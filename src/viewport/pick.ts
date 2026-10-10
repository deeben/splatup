import {
  BufferGeometry,
  Mesh,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Intersection,
  type Object3D,
} from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { registry } from './registry';
import { worldToUser } from '../core/frame';
import type { SnapKind, SnapResult, Vec3 } from '../core/types';

// Install BVH-accelerated raycasting globally.
(BufferGeometry.prototype as unknown as { computeBoundsTree: unknown }).computeBoundsTree = computeBoundsTree;
(BufferGeometry.prototype as unknown as { disposeBoundsTree: unknown }).disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast as unknown as typeof Mesh.prototype.raycast;

const raycaster = new Raycaster();
const ndc = new Vector2();
const tmp = new Vector3();
const tmpScreen = new Vector3();

/** Screen-space radius (px) within which a vertex/corner snap wins over a face hit. */
const SNAP_PX = 12;

export interface PickOptions {
  includeScan?: boolean;
  includeDesign?: boolean;
  /** Ignore scan hits above this world Y (metres) – matches the section clip. */
  clipY?: number | null;
  vertexSnap?: boolean;
}

export interface PickHit extends SnapResult {
  world: Vector3;
}

function isVisible(o: Object3D | null): boolean {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

function findObjectId(o: Object3D | null): string | undefined {
  for (let n = o; n; n = n.parent) if (n.userData.objectId) return n.userData.objectId as string;
  return undefined;
}

function findGroup(o: Object3D | null): Object3D | null {
  for (let n = o; n; n = n.parent) if (n.userData.objectId) return n;
  return null;
}

export function pick(
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: Camera,
  opts: PickOptions = {},
): PickHit | null {
  const { includeScan = true, includeDesign = true, clipY = null, vertexSnap = true } = opts;
  const rect = dom.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.params.Line = { threshold: 0 };
  raycaster.params.Points = { threshold: 0 };
  // With a section clip active we need all hits so we can skip the clipped ones.
  raycaster.firstHitOnly = clipY == null;

  const targets: Object3D[] = [];
  if (includeDesign && registry.designRoot) targets.push(registry.designRoot);
  if (includeScan && registry.scanRoot) targets.push(registry.scanRoot);
  if (!targets.length) return null;

  const hits = raycaster.intersectObjects(targets, true) as Intersection<Object3D>[];
  hits.sort((a, b) => a.distance - b.distance);

  const hit = hits.find((h) => {
    if (!(h.object as Mesh).isMesh || h.object.userData.noPick) return false;
    if (!isVisible(h.object)) return false;
    const isDesign = !!findObjectId(h.object);
    if (!isDesign && clipY != null && h.point.y > clipY) return false;
    return true;
  });
  if (!hit) return null;

  const objectId = findObjectId(hit.object);
  let kind: SnapKind = 'face';
  const world = hit.point.clone();

  if (vertexSnap) {
    const candidates = objectId ? designSnapPoints(hit.object) : scanFaceVertices(hit);
    let best = SNAP_PX;
    const p0 = toScreen(hit.point, camera, rect);
    for (const c of candidates) {
      const p = toScreen(c, camera, rect);
      const d = Math.hypot(p.x - p0.x, p.y - p0.y);
      if (d < best) {
        best = d;
        world.copy(c);
        kind = objectId ? 'corner' : 'vertex';
      }
    }
  }

  return { world, point: worldToUser(world), kind, objectId };
}

function toScreen(v: Vector3, camera: Camera, rect: DOMRect) {
  tmpScreen.copy(v).project(camera);
  return { x: (tmpScreen.x * 0.5 + 0.5) * rect.width, y: (-tmpScreen.y * 0.5 + 0.5) * rect.height };
}

function scanFaceVertices(hit: Intersection<Object3D>): Vector3[] {
  const mesh = hit.object as Mesh;
  const face = hit.face;
  if (!face) return [];
  const pos = mesh.geometry.getAttribute('position');
  return [face.a, face.b, face.c].map((i) =>
    new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld),
  );
}

function designSnapPoints(o: Object3D): Vector3[] {
  const group = findGroup(o);
  const pts = (group?.userData.snapPoints as [number, number, number][] | undefined) ?? [];
  return pts.map((p) => tmp.set(...p).applyMatrix4(group!.matrixWorld).clone());
}

/** Constrain `b` to the dominant user axis from `a` (Shift-lock while measuring). */
export function axisLock(a: Vec3, b: Vec3): { point: Vec3; axis: 0 | 1 | 2 } {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const axis = [0, 1, 2].reduce((m, i) => (Math.abs(d[i]) > Math.abs(d[m]) ? i : m), 0) as 0 | 1 | 2;
  const point = [...a] as Vec3;
  point[axis] = b[axis];
  return { point, axis };
}
