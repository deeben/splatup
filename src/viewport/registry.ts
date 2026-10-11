import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import type { OrbitControls as OrbitControlsImpl, TransformControls } from 'three-stdlib';
import type { StandardView } from '../core/types';

export interface CapturedView {
  id: StandardView;
  title: string;
  subTitle: string;
  dataUrl: string;
  jpegBytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * Mutable handles to scene objects that non-React code (picking, framing,
 * tool controller, view switcher, export generator) needs.
 */
export const registry: {
  scanRoot: Object3D | null;
  designRoot: Object3D | null;
  transformControls: TransformControls | null;
  camera: Camera | null;
  controls: OrbitControlsImpl | null;
  gl: WebGLRenderer | null;
  scene: Scene | null;
  setFrontFromCurrentCamera?: (snapToAlignment?: boolean) => number | null;
  getCurrentCameraAzimuth?: () => number;
  captureElevationViews?: () => Promise<CapturedView[]>;
} = {
  scanRoot: null,
  designRoot: null,
  transformControls: null,
  camera: null,
  controls: null,
  gl: null,
  scene: null,
};

