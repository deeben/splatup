import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import type { JibCraneObject, SteelBeamObject } from '../../core/types';
import { mm } from '../../core/frame';
import { STEEL_CATALOGUE, buildSteelBeamGeometry, type SectionDef } from './steelSections';

/**
 * Column-mounted slewing jib crane (bolt-on or weld-on, low-headroom or over-braced).
 *
 * Everything here is worked out in millimetres in the object's local three.js frame
 * (X = outreach, Y = up, Z = across the column flange) and converted to metres at the
 * very end, so the numbers read like a fabrication drawing.
 *
 *   origin  = column flange face, top of boom steel (TOS), on the pivot line
 *   column  = behind the origin (−X)
 *   pivot   = vertical pin axis, PIVOT_OFFSET in front of the flange face
 *
 * Parts are split into "fixed" (brackets, column stub) and "slewing" (boom, brace,
 * hoist). The slewing group is rotated about the pin axis by `slewAngle`.
 *
 * Plate and pin sizes are typical detailing proportions for visualisation and
 * clash checking, not a structural design.
 */

const STEEL_DENSITY = 7.85e-6; // kg/mm³

/** Pin axis distance in front of the column flange face (mm). */
export const PIVOT_OFFSET = 180;
const PLATE_T = 20; // bracket mounting plate thickness
const PLATE_H = 300; // bracket mounting plate height
const LUG_T = 20; // horizontal pin lug thickness
const LUG_GAP = 70; // clear gap between lugs (= knuckle height)
const LUG_W = 140; // lug width across the flange
const PIN_D = 40;
const KNUCKLE_D = 80;
const BOLT_D = 24; // M24 clamp rods
const NUT_D = 40;
const NUT_T = 20;
const CLAMP_EDGE = 70; // bolt-on plate overhang past each flange edge
const WELD_LEG = 8;
const TROLLEY_LEN = 260;
/** Lug tip, measured from the column face (mm). */
const LUG_END = PIVOT_OFFSET + 45;
/** Clear gap between the knuckle and the heel post / heel plate (mm). */
const HEEL_GAP = 30;
/** Distance from the pivot pin to the face of the slewing heel (mm). */
const HEEL_FROM_PIN = KNUCKLE_D / 2 + HEEL_GAP;

export type JibPart = 'fixed' | 'slewing';

export interface JibMetrics {
  boom: SectionDef;
  column: SectionDef;
  /** Hoist trolley reach limits, measured from the pivot pin (mm). */
  minHookApproach: number;
  maxHookReach: number;
  /** Trolley position after clamping to the reach limits (mm from pivot). */
  trolleyPosition: number;
  /** Highest steel above TOS of boom (mm). Space needed above the boom. */
  headroomAboveTos: number;
  /** Lowest bracket steel below TOS of boom (mm, positive down). */
  bracketDepthBelowTos: number;
  /** Underside of hook block below TOS when the hoist is shown (mm, positive down). */
  hookBelowTos: number;
  /** Brace / tie description for schedules. */
  braceLabel: string;
  /** Estimated fabricated mass: boom, brace, post, plates (excludes column, hoist, bolts). */
  massKg: number;
}

interface Part {
  geom: BufferGeometry;
  matrix: Matrix4;
  group: JibPart;
}

const _q = new Quaternion();
const _one = new Vector3(1, 1, 1);
const _yUp = new Vector3(0, 1, 0);

function sec(name: string, fallback: string): SectionDef {
  return STEEL_CATALOGUE[name] ?? STEEL_CATALOGUE[fallback];
}

/** Brace size follows the boom: small booms get 100 SHS, bigger ones 150 SHS. */
function braceSectionFor(boom: SectionDef): string {
  return boom.depth >= 300 ? '150x150 SHS' : '100x100 SHS';
}

/** Reach limits and headroom numbers, without building any geometry. Used by the panel. */
export function computeJibMetrics(o: JibCraneObject): JibMetrics {
  const boom = sec(o.boomSection, '250UB37');
  const column = sec(o.columnSection, '310UC97');
  const D = boom.depth;
  const H = Math.max(300, o.bracketCentres);
  const S = Math.max(800, o.span);
  const brace = sec(braceSectionFor(boom), '100x100 SHS');
  const P = brace.depth;

  let minHookApproach: number;
  let headroomAboveTos: number;
  let bracketDepthBelowTos: number;
  let braceLabel: string;
  let massKg = 0;

  if (o.bracing === 'lowHeadroom') {
    // Brace lands on the boom underside 45° out from the heel post.
    const postFront = HEEL_FROM_PIN + P; // from pivot
    const rise = H - D / 2 - 50;
    const braceEnd = postFront + rise;
    minHookApproach = braceEnd + TROLLEY_LEN / 2 + 50;
    headroomAboveTos = Math.max(0, PLATE_H / 2 - D / 2);
    bracketDepthBelowTos = D / 2 + H + PLATE_H / 2;
    braceLabel = `${brace.label} knee brace + heel post`;
    massKg += (brace.mass * (rise * Math.SQRT2 + H + D / 2)) / 1000;
    massKg += (boom.mass * (S - postFront)) / 1000;
  } else {
    minHookApproach = HEEL_FROM_PIN + PLATE_T + TROLLEY_LEN / 2 + 50;
    headroomAboveTos = H - D / 2 + PLATE_H / 2;
    bracketDepthBelowTos = D / 2 + PLATE_H / 2;
    braceLabel = 'Ø60 CHS tie bar';
    const tieX = 0.75 * S;
    const tieLen = Math.hypot(tieX, H - D / 2);
    massKg += (5.2 * tieLen) / 1000; // 60.3 x 3.6 CHS ≈ 5.0 kg/m
    massKg += (boom.mass * (S - HEEL_FROM_PIN - PLATE_T)) / 1000;
  }

  // Bracket plates, lugs and (bolt-on) rear clamp plates, two brackets.
  const plateW = o.mounting === 'boltOn' ? column.flangeWidth + 2 * CLAMP_EDGE : Math.max(150, column.flangeWidth - 10);
  const lugLen = LUG_END - PLATE_T;
  let plateVol = PLATE_T * PLATE_H * plateW + 2 * LUG_T * LUG_W * lugLen;
  if (o.mounting === 'boltOn') plateVol += PLATE_T * PLATE_H * plateW;
  massKg += 2 * plateVol * STEEL_DENSITY;

  const maxHookReach = S - TROLLEY_LEN / 2 - 40;
  const trolleyPosition = Math.min(maxHookReach, Math.max(minHookApproach, o.trolleyPosition));
  const hookBelowTos = D + 140 + 320 + 300 + 120;

  return {
    boom,
    column,
    minHookApproach: Math.round(minHookApproach),
    maxHookReach: Math.round(maxHookReach),
    trolleyPosition: Math.round(trolleyPosition),
    headroomAboveTos: Math.round(headroomAboveTos),
    bracketDepthBelowTos: Math.round(bracketDepthBelowTos),
    hookBelowTos: Math.round(hookBelowTos),
    braceLabel,
    massKg: Math.round(massKg * 10) / 10,
  };
}

export function buildJibCraneGeometry(o: JibCraneObject): {
  geometry: BufferGeometry;
  snapPoints: [number, number, number][];
  metrics: JibMetrics;
} {
  const m = computeJibMetrics(o);
  const parts: Part[] = [];
  const snapsFixed: Vector3[] = [];
  const snapsSlew: Vector3[] = [];

  const D = m.boom.depth;
  const B = m.boom.flangeWidth;
  const H = Math.max(300, o.bracketCentres);
  const S = Math.max(800, o.span);
  const e = PIVOT_OFFSET;
  const brace = sec(braceSectionFor(m.boom), '100x100 SHS');
  const P = brace.depth;

  /** Axis-aligned box from its centre and size (mm). */
  const box = (group: JibPart, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
    parts.push({
      geom: new BoxGeometry(sx, sy, sz),
      matrix: new Matrix4().makeTranslation(cx, cy, cz),
      group,
    });
  };

  /** Cylinder between two points (mm). */
  const rod = (group: JibPart, a: Vector3, b: Vector3, d: number, segments = 16) => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) return;
    _q.setFromUnitVectors(_yUp, dir.normalize());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    parts.push({
      geom: new CylinderGeometry(d / 2, d / 2, len, segments),
      matrix: new Matrix4().compose(mid, _q.clone(), _one),
      group,
    });
  };

  /**
   * Catalogue steel member from `a` to `b` (mm). The section's depth stays in the
   * vertical plane through the member (web vertical for a horizontal boom).
   */
  const member = (group: JibPart, sectionName: string, a: Vector3, b: Vector3) => {
    const len = a.distanceTo(b);
    if (len < 1) return;
    const fake = {
      kind: 'beam',
      sectionName,
      length: len,
      alignment: 'center',
      rollAngle: 0,
    } as SteelBeamObject;
    const { geometry } = buildSteelBeamGeometry(fake);
    // Normalise to mm and run along +X from 0 to len, whatever way the extrusion went.
    geometry.scale(1000, 1000, 1000);
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(-bb.min.x, 0, 0);
    // Orient: +X → direction a→b, staying in the vertical plane (Y up).
    const dir = b.clone().sub(a).normalize();
    const yaw = Math.atan2(-dir.z, dir.x);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const rot = new Matrix4().makeRotationY(yaw).multiply(new Matrix4().makeRotationZ(pitch));
    parts.push({ geom: geometry, matrix: new Matrix4().makeTranslation(a.x, a.y, a.z).multiply(rot), group });
  };

  const v = (x: number, y: number, z = 0) => new Vector3(x, y, z);

  // ---------------------------------------------------------------- brackets (fixed)
  const col = m.column;
  const boltOn = o.mounting === 'boltOn';
  const plateW = boltOn ? col.flangeWidth + 2 * CLAMP_EDGE : Math.max(150, col.flangeWidth - 10);

  const bracket = (yb: number) => {
    // Mounting plate on the flange face.
    box('fixed', PLATE_T / 2, yb, 0, PLATE_T, PLATE_H, plateW);
    // Two horizontal lugs carrying the pin, with a stiffener between them.
    const lugLen = LUG_END - PLATE_T;
    const lugCx = PLATE_T + lugLen / 2;
    const lugOff = LUG_GAP / 2 + LUG_T / 2;
    box('fixed', lugCx, yb + lugOff, 0, lugLen, LUG_T, LUG_W);
    box('fixed', lugCx, yb - lugOff, 0, lugLen, LUG_T, LUG_W);
    const stiffLen = e - KNUCKLE_D / 2 - 10 - PLATE_T;
    box('fixed', PLATE_T + stiffLen / 2, yb, 0, stiffLen, LUG_GAP, 16);
    // Lug gussets under the bottom lug and over the top lug.
    box('fixed', PLATE_T + 50, yb - lugOff - LUG_T / 2 - 50, 0, 100, 100, 12);
    box('fixed', PLATE_T + 50, yb + lugOff + LUG_T / 2 + 50, 0, 100, 100, 12);
    // Pin, poking through both lugs.
    rod('fixed', v(e, yb - lugOff - LUG_T / 2 - 15), v(e, yb + lugOff + LUG_T / 2 + 15), PIN_D);

    if (boltOn) {
      // Rear clamp plates behind the flange, one each side of the web, tied with M24 rods.
      const tf = col.flangeThick;
      const innerZ = col.webThick / 2 + 10;
      const outerZ = col.flangeWidth / 2 + CLAMP_EDGE;
      const rearW = outerZ - innerZ;
      for (const side of [-1, 1]) {
        box('fixed', -tf - PLATE_T / 2, yb, side * (innerZ + rearW / 2), PLATE_T, PLATE_H, rearW);
        const zb = side * (col.flangeWidth / 2 + CLAMP_EDGE / 2);
        for (const dy of [-PLATE_H / 2 + 40, PLATE_H / 2 - 40]) {
          const x0 = -tf - PLATE_T - NUT_T - 10;
          const x1 = PLATE_T + NUT_T + 10;
          rod('fixed', v(x0, yb + dy, zb), v(x1, yb + dy, zb), BOLT_D, 10);
          // Hex nuts both ends.
          rod('fixed', v(PLATE_T, yb + dy, zb), v(PLATE_T + NUT_T, yb + dy, zb), NUT_D, 6);
          rod('fixed', v(-tf - PLATE_T - NUT_T, yb + dy, zb), v(-tf - PLATE_T, yb + dy, zb), NUT_D, 6);
        }
      }
    } else {
      // Fillet welds all round the plate where it meets the flange (diamond section,
      // half buried, so the visible part reads as a fillet).
      const leg = WELD_LEG * Math.SQRT2;
      const weld = (cy: number, cz: number, len: number, alongZ: boolean) => {
        const g = new BoxGeometry(leg, alongZ ? leg : len, alongZ ? len : leg);
        const rot = alongZ ? new Matrix4().makeRotationZ(Math.PI / 4) : new Matrix4().makeRotationY(Math.PI / 4);
        parts.push({ geom: g, matrix: new Matrix4().makeTranslation(0, cy, cz).multiply(rot), group: 'fixed' });
      };
      weld(yb + PLATE_H / 2, 0, plateW, true);
      weld(yb - PLATE_H / 2, 0, plateW, true);
      weld(yb, plateW / 2, PLATE_H, false);
      weld(yb, -plateW / 2, PLATE_H, false);
    }

    snapsFixed.push(v(e, yb), v(PLATE_T, yb + PLATE_H / 2, 0), v(PLATE_T, yb - PLATE_H / 2, 0));
  };

  // Pin heights for each arrangement.
  let topPin: number;
  let botPin: number;
  if (o.bracing === 'lowHeadroom') {
    topPin = -D / 2;
    botPin = topPin - H;
  } else {
    botPin = -D / 2;
    topPin = botPin + H;
  }
  bracket(topPin);
  bracket(botPin);

  // ---------------------------------------------------------------- column stub (fixed)
  if (o.showColumn) {
    const yLo = botPin - PLATE_H / 2 - 600;
    const yHi = topPin + PLATE_H / 2 + 600;
    // Vertical member: web runs along X so a flange faces the jib.
    const fake = { kind: 'beam', sectionName: col.name, length: yHi - yLo, alignment: 'center', rollAngle: 0 } as SteelBeamObject;
    const { geometry } = buildSteelBeamGeometry(fake);
    geometry.scale(1000, 1000, 1000);
    geometry.computeBoundingBox();
    geometry.translate(-geometry.boundingBox!.min.x, 0, 0);
    // Length X → up (Y); depth Y → −X.
    geometry.rotateZ(Math.PI / 2);
    parts.push({ geom: geometry, matrix: new Matrix4().makeTranslation(-col.depth / 2, yLo, 0), group: 'fixed' });
  }

  // ---------------------------------------------------------------- slewing parts
  // Knuckles around each pin.
  const knuckle = (yb: number) => rod('slewing', v(e, yb - LUG_GAP / 2 + 2), v(e, yb + LUG_GAP / 2 - 2), KNUCKLE_D, 20);
  knuckle(topPin);
  knuckle(botPin);

  const tipX = e + S;
  let boomStartX: number;

  if (o.bracing === 'lowHeadroom') {
    // Heel post between the pins, boom off its front face, 45° knee brace underneath.
    const postX = e + HEEL_FROM_PIN + P / 2;
    member('slewing', brace.name, v(postX, botPin - LUG_GAP / 2), v(postX, 0));
    // Knuckle-to-post connection plates (sit between the lugs).
    for (const yb of [topPin, botPin]) box('slewing', (e + postX) / 2, yb, 0, postX - e, 20, LUG_GAP);
    // Post cap plate.
    box('slewing', postX, 5, 0, P + 20, 10, P + 20);
    boomStartX = postX + P / 2;

    const rise = H - D / 2 - 50;
    const bx0 = boomStartX;
    const by0 = botPin + 50;
    const bx1 = bx0 + rise;
    const by1 = -D;
    member('slewing', brace.name, v(bx0, by0), v(bx1, by1));
    snapsSlew.push(v(bx1, by1), v(postX, botPin - LUG_GAP / 2));
  } else {
    // Boom heel end plate pinned at the bottom bracket; tie bar from the top pin.
    const heelX = e + HEEL_FROM_PIN;
    box('slewing', (e + heelX) / 2, botPin, 0, heelX - e, 20, LUG_GAP);
    box('slewing', heelX + PLATE_T / 2, -D / 2, 0, PLATE_T, D, B);
    boomStartX = heelX + PLATE_T;

    const tieX = e + 0.75 * S;
    // Tie lug on top flange.
    box('slewing', tieX, 45, 0, 160, 90, 16);
    // Fork at the top knuckle.
    box('slewing', e + HEEL_FROM_PIN, topPin, 0, 60, 20, LUG_GAP);
    const t0 = v(e + HEEL_FROM_PIN + 20, topPin);
    const t1 = v(tieX, 55);
    rod('slewing', t0, t1, 60.3, 16);
    snapsSlew.push(t0, t1);
  }

  // Boom (TOS at y = 0, web vertical).
  member('slewing', m.boom.name, v(boomStartX, -D / 2), v(tipX, -D / 2));
  // End plate and trolley end stops.
  box('slewing', tipX + 5, -D / 2, 0, 10, D, B);
  for (const side of [-1, 1]) box('slewing', tipX - 30, -D - 40, side * (B / 2 - 20), 20, 80, 40);

  snapsSlew.push(
    v(boomStartX, 0),
    v(boomStartX, -D),
    v(tipX, 0),
    v(tipX, -D),
    v(tipX, 0, B / 2),
    v(tipX, 0, -B / 2),
    v((boomStartX + tipX) / 2, 0),
    v((boomStartX + tipX) / 2, -D),
  );

  // Hoist and trolley.
  if (o.showHoist) {
    const tx = e + m.trolleyPosition;
    const yTrolley = -D - 20 - 60;
    box('slewing', tx, yTrolley, 0, TROLLEY_LEN, 120, B + 80);
    // Trolley side plates up beside the bottom flange.
    for (const side of [-1, 1]) box('slewing', tx, -D + 10, side * (B / 2 + 30), TROLLEY_LEN - 40, 60, 10);
    const yHoistTop = -D - 140;
    box('slewing', tx, yHoistTop - 160, 0, 280, 320, 260);
    const yRopeTop = yHoistTop - 320;
    rod('slewing', v(tx, yRopeTop), v(tx, yRopeTop - 300), 12, 8);
    box('slewing', tx, yRopeTop - 300 - 60, 0, 80, 120, 50);
    snapsSlew.push(v(tx, -m.hookBelowTos));
  }

  // ---------------------------------------------------------------- merge
  const theta = (o.slewAngle * Math.PI) / 180;
  const slew = new Matrix4()
    .makeTranslation(e, 0, 0)
    .multiply(new Matrix4().makeRotationY(theta))
    .multiply(new Matrix4().makeTranslation(-e, 0, 0));
  const toMetres = new Matrix4().makeScale(mm(1), mm(1), mm(1));

  const geometry = mergeParts(parts, slew, toMetres);

  const snapPoints: [number, number, number][] = [];
  for (const p of snapsFixed) {
    const q = p.clone().applyMatrix4(toMetres);
    snapPoints.push([q.x, q.y, q.z]);
  }
  for (const p of snapsSlew) {
    const q = p.clone().applyMatrix4(slew).applyMatrix4(toMetres);
    snapPoints.push([q.x, q.y, q.z]);
  }

  return { geometry, snapPoints, metrics: m };
}

/** Flattens every part to plain triangles, applies its transform, and merges. */
function mergeParts(parts: Part[], slew: Matrix4, toMetres: Matrix4): BufferGeometry {
  const flat: { pos: ArrayLike<number>; count: number; matrix: Matrix4 }[] = [];
  let total = 0;
  for (const p of parts) {
    const g = p.geom.index ? p.geom.toNonIndexed() : p.geom;
    const pos = g.getAttribute('position');
    const matrix = toMetres.clone();
    if (p.group === 'slewing') matrix.multiply(slew);
    matrix.multiply(p.matrix);
    flat.push({ pos: pos.array, count: pos.count, matrix });
    total += pos.count;
    if (g !== p.geom) g.dispose();
    p.geom.dispose();
  }

  const out = new Float32Array(total * 3);
  const tmp = new Vector3();
  let offset = 0;
  for (const f of flat) {
    for (let i = 0; i < f.count; i++) {
      tmp.set(f.pos[i * 3], f.pos[i * 3 + 1], f.pos[i * 3 + 2]).applyMatrix4(f.matrix);
      out[(offset + i) * 3] = tmp.x;
      out[(offset + i) * 3 + 1] = tmp.y;
      out[(offset + i) * 3 + 2] = tmp.z;
    }
    offset += f.count;
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(out, 3));
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
