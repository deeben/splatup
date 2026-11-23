import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { HandrailObject, LadderObject, SwingGateObject, Vec3 } from '../../core/types';
import { mm } from '../../core/frame';
import { buildRailSystem, layoutRailSystem, mergeGeometries, type RailLayout } from './handrailSystem';

// Reusable scratch objects to avoid allocation
const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);

/** Scene-space base line for a handrail object (user mm Z-up → three metres Y-up). */
export function handrailPath(obj: HandrailObject): Vector3[] {
  const rawPts = obj.points.length >= 2 ? obj.points : [[-1000, 0, 0] as Vec3, [1000, 0, 0] as Vec3];
  return rawPts.map((p) => new Vector3(mm(p[0]), mm(p[2]), -mm(p[1])));
}

function hoopFlags(obj: HandrailObject) {
  const h = obj.endHoops ?? 'none';
  return { hoopStart: h === 'both' || h === 'start', hoopEnd: h === 'both' || h === 'end' };
}

/** Stanchion layout for a handrail object (used by the property panel and BOM). */
export function handrailLayout(obj: HandrailObject): RailLayout {
  return layoutRailSystem(handrailPath(obj), {
    height: mm(obj.height),
    postSpacing: mm(obj.stanchionSpacing),
    hoopInset: true,
    ...hoopFlags(obj),
  });
}

/**
 * Builds full Monowills-style industrial handrail geometry.
 */
export function buildMonowillsHandrail(obj: HandrailObject): {
  geometry: BufferGeometry;
  snapPoints: [number, number, number][];
} {
  const pipeR = mm(obj.pipeDiameter) / 2;
  const { items, snapPoints } = buildRailSystem({
    path: handrailPath(obj),
    height: mm(obj.height),
    postSpacing: mm(obj.stanchionSpacing),
    pipeR,
    midPipeR: pipeR * 0.8,
    hoopInset: true,
    ...hoopFlags(obj),
    kickplate: obj.hasKickplate,
    mount: obj.mount ?? 'base',
    mountSide: obj.mountSide === 'right' ? -1 : 1,
    sideLeg: mm(obj.sideLegLength ?? 300),
    movable: obj.movableSpan ?? null,
  });
  return { geometry: mergeGeometries(items), snapPoints };
}

/**
 * Builds Monowills self-closing safety swing gate module.
 */
export function buildSwingGate(obj: SwingGateObject): {
  geometry: BufferGeometry;
  snapPoints: [number, number, number][];
} {
  const items: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const snapPoints: [number, number, number][] = [];

  const W = mm(obj.width);
  const H = mm(obj.height);
  const pipeR = mm(38) / 2; // ~19mm
  const ballR = pipeR * 1.5;
  const swingRad = (obj.swingAngle * Math.PI) / 180;

  // Stanchion templates
  const postGeom = new CylinderGeometry(pipeR, pipeR, H, 16);
  const ballGeom = new SphereGeometry(ballR, 16, 12);
  const baseGeom = new BoxGeometry(mm(120), mm(12), mm(120));

  // 1. Hinge Post (left at x = -W/2)
  const leftX = -W / 2;
  items.push({
    geom: baseGeom,
    matrix: new Matrix4().compose(new Vector3(leftX, mm(6), 0), _q.identity(), _s),
  });
  items.push({
    geom: postGeom,
    matrix: new Matrix4().compose(new Vector3(leftX, H / 2, 0), _q.identity(), _s),
  });
  items.push({
    geom: ballGeom,
    matrix: new Matrix4().compose(new Vector3(leftX, H, 0), _q.identity(), _s),
  });

  // 2. Latch / Stop Post (right at x = +W/2)
  const rightX = W / 2;
  items.push({
    geom: baseGeom,
    matrix: new Matrix4().compose(new Vector3(rightX, mm(6), 0), _q.identity(), _s),
  });
  items.push({
    geom: postGeom,
    matrix: new Matrix4().compose(new Vector3(rightX, H / 2, 0), _q.identity(), _s),
  });
  items.push({
    geom: ballGeom,
    matrix: new Matrix4().compose(new Vector3(rightX, H, 0), _q.identity(), _s),
  });

  // 3. Swing Gate Leaf (pivots around hinge post at leftX)
  const gateW = W - mm(60); // clearance gap
  const gateGeomItems: { geom: BufferGeometry; matrix: Matrix4 }[] = [];

  const gateTopRail = new CylinderGeometry(pipeR * 0.9, pipeR * 0.9, gateW, 16);
  const gateMidRail = new CylinderGeometry(pipeR * 0.8, pipeR * 0.8, gateW, 16);
  const gateUpright = new CylinderGeometry(pipeR * 0.85, pipeR * 0.85, H * 0.75, 16);

  const rotZ = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);

  // Top rail of gate
  gateGeomItems.push({
    geom: gateTopRail,
    matrix: new Matrix4().compose(new Vector3(gateW / 2, H * 0.9, 0), rotZ, _s),
  });
  // Mid rail of gate
  gateGeomItems.push({
    geom: gateMidRail,
    matrix: new Matrix4().compose(new Vector3(gateW / 2, H * 0.5, 0), rotZ, _s),
  });
  // Bottom toe bar
  if (obj.hasKickplate) {
    const toeBar = new BoxGeometry(gateW, mm(80), mm(5));
    gateGeomItems.push({
      geom: toeBar,
      matrix: new Matrix4().compose(new Vector3(gateW / 2, mm(60), 0), _q.identity(), _s),
    });
  }
  // Upright outer edge
  gateGeomItems.push({
    geom: gateUpright,
    matrix: new Matrix4().compose(new Vector3(gateW, H * 0.5, 0), _q.identity(), _s),
  });

  // Self-closing diagonal spring return simulation bar
  const diagLen = Math.hypot(gateW, H * 0.4);
  const diagAngle = Math.atan2(H * 0.4, gateW);
  const diagGeom = new CylinderGeometry(mm(10), mm(10), diagLen, 12);
  const diagRot = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), diagAngle - Math.PI / 2);
  gateGeomItems.push({
    geom: diagGeom,
    matrix: new Matrix4().compose(new Vector3(gateW / 2, H * 0.7, mm(15)), diagRot, _s),
  });

  const mergedGateLeaf = mergeGeometries(gateGeomItems);

  // Apply gate swing rotation around hinge post
  const swingQuat = new Quaternion().setFromAxisAngle(_up, swingRad);
  const mGatePivot = new Matrix4().compose(new Vector3(leftX + mm(20), 0, 0), swingQuat, _s);
  items.push({ geom: mergedGateLeaf, matrix: mGatePivot });

  snapPoints.push([leftX, H, 0]);
  snapPoints.push([rightX, H, 0]);
  snapPoints.push([leftX, 0, 0]);
  snapPoints.push([rightX, 0, 0]);

  return {
    geometry: mergeGeometries(items),
    snapPoints,
  };
}

/**
 * Builds Australian Standard AS 1657 industrial access ladder with rungs and safety cage.
 */
export function buildAccessLadder(obj: LadderObject): {
  geometry: BufferGeometry;
  snapPoints: [number, number, number][];
} {
  const items: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const snapPoints: [number, number, number][] = [];

  const H = mm(obj.height);
  const W = mm(obj.width); // clear width ~450mm
  const rungSpacingM = mm(obj.rungSpacing); // ~280mm
  const strThick = mm(10);
  const strDepth = mm(65);
  const rungR = mm(20) / 2; // 20mm round bar

  const stringerGeom = new BoxGeometry(strThick, H, strDepth);
  const rungGeom = new CylinderGeometry(rungR, rungR, W, 12);
  const rotZ = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);

  // 1. Left stringer
  items.push({
    geom: stringerGeom,
    matrix: new Matrix4().compose(new Vector3(-W / 2 - strThick / 2, H / 2, 0), _q.identity(), _s),
  });
  // 2. Right stringer
  items.push({
    geom: stringerGeom,
    matrix: new Matrix4().compose(new Vector3(W / 2 + strThick / 2, H / 2, 0), _q.identity(), _s),
  });

  // 3. Rungs
  const numRungs = Math.floor(H / rungSpacingM);
  for (let i = 1; i <= numRungs; i++) {
    const rungY = i * rungSpacingM;
    items.push({
      geom: rungGeom,
      matrix: new Matrix4().compose(new Vector3(0, rungY, 0), rotZ, _s),
    });
    snapPoints.push([0, rungY, 0]);
  }

  // 4. Top walkthrough handrail stubs (AS 1657 walkthrough extensions: 1060mm above top landing)
  const extH = mm(1060);
  const walkExtensionGeom = new CylinderGeometry(mm(18), mm(18), extH, 16);
  items.push({
    geom: walkExtensionGeom,
    matrix: new Matrix4().compose(new Vector3(-W / 2 - strThick / 2, H + extH / 2, 0), _q.identity(), _s),
  });
  items.push({
    geom: walkExtensionGeom,
    matrix: new Matrix4().compose(new Vector3(W / 2 + strThick / 2, H + extH / 2, 0), _q.identity(), _s),
  });

  // Top ball finials
  const topFinialGeom = new SphereGeometry(mm(25), 16, 12);
  items.push({
    geom: topFinialGeom,
    matrix: new Matrix4().compose(new Vector3(-W / 2 - strThick / 2, H + extH, 0), _q.identity(), _s),
  });
  items.push({
    geom: topFinialGeom,
    matrix: new Matrix4().compose(new Vector3(W / 2 + strThick / 2, H + extH, 0), _q.identity(), _s),
  });

  // 5. Safety cage (if enabled or height >= 3m)
  if (obj.hasCage || obj.height >= 3000) {
    const cageStartY = mm(obj.cageStartHeight); // 2200mm
    const cageRadius = mm(360); // 720mm diameter hoop
    const hoopSpacing = mm(1000); // 1 hoop every 1000mm

    const hoopGeom = new CylinderGeometry(cageRadius, cageRadius, mm(8), 24, 1, true, 0, Math.PI * 1.3);
    const hoopRot = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

    for (let y = cageStartY; y <= H + mm(200); y += hoopSpacing) {
      items.push({
        geom: hoopGeom,
        matrix: new Matrix4().compose(new Vector3(0, y, cageRadius * 0.7), hoopRot, _s),
      });
    }

    // Vertical cage straps (5 vertical flat bars connecting hoops around the back)
    const strapLen = Math.max(0.1, H + mm(200) - cageStartY);
    const strapGeom = new BoxGeometry(mm(6), strapLen, mm(38));

    for (const angleDeg of [-60, -30, 0, 30, 60]) {
      const a = (angleDeg * Math.PI) / 180;
      const sx = Math.sin(a) * cageRadius;
      const sz = Math.cos(a) * cageRadius + mm(50);
      items.push({
        geom: strapGeom,
        matrix: new Matrix4().compose(new Vector3(sx, cageStartY + strapLen / 2, sz), _q.identity(), _s),
      });
    }
  }

  snapPoints.push([0, 0, 0]);
  snapPoints.push([0, H, 0]);
  snapPoints.push([-W / 2, 0, 0]);
  snapPoints.push([W / 2, 0, 0]);
  snapPoints.push([-W / 2, H, 0]);
  snapPoints.push([W / 2, H, 0]);

  return {
    geometry: mergeGeometries(items),
    snapPoints,
  };
}
