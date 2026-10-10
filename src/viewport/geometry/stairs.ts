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
import type { StairsObject } from '../../core/types';
import { mm } from '../../core/frame';

const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);

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

export interface StairsMetrics {
  numRisers: number;
  riseMm: number;
  goingMm: number;
  totalRunMm: number;
  totalRiseMm: number;
  slopeDeg: number;
  isCompliant: boolean;
  complianceMsg: string;
}

export function computeStairsMetrics(obj: StairsObject): StairsMetrics {
  const totalRise = Math.max(100, obj.totalRise);
  const numRisers = Math.max(1, obj.numSteps || Math.round(totalRise / 190));
  const riseMm = Math.round((totalRise / numRisers) * 10) / 10;
  const goingMm = obj.going || 245;
  const totalRunMm = Math.round(goingMm * numRisers);
  const slopeRad = Math.atan2(totalRise, totalRunMm);
  const slopeDeg = Math.round(((slopeRad * 180) / Math.PI) * 10) / 10;

  // AS 1657 standard limits:
  // Rise: 170mm to 200mm (preferred 190mm)
  // Going: 235mm to 245mm (preferred 245mm)
  // Slope: 30 deg to 38 deg
  const riseOk = riseMm >= 170 && riseMm <= 200;
  const goingOk = goingMm >= 235 && goingMm <= 245;
  const slopeOk = slopeDeg >= 30 && slopeDeg <= 38.5;
  const isCompliant = riseOk && goingOk && slopeOk;

  let complianceMsg = 'AS 1657 Compliant';
  if (!riseOk) complianceMsg = `Rise ${riseMm}mm outside standard (170-200mm)`;
  else if (!goingOk) complianceMsg = `Going ${goingMm}mm outside standard (235-245mm)`;
  else if (!slopeOk) complianceMsg = `Slope ${slopeDeg}° outside standard (30-38°)`;

  return {
    numRisers,
    riseMm,
    goingMm,
    totalRunMm,
    totalRiseMm: totalRise,
    slopeDeg,
    isCompliant,
    complianceMsg,
  };
}

/**
 * Builds full AS 1657 industrial stairway with PFC stringers, grating treads, and Monowills handrails.
 * Origin (0,0,0) is at the bottom landing nosing center.
 * Stair flight runs along local +X, rises along Three Y (Up), and spans width along Three Z.
 */
export function buildStairsGeometry(obj: StairsObject): {
  geometry: BufferGeometry;
  snapPoints: [number, number, number][];
  metrics: StairsMetrics;
} {
  const items: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const snapPoints: [number, number, number][] = [];
  const metrics = computeStairsMetrics(obj);

  const clearWidth = mm(obj.width || 750);
  const rise = mm(metrics.riseMm);
  const going = mm(metrics.goingMm);
  const N = metrics.numRisers;
  const totalRise = mm(metrics.totalRiseMm);
  const totalRun = mm(metrics.totalRunMm);

  // Stringer parameters (200 PFC default: 200mm depth, 75mm flange, 6mm web)
  const stringerDepth = mm(obj.stringerSection === '250PFC' ? 250 : obj.stringerSection === '150PFC' ? 150 : 200);
  const stringerFlange = mm(75);
  const stringerWebThick = mm(6);
  const stringerFlangeThick = mm(12);

  // Flight slope geometry
  const diagLen = Math.hypot(totalRun, totalRise);
  const slopeAngle = Math.atan2(totalRise, totalRun);
  const slopeQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), slopeAngle);

  // Stringer Channel Geometry: web plate + top flange + bottom flange
  const webGeom = new BoxGeometry(diagLen + mm(200), stringerDepth, stringerWebThick);
  const flgGeom = new BoxGeometry(diagLen + mm(200), stringerFlangeThick, stringerFlange);

  const halfWidth = clearWidth / 2;

  // Place Left (-Z) and Right (+Z) Stringers
  const stringerZPositions = [
    { z: -halfWidth - stringerFlange / 2, toeIn: true },
    { z: halfWidth + stringerFlange / 2, toeIn: false },
  ];

  for (const { z } of stringerZPositions) {
    const stringerCenter = new Vector3(totalRun / 2, totalRise / 2 - mm(50), z);

    // Web plate
    const mWeb = new Matrix4().compose(stringerCenter, slopeQuat, _s);
    items.push({ geom: webGeom, matrix: mWeb });

    // Top flange
    const mTopFlg = new Matrix4().compose(
      stringerCenter.clone().add(new Vector3(-Math.sin(slopeAngle), Math.cos(slopeAngle), 0).multiplyScalar(stringerDepth / 2 - stringerFlangeThick / 2)),
      slopeQuat,
      _s,
    );
    items.push({ geom: flgGeom, matrix: mTopFlg });

    // Bottom flange
    const mBotFlg = new Matrix4().compose(
      stringerCenter.clone().add(new Vector3(Math.sin(slopeAngle), -Math.cos(slopeAngle), 0).multiplyScalar(stringerDepth / 2 - stringerFlangeThick / 2)),
      slopeQuat,
      _s,
    );
    items.push({ geom: flgGeom, matrix: mBotFlg });
  }

  // Treads (Webgrate Type T6)
  const treadThick = mm(32);
  const treadGeom = new BoxGeometry(going - mm(10), treadThick, clearWidth);
  const nosingGeom = new BoxGeometry(mm(6), mm(25), clearWidth); // yellow/abrasive nosing strip

  for (let i = 1; i <= N; i++) {
    const stepX = (i - 0.5) * going;
    const stepY = i * rise;

    // Tread plate
    const mTread = new Matrix4().compose(
      new Vector3(stepX, stepY - treadThick / 2, 0),
      _q.identity(),
      _s,
    );
    items.push({ geom: treadGeom, matrix: mTread });

    // Nosing strip along front edge
    const mNosing = new Matrix4().compose(
      new Vector3(stepX - going / 2 + mm(3), stepY - mm(12.5), 0),
      _q.identity(),
      _s,
    );
    items.push({ geom: nosingGeom, matrix: mNosing });

    // Snap point at front nosing center
    snapPoints.push([stepX - going / 2, stepY, 0]);
    // Snap points at left and right nosing corners
    snapPoints.push([stepX - going / 2, stepY, -halfWidth]);
    snapPoints.push([stepX - going / 2, stepY, halfWidth]);
  }

  // Monowills Stair Handrails (mounted to stringers per D-001-S-10015 Detail 12)
  const side = obj.handrailSide || 'both';
  if (side !== 'none') {
    const H = mm(obj.handrailHeight || 1000);
    const midH = H * 0.56;
    const pipeR = mm(42.4) / 2;
    const midPipeR = pipeR * 0.8;
    const ballR = pipeR * 1.5;

    const postGeom = new CylinderGeometry(pipeR, pipeR, H, 16);
    const ballGeom = new SphereGeometry(ballR, 16, 12);
    const railGeom = new CylinderGeometry(pipeR, pipeR, diagLen, 16);
    const midRailGeom = new CylinderGeometry(midPipeR, midPipeR, diagLen, 16);
    const kickGeom = new BoxGeometry(diagLen, mm(100), mm(6));

    const sidesZ = [];
    if (side === 'both' || side === 'left') sidesZ.push(-halfWidth - mm(40));
    if (side === 'both' || side === 'right') sidesZ.push(halfWidth + mm(40));

    // Rail rotation quaternion along the flight slope (length along Y in CylinderGeometry)
    const slopeDir = new Vector3(Math.cos(slopeAngle), Math.sin(slopeAngle), 0).normalize();
    const railQuat = new Quaternion().setFromUnitVectors(_up, slopeDir);

    for (const rz of sidesZ) {
      // 2 or 3 Stanchions along the stringer (vertical posts)
      const numStanchions = Math.max(2, Math.ceil(diagLen / mm(1800)) + 1);
      for (let s = 0; s < numStanchions; s++) {
        const t = s / (numStanchions - 1);
        const postX = t * totalRun;
        const postY = t * totalRise;

        // Vertical post
        const mPost = new Matrix4().compose(
          new Vector3(postX, postY + H / 2, rz),
          _q.identity(),
          _s,
        );
        items.push({ geom: postGeom, matrix: mPost });

        // Spherical balls at top and mid rail joints
        const mTopBall = new Matrix4().compose(new Vector3(postX, postY + H, rz), _q.identity(), _s);
        items.push({ geom: ballGeom, matrix: mTopBall });

        const mMidBall = new Matrix4().compose(new Vector3(postX, postY + midH, rz), _q.identity(), _s);
        items.push({ geom: ballGeom, matrix: mMidBall });

        snapPoints.push([postX, postY + H, rz]);
      }

      // Continuous Sloping Top Rail
      const mTopRail = new Matrix4().compose(
        new Vector3(totalRun / 2, totalRise / 2 + H, rz),
        railQuat,
        _s,
      );
      items.push({ geom: railGeom, matrix: mTopRail });

      // Continuous Sloping Mid Rail
      const mMidRail = new Matrix4().compose(
        new Vector3(totalRun / 2, totalRise / 2 + midH, rz),
        railQuat,
        _s,
      );
      items.push({ geom: midRailGeom, matrix: mMidRail });

      // Sloping Kickplate along stringer
      if (obj.hasKickplate) {
        const kickRotM = new Matrix4().makeBasis(
          slopeDir,
          new Vector3(-Math.sin(slopeAngle), Math.cos(slopeAngle), 0),
          new Vector3(0, 0, 1),
        );
        const kickQuat = new Quaternion().setFromRotationMatrix(kickRotM);

        const mKick = new Matrix4().compose(
          new Vector3(totalRun / 2, totalRise / 2 + mm(55), rz),
          kickQuat,
          _s,
        );
        items.push({ geom: kickGeom, matrix: mKick });
      }
    }
  }

  // Key boundary snap points
  snapPoints.push([0, 0, 0]); // bottom landing center
  snapPoints.push([0, 0, -halfWidth]);
  snapPoints.push([0, 0, halfWidth]);
  snapPoints.push([totalRun, totalRise, 0]); // top landing center
  snapPoints.push([totalRun, totalRise, -halfWidth]);
  snapPoints.push([totalRun, totalRise, halfWidth]);

  return {
    geometry: mergeGeometries(items),
    snapPoints,
    metrics,
  };
}
