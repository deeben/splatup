/**
 * SplatUp document model.
 *
 * All values stored in the document use the *user frame*:
 *   - millimetres
 *   - right-handed, Z-up (CAD convention): X = east-ish, Y = north-ish, Z = height
 *   - rotations in degrees, applied as yaw (Z) * pitch (Y) * roll (X)
 *
 * The three.js scene is Y-up metres; conversion lives in `core/frame.ts` and is
 * the only place the two frames meet.
 */

export type Vec3 = [number, number, number];

export interface Transform {
  /** Position of the object origin (mm, user frame). */
  position: Vec3;
  /** Rotation in degrees about user X, Y, Z. */
  rotation: Vec3;
}

interface BaseObject {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  transform: Transform;
}

/** Rectangular block. Origin at the centre of the base face. */
export interface BoxObject extends BaseObject {
  kind: 'box';
  /** Length along local X (mm). */
  length: number;
  /** Width along local Y (mm). */
  width: number;
  /** Height along local Z (mm). */
  height: number;
}

/** Cylinder. Axis along local Z, origin at the centre of the base. */
export interface CylinderObject extends BaseObject {
  kind: 'cylinder';
  diameter: number;
  length: number;
}

export type DesignObject = BoxObject | CylinderObject;
export type DesignKind = DesignObject['kind'];

export interface Measurement {
  id: string;
  name: string;
  a: Vec3;
  b: Vec3;
}

export interface ScanAsset {
  id: string;
  name: string;
  fileName: string;
  byteSize: number;
  visible: boolean;
  opacity: number;
  /** Show baked scan colours without scene lighting (recommended for Scaniverse). */
  unlit: boolean;
  doubleSided: boolean;
}

export interface ViewSettings {
  /** Hide scan geometry above this height (mm, user Z). null = off. */
  clipHeight: number | null;
}

export interface Project {
  version: 1;
  name: string;
  units: 'mm';
  scans: ScanAsset[];
  objects: DesignObject[];
  measurements: Measurement[];
  view: ViewSettings;
}

export type Selection =
  | { type: 'object'; id: string }
  | { type: 'measurement'; id: string }
  | { type: 'scan'; id: string }
  | null;

export type Tool = 'select' | 'measure' | 'box' | 'cylinder';

export type SnapKind = 'vertex' | 'corner' | 'face' | 'axis';

export interface SnapResult {
  /** Snapped point, user frame mm. */
  point: Vec3;
  kind: SnapKind;
  objectId?: string;
  /** Set when the point is constrained to a user axis (0=X, 1=Y, 2=Z). */
  axis?: 0 | 1 | 2;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export function newProject(): Project {
  return {
    version: 1,
    name: 'Untitled',
    units: 'mm',
    scans: [],
    objects: [],
    measurements: [],
    view: { clipHeight: null },
  };
}
