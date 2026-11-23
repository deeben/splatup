import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  Path,
  Shape,
  TorusGeometry,
} from 'three';
import type { BeamLiftingPoint, LiftingPointType, SteelBeamObject } from '../../core/types';
import { mm } from '../../core/frame';
import type { SectionDef } from './steelSections';

/**
 * Lifting points that sit on a steel beam: welded padeyes and RUD-style load
 * rings (weld-on and bolt-on swivel).
 *
 * They are stored on the beam itself (`SteelBeamObject.liftingPoints`) rather
 * than as separate objects, so they move, rotate, roll and duplicate with the
 * beam and can never drift off it. Each one is positioned by distance along
 * the beam, which flange face it sits on, and an optional offset across the
 * flange.
 *
 * Sizes are picked from small catalogues keyed by working load limit (WLL).
 * They are realistic for layout and clash checking, but are INDICATIVE ONLY:
 * the actual padeye design, weld and rated hardware must come from the
 * engineer and the supplier's data sheet.
 */

const STEEL_DENSITY = 7850; // kg/m³

// ── Catalogues ────────────────────────────────────────────────────────────

/**
 * Tombstone padeye plate. Hole sized for a bow shackle of the same WLL
 * (Crosby G-209 style pin), plate thickness kept inside the shackle jaw.
 */
export interface PadeyeSize {
  wll: number;
  /** Shackle that suits the hole, for the label. */
  shackle: string;
  /** Hole diameter (mm). */
  hole: number;
  /** Plate thickness (mm). */
  thick: number;
  /** Outer radius of the rounded head; plate width is 2R (mm). */
  radius: number;
  /** Height of the hole centre above the flange face (mm). */
  holeHeight: number;
}

export const PADEYE_SIZES: PadeyeSize[] = [
  { wll: 1, shackle: '3/8" (1 t)', hole: 13, thick: 12, radius: 30, holeHeight: 45 },
  { wll: 2, shackle: '1/2" (2 t)', hole: 18, thick: 16, radius: 35, holeHeight: 55 },
  { wll: 3.25, shackle: '5/8" (3.25 t)', hole: 21, thick: 20, radius: 45, holeHeight: 65 },
  { wll: 4.75, shackle: '3/4" (4.75 t)', hole: 25, thick: 25, radius: 50, holeHeight: 75 },
  { wll: 6.5, shackle: '7/8" (6.5 t)', hole: 28, thick: 30, radius: 55, holeHeight: 85 },
  { wll: 8.5, shackle: '1" (8.5 t)', hole: 31, thick: 32, radius: 65, holeHeight: 95 },
  { wll: 12, shackle: '1-1/4" (12 t)', hole: 38, thick: 40, radius: 75, holeHeight: 110 },
];

/** Weld-on load ring: a weld block with a forged ring hinged through it. */
export interface RudWeldSize {
  wll: number;
  /** Weld block length × width × height (mm). Length runs in the ring plane. */
  block: [number, number, number];
  /** Ring bar diameter (mm). */
  bar: number;
  /** Clear inside diameter of the ring (mm). */
  inner: number;
  /** Catalogue-style mass (kg). */
  mass: number;
}

export const RUD_WELD_SIZES: RudWeldSize[] = [
  { wll: 1.5, block: [50, 30, 22], bar: 10, inner: 40, mass: 0.3 },
  { wll: 2.5, block: [60, 38, 28], bar: 13, inner: 48, mass: 0.6 },
  { wll: 4, block: [75, 45, 32], bar: 16, inner: 58, mass: 1.1 },
  { wll: 6.7, block: [90, 55, 40], bar: 20, inner: 70, mass: 2.0 },
  { wll: 10, block: [110, 65, 48], bar: 24, inner: 85, mass: 3.6 },
  { wll: 16, block: [135, 80, 58], bar: 30, inner: 100, mass: 6.5 },
];

/** Bolt-on swivel load ring: round swivel base, bracket and ring, bolted through the flange. */
export interface RudBoltSize {
  wll: number;
  /** Bolt diameter (mm), e.g. 16 for M16. */
  bolt: number;
  /** Swivel base diameter × height (mm). */
  base: [number, number];
  bar: number;
  inner: number;
  mass: number;
}

export const RUD_BOLT_SIZES: RudBoltSize[] = [
  { wll: 1, bolt: 12, base: [42, 22], bar: 10, inner: 38, mass: 0.4 },
  { wll: 1.5, bolt: 16, base: [52, 28], bar: 13, inner: 45, mass: 0.7 },
  { wll: 2.5, bolt: 20, base: [62, 34], bar: 16, inner: 55, mass: 1.2 },
  { wll: 4, bolt: 24, base: [75, 40], bar: 18, inner: 65, mass: 2.0 },
  { wll: 6.7, bolt: 30, base: [92, 50], bar: 22, inner: 80, mass: 3.8 },
  { wll: 10, bolt: 36, base: [110, 60], bar: 26, inner: 95, mass: 6.0 },
];

export const LIFTING_LABEL: Record<LiftingPointType, string> = {
  padeye: 'Padeye',
  rudWeld: 'RUD ring (weld-on)',
  rudBolt: 'RUD ring (bolt-on)',
};

/** WLL choices for a given type, smallest first. */
export function wllOptions(type: LiftingPointType): number[] {
  if (type === 'padeye') return PADEYE_SIZES.map((s) => s.wll);
  if (type === 'rudWeld') return RUD_WELD_SIZES.map((s) => s.wll);
  return RUD_BOLT_SIZES.map((s) => s.wll);
}

/** Smallest catalogue entry that carries at least `wll`, else the largest. */
function pick<T extends { wll: number }>(list: T[], wll: number): T {
  return list.find((s) => s.wll >= wll - 1e-6) ?? list[list.length - 1];
}

export const padeyeSize = (wll: number) => pick(PADEYE_SIZES, wll);
export const rudWeldSize = (wll: number) => pick(RUD_WELD_SIZES, wll);
export const rudBoltSize = (wll: number) => pick(RUD_BOLT_SIZES, wll);

/** Nearest catalogue WLL for a type, so switching type keeps a sensible size. */
export function nearestWll(type: LiftingPointType, wll: number): number {
  const opts = wllOptions(type);
  return opts.reduce((best, w) => (Math.abs(w - wll) < Math.abs(best - wll) ? w : best), opts[0]);
}

// ── Placement ─────────────────────────────────────────────────────────────

/**
 * Default offset across the flange (mm, from the section centreline) when the
 * user hasn't set one. Welded items sit on the centreline; a bolt-on ring
 * can't go through the web, so on open sections it moves to the middle of a
 * flange outstand.
 */
export function autoLateral(sec: SectionDef, p: BeamLiftingPoint): number {
  const B = sec.flangeWidth;
  const tw = sec.webThick;
  if (sec.category === 'EA') {
    // Top "face" of an angle is the tip of the vertical leg (at the -Z side).
    if (p.face === 'top') return -B / 2 + tw / 2;
    return tw / 2; // middle of the horizontal leg, clear of the vertical one
  }
  if (p.type !== 'rudBolt') return 0;
  if (sec.category === 'UB' || sec.category === 'UC') return (B / 2 + tw / 2) / 2;
  if (sec.category === 'PFC') return tw / 2; // web is on the -Z side
  return 0; // SHS / RHS: bolt into the tube (blind bolt / nut inside)
}

export function lateralOf(sec: SectionDef, p: BeamLiftingPoint): number {
  return p.lateral ?? autoLateral(sec, p);
}

// ── Geometry ──────────────────────────────────────────────────────────────

/** A part in "fitting space": metres, Y up off the flange face (Y=0), ring/plate plane = XY. */
interface Part {
  geom: BufferGeometry;
  matrix: Matrix4;
}

const m4 = () => new Matrix4();

function padeyeParts(p: BeamLiftingPoint): Part[] {
  const s = padeyeSize(p.wll);
  const R = mm(s.radius);
  const h = mm(s.holeHeight);
  const t = mm(s.thick);

  // Tombstone: straight sides up to the hole centre, semicircular head.
  const shape = new Shape();
  shape.moveTo(-R, 0);
  shape.lineTo(R, 0);
  shape.lineTo(R, h);
  shape.absarc(0, h, R, 0, Math.PI, false);
  shape.lineTo(-R, 0);
  const hole = new Path();
  hole.absarc(0, h, mm(s.hole) / 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geom = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 24 });
  return [{ geom, matrix: m4().makeTranslation(0, 0, -t / 2) }];
}

/** Ring standing up in the XY plane with its lowest bar centre at `barY`. */
function ringPart(bar: number, inner: number, barY: number): Part {
  const r = mm(bar) / 2;
  const Rm = mm(inner) / 2 + r;
  const geom = new TorusGeometry(Rm, r, 20, 40);
  return { geom, matrix: m4().makeTranslation(0, barY + Rm, 0) };
}

function rudWeldParts(p: BeamLiftingPoint): Part[] {
  const s = rudWeldSize(p.wll);
  const [L, W, H] = s.block.map(mm);
  // Block with its top edges chamfered by a third of the height (reads like the forged block).
  const c = H / 3;
  const shape = new Shape();
  shape.moveTo(-L / 2, 0);
  shape.lineTo(L / 2, 0);
  shape.lineTo(L / 2, H - c);
  shape.lineTo(L / 2 - c, H);
  shape.lineTo(-L / 2 + c, H);
  shape.lineTo(-L / 2, H - c);
  shape.closePath();
  const block = new ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
  return [
    { geom: block, matrix: m4().makeTranslation(0, 0, -W / 2) },
    // Ring hinges through the upper part of the block.
    ringPart(s.bar, s.inner, H * 0.7),
  ];
}

function rudBoltParts(p: BeamLiftingPoint, flangeThick: number): Part[] {
  const s = rudBoltSize(p.wll);
  const d = mm(s.bolt);
  const [Db, Hb] = s.base.map(mm);
  const tf = mm(flangeThick);

  const parts: Part[] = [];
  // Swivel base.
  parts.push({ geom: new CylinderGeometry(Db / 2, Db / 2, Hb * 0.6, 32), matrix: m4().makeTranslation(0, Hb * 0.3, 0) });
  // Bracket (bow) that carries the ring.
  parts.push({ geom: new BoxGeometry(Db * 0.55, Hb * 0.4, Db * 0.45), matrix: m4().makeTranslation(0, Hb * 0.8, 0) });
  // Ring.
  parts.push(ringPart(s.bar, s.inner, Hb * 0.85));
  // Bolt shank through the flange, washer and hex nut on the far side.
  const washerT = d * 0.2;
  const nutH = d * 0.8;
  const shankLen = tf + washerT + nutH + d * 0.3;
  parts.push({ geom: new CylinderGeometry(d / 2, d / 2, shankLen, 16), matrix: m4().makeTranslation(0, -shankLen / 2, 0) });
  parts.push({ geom: new CylinderGeometry(d * 1.1, d * 1.1, washerT, 24), matrix: m4().makeTranslation(0, -tf - washerT / 2, 0) });
  // CylinderGeometry radius is to the corners: across-flats ≈ 1.5d → corner radius = 0.75d / cos30°.
  const nutR = (d * 0.75) / Math.cos(Math.PI / 6);
  parts.push({ geom: new CylinderGeometry(nutR, nutR, nutH, 6), matrix: m4().makeTranslation(0, -tf - washerT - nutH / 2, 0) });
  return parts;
}

/**
 * Fitting geometry for every lifting point on a beam, in the beam's local
 * three.js frame with the section centred on Y=0, Z=0 and the length running
 * 0 → L along +X (i.e. before the beam's alignment offset and roll are applied).
 * Returns the parts to merge and a snap point at each lifting eye.
 */
export function buildLiftingPointParts(
  obj: SteelBeamObject,
  sec: SectionDef,
): { parts: Part[]; snapPoints: [number, number, number][] } {
  const parts: Part[] = [];
  const snapPoints: [number, number, number][] = [];
  const D = mm(sec.depth);
  for (const p of obj.liftingPoints ?? []) {
    const x = mm(Math.min(Math.max(p.offset, 0), obj.length));
    const z = mm(lateralOf(sec, p));
    const down = p.face === 'bottom';

    const local =
      p.type === 'padeye'
        ? padeyeParts(p)
        : p.type === 'rudWeld'
          ? rudWeldParts(p)
          : rudBoltParts(p, sec.flangeThick);

    // Fitting space → beam space: turn across the beam if asked, flip under
    // the bottom flange, then move onto the face.
    const place = m4().makeTranslation(x, down ? -D / 2 : D / 2, z);
    if (down) place.multiply(m4().makeRotationX(Math.PI));
    if (p.orientation === 'across') place.multiply(m4().makeRotationY(Math.PI / 2));

    for (const part of local) {
      parts.push({ geom: part.geom, matrix: place.clone().multiply(part.matrix) });
    }

    // Snap to the eye: hole centre for a padeye, top of the ring otherwise.
    const eyeH =
      p.type === 'padeye'
        ? mm(padeyeSize(p.wll).holeHeight)
        : p.type === 'rudWeld'
          ? mm(rudWeldSize(p.wll).block[2] * 0.7 + rudWeldSize(p.wll).inner + rudWeldSize(p.wll).bar * 1.5)
          : mm(rudBoltSize(p.wll).base[1] * 0.85 + rudBoltSize(p.wll).inner + rudBoltSize(p.wll).bar * 1.5);
    snapPoints.push([x, down ? -D / 2 - eyeH : D / 2 + eyeH, z]);
  }
  return { parts, snapPoints };
}

/** Approximate steel mass of one lifting point (kg). */
export function liftingPointMass(p: BeamLiftingPoint): number {
  if (p.type === 'rudWeld') return rudWeldSize(p.wll).mass;
  if (p.type === 'rudBolt') return rudBoltSize(p.wll).mass;
  const s = padeyeSize(p.wll);
  const R = s.radius / 1000;
  const h = s.holeHeight / 1000;
  const area = 2 * R * h + (Math.PI * R * R) / 2 - Math.PI * (s.hole / 2000) ** 2;
  return area * (s.thick / 1000) * STEEL_DENSITY;
}

/** Total mass of all lifting points on a beam (kg). */
export function beamLiftingMass(obj: SteelBeamObject): number {
  return (obj.liftingPoints ?? []).reduce((sum, p) => sum + liftingPointMass(p), 0);
}

/** Short one-line summary for BOM rows, e.g. "2x Padeye 2t, 1x RUD weld 4t" (plain ASCII for the PDF fonts). */
export function liftingSummary(obj: SteelBeamObject): string {
  const short: Record<LiftingPointType, string> = { padeye: 'Padeye', rudWeld: 'RUD weld', rudBolt: 'RUD bolt' };
  const counts = new Map<string, number>();
  for (const p of obj.liftingPoints ?? []) {
    const wll =
      p.type === 'padeye' ? padeyeSize(p.wll).wll : p.type === 'rudWeld' ? rudWeldSize(p.wll).wll : rudBoltSize(p.wll).wll;
    const key = `${short[p.type]} ${wll}t`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${n}x ${k}`).join(', ');
}
