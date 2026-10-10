import { Euler, Vector3 } from 'three';
import type { Vec3 } from './types';

/**
 * Frame conversion between the document (user frame: Z-up, mm) and the
 * three.js scene (Y-up, metres).
 *
 *   three.x =  user.X
 *   three.y =  user.Z
 *   three.z = -user.Y
 */

const MM = 0.001;
const DEG = Math.PI / 180;

export function userToWorld(p: Vec3, out = new Vector3()): Vector3 {
  return out.set(p[0] * MM, p[2] * MM, -p[1] * MM);
}

export function worldToUser(v: Vector3): Vec3 {
  return [v.x / MM, -v.z / MM, v.y / MM];
}

/**
 * User rotation (deg about X, Y, Z; applied Rz·Ry·Rx) → three.js Euler.
 * In three's frame that is R(yaw about +Y)·R(pitch about −Z)·R(roll about +X),
 * which is Euler order 'YZX'.
 */
export function userRotToEuler(r: Vec3, out = new Euler()): Euler {
  return out.set(r[0] * DEG, r[2] * DEG, -r[1] * DEG, 'YZX');
}

export function eulerToUserRot(e: Euler): Vec3 {
  const copy = e.clone();
  if (copy.order !== 'YZX') copy.reorder('YZX');
  return [copy.x / DEG, -copy.z / DEG, copy.y / DEG].map(cleanAngle) as Vec3;
}

function cleanAngle(a: number): number {
  let v = Math.round(a * 1000) / 1000;
  if (Object.is(v, -0)) v = 0;
  return v;
}

/** Tuple form for R3F props. */
export function userToWorldTuple(p: Vec3): [number, number, number] {
  return [p[0] * MM, p[2] * MM, -p[1] * MM];
}

export const mm = (v: number) => v * MM;
