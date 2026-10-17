import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import {
  newProject,
  type Bounds,
  type DesignKind,
  type DesignObject,
  type HandrailObject,
  type Measurement,
  type PolyShapeObject,
  type Project,
  type ScanAsset,
  type Selection,
  type SnapResult,
  type StandardView,
  type Tool,
  type Vec3,
  type ViewRequest,
} from './types';
import { uid } from './units';

const HISTORY_LIMIT = 200;

export type GizmoMode = 'translate' | 'rotate';
export type GizmoSpace = 'local' | 'world';

interface AppState {
  doc: Project;
  past: Project[];
  future: Project[];

  /** Raw GLB blobs keyed by scan id (not part of the JSON document). */
  scanFiles: Record<string, Blob>;

  tool: Tool;
  selection: Selection;
  gizmoMode: GizmoMode;
  gizmoSpace: GizmoSpace;
  /** Snap gizmo translation to 10 mm / rotation to 15°. */
  gridSnap: boolean;
  hover: SnapResult | null;
  /** First point of an in-progress measurement. */
  pendingA: Vec3 | null;
  status: string;
  /** Incremented to request the viewport to frame the scene. */
  frameRequest: number;

  // ---- document mutations (undoable) ----
  commit: (recipe: (d: Draft<Project>) => void) => void;
  undo: () => void;
  redo: () => void;

  addScan: (file: File | Blob, name: string) => string;
  updateScan: (id: string, patch: Partial<ScanAsset>) => void;
  removeScan: (id: string) => void;

  addObject: (kind: DesignKind, at: Vec3) => string;
  updateObject: (id: string, recipe: (o: Draft<DesignObject>) => void) => void;
  /** Transient update during drag (does not push undo history) */
  updateObjectLive: (id: string, recipe: (o: Draft<DesignObject>) => void) => void;
  /** Commit undo history snapshot after dragging completes */
  commitChange: (snapshotBefore: Project) => void;
  duplicateObject: (id: string) => void;

  addMeasurement: (a: Vec3, b: Vec3) => string;
  renameMeasurement: (id: string, name: string) => void;

  deleteSelection: () => void;

  // ---- UI state (not undoable) ----
  setTool: (t: Tool) => void;
  select: (s: Selection) => void;
  setGizmoMode: (m: GizmoMode) => void;
  setGizmoSpace: (s: GizmoSpace) => void;
  toggleGizmoSpace: () => void;
  setGridSnap: (v: boolean) => void;
  setHover: (h: SnapResult | null) => void;
  setPendingA: (p: Vec3 | null) => void;
  setStatus: (s: string) => void;
  requestFrame: () => void;

  /** Combined bounds of loaded scans (user frame mm). */
  bounds: Bounds | null;
  setBounds: (b: Bounds | null) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;

  /** In-progress points for multi-point drawing tools (polyShape, handrail). */
  drawingPoints: Vec3[];
  addDrawingPoint: (p: Vec3) => void;
  popDrawingPoint: () => void;
  clearDrawingPoints: () => void;
  addPolyShape: (points: Vec3[], thickness?: number) => string;
  addHandrail: (points: Vec3[], height?: 900 | 1000) => string;

  /** Set project/scene orientation angle in degrees. */
  setSceneAlignment: (angle: number) => void;
  /** Set Front view orientation angle in degrees. */
  setFrontViewAngle: (angle: number) => void;
  /** Rotate Front view angle by relative delta degrees (+90, -90, 180). */
  rotateFrontView: (deltaDeg: number) => void;

  /** Currently active standard view ('front', 'top', etc.) or null if in custom view. */
  activeStandardView: StandardView | null;
  /** Active view navigation request. */
  viewRequest: ViewRequest | null;
  /** Switch to a standard view. */
  setView: (view: StandardView, fitBounds?: boolean) => void;
  setActiveStandardView: (view: StandardView | null) => void;

  loadProject: (doc: Project, files: Record<string, Blob>) => void;
  resetProject: () => void;
}

const DEFAULTS: Record<DesignKind, () => Omit<DesignObject, 'id' | 'name' | 'transform'>> = {
  box: () => ({ kind: 'box', length: 1000, width: 600, height: 400, color: '#f59e0b', visible: true }),
  cylinder: () => ({ kind: 'cylinder', diameter: 400, length: 1000, color: '#38bdf8', visible: true }),
  polyShape: () => ({
    kind: 'polyShape',
    points: [
      [-600, -400, 0],
      [600, -400, 0],
      [600, 400, 0],
      [-600, 400, 0],
    ],
    thickness: 50,
    color: '#10b981',
    visible: true,
  }),
  handrail: () => ({
    kind: 'handrail',
    points: [
      [-1000, 0, 0],
      [1000, 0, 0],
    ],
    height: 1000,
    stanchionSpacing: 1500,
    hasKickplate: true,
    hasMidrail: true,
    pipeDiameter: 42.4,
    color: '#facc15',
    visible: true,
  }),
  gate: () => ({
    kind: 'gate',
    width: 750,
    height: 1000,
    swingAngle: 0,
    hasKickplate: true,
    color: '#facc15',
    visible: true,
  }),
  ladder: () => ({
    kind: 'ladder',
    height: 2500,
    width: 450,
    rungSpacing: 280,
    hasCage: false,
    cageStartHeight: 2200,
    color: '#94a3b8',
    visible: true,
  }),
  stairs: () => ({
    kind: 'stairs',
    width: 750,
    totalRise: 1900,
    going: 245,
    numSteps: 10,
    stringerSection: '200PFC' as const,
    handrailSide: 'both' as const,
    handrailHeight: 1000 as const,
    hasKickplate: true,
    color: '#f59e0b',
    visible: true,
  }),
  beam: () => ({
    kind: 'beam',
    sectionName: '250UB37',
    length: 3000,
    alignment: 'topCenter' as const,
    rollAngle: 0,
    color: '#64748b',
    visible: true,
  }),
};

const LABEL: Record<DesignKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  polyShape: 'Platform / Duct Slab',
  handrail: 'Monowills Handrail',
  gate: 'Swing Gate',
  ladder: 'Access Ladder',
  stairs: 'Industrial Stairs',
  beam: 'Steel Beam',
};

export const useApp = create<AppState>()((set, get) => ({
  doc: newProject(),
  past: [],
  future: [],
  scanFiles: {},

  tool: 'select',
  selection: null,
  gizmoMode: 'translate',
  gizmoSpace: 'local',
  gridSnap: true,
  hover: null,
  pendingA: null,
  drawingPoints: [],
  status: '',
  frameRequest: 0,

  commit: (recipe) => {
    const prev = get().doc;
    const next = produce(prev, recipe);
    if (next === prev) return;
    set((s) => ({
      doc: next,
      past: [...s.past, prev].slice(-HISTORY_LIMIT),
      future: [],
    }));
  },

  undo: () => {
    const { past, doc, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selection: validSel(get().selection, prev) });
  },

  redo: () => {
    const { past, doc, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({ doc: next, past: [...past, doc], future: future.slice(1), selection: validSel(get().selection, next) });
  },

  addScan: (file, name) => {
    const id = uid('scan_');
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const format: 'glb' | 'ply' | 'las' =
      ext === 'ply' ? 'ply' : ext === 'las' || ext === 'laz' ? 'las' : 'glb';
    const isZUp = format === 'las' || format === 'ply';
    const asset: ScanAsset = {
      id,
      name: name.replace(/\.(glb|gltf|ply|las|laz)$/i, ''),
      fileName: name,
      byteSize: file.size,
      visible: true,
      opacity: 1,
      unlit: true,
      doubleSided: false,
      format,
      orientation: isZUp ? 'z-up' : 'y-up',
      pointSize: 0.015,
    };
    set((s) => ({ scanFiles: { ...s.scanFiles, [id]: file } }));
    get().commit((d) => {
      d.scans.push(asset);
      if (d.name === 'Untitled') d.name = asset.name;
    });
    return id;
  },

  updateScan: (id, patch) =>
    get().commit((d) => {
      const s = d.scans.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    }),

  removeScan: (id) => {
    get().commit((d) => {
      d.scans = d.scans.filter((x) => x.id !== id);
    });
    // Keep the blob so undo can restore it.
  },

  addObject: (kind, at) => {
    const id = uid('obj_');
    const count = get().doc.objects.filter((o) => o.kind === kind).length + 1;
    const align = get().doc.sceneAlignment ?? 0;
    const obj = {
      ...DEFAULTS[kind](),
      id,
      name: `${LABEL[kind]} ${count}`,
      transform: { position: at, rotation: [0, 0, Math.round(align * 10) / 10] as Vec3 },
    } as DesignObject;
    get().commit((d) => {
      d.objects.push(obj);
    });
    set({ selection: { type: 'object', id } });
    return id;
  },

  updateObject: (id, recipe) =>
    get().commit((d) => {
      const o = d.objects.find((x) => x.id === id);
      if (o) recipe(o);
    }),

  updateObjectLive: (id, recipe) => {
    const prev = get().doc;
    const next = produce(prev, (d) => {
      const o = d.objects.find((x) => x.id === id);
      if (o) recipe(o);
    });
    if (next !== prev) {
      set({ doc: next });
    }
  },

  commitChange: (snapshotBefore) => {
    const current = get().doc;
    if (current === snapshotBefore) return;
    set((s) => ({
      past: [...s.past, snapshotBefore].slice(-HISTORY_LIMIT),
      future: [],
    }));
  },

  duplicateObject: (id) => {
    const src = get().doc.objects.find((o) => o.id === id);
    if (!src) return;
    const nid = uid('obj_');
    const p = src.transform.position;
    get().commit((d) => {
      d.objects.push({
        ...structuredClone(src),
        id: nid,
        name: `${src.name} copy`,
        transform: { position: [p[0] + 500, p[1], p[2]], rotation: [...src.transform.rotation] as Vec3 },
      });
    });
    set({ selection: { type: 'object', id: nid } });
  },

  addMeasurement: (a, b) => {
    const id = uid('m_');
    const n = get().doc.measurements.length + 1;
    get().commit((d) => {
      d.measurements.push({ id, name: `M${n}`, a, b } satisfies Measurement);
    });
    return id;
  },

  renameMeasurement: (id, name) =>
    get().commit((d) => {
      const m = d.measurements.find((x) => x.id === id);
      if (m) m.name = name;
    }),

  deleteSelection: () => {
    const sel = get().selection;
    if (!sel) return;
    get().commit((d) => {
      if (sel.type === 'object') d.objects = d.objects.filter((o) => o.id !== sel.id);
      if (sel.type === 'measurement') d.measurements = d.measurements.filter((m) => m.id !== sel.id);
      if (sel.type === 'scan') d.scans = d.scans.filter((m) => m.id !== sel.id);
    });
    set({ selection: null });
  },

  addDrawingPoint: (p) => set((s) => ({ drawingPoints: [...s.drawingPoints, p] })),
  popDrawingPoint: () => set((s) => ({ drawingPoints: s.drawingPoints.slice(0, -1) })),
  clearDrawingPoints: () => set({ drawingPoints: [] }),

  addPolyShape: (points, thickness = 50) => {
    if (points.length < 3) return '';
    const id = uid('obj_');
    const count = get().doc.objects.filter((o) => o.kind === 'polyShape').length + 1;
    const align = get().doc.sceneAlignment ?? 0;
    const alignRad = (align * Math.PI) / 180;
    const cosA = Math.cos(alignRad);
    const sinA = Math.sin(alignRad);
    const n = points.length;
    const cx = points.reduce((s, p) => s + p[0], 0) / n;
    const cy = points.reduce((s, p) => s + p[1], 0) / n;
    const cz = points.reduce((s, p) => s + p[2], 0) / n;
    const center: Vec3 = [Math.round(cx), Math.round(cy), Math.round(cz)];
    // Rotate into local space aligned with scene alignment
    const localPoints: Vec3[] = points.map((p) => {
      const dx = p[0] - center[0];
      const dy = p[1] - center[1];
      const dz = p[2] - center[2];
      return [
        Math.round(dx * cosA + dy * sinA),
        Math.round(-dx * sinA + dy * cosA),
        Math.round(dz),
      ];
    });
    const obj: PolyShapeObject = {
      kind: 'polyShape',
      id,
      name: `Platform / Slab ${count}`,
      transform: { position: center, rotation: [0, 0, Math.round(align * 10) / 10] },
      points: localPoints,
      thickness,
      color: '#10b981',
      visible: true,
    };
    get().commit((d) => {
      d.objects.push(obj);
    });
    set({ selection: { type: 'object', id }, drawingPoints: [], tool: 'select' });
    return id;
  },

  addHandrail: (points, height = 1000) => {
    if (points.length < 2) return '';
    const id = uid('obj_');
    const count = get().doc.objects.filter((o) => o.kind === 'handrail').length + 1;
    const origin = points[0].map((v) => Math.round(v)) as Vec3;
    const dx = points[1][0] - points[0][0];
    const dy = points[1][1] - points[0][1];
    const yawRad = Math.atan2(dy, dx);
    const yawDeg = Math.round(((yawRad * 180) / Math.PI) * 10) / 10;
    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);
    // Rotate into local coordinate space aligned with the handrail run
    const localPoints: Vec3[] = points.map((p) => {
      const vx = p[0] - origin[0];
      const vy = p[1] - origin[1];
      const vz = p[2] - origin[2];
      return [
        Math.round(vx * cosY + vy * sinY),
        Math.round(-vx * sinY + vy * cosY),
        Math.round(vz),
      ];
    });
    const obj: HandrailObject = {
      kind: 'handrail',
      id,
      name: `Monowills Run ${count}`,
      transform: { position: origin, rotation: [0, 0, yawDeg] },
      points: localPoints,
      height,
      stanchionSpacing: 1500,
      hasKickplate: true,
      hasMidrail: true,
      pipeDiameter: 42.4,
      color: '#facc15',
      visible: true,
    };
    get().commit((d) => {
      d.objects.push(obj);
    });
    set({ selection: { type: 'object', id }, drawingPoints: [], tool: 'select' });
    return id;
  },

  setSceneAlignment: (angle) => {
    const clean = Math.round(angle * 10) / 10;
    get().commit((d) => {
      d.sceneAlignment = clean;
      if (d.frontViewAngle === undefined) {
        d.frontViewAngle = clean;
      }
    });
  },

  setFrontViewAngle: (angle) => {
    const clean = Math.round((((angle % 360) + 360) % 360) * 10) / 10;
    get().commit((d) => {
      d.frontViewAngle = clean;
    });
    const active = get().activeStandardView;
    if (active) {
      get().setView(active);
    }
  },

  rotateFrontView: (deltaDeg) => {
    const current = get().doc.frontViewAngle ?? get().doc.sceneAlignment ?? 0;
    const clean = Math.round(((((current + deltaDeg) % 360) + 360) % 360) * 10) / 10;
    get().commit((d) => {
      d.frontViewAngle = clean;
    });
    const active = get().activeStandardView;
    if (active) {
      get().setView(active);
    }
  },

  activeStandardView: null,
  viewRequest: null,
  setView: (view, fitBounds) =>
    set({
      viewRequest: { view, token: Date.now(), fitBounds },
      activeStandardView: view,
    }),
  setActiveStandardView: (activeStandardView) => set({ activeStandardView }),

  setTool: (tool) => set({ tool, pendingA: null, drawingPoints: [], status: '' }),
  select: (selection) => set({ selection }),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  setGizmoSpace: (gizmoSpace) => set({ gizmoSpace }),
  toggleGizmoSpace: () => set((s) => ({ gizmoSpace: s.gizmoSpace === 'local' ? 'world' : 'local' })),
  setGridSnap: (gridSnap) => set({ gridSnap }),
  setHover: (hover) => set({ hover }),
  setPendingA: (pendingA) => set({ pendingA }),
  setStatus: (status) => set({ status }),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1, activeStandardView: null })),

  bounds: null,
  setBounds: (bounds) => set({ bounds }),
  showGrid: true,
  setShowGrid: (showGrid) => set({ showGrid }),

  loadProject: (doc, files) =>
    set((s) => ({
      doc,
      scanFiles: files,
      past: [],
      future: [],
      selection: null,
      pendingA: null,
      tool: 'select',
      frameRequest: s.frameRequest + 1,
    })),

  resetProject: () =>
    set({ doc: newProject(), scanFiles: {}, past: [], future: [], selection: null, pendingA: null, tool: 'select' }),
}));

function validSel(sel: Selection, doc: Project): Selection {
  if (!sel) return null;
  const list = sel.type === 'object' ? doc.objects : sel.type === 'measurement' ? doc.measurements : doc.scans;
  return list.some((x) => x.id === sel.id) ? sel : null;
}

export function selectedObject(s: AppState): DesignObject | undefined {
  const sel = s.selection;
  return sel?.type === 'object' ? s.doc.objects.find((o) => o.id === sel.id) : undefined;
}
