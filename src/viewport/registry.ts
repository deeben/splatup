import type { Camera, Object3D } from 'three';
import type { OrbitControls as OrbitControlsImpl, TransformControls } from 'three-stdlib';

/**
 * Mutable handles to scene objects that non-React code (picking, framing,
 * tool controller, view switcher) needs. Not part of app state – never triggers renders.
 */
export const registry: {
  scanRoot: Object3D | null;
  designRoot: Object3D | null;
  transformControls: TransformControls | null;
  camera: Camera | null;
  controls: OrbitControlsImpl | null;
  setFrontFromCurrentCamera?: (snapToAlignment?: boolean) => number | null;
  getCurrentCameraAzimuth?: () => number;
} = {
  scanRoot: null,
  designRoot: null,
  transformControls: null,
  camera: null,
  controls: null,
};

