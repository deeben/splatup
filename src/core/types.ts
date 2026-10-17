/**
 * SplatUp document model.
 *
 * All values stored in the document use the *user frame*:
 *   - millimetres
 *   - right-handed, Z-up (CAD convention): X = east-ish, Y = north-ish, Z = height
 *   - rotations in degrees, applied as yaw (Z) * pitch (Y) * roll (X)
 *
 * The three.js scene is Y-up metres; conversion lives in `core/frame.ts` and is
 * the only place the two frames meet.
 */

export type Vec3 = [number, number, number];

export interface Transform {
  /** Position of the object origin (mm, user frame). */
  position: Vec3;
  /** Rotation in degrees about user X, Y, Z. */
  rotation: Vec3;
}

interface BaseObject {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  transform: Transform;
}

/** Rectangular block. Origin at the centre of the base face. */
export interface BoxObject extends BaseObject {
  kind: 'box';
  /** Length along local X (mm). */
  length: number;
  /** Width along local Y (mm). */
  width: number;
  /** Height along local Z (mm). */
  height: number;
}

/** Cylinder. Axis along local Z, origin at the centre of the base. */
export interface CylinderObject extends BaseObject {
  kind: 'cylinder';
  diameter: number;
  length: number;
}

/** Custom 3D polygon prism for transition ducts, offset ducting, or platform floor slabs. */
export interface PolyShapeObject extends BaseObject {
  kind: 'polyShape';
  /** Vertices in user frame mm, local to object origin. */
  points: Vec3[];
  /** Extrusion height / slab thickness in mm (along Z/normal). */
  thickness: number;
  /** Whether the shape is a hollow duct section. */
  isHollow?: boolean;
}

/** Monowills-style industrial handrail (AS 1657) with ball stanchions and toeboard. */
export interface HandrailObject extends BaseObject {
  kind: 'handrail';
  /** Path points (mm, local to object origin). Minimum 2 points for a straight run. */
  points: Vec3[];
  /** Monowills standard height: 900mm or 1000mm. */
  height: 900 | 1000;
  /** Stanchion spacing along the run (mm, standard 1500mm, max 2000mm per AS 1657). */
  stanchionSpacing: number;
  /** Include 100mm kickplate / toeboard along bottom edge. */
  hasKickplate: boolean;
  /** Include knee rail (mid rail). */
  hasMidrail: boolean;
  /** Pipe outer diameter (mm, standard 42.4mm for 32NB). */
  pipeDiameter: number;
}

/** Monowills self-closing safety swing gate module. */
export interface SwingGateObject extends BaseObject {
  kind: 'gate';
  /** Clear opening width in mm (standard 750mm). */
  width: number;
  /** Height in mm (900mm or 1000mm). */
  height: 900 | 1000;
  /** Swing angle (degrees, 0 = closed, 90 = open). */
  swingAngle: number;
  /** Include toeboard. */
  hasKickplate: boolean;
}

/** Industrial access ladder per AS 1657 with rungs and optional safety cage. */
export interface LadderObject extends BaseObject {
  kind: 'ladder';
  /** Total vertical climb height (mm). */
  height: number;
  /** Clear width between stringers (mm, standard 450mm). */
  width: number;
  /** Centre-to-centre rung spacing (mm, standard 280mm). */
  rungSpacing: number;
  /** Include safety cage (standard for climb > 3000mm). */
  hasCage: boolean;
  /** Clearance height before cage starts (mm, standard 2200mm). */
  cageStartHeight: number;
}

/** AS 1657 Industrial Stairway with PFC stringers, grating treads, and Monowills handrails. */
export interface StairsObject extends BaseObject {
  kind: 'stairs';
  /** Clear width between stringers in mm (standard 750mm, range 600-1200mm). */
  width: number;
  /** Total vertical rise in mm (floor-to-floor). */
  totalRise: number;
  /** Horizontal tread going in mm (standard 245mm, range 235-245mm). */
  going: number;
  /** Number of step risers (auto-calculated from ~190mm rise). */
  numSteps: number;
  /** Stringer channel profile (per D-001-S-10013): 200PFC, 250PFC, or 150PFC. */
  stringerSection: '200PFC' | '250PFC' | '150PFC';
  /** Handrail placement: 'both' | 'left' | 'right' | 'none'. */
  handrailSide: 'both' | 'left' | 'right' | 'none';
  /** Handrail height above nosing line in mm (900 or 1000). */
  handrailHeight: 900 | 1000;
  /** Include 100mm kickplate / toeboard on stringers. */
  hasKickplate: boolean;
}

/** Australian Standard Structural Steel Section (UB, UC, PFC, SHS/RHS, EA). */
export interface SteelBeamObject extends BaseObject {
  kind: 'beam';
  /** Section designation, e.g. '250UB37', '200PFC', '150UC30', '100x100 SHS'. */
  sectionName: string;
  /** Beam length in mm along local X. */
  length: number;
  /** Alignment cardinal point relative to section: 'topCenter' | 'center' | 'bottomCenter'. */
  alignment: 'topCenter' | 'center' | 'bottomCenter';
  /** Axial roll rotation in degrees (0 = strong axis vertical). */
  rollAngle: number;
}

export type DesignObject =
  | BoxObject
  | CylinderObject
  | PolyShapeObject
  | HandrailObject
  | SwingGateObject
  | LadderObject
  | StairsObject
  | SteelBeamObject;
export type DesignKind = DesignObject['kind'];

export interface Measurement {
  id: string;
  name: string;
  a: Vec3;
  b: Vec3;
}

export interface ScanAsset {
  id: string;
  name: string;
  fileName: string;
  byteSize: number;
  visible: boolean;
  opacity: number;
  /** Show baked scan colours without scene lighting (recommended for Scaniverse). */
  unlit: boolean;
  doubleSided: boolean;
  /** Scan file format */
  format?: 'glb' | 'ply' | 'las';
  /** Coordinate orientation: 'y-up' (GLB standard) or 'z-up' (LiDAR / CAD standard) */
  orientation?: 'y-up' | 'z-up';
  /** Point size for point cloud scans in metres (default 0.015 = 15mm) */
  pointSize?: number;
}

export interface ViewSettings {
  /** Hide scan geometry above this height (mm, user Z). null = off. */
  clipHeight: number | null;
}

export interface Project {
  version: 1;
  name: string;
  units: 'mm';
  scans: ScanAsset[];
  objects: DesignObject[];
  measurements: Measurement[];
  view: ViewSettings;
  /** Scene orientation / alignment angle in degrees (yaw about user Z). Default 0. */
  sceneAlignment?: number;
  /** Front view orientation angle in degrees (default equals sceneAlignment). */
  frontViewAngle?: number;
}

export type StandardView =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'isoLeft'
  | 'isoRight';

export interface ViewRequest {
  view: StandardView;
  token: number;
  fitBounds?: boolean;
}

export type Selection =
  | { type: 'object'; id: string }
  | { type: 'measurement'; id: string }
  | { type: 'scan'; id: string }
  | null;

export type Tool =
  | 'select'
  | 'measure'
  | 'align'
  | 'box'
  | 'cylinder'
  | 'polyShape'
  | 'handrail'
  | 'gate'
  | 'ladder'
  | 'stairs'
  | 'beam';

export type SnapKind = 'vertex' | 'corner' | 'face' | 'axis';

export interface SnapResult {
  /** Snapped point, user frame mm. */
  point: Vec3;
  kind: SnapKind;
  objectId?: string;
  /** Set when the point is constrained to a user axis (0=X, 1=Y, 2=Z). */
  axis?: 0 | 1 | 2;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export function newProject(): Project {
  return {
    version: 1,
    name: 'Untitled',
    units: 'mm',
    scans: [],
    objects: [],
    measurements: [],
    view: { clipHeight: null },
    sceneAlignment: 0,
    frontViewAngle: 0,
  };
}
