import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { ModelFormat, ModelUnits, ModelUpAxis, Vec3 } from '../../core/types';

/**
 * Imported object loading (GLB / STL → one merged BufferGeometry).
 *
 * Imported objects are rendered like the built-in primitives (single colour,
 * CAD edges, snap points, PDF line drawings), so every mesh in the file is
 * baked into one position-only geometry in the file's own units and axes.
 * Unit scaling, up-axis and the base-centre origin are applied later in
 * `placeModelGeometry`, so changing them in the panel never re-parses the file.
 */

export const UNIT_TO_MM: Record<ModelUnits, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export function modelFormatFor(fileName: string): ModelFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'glb' || ext === 'gltf') return 'glb';
  if (ext === 'stl') return 'stl';
  return null;
}

/** Parse a GLB/STL file into a single non-indexed position-only geometry (source units, source axes). */
export async function parseModel(buf: ArrayBuffer, format: ModelFormat): Promise<BufferGeometry> {
  if (format === 'stl') {
    const geom = new STLLoader().parse(buf);
    return positionsOnly([geom]);
  }

  const gltf = await new GLTFLoader().parseAsync(buf, '');
  gltf.scene.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  gltf.scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.geometry?.getAttribute('position')) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    parts.push(g);
  });
  if (!parts.length) throw new Error('No meshes found in file');
  return positionsOnly(parts);
}

/** Merge geometries into one non-indexed geometry holding only positions. */
function positionsOnly(parts: BufferGeometry[]): BufferGeometry {
  let total = 0;
  const flat = parts.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    total += ni.getAttribute('position').count;
    return ni;
  });
  const out = new Float32Array(total * 3);
  let offset = 0;
  for (const g of flat) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      out[offset++] = pos.getX(i);
      out[offset++] = pos.getY(i);
      out[offset++] = pos.getZ(i);
    }
  }
  parts.forEach((g) => g.dispose());
  flat.forEach((g) => g.dispose());
  const merged = new BufferGeometry();
  merged.setAttribute('position', new Float32BufferAttribute(out, 3));
  merged.computeBoundingBox();
  return merged;
}

/**
 * Pick sensible source units from the raw extent.
 *  - GLB is metres by spec, but CAD exporters often write millimetres: a
 *    "metre" object bigger than 200 m is almost certainly mm.
 *  - STL has no units; mm is the de-facto default, but anything under 10
 *    units across would be a tiny part in this context, so treat it as metres.
 */
export function guessUnits(rawGeom: BufferGeometry, format: ModelFormat): ModelUnits {
  if (!rawGeom.boundingBox) rawGeom.computeBoundingBox();
  const size = rawGeom.boundingBox!.getSize(new Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  if (format === 'glb') return extent > 200 ? 'mm' : 'm';
  return extent < 10 ? 'm' : 'mm';
}

/** GLB is Y-up by spec; STL comes from CAD/3D-printing tools that are almost always Z-up. */
export function defaultUpAxis(format: ModelFormat): ModelUpAxis {
  return format === 'stl' ? 'z' : 'y';
}

/**
 * Convert raw geometry into the scene frame (three.js, Y-up, metres) with the
 * origin at the centre of the base, matching the box/cylinder convention.
 * Returns the new geometry and its size in user-frame mm (L × W × H).
 */
export function placeModelGeometry(
  raw: BufferGeometry,
  units: ModelUnits,
  upAxis: ModelUpAxis,
  scale: number,
): { geometry: BufferGeometry; sizeMm: Vec3 } {
  const g = raw.clone();
  const m = new Matrix4();
  if (upAxis === 'z') g.applyMatrix4(m.makeRotationX(-Math.PI / 2));
  const s = (UNIT_TO_MM[units] / 1000) * (scale > 0 ? scale : 1);
  g.applyMatrix4(m.makeScale(s, s, s));
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const c = box.getCenter(new Vector3());
  g.applyMatrix4(m.makeTranslation(-c.x, -box.min.y, -c.z));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const size = g.boundingBox!.getSize(new Vector3());
  // three (x, y, z) → user (X, -Z, Y); sizes are unsigned.
  return { geometry: g, sizeMm: [size.x * 1000, size.z * 1000, size.y * 1000] };
}

/** Bounding-box corners + mid-edges of a placed geometry, used for vertex snapping. */
export function modelSnapPoints(g: BufferGeometry): [number, number, number][] {
  const b = g.boundingBox!;
  const xs = [b.min.x, (b.min.x + b.max.x) / 2, b.max.x];
  const ys = [b.min.y, (b.min.y + b.max.y) / 2, b.max.y];
  const zs = [b.min.z, (b.min.z + b.max.z) / 2, b.max.z];
  const pts: [number, number, number][] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) {
    if (x === xs[1] && y === ys[1] && z === zs[1]) continue;
    pts.push([x, y, z]);
  }
  return pts;
}

// One parse per asset; duplicated objects share the same file and geometry.
const cache = new Map<string, Promise<BufferGeometry>>();

export function loadModelGeometry(assetId: string, blob: Blob, format: ModelFormat): Promise<BufferGeometry> {
  let p = cache.get(assetId);
  if (!p) {
    p = blob.arrayBuffer().then((buf) => parseModel(buf, format));
    p.catch(() => cache.delete(assetId));
    cache.set(assetId, p);
  }
  return p;
}
