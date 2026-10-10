import type { Object3D } from 'three';
import type { TransformControls } from 'three-stdlib';

/**
 * Mutable handles to scene objects that non-React code (picking, framing,
 * tool controller) needs. Not part of app state – never triggers renders.
 */
export const registry: {
  scanRoot: Object3D | null;
  designRoot: Object3D | null;
  transformControls: TransformControls | null;
} = {
  scanRoot: null,
  designRoot: null,
  transformControls: null,
};
