import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useApp } from '../core/store';
import { registry } from './registry';
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
 * Controller managing aligned camera views and smooth animations.
 */
export function ViewController() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const viewRequest = useApp((s) => s.viewRequest);
  const frontViewAngle = useApp((s) => s.doc.frontViewAngle ?? s.doc.sceneAlignment ?? 0);
  const animRef = useRef<number>(0);

  // Register camera and helper callbacks
  useEffect(() => {
    registry.camera = camera;
    registry.controls = controls;

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

    return () => {
      registry.camera = null;
      registry.controls = null;
      registry.setFrontFromCurrentCamera = undefined;
      registry.getCurrentCameraAzimuth = undefined;
    };
  }, [camera, controls]);

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
