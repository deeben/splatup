import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useApp } from '../core/store';
import { axisLock, pick } from './pick';
import { registry } from './registry';
import type { SnapResult } from '../core/types';

const CLICK_TOLERANCE_PX = 5;

/**
 * Translates raw pointer events on the canvas into tool actions.
 * Orbit/pan use drag; tools act on *clicks* (pointer up without movement),
 * so navigation and drawing never fight each other.
 */
export function ToolController() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;

  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; button: number; gizmo: boolean } | null = null;
    let raf = 0;
    let lastMove: PointerEvent | null = null;

    const clipY = () => {
      const c = useApp.getState().doc.view.clipHeight;
      return c == null ? null : c / 1000;
    };

    const snapAt = (e: { clientX: number; clientY: number; shiftKey: boolean }): SnapResult | null => {
      const st = useApp.getState();
      const hit = pick(e.clientX, e.clientY, el, camera, { clipY: clipY() });
      if (!hit) return null;
      const res: SnapResult = { point: hit.point, kind: hit.kind, objectId: hit.objectId };
      if (st.tool === 'measure' && st.pendingA && e.shiftKey) {
        const locked = axisLock(st.pendingA, hit.point);
        return { ...res, point: locked.point, axis: locked.axis, kind: 'axis' };
      }
      return res;
    };

    const updateHover = () => {
      raf = 0;
      const e = lastMove;
      if (!e) return;
      const st = useApp.getState();
      if (st.tool === 'select') {
        if (st.hover) st.setHover(null);
        return;
      }
      st.setHover(snapAt(e));
    };

    const onMove = (e: PointerEvent) => {
      // Skip expensive picking while orbiting.
      if (down && e.buttons) return;
      lastMove = e;
      if (!raf) raf = requestAnimationFrame(updateHover);
    };

    const onDown = (e: PointerEvent) => {
      const tc = registry.transformControls as unknown as { axis?: unknown } | null;
      down = { x: e.clientX, y: e.clientY, button: e.button, gizmo: !!tc?.axis };
    };

    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.gizmo || d.button !== 0) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_TOLERANCE_PX) return;
      handleClick(e);
    };

    const handleClick = (e: PointerEvent) => {
      const st = useApp.getState();
      switch (st.tool) {
        case 'select': {
          const hit = pick(e.clientX, e.clientY, el, camera, { clipY: clipY(), vertexSnap: false });
          st.select(hit?.objectId ? { type: 'object', id: hit.objectId } : null);
          break;
        }
        case 'measure': {
          const s = snapAt(e);
          if (!s) return;
          if (!st.pendingA) {
            st.setPendingA(s.point);
            st.setStatus('Click the second point · hold Shift to lock to an axis · Esc to cancel');
          } else {
            const id = st.addMeasurement(st.pendingA, s.point);
            st.setPendingA(null);
            st.select({ type: 'measurement', id });
            st.setStatus('Measurement added · click to start another');
          }
          break;
        }
        case 'box':
        case 'cylinder': {
          const s = snapAt(e);
          if (!s) {
            st.setStatus('Click on the scan to place the object');
            return;
          }
          st.addObject(st.tool, s.point.map((v) => Math.round(v)) as typeof s.point);
          st.setTool('select');
          st.setStatus('Placed · edit exact dimensions in the panel on the right');
          break;
        }
      }
    };

    const onDbl = (e: MouseEvent) => {
      // Double-click: orbit around the picked point.
      const hit = pick(e.clientX, e.clientY, el, camera, { clipY: clipY(), vertexSnap: false });
      if (hit && controls) {
        controls.target.copy(hit.world);
        controls.update();
      }
    };

    const onLeave = () => useApp.getState().setHover(null);

    const onShift = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || !lastMove) return;
      const m = lastMove;
      const st = useApp.getState();
      if (st.tool !== 'measure' || !st.pendingA) return;
      st.setHover(snapAt({ clientX: m.clientX, clientY: m.clientY, shiftKey: e.type === 'keydown' }));
    };
    window.addEventListener('keydown', onShift);
    window.addEventListener('keyup', onShift);

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('dblclick', onDbl);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('dblclick', onDbl);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onShift);
      window.removeEventListener('keyup', onShift);
      cancelAnimationFrame(raf);
    };
  }, [gl, camera, controls]);

  return null;
}

/** Frames the camera on the scan (or design) whenever `frameRequest` changes. */
export function FrameController() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const frameRequest = useApp((s) => s.frameRequest);

  useEffect(() => {
    if (!controls) return;
    // Wait a frame so newly loaded objects are in the scene graph.
    const id = requestAnimationFrame(() => {
      const box = new Box3();
      for (const root of [registry.scanRoot, registry.designRoot]) if (root) box.expandByObject(root);
      if (box.isEmpty()) box.set(new Vector3(-2, 0, -2), new Vector3(2, 2.5, 2));
      const center = box.getCenter(new Vector3());
      const radius = box.getSize(new Vector3()).length() / 2;
      const fov = (camera.fov * Math.PI) / 180;
      const distance = radius / Math.sin(fov / 2);
      const dir = new Vector3(1, 0.9, 1.2).normalize();
      camera.position.copy(center).addScaledVector(dir, distance);
      camera.near = Math.max(distance / 1000, 0.005);
      camera.far = distance * 50;
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
    });
    return () => cancelAnimationFrame(id);
  }, [frameRequest, controls, camera]);

  return null;
}
