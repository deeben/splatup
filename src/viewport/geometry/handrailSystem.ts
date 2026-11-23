/**
 * Shared handrail builder used by free-standing handrail runs and stair flights.
 *
 * Works in three.js scene space (metres, Y up). The caller supplies a base
 * line (the stanchion centreline at floor / nosing level) and options; this
 * module lays out the stanchions and sweeps the rails as continuous tubes so
 * corners and end hoops come out as smooth bends, like the bent-pipe details
 * on drawing D-001-S-10015 (corner R140, closure bends 300 past the end post).
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';

export type GeomItem = { geom: BufferGeometry; matrix: Matrix4 };

/** Bend radius for corners and hoops (D-001-S-10015: R140). */
export const BEND_R = 0.14;
/** Distance from the end stanchion to the outside of an end hoop (300). */
export const HOOP_EXT = 0.3;
/** Stanchions sit this far back from a corner on each leg (300 max). */
export const CORNER_POST_OFFSET = 0.3;
/** A rail system taller than this (base to top rail) needs a mid / knee rail. */
export const MIDRAIL_GAP_MAX_MM = 450;
/** Typical gap from top rail down to the mid rail on a full-height rail (440). */
const TOP_TO_MID = 0.44;
/** Height of the hoop's lower return when there is no mid rail. */
const LOW_RETURN = 0.15;

export type MountType = 'base' | 'sideBolted' | 'sidePocket' | 'none';

export interface MovableRail {
  type: 'slide' | 'pivot';
  /** 1-based span number, counted from the start of the run. */
  span: number;
  /** 0 = closed, 1 = fully open (slide one span length, or pivot 90° up). */
  open: number;
}

export interface RailSystemOptions {
  /** Stanchion centreline at base level, scene metres. */
  path: Vector3[];
  /** Base-to-top-rail height, metres. */
  height: number;
  /** Maximum stanchion spacing, metres. */
  postSpacing: number;
  pipeR: number;
  midPipeR: number;
  hoopStart: boolean;
  hoopEnd: boolean;
  /**
   * true: the path ends are the outside of the hoop, so the end stanchions sit
   * 300 in from each end (fits a run drawn up to a column).
   * false: the hoop is added beyond the path ends (stair flights).
   */
  hoopInset: boolean;
  kickplate: boolean;
  mount: MountType;
  /** Which side of the run the supporting steel is on (+1 left, -1 right of travel). */
  mountSide: 1 | -1;
  /** Side mounts: length of the stanchion leg below floor level, metres (default 0.3). */
  sideLeg?: number;
  movable?: MovableRail | null;
}

export interface PostInfo {
  pos: Vector3;
  /** Arc length from the start of the path. */
  s: number;
  seg: number;
  dir: Vector3;
}

export interface RailLayout {
  posts: PostInfo[];
  /** Span i (0-based) runs from posts[i] to posts[i+1]; true if both posts are on one straight leg. */
  straightSpans: boolean[];
  midH: number | null;
  totalLength: number;
}

/** Mid rail height for a given top rail height (metres), or null when none is needed. */
export function midRailHeight(height: number): number | null {
  if (height * 1000 <= MIDRAIL_GAP_MAX_MM + 0.5) return null;
  return Math.max(height / 2, height - TOP_TO_MID);
}

function cumulative(path: Vector3[]): number[] {
  const s = [0];
  for (let i = 1; i < path.length; i++) s.push(s[i - 1] + path[i].distanceTo(path[i - 1]));
  return s;
}

function cleanPath(path: Vector3[]): Vector3[] {
  const out: Vector3[] = [];
  for (const p of path) {
    if (!out.length || out[out.length - 1].distanceTo(p) > 1e-4) out.push(p.clone());
  }
  return out;
}

/** Point at arc length s along a polyline. */
function pointAt(path: Vector3[], cum: number[], s: number): Vector3 {
  if (s <= 0) return path[0].clone();
  for (let i = 1; i < path.length; i++) {
    if (s <= cum[i] + 1e-9) {
      const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      return new Vector3().lerpVectors(path[i - 1], path[i], t);
    }
  }
  return path[path.length - 1].clone();
}

/** The part of a polyline between arc lengths s0 and s1 (keeps interior vertices). */
function slicePath(path: Vector3[], cum: number[], s0: number, s1: number): Vector3[] {
  const out = [pointAt(path, cum, s0)];
  for (let i = 1; i < path.length - 1; i++) {
    if (cum[i] > s0 + 1e-6 && cum[i] < s1 - 1e-6) out.push(path[i].clone());
  }
  out.push(pointAt(path, cum, s1));
  return cleanPath(out);
}

const lift = (pts: Vector3[], dy: number) => pts.map((p) => new Vector3(p.x, p.y + dy, p.z));

/** Lays out stanchions along the path. Pure maths; also used by the property panel for counts. */
export function layoutRailSystem(
  rawPath: Vector3[],
  opts: { height: number; postSpacing: number; hoopStart: boolean; hoopEnd: boolean; hoopInset: boolean },
): RailLayout {
  const path = cleanPath(rawPath);
  const cum = cumulative(path);
  const total = cum[cum.length - 1] ?? 0;
  const posts: PostInfo[] = [];
  const segOfPost: number[] = [];
  const nSeg = path.length - 1;

  for (let i = 0; i < nSeg; i++) {
    const L = cum[i + 1] - cum[i];
    const dir = new Vector3().subVectors(path[i + 1], path[i]).normalize();
    let so: number;
    let eo: number;
    if (i === 0) so = opts.hoopStart && opts.hoopInset ? HOOP_EXT : 0;
    else so = CORNER_POST_OFFSET;
    if (i === nSeg - 1) eo = opts.hoopEnd && opts.hoopInset ? HOOP_EXT : 0;
    else eo = CORNER_POST_OFFSET;

    const usable = L - so - eo;
    const positions: number[] = [];
    if (usable < 0.05) {
      positions.push(L / 2);
    } else {
      const n = Math.max(2, Math.ceil(usable / Math.max(0.2, opts.postSpacing)) + 1);
      for (let k = 0; k < n; k++) positions.push(so + (usable * k) / (n - 1));
    }
    for (const t of positions) {
      posts.push({ pos: pointAt(path, cum, cum[i] + t), s: cum[i] + t, seg: i, dir });
      segOfPost.push(i);
    }
  }

  const straightSpans: boolean[] = [];
  for (let k = 0; k < posts.length - 1; k++) straightSpans.push(segOfPost[k] === segOfPost[k + 1]);

  return { posts, straightSpans, midH: midRailHeight(opts.height), totalLength: total };
}

/**
 * Rounds each interior corner of a polyline with an arc of radius R (clamped so
 * neighbouring arcs never overlap).
 */
export function filletPolyline(input: Vector3[], R: number, arcSegs = 8): Vector3[] {
  const pts = cleanPath(input);
  if (pts.length < 3) return pts;
  const out: Vector3[] = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const P = pts[i];
    const inV = new Vector3().subVectors(P, pts[i - 1]);
    const outV = new Vector3().subVectors(pts[i + 1], P);
    const lin = inV.length();
    const lout = outV.length();
    inV.normalize();
    outV.normalize();
    const theta = Math.acos(Math.min(1, Math.max(-1, inV.dot(outV))));
    if (theta < 1e-3 || theta > Math.PI - 1e-3) {
      out.push(P.clone());
      continue;
    }
    const half = Math.tan(theta / 2);
    const maxIn = i - 1 === 0 ? lin * 0.98 : lin * 0.49;
    const maxOut = i + 1 === pts.length - 1 ? lout * 0.98 : lout * 0.49;
    const tanLen = Math.min(R * half, maxIn, maxOut);
    const r = tanLen / half;
    const T1 = P.clone().addScaledVector(inV, -tanLen);
    const bis = new Vector3().subVectors(outV, inV).normalize();
    const C = P.clone().addScaledVector(bis, r / Math.cos(theta / 2));
    const axis = new Vector3().crossVectors(inV, outV).normalize();
    const v0 = new Vector3().subVectors(T1, C);
    const q = new Quaternion();
    for (let k = 0; k <= arcSegs; k++) {
      q.setFromAxisAngle(axis, (theta * k) / arcSegs);
      out.push(C.clone().add(v0.clone().applyQuaternion(q)));
    }
  }
  out.push(pts[pts.length - 1].clone());
  return cleanPath(out);
}

/** Sweeps a circular tube along a polyline using parallel-transport frames. */
export function sweepTube(input: Vector3[], radius: number, radial = 14): BufferGeometry {
  const pts = cleanPath(input);
  const geom = new BufferGeometry();
  if (pts.length < 2) return geom;
  const n = pts.length;
  const tangents: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const t = new Vector3().subVectors(b, a);
    if (i > 0 && i < n - 1) {
      const t1 = new Vector3().subVectors(pts[i], a).normalize();
      const t2 = new Vector3().subVectors(b, pts[i]).normalize();
      t.copy(t1.add(t2));
    }
    tangents.push(t.normalize());
  }
  // Initial normal: any vector perpendicular to the first tangent.
  const t0 = tangents[0];
  const ref = Math.abs(t0.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  let normal = new Vector3().crossVectors(t0, ref).normalize();
  const positions = new Float32Array(n * radial * 3);
  const q = new Quaternion();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      q.setFromUnitVectors(tangents[i - 1], tangents[i]);
      normal = normal.clone().applyQuaternion(q).normalize();
    }
    const binormal = new Vector3().crossVectors(tangents[i], normal).normalize();
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a) * radius;
      const s = Math.sin(a) * radius;
      const o = (i * radial + j) * 3;
      positions[o] = pts[i].x + normal.x * c + binormal.x * s;
      positions[o + 1] = pts[i].y + normal.y * c + binormal.y * s;
      positions[o + 2] = pts[i].z + normal.z * c + binormal.z * s;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }
  geom.setAttribute('position', new BufferAttribute(positions, 3));
  geom.setIndex(indices);
  return geom;
}

/** Merges geometries (each with its own transform) into one indexed BufferGeometry. */
export function mergeGeometries(items: GeomItem[]): BufferGeometry {
  const merged = new BufferGeometry();
  let totalVerts = 0;
  for (const { geom } of items) {
    const pos = geom.getAttribute('position');
    if (pos) totalVerts += pos.count;
  }
  const positions = new Float32Array(totalVerts * 3);
  const indices: number[] = [];
  let vertOffset = 0;
  const v = new Vector3();
  for (const { geom, matrix } of items) {
    const pos = geom.getAttribute('position');
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      positions[(vertOffset + i) * 3] = v.x;
      positions[(vertOffset + i) * 3 + 1] = v.y;
      positions[(vertOffset + i) * 3 + 2] = v.z;
    }
    if (geom.index) {
      for (let i = 0; i < geom.index.count; i++) indices.push(geom.index.getX(i) + vertOffset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + vertOffset);
    }
    vertOffset += pos.count;
  }
  merged.setAttribute('position', new BufferAttribute(positions, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

const _I = new Matrix4();
const _up = new Vector3(0, 1, 0);
const _one = new Vector3(1, 1, 1);
const at = (p: Vector3, q: Quaternion = new Quaternion()) => new Matrix4().compose(p, q, _one);

/** A cylinder between two points. */
function rod(a: Vector3, b: Vector3, r: number, seg = 12): GeomItem {
  const d = new Vector3().subVectors(b, a);
  const len = Math.max(1e-4, d.length());
  const q = new Quaternion().setFromUnitVectors(_up, d.normalize());
  return { geom: new CylinderGeometry(r, r, len, seg), matrix: at(new Vector3().addVectors(a, b).multiplyScalar(0.5), q) };
}

/** An axis-aligned box oriented by a basis (x along run, y up, z across). */
function orientedBox(center: Vector3, size: Vector3, xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): GeomItem {
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis));
  return { geom: new BoxGeometry(size.x, size.y, size.z), matrix: new Matrix4().compose(center, q, _one) };
}

/**
 * Builds the full rail system: stanchions with their mounting detail, top and
 * mid rails (with corner bends and end hoops), kickplate and any movable span.
 */
export function buildRailSystem(opts: RailSystemOptions): { items: GeomItem[]; snapPoints: [number, number, number][]; layout: RailLayout } {
  const items: GeomItem[] = [];
  const snapPoints: [number, number, number][] = [];
  const base = cleanPath(opts.path);
  const layout = layoutRailSystem(base, opts);
  if (base.length < 2) return { items, snapPoints, layout };

  const H = opts.height;
  const midH = layout.midH;
  const lowH = midH ?? Math.min(LOW_RETURN, H * 0.4);
  const { posts } = layout;
  const pipeR = opts.pipeR;
  const ballR = pipeR * 1.5;
  const ballGeom = new SphereGeometry(ballR, 16, 12);

  // Extend the path past its ends when the hoops sit outside the run (stairs).
  const ext = base.map((p) => p.clone());
  let shift = 0;
  if (!opts.hoopInset && opts.hoopStart) {
    const d0 = new Vector3().subVectors(base[0], base[1]).normalize();
    ext.unshift(base[0].clone().addScaledVector(d0, HOOP_EXT));
    shift = HOOP_EXT;
  }
  if (!opts.hoopInset && opts.hoopEnd) {
    const n = base.length;
    const d1 = new Vector3().subVectors(base[n - 1], base[n - 2]).normalize();
    ext.push(base[n - 1].clone().addScaledVector(d1, HOOP_EXT));
  }
  const cum = cumulative(ext);
  const total = cum[cum.length - 1];
  const sFirst = posts.length ? posts[0].s + shift : 0;
  const sLast = posts.length ? posts[posts.length - 1].s + shift : total;

  // ── Stanchions ──────────────────────────────────────────────────────────
  for (const post of posts) {
    const p = post.pos;
    // Points to the left of travel (user +Y side for a run along +X).
    const across = new Vector3(post.dir.z, 0, -post.dir.x);
    if (across.lengthSq() < 1e-8) across.set(0, 0, 1);
    across.normalize();
    const runFlat = new Vector3(post.dir.x, 0, post.dir.z);
    if (runFlat.lengthSq() < 1e-8) runFlat.set(1, 0, 0);
    runFlat.normalize();
    const toSteel = across.clone().multiplyScalar(opts.mountSide);
    const leg = Math.max(0.17, opts.sideLeg ?? 0.3);

    let bottom = 0;
    if (opts.mount === 'base') {
      items.push(orientedBox(new Vector3(p.x, p.y + 0.006, p.z), new Vector3(0.12, 0.012, 0.12), runFlat, _up, across));
    } else if (opts.mount === 'sideBolted') {
      // Full height above the floor; the lower leg runs down past the grating and
      // bolts (2 bolts at 100 crs) through a 100x10 FL cleat to the PFC web below.
      bottom = -leg;
      const cleatH = Math.min(0.22, leg);
      const cleatC = new Vector3(p.x, p.y + bottom + cleatH / 2, p.z).addScaledVector(toSteel, pipeR + 0.005);
      items.push(orientedBox(cleatC, new Vector3(0.1, cleatH, 0.01), runFlat, _up, across));
      for (const y of [bottom + cleatH / 2 - 0.05, bottom + cleatH / 2 + 0.05]) {
        const c = new Vector3(p.x, p.y + y, p.z);
        items.push(rod(c.clone().addScaledVector(toSteel, -pipeR - 0.02), c.clone().addScaledVector(toSteel, pipeR + 0.03), 0.008, 8));
        // Bolt head and nut
        items.push(rod(c.clone().addScaledVector(toSteel, -pipeR - 0.02), c.clone().addScaledVector(toSteel, -pipeR - 0.006), 0.014, 6));
        items.push(rod(c.clone().addScaledVector(toSteel, pipeR + 0.012), c.clone().addScaledVector(toSteel, pipeR + 0.026), 0.014, 6));
      }
    } else if (opts.mount === 'sidePocket') {
      // Removable stanchion: full height above the floor, lower leg drops past the
      // grating into a DN50 tube sleeve (150 long) welded to the PFC face below.
      bottom = -leg;
      const sleeveR = 0.0302;
      const sleeveTop = bottom + 0.155;
      items.push(rod(new Vector3(p.x, p.y + bottom + 0.005, p.z), new Vector3(p.x, p.y + sleeveTop, p.z), sleeveR, 16));
      const plateC = new Vector3(p.x, p.y + bottom + 0.08, p.z).addScaledVector(toSteel, sleeveR + 0.005);
      items.push(orientedBox(plateC, new Vector3(0.08, 0.15, 0.01), runFlat, _up, across));
      // Locating collar on the stanchion, resting on the sleeve.
      items.push(rod(new Vector3(p.x, p.y + sleeveTop, p.z), new Vector3(p.x, p.y + sleeveTop + 0.02, p.z), sleeveR + 0.002, 16));
    }

    items.push(rod(new Vector3(p.x, p.y + bottom, p.z), new Vector3(p.x, p.y + H, p.z), pipeR, 16));
    items.push({ geom: ballGeom, matrix: at(new Vector3(p.x, p.y + H, p.z)) });
    if (midH != null) items.push({ geom: ballGeom, matrix: at(new Vector3(p.x, p.y + midH, p.z)) });
    snapPoints.push([p.x, p.y + H, p.z], [p.x, p.y, p.z]);
  }

  // ── Top rail (with hoops), split around a movable span if there is one ──
  const mv = opts.movable;
  const spanIdx = mv ? Math.round(mv.span) - 1 : -1;
  const hasMovable = !!mv && spanIdx >= 0 && spanIdx < posts.length - 1 && layout.straightSpans[spanIdx];

  const lowAt = (s: number) => {
    const p = pointAt(ext, cum, s);
    return new Vector3(p.x, p.y + lowH, p.z);
  };
  const startHoop = opts.hoopStart && posts.length ? [lowAt(sFirst), lowAt(0)] : [];
  const endHoop = opts.hoopEnd && posts.length ? [lowAt(total), lowAt(sLast)] : [];
  // Without a hoop the rail stops at the end stanchion.
  const topStart = opts.hoopStart ? 0 : sFirst;
  const topEnd = opts.hoopEnd ? total : sLast;

  const pushRail = (pts: Vector3[], r: number) => {
    const g = sweepTube(filletPolyline(pts, BEND_R), r);
    if (g.getAttribute('position')) items.push({ geom: g, matrix: _I });
  };

  if (hasMovable) {
    const sA = posts[spanIdx].s + shift;
    const sB = posts[spanIdx + 1].s + shift;
    pushRail([...startHoop, ...lift(slicePath(ext, cum, topStart, sA), H)], pipeR);
    pushRail([...lift(slicePath(ext, cum, sB, topEnd), H), ...endHoop], pipeR);

    const pA = posts[spanIdx].pos.clone().setY(posts[spanIdx].pos.y + H);
    const pB = posts[spanIdx + 1].pos.clone().setY(posts[spanIdx + 1].pos.y + H);
    const dir = new Vector3().subVectors(pB, pA).normalize();
    const spanLen = pA.distanceTo(pB);
    const open = Math.min(1, Math.max(0, mv!.open));
    if (mv!.type === 'slide') {
      // Telescoping sleeve rail that slides over the next fixed rail.
      const off = open * spanLen;
      const a = pA.clone().addScaledVector(dir, -0.05 + off);
      const b = pB.clone().addScaledVector(dir, 0.15 + off);
      items.push(rod(a, b, pipeR * 1.18, 16));
      // Guide collars on both posts.
      for (const p of [pA, pB]) {
        items.push(rod(p.clone().addScaledVector(dir, -0.04), p.clone().addScaledVector(dir, 0.04), pipeR * 1.45, 16));
      }
    } else {
      // Rail hinged at the first post, lifting up like a boom gate.
      const flat = new Vector3(dir.x, 0, dir.z).normalize();
      const axis = new Vector3().crossVectors(flat, _up).normalize();
      const q = new Quaternion().setFromAxisAngle(axis, open * (Math.PI / 2));
      const tip = new Vector3().subVectors(pB, pA).applyQuaternion(q).add(pA);
      items.push(rod(pA, tip, pipeR, 16));
      // Hinge knuckle at the pivot post and a saddle on the receiving post.
      items.push(rod(pA.clone().addScaledVector(axis, -0.04), pA.clone().addScaledVector(axis, 0.04), pipeR * 1.3, 12));
      const saddle = pB.clone().setY(pB.y - pipeR * 1.2);
      items.push(orientedBox(saddle, new Vector3(0.06, 0.012, pipeR * 3), flat, _up, axis));
    }
  } else {
    pushRail([...startHoop, ...lift(slicePath(ext, cum, topStart, topEnd), H), ...endHoop], pipeR);
  }

  // ── Mid / knee rail ─────────────────────────────────────────────────────
  if (midH != null) {
    if (sLast - sFirst > 0.01) pushRail(lift(slicePath(ext, cum, sFirst, sLast), midH), opts.midPipeR);
  }

  // ── Kickplate (100 x 6 FL) along the base line ─────────────────────────
  if (opts.kickplate) {
    for (let i = 0; i < base.length - 1; i++) {
      const p1 = base[i];
      const p2 = base[i + 1];
      const segLen = p1.distanceTo(p2);
      if (segLen < 1e-3) continue;
      const tangent = new Vector3().subVectors(p2, p1).normalize();
      const normal = new Vector3(-tangent.z, 0, tangent.x);
      if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
      normal.normalize();
      const kickUp = new Vector3().crossVectors(normal, tangent).normalize();
      const center = new Vector3().addVectors(p1, p2).multiplyScalar(0.5).addScaledVector(kickUp, 0.055);
      items.push(orientedBox(center, new Vector3(segLen, 0.1, 0.006), tangent, kickUp, normal));
    }
  }

  return { items, snapPoints, layout };
}
