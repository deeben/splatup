import { BufferAttribute, BufferGeometry, ShapeUtils, Vector2, Vector3 } from 'three';
import type { Vec3 } from '../../core/types';
import { mm } from '../../core/frame';

export interface PolyMetrics {
  areaM2: number;
  perimeterMm: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

/**
 * Calculates planar area (m²), perimeter (mm), and bounding dimensions for a 3D polygon.
 */
export function computePolyMetrics(points: Vec3[], thicknessMm = 50): PolyMetrics {
  if (points.length < 3) {
    return { areaM2: 0, perimeterMm: 0, widthMm: 0, depthMm: 0, heightMm: thicknessMm };
  }

  let perimeterMm = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    perimeterMm += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }

  // Planar 2D projection for area (Green's theorem / Shoelace formula on best-fit plane)
  const norm = computePolygonNormal(points);
  const u = new Vector3();
  const v = new Vector3();
  if (Math.abs(norm.z) > 0.5) {
    u.set(1, 0, 0).cross(norm).normalize();
  } else {
    u.set(0, 0, 1).cross(norm).normalize();
  }
  v.crossVectors(norm, u).normalize();

  let areaSum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const x1 = p1[0] * u.x + p1[1] * u.y + p1[2] * u.z;
    const y1 = p1[0] * v.x + p1[1] * v.y + p1[2] * v.z;
    const x2 = p2[0] * u.x + p2[1] * u.y + p2[2] * u.z;
    const y2 = p2[0] * v.x + p2[1] * v.y + p2[2] * v.z;
    areaSum += x1 * y2 - x2 * y1;
  }
  const areaM2 = Math.abs(areaSum) * 0.5 * 1e-6; // mm² -> m²

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const zs = points.map((p) => p[2]);
  const widthMm = Math.max(...xs) - Math.min(...xs);
  const depthMm = Math.max(...ys) - Math.min(...ys);
  const heightMm = Math.max(...zs) - Math.min(...zs) + thicknessMm;

  return { areaM2, perimeterMm, widthMm, depthMm, heightMm };
}

function computePolygonNormal(points: Vec3[]): Vector3 {
  // Newell's method for arbitrary 3D polygons
  const n = new Vector3(0, 0, 0);
  for (let i = 0; i < points.length; i++) {
    const c = points[i];
    const next = points[(i + 1) % points.length];
    n.x += (c[1] - next[1]) * (c[2] + next[2]);
    n.y += (c[2] - next[2]) * (c[0] + next[0]);
    n.z += (c[0] - next[0]) * (c[1] + next[1]);
  }
  if (n.lengthSq() < 1e-6) return new Vector3(0, 0, 1);
  return n.normalize();
}

/**
 * Builds a watertight 3D prism BufferGeometry in three.js scene coordinates (metres, Y-up)
 * from 3D points in CAD frame (Z-up, mm).
 */
export function buildPolyPrismGeometry(points: Vec3[], thicknessMm = 50): BufferGeometry {
  const geom = new BufferGeometry();
  if (points.length < 3) return geom;

  // CAD frame: Z is height. three frame: x = userX*mm, y = userZ*mm, z = -userY*mm
  // We extrude along CAD +Z (or normal if tilted).
  const thickM = mm(thicknessMm);

  // Compute 2D polygon projection in CAD XY plane for triangulation
  const ring2D = points.map((p) => new Vector2(p[0], p[1]));
  let triangles = ShapeUtils.triangulateShape(ring2D, []);

  // If triangulation failed or points are co-linear, fallback to fan
  if (!triangles || triangles.length === 0) {
    triangles = [];
    for (let i = 1; i < points.length - 1; i++) {
      triangles.push([0, i, i + 1]);
    }
  }

  // Ensure consistent CCW winding in 2D
  if (ShapeUtils.isClockWise(ring2D)) {
    ring2D.reverse();
    // reverse winding of triangles
    triangles = triangles.map(([a, b, c]) => [c, b, a]);
  }

  const vertices: number[] = [];
  const indices: number[] = [];

  // Convert each point into bottom & top 3D three.js coordinates
  // base:
  const basePts = points.map((p) => [mm(p[0]), mm(p[2]), -mm(p[1])] as const);
  // top (extruded upwards by thickM along three Y / CAD Z):
  const topPts = points.map((p) => [mm(p[0]), mm(p[2]) + thickM, -mm(p[1])] as const);

  const numPts = points.length;

  // Add base vertices (index: 0 to numPts - 1)
  for (let i = 0; i < numPts; i++) {
    vertices.push(basePts[i][0], basePts[i][1], basePts[i][2]);
  }
  // Add top vertices (index: numPts to 2*numPts - 1)
  for (let i = 0; i < numPts; i++) {
    vertices.push(topPts[i][0], topPts[i][1], topPts[i][2]);
  }

  // 1. Top cap faces (facing +Y / +CAD Z)
  for (const [a, b, c] of triangles) {
    indices.push(numPts + a, numPts + b, numPts + c);
  }

  // 2. Bottom cap faces (facing -Y / -CAD Z, inverted winding)
  for (const [a, b, c] of triangles) {
    indices.push(c, b, a);
  }

  // 3. Side walls
  for (let i = 0; i < numPts; i++) {
    const next = (i + 1) % numPts;
    const b0 = i;
    const b1 = next;
    const t0 = numPts + i;
    const t1 = numPts + next;

    // Two triangles per side quad: (b0, b1, t1) and (b0, t1, t0)
    indices.push(b0, b1, t1);
    indices.push(b0, t1, t0);
  }

  geom.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  return geom;
}
