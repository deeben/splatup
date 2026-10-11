import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Color, PerspectiveCamera, Vector2, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useApp } from '../core/store';
import { registry, type CapturedView } from './registry';
import type { StandardView } from '../core/types';

/**
 * Returns horizontal unit vector pointing towards azimuth angle (in degrees, user coords).
 * In user coordinates: X=East, Y=North.
 * In Three.js: three.x = user.X, three.y = user.Z (up), three.z = -user.Y.
 */
export function horizontalDir(angleDeg: number, out = new Vector3()): Vector3 {
  const rad = (angleDeg * Math.PI) / 180;
  return out.set(Math.cos(rad), 0, -Math.sin(rad));
}

/**
 * Computes camera position and up vector for a standard aligned view.
 * - Front view: looks horizontally at model, respecting UP.
 * - Top view: looks straight down with Front camera position at bottom of screen.
 * - Left view: 90° to the left of front.
 * - Right view: 90° to the right of front.
 * - Back view: 180° opposite front.
 * - ISO Left: 45° between Left and Front, looking down at 45°.
 * - ISO Right: 45° between Right and Front, looking down at 45°.
 */
export function computeViewCamera(
  view: StandardView,
  frontAngleDeg: number,
  center: Vector3,
  distance: number,
): { position: Vector3; target: Vector3; up: Vector3 } {
  const D = Math.max(distance, 0.1);
  const up = new Vector3(0, 1, 0);
  const target = center.clone();
  const position = center.clone();

  switch (view) {
    case 'front': {
      const dir = horizontalDir(frontAngleDeg);
      position.addScaledVector(dir, D);
      break;
    }
    case 'back': {
      const dir = horizontalDir(frontAngleDeg + 180);
      position.addScaledVector(dir, D);
      break;
    }
    case 'left': {
      // 90 degrees to the left of front (when standing at Front facing target)
      const dir = horizontalDir(frontAngleDeg - 90);
      position.addScaledVector(dir, D);
      break;
    }
    case 'right': {
      // 90 degrees to the right of front
      const dir = horizontalDir(frontAngleDeg + 90);
      position.addScaledVector(dir, D);
      break;
    }
    case 'top': {
      // Look straight down from above (+Y), with Front camera position at bottom of screen.
      // Epsilon offset along Front direction ensures orbit polar angle is ~0 without gimbal singularity.
      const dir = horizontalDir(frontAngleDeg);
      position.y += D;
      position.addScaledVector(dir, D * 1e-4);
      break;
    }
    case 'bottom': {
      const dir = horizontalDir(frontAngleDeg);
      position.y -= D;
      position.addScaledVector(dir, D * 1e-4);
      break;
    }
    case 'isoLeft': {
      // Between Left and Front (frontAngle - 45°), looking down at 45°
      const dir = horizontalDir(frontAngleDeg - 45);
      const horiz = D * Math.cos(Math.PI / 4);
      const vert = D * Math.sin(Math.PI / 4);
      position.y += vert;
      position.addScaledVector(dir, horiz);
      break;
    }
    case 'isoRight': {
      // Between Right and Front (frontAngle + 45°), looking down at 45°
      const dir = horizontalDir(frontAngleDeg + 45);
      const horiz = D * Math.cos(Math.PI / 4);
      const vert = D * Math.sin(Math.PI / 4);
      position.y += vert;
      position.addScaledVector(dir, horiz);
      break;
    }
  }

  return { position, target, up };
}

/**
 * Controller managing aligned camera views, smooth animations, and elevation exports.
 */
export function ViewController() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const viewRequest = useApp((s) => s.viewRequest);
  const frontViewAngle = useApp((s) => s.doc.frontViewAngle ?? s.doc.sceneAlignment ?? 0);
  const animRef = useRef<number>(0);

  // Register camera and helper callbacks
  useEffect(() => {
    registry.camera = camera;
    registry.controls = controls;
    registry.gl = gl;
    registry.scene = scene;

    registry.getCurrentCameraAzimuth = () => {
      const pos = camera.position;
      const tgt = controls ? controls.target : new Vector3();
      const dx = pos.x - tgt.x;
      const dz = pos.z - tgt.z;
      // In user coords: X=dx, Y=-dz
      let rawDeg = (Math.atan2(-dz, dx) * 180) / Math.PI;
      rawDeg = ((rawDeg % 360) + 360) % 360;
      return Math.round(rawDeg * 10) / 10;
    };

    registry.setFrontFromCurrentCamera = (snapToAlignment = true) => {
      const rawDeg = registry.getCurrentCameraAzimuth?.() ?? 0;
      let finalAngle = rawDeg;

      if (snapToAlignment) {
        const align = useApp.getState().doc.sceneAlignment ?? 0;
        let diff = (((finalAngle - align) % 360) + 360) % 360;
        if (diff > 180) diff -= 360;
        const quadrantOffset = Math.round(diff / 90) * 90;
        finalAngle = (((align + quadrantOffset) % 360) + 360) % 360;
        finalAngle = Math.round(finalAngle * 10) / 10;
      }

      useApp.getState().setFrontViewAngle(finalAngle);
      useApp.getState().setView('front');
      useApp.getState().setStatus(`✓ Front view set to ${finalAngle}° (squared to scene grid)`);
      return finalAngle;
    };

    registry.captureElevationViews = async () => {
      if (!registry.gl || !registry.scene || !registry.camera) {
        throw new Error('Viewport renderer not initialized');
      }
      const rGl = registry.gl;
      const rScene = registry.scene;
      const rCam = registry.camera as PerspectiveCamera;

      // 1. Save previous state
      const prevScanVis = registry.scanRoot ? registry.scanRoot.visible : true;
      const prevGizmoVis = registry.transformControls ? registry.transformControls.visible : true;
      const prevBg = rScene.background;
      const prevCamPos = rCam.position.clone();
      const prevCamUp = rCam.up.clone();
      const prevCamTarget = controls ? controls.target.clone() : new Vector3();
      const prevCamFov = rCam.fov;
      const prevCamAspect = rCam.aspect;
      const prevCamNear = rCam.near;
      const prevCamFar = rCam.far;

      // Hide scan data and transform gizmo, keep CAD primitives only
      if (registry.scanRoot) registry.scanRoot.visible = false;
      if (registry.transformControls) registry.transformControls.visible = false;
      if (registry.designRoot) registry.designRoot.visible = true;

      // Set clean architectural white background
      rScene.background = new Color('#ffffff');

      // 2. Compute bounding box of design primitives
      const box = new Box3();
      if (registry.designRoot) box.expandByObject(registry.designRoot);
      if (box.isEmpty()) {
        box.set(new Vector3(-1, 0, -1), new Vector3(1, 1.5, 1));
      }
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const radius = Math.max(size.length() / 2, 0.5);

      // Telephoto FOV 35° minimizes perspective distortion for engineering drawings
      rCam.fov = 35;
      const fovRad = (35 * Math.PI) / 180;
      const distance = (radius / Math.sin(fovRad / 2)) * 1.15;
      rCam.near = Math.max(distance / 500, 0.01);
      rCam.far = distance * 20;

      const frontAngle = useApp.getState().doc.frontViewAngle ?? useApp.getState().doc.sceneAlignment ?? 0;

      const viewsToCapture: { id: StandardView; title: string; subTitle: string }[] = [
        { id: 'top', title: 'PLAN VIEW (TOP VIEW)', subTitle: 'Looking Down · Front at Bottom' },
        { id: 'front', title: 'FRONT ELEVATION', subTitle: 'Level Eye Elevation · Respects UP' },
        { id: 'left', title: 'LEFT ELEVATION', subTitle: '90° Left Elevation' },
        { id: 'right', title: 'RIGHT ELEVATION', subTitle: '90° Right Elevation' },
        { id: 'back', title: 'BACK ELEVATION', subTitle: '180° Rear Elevation' },
        { id: 'isoLeft', title: 'ISOMETRIC VIEW (45°)', subTitle: 'South-West Isometric 3D' },
      ];

      const captured: CapturedView[] = [];

      // Render at 1600x1200 for crisp drawing sheets
      const origSize = rGl.getSize(new Vector2());
      const targetW = 1600;
      const targetH = 1200;
      rGl.setSize(targetW, targetH, false);
      rCam.aspect = targetW / targetH;
      rCam.updateProjectionMatrix();

      try {
        for (const v of viewsToCapture) {
          const { position, target, up } = computeViewCamera(v.id, frontAngle, center, distance);
          rCam.position.copy(position);
          rCam.up.copy(up);
          rCam.lookAt(target);
          rCam.updateProjectionMatrix();

          rGl.render(rScene, rCam);

          const dataUrl = rGl.domElement.toDataURL('image/jpeg', 0.92);
          const res = await fetch(dataUrl);
          const buf = await res.arrayBuffer();

          captured.push({
            id: v.id,
            title: v.title,
            subTitle: v.subTitle,
            dataUrl,
            jpegBytes: new Uint8Array(buf),
            width: targetW,
            height: targetH,
          });
        }
      } finally {
        // Restore all previous states
        if (registry.scanRoot) registry.scanRoot.visible = prevScanVis;
        if (registry.transformControls) registry.transformControls.visible = prevGizmoVis;
        rScene.background = prevBg;

        rCam.fov = prevCamFov;
        rCam.aspect = prevCamAspect;
        rCam.near = prevCamNear;
        rCam.far = prevCamFar;
        rCam.position.copy(prevCamPos);
        rCam.up.copy(prevCamUp);
        if (controls) controls.target.copy(prevCamTarget);
        rCam.updateProjectionMatrix();
        if (controls) controls.update();

        rGl.setSize(origSize.x, origSize.y, false);
        rGl.render(rScene, rCam);
      }

      return captured;
    };

    return () => {
      registry.camera = null;
      registry.controls = null;
      registry.gl = null;
      registry.scene = null;
      registry.setFrontFromCurrentCamera = undefined;
      registry.getCurrentCameraAzimuth = undefined;
      registry.captureElevationViews = undefined;
    };
  }, [camera, controls, gl, scene]);

  // Clear active standard view when user manually orbits
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = 0;
      }
      useApp.getState().setActiveStandardView(null);
    };
    controls.addEventListener('start', onStart);
    return () => {
      controls.removeEventListener('start', onStart);
    };
  }, [controls]);

  // Process viewRequest with smooth transition
  useEffect(() => {
    if (!viewRequest || !controls) return;
    const { view, fitBounds } = viewRequest;

    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
    }

    // Determine bounding box
    const box = new Box3();
    for (const root of [registry.scanRoot, registry.designRoot]) if (root) box.expandByObject(root);
    if (box.isEmpty()) box.set(new Vector3(-2, 0, -2), new Vector3(2, 2.5, 2));

    const boxCenter = box.getCenter(new Vector3());
    const boxRadius = box.getSize(new Vector3()).length() / 2;
    const fovRad = (camera.fov * Math.PI) / 180;
    const fitDistance = Math.max(boxRadius / Math.sin(fovRad / 2), 0.5);

    // Target center: keep controls.target unless fitBounds or out of bounds
    let center = controls.target.clone();
    if (fitBounds || center.lengthSq() < 1e-4 || box.distanceToPoint(center) > boxRadius * 2) {
      center = boxCenter;
    }

    // Distance: maintain current distance unless fitBounds or unreasonable
    let distance = camera.position.distanceTo(center);
    if (fitBounds || distance < 0.2 || distance > fitDistance * 4) {
      distance = fitDistance;
    }

    const { position: destPos, target: destTarget, up: destUp } = computeViewCamera(
      view,
      frontViewAngle,
      center,
      distance,
    );

    // Smooth ease-out animation
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startUp = camera.up.clone();
    const startTime = performance.now();
    const duration = 280;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease out

      camera.position.lerpVectors(startPos, destPos, ease);
      controls.target.lerpVectors(startTarget, destTarget, ease);
      camera.up.lerpVectors(startUp, destUp, ease).normalize();

      camera.lookAt(controls.target);
      controls.update();

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        camera.position.copy(destPos);
        controls.target.copy(destTarget);
        camera.up.copy(destUp);
        camera.updateProjectionMatrix();
        controls.update();
        animRef.current = 0;
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = 0;
      }
    };
  }, [viewRequest, frontViewAngle, camera, controls]);

  return null;
}
