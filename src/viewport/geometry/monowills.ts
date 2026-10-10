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
import type { HandrailObject, LadderObject, SwingGateObject, Vec3 } from '../../core/types';
import { mm } from '../../core/frame';

// Reusable scratch objects to avoid allocation
const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);

/**
 * Merges multiple geometries into a single BufferGeometry using matrix transformations.
 */
function mergeGeometries(items: { geom: BufferGeometry; matrix: Matrix4 }[]): BufferGeometry {
  const merged = new BufferGeometry();
  let totalVerts = 0;
  let totalIndices = 0;

  for (const { geom } of items) {
    const pos = geom.getAttribute('position');
    if (!pos) continue;
    totalVerts += pos.count;
    totalIndices += geom.index ? geom.index.count : pos.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const indices: number[] = [];
  let vertOffset = 0;

  for (const { geom, matrix } of items) {
    const pos = geom.getAttribute('position');
    if (!pos) continue;
    const v = new Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      positions[(vertOffset + i) * 3] = v.x;
      positions[(vertOffset + i) * 3 + 1] = v.y;
      positions[(vertOffset + i) * 3 + 2] = v.z;
    }

    if (geom.index) {
      for (let i = 0; i < geom.index.count; i++) {
        indices.push(geom.index.getX(i) + vertOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices.push(i + vertOffset);
      }
    }

    vertOffset += pos.count;
  }

  merged.setAttribute('position', new BufferAttribute(positions, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Builds full Monowills-style industrial handrail geometry.
 */
export function buildMonowillsHandrail(obj: HandrailObject): {
  geometry: BufferGeometry;
  snapPoints: [number, number, number][];
} {
  const items: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const snapPoints: [number, number, number][] = [];

  const H = mm(obj.height); // e.g. 1.0m or 0.9m
  const midH = H * (obj.height === 1000 ? 0.56 : 0.52); // ~560mm
  const pipeR = mm(obj.pipeDiameter) / 2; // ~21mm
  const midPipeR = pipeR * 0.8;
  const ballR = pipeR * 1.5; // Monowills spherical ball ~64mm dia
  const baseSize = mm(120);
  const baseThick = mm(12);

  // Primitive templates
  const stanchionGeom = new CylinderGeometry(pipeR, pipeR, H, 16);
  const ballGeom = new SphereGeometry(ballR, 16, 12);
  const baseGeom = new BoxGeometry(baseSize, baseThick, baseSize);
  const kickGeom = new BoxGeometry(1, mm(100), mm(6)); // unit length along X, scaled later

  const rawPts = obj.points.length >= 2 ? obj.points : [[-1000, 0, 0] as Vec3, [1000, 0, 0] as Vec3];

  // Convert user frame mm to three scene metres
  const pathPts: Vector3[] = rawPts.map((p) => new Vector3(mm(p[0]), mm(p[2]), -mm(p[1])));

  for (let s = 0; s < pathPts.length - 1; s++) {
    const p1 = pathPts[s];
    const p2 = pathPts[s + 1];
    const segVec = new Vector3().subVectors(p2, p1);
    const segLen = segVec.length();
    if (segLen < 0.001) continue;

    const segDir = segVec.clone().normalize();
    const stanchionMaxSpacing = mm(obj.stanchionSpacing);
    const numStanchions = Math.max(2, Math.ceil(segLen / stanchionMaxSpacing) + 1);

    const segAngle = Math.atan2(segDir.x, segDir.z);
    const postRot = new Quaternion().setFromAxisAngle(_up, segAngle + Math.PI / 2);

    // Place stanchions along this segment
    for (let i = 0; i < numStanchions; i++) {
      // Avoid duplicate stanchion on intermediate corner joints
      if (s > 0 && i === 0) continue;

      const t = i / (numStanchions - 1);
      const postPos = new Vector3().lerpVectors(p1, p2, t);

      // Base plate: oriented squarely with the handrail run
      const mBase = new Matrix4().compose(
        new Vector3(postPos.x, postPos.y + baseThick / 2, postPos.z),
        postRot,
        _s,
      );
      items.push({ geom: baseGeom, matrix: mBase });

      // Vertical post
      const mPost = new Matrix4().compose(
        new Vector3(postPos.x, postPos.y + H / 2, postPos.z),
        _q.identity(),
        _s,
      );
      items.push({ geom: stanchionGeom, matrix: mPost });

      // Monowills signature balls
      const mTopBall = new Matrix4().compose(
        new Vector3(postPos.x, postPos.y + H, postPos.z),
        _q.identity(),
        _s,
      );
      items.push({ geom: ballGeom, matrix: mTopBall });

      if (obj.hasMidrail) {
        const mMidBall = new Matrix4().compose(
          new Vector3(postPos.x, postPos.y + midH, postPos.z),
          _q.identity(),
          _s,
        );
        items.push({ geom: ballGeom, matrix: mMidBall });
      }

      snapPoints.push([postPos.x, postPos.y + H, postPos.z]);
      snapPoints.push([postPos.x, postPos.y, postPos.z]);
    }

    // Continuous Top Rail tube
    const railCenter = new Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const railQuat = new Quaternion().setFromUnitVectors(_up, segDir);
    const topRailGeom = new CylinderGeometry(pipeR, pipeR, segLen, 16);

    const mTopRail = new Matrix4().compose(
      new Vector3(railCenter.x, railCenter.y + H, railCenter.z),
      railQuat,
      _s,
    );
    items.push({ geom: topRailGeom, matrix: mTopRail });

    // Continuous Mid Rail tube
    if (obj.hasMidrail) {
      const midRailGeom = new CylinderGeometry(midPipeR, midPipeR, segLen, 16);
      const mMidRail = new Matrix4().compose(
        new Vector3(railCenter.x, railCenter.y + midH, railCenter.z),
        railQuat,
        _s,
      );
      items.push({ geom: midRailGeom, matrix: mMidRail });
    }

    // Kickplate / Toeboard (100mm high strip along bottom)
    if (obj.hasKickplate) {
      // Orient kickplate flat face facing normal to the run
      const angle = Math.atan2(segDir.x, segDir.z);
      const kickRot = new Quaternion().setFromAxisAngle(_up, angle + Math.PI / 2);
      const mKick = new Matrix4().compose(
        new Vector3(railCenter.x, railCenter.y + mm(55), railCenter.z),
        kickRot,
        new Vector3(segLen, 1, 1),
      );
      items.push({ geom: kickGeom, matrix: mKick });
    }
  }

  return {
    geometry: mergeGeometries(items),
    snapPoints,
  };
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
