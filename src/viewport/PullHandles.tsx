import { useMemo, useRef, useState } from 'react';
import {
  Euler,
  Group,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useApp } from '../core/store';
import { mm, userRotToEuler, userToWorldTuple, worldToUser } from '../core/frame';
import { registry } from './registry';
import type {
  BoxObject,
  CylinderObject,
  DesignObject,
  LadderObject,
  PolyShapeObject,
  Project,
  StairsObject,
  SteelBeamObject,
  SwingGateObject,
} from '../core/types';
import { STEEL_CATALOGUE, DEFAULT_SECTION } from './geometry/steelSections';
import { computeStairsMetrics } from './geometry/stairs';

interface HandleDef {
  id: string;
  label: string;
  localPos: [number, number, number];
  localAxis: [number, number, number];
  getVal: (obj: DesignObject) => number;
  apply: (obj: DesignObject, deltaMm: number, initialDoc: Project) => void;
}

const _v = new Vector3();
const _camDir = new Vector3();
const _binormal = new Vector3();
const _planeNormal = new Vector3();
const _hitPoint = new Vector3();
const _dragPlane = new Plane();
const _raycaster = new Raycaster();
const _ndc = new Vector2();

export function PullHandles({ obj }: { obj: DesignObject }) {
  const position = userToWorldTuple(obj.transform.position);
  const rotation = useMemo(() => userRotToEuler(obj.transform.rotation), [obj.transform.rotation]);
  const groupRef = useRef<Group>(null);

  const handles = useMemo(() => getHandlesForObject(obj), [obj]);

  if (!obj.visible || handles.length === 0) return null;

  return (
    <group
      ref={groupRef}
      name={`pull-handles-${obj.id}`}
      position={position}
      rotation={rotation}
      renderOrder={100}
      userData={{ noPick: true }}
    >
      {handles.map((h) => (
        <SingleHandle
          key={h.id}
          handle={h}
          obj={obj}
          groupRef={groupRef}
        />
      ))}
    </group>
  );
}

function SingleHandle({
  handle,
  obj,
  groupRef,
}: {
  handle: HandleDef;
  obj: DesignObject;
  groupRef: React.RefObject<Group | null>;
}) {
  const { camera, gl } = useThree();
  const gridSnap = useApp((s) => s.gridSnap);
  const updateObjectLive = useApp((s) => s.updateObjectLive);
  const commitChange = useApp((s) => s.commitChange);

  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [liveDeltaMm, setLiveDeltaMm] = useState(0);

  const handleMeshRef = useRef<Group>(null);
  const initialDocRef = useRef<Project | null>(null);
  const dragStartDataRef = useRef<{
    handleWorldPos: Vector3;
    handleWorldAxis: Vector3;
    t0: number;
    initialVal: number;
  } | null>(null);

  // Keep a comfortable screen-space scale based on camera distance
  useFrame(() => {
    if (!handleMeshRef.current) return;
    handleMeshRef.current.getWorldPosition(_v);
    const dist = camera.position.distanceTo(_v);
    // Base scale proportional to distance, clamped
    const baseScale = Math.max(0.45, Math.min(2.5, dist * 0.16));
    const activeMultiplier = dragging ? 1.35 : hovered ? 1.22 : 1.0;
    handleMeshRef.current.scale.setScalar(baseScale * activeMultiplier);
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return; // Primary left button only
    e.stopPropagation();

    const group = groupRef.current;
    const handleGroup = handleMeshRef.current;
    if (!group || !handleGroup) return;

    // Temporarily disable OrbitControls and TransformControls
    if (registry.controls) registry.controls.enabled = false;
    if (registry.transformControls) {
      registry.transformControls.visible = false;
      (registry.transformControls as any).enabled = false;
    }

    // Snapshot state before drag for clean undo history
    const docBefore = useApp.getState().doc;
    initialDocRef.current = docBefore;

    // Compute world position and world drag axis
    const handleWorldPos = handleGroup.getWorldPosition(new Vector3());
    const groupQuat = group.getWorldQuaternion(new Quaternion());
    const localAxisVec = new Vector3(...handle.localAxis);
    const handleWorldAxis = localAxisVec.clone().applyQuaternion(groupQuat).normalize();

    // Construct drag plane passing through handleWorldPos facing camera
    _camDir.copy(camera.position).sub(handleWorldPos);
    _binormal.crossVectors(handleWorldAxis, _camDir);
    if (_binormal.lengthSq() < 1e-6) {
      _binormal.crossVectors(handleWorldAxis, camera.up);
    }
    _planeNormal.crossVectors(_binormal, handleWorldAxis).normalize();
    _dragPlane.setFromNormalAndCoplanarPoint(_planeNormal, handleWorldPos);

    // Initial projection of pointer ray onto plane
    const dom = gl.domElement;
    const rect = dom.getBoundingClientRect();
    _ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    _raycaster.setFromCamera(_ndc, camera);

    let t0 = 0;
    if (_raycaster.ray.intersectPlane(_dragPlane, _hitPoint)) {
      t0 = _hitPoint.sub(handleWorldPos).dot(handleWorldAxis);
    }

    const initialVal = handle.getVal(obj);
    dragStartDataRef.current = {
      handleWorldPos,
      handleWorldAxis,
      t0,
      initialVal,
    };

    setDragging(true);
    setLiveDeltaMm(0);
    document.body.style.cursor = 'grabbing';

    const onPointerMove = (moveEv: PointerEvent) => {
      const startData = dragStartDataRef.current;
      const initialDoc = initialDocRef.current;
      if (!startData || !initialDoc) return;

      const r = dom.getBoundingClientRect();
      _ndc.set(
        ((moveEv.clientX - r.left) / r.width) * 2 - 1,
        -((moveEv.clientY - r.top) / r.height) * 2 + 1,
      );
      _raycaster.setFromCamera(_ndc, camera);

      if (_raycaster.ray.intersectPlane(_dragPlane, _hitPoint)) {
        const t = _hitPoint.sub(startData.handleWorldPos).dot(startData.handleWorldAxis);
        const deltaM = t - startData.t0;
        const rawDeltaMm = deltaM * 1000;

        // Snapping logic:
        // Hold Shift for continuous 1mm precision; otherwise snap to 10mm if gridSnap is active.
        const snapStep = moveEv.shiftKey ? 1 : (gridSnap ? 10 : 1);
        const snappedDeltaMm = Math.round(rawDeltaMm / snapStep) * snapStep;

        setLiveDeltaMm(snappedDeltaMm);

        updateObjectLive(obj.id, (draft) => {
          handle.apply(draft, snappedDeltaMm, initialDoc);
        });
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      setDragging(false);
      setLiveDeltaMm(0);
      document.body.style.cursor = 'default';

      if (registry.controls) registry.controls.enabled = true;
      if (registry.transformControls) {
        registry.transformControls.visible = true;
        (registry.transformControls as any).enabled = true;
      }

      if (initialDocRef.current) {
        commitChange(initialDocRef.current);
        initialDocRef.current = null;
      }
      dragStartDataRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const currentVal = handle.getVal(obj);

  // Material appearance
  const color = dragging ? '#facc15' : hovered ? '#ffffff' : '#38bdf8';
  const emissive = dragging ? '#f59e0b' : hovered ? '#38bdf8' : '#0284c7';

  // Local stem line orientation
  const axis = new Vector3(...handle.localAxis).normalize();
  const stemRot = useMemo(() => {
    const q = new Quaternion();
    q.setFromUnitVectors(new Vector3(0, 1, 0), axis);
    return new Euler().setFromQuaternion(q);
  }, [axis]);

  return (
    <group position={handle.localPos}>
      <group ref={handleMeshRef}>
        {/* Outward stem/stalk */}
        <group rotation={stemRot}>
          <mesh position={[0, 0.03, 0]} userData={{ noPick: true }}>
            <cylinderGeometry args={[0.006, 0.006, 0.06, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.65} depthTest={false} />
          </mesh>
        </group>

        {/* Tactile pull knob / cube */}
        <mesh
          position={[axis.x * 0.06, axis.y * 0.06, axis.z * 0.06]}
          userData={{ noPick: true }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = 'grab';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHovered(false);
            if (!dragging) document.body.style.cursor = 'default';
          }}
          onPointerDown={onPointerDown}
        >
          <boxGeometry args={[0.045, 0.045, 0.045]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={dragging ? 0.7 : hovered ? 0.5 : 0.25}
            roughness={0.2}
            metalness={0.3}
            depthTest={false}
          />
        </mesh>

        {/* Live dimension badge tooltip */}
        {(hovered || dragging) && (
          <Html
            position={[axis.x * 0.06, axis.y * 0.06 + 0.06, axis.z * 0.06]}
            center
            distanceFactor={10}
            zIndexRange={[100, 0]}
          >
            <div className="pull-handle-badge">
              <span className="pull-handle-dim">{handle.label}</span>
              <span className="pull-handle-val">{Math.round(currentVal)} mm</span>
              {dragging && liveDeltaMm !== 0 && (
                <span className={`pull-handle-delta ${liveDeltaMm > 0 ? 'pos' : 'neg'}`}>
                  {liveDeltaMm > 0 ? `+${Math.round(liveDeltaMm)}` : Math.round(liveDeltaMm)}
                </span>
              )}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

/**
 * Generates interactive pull handles for each shape kind.
 */
function getHandlesForObject(obj: DesignObject): HandleDef[] {
  switch (obj.kind) {
    case 'box': {
      const o = obj as BoxObject;
      const L = mm(o.length);
      const H = mm(o.height);
      const W = mm(o.width);

      return [
        // +X face (Length right)
        {
          id: 'box_posX',
          label: 'Length (X)',
          localPos: [L / 2, H / 2, 0],
          localAxis: [1, 0, 0],
          getVal: (d) => (d as BoxObject).length,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as BoxObject;
            if (!initObj) return;
            const newL = Math.max(10, initObj.length + deltaMm);
            const deltaL = newL - initObj.length;
            (draft as BoxObject).length = Math.round(newL);

            // Shift origin along local +X by deltaL / 2 so -X face stays pinned
            const offsetLocal = new Vector3((deltaL / 2) * 0.001, 0, 0);
            offsetLocal.applyEuler(userRotToEuler(initObj.transform.rotation));
            const deltaUser = worldToUser(offsetLocal);
            const p0 = initObj.transform.position;
            draft.transform.position = [
              Math.round((p0[0] + deltaUser[0]) * 10) / 10,
              Math.round((p0[1] + deltaUser[1]) * 10) / 10,
              Math.round((p0[2] + deltaUser[2]) * 10) / 10,
            ];
          },
        },
        // -X face (Length left)
        {
          id: 'box_negX',
          label: 'Length (X)',
          localPos: [-L / 2, H / 2, 0],
          localAxis: [-1, 0, 0],
          getVal: (d) => (d as BoxObject).length,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as BoxObject;
            if (!initObj) return;
            const newL = Math.max(10, initObj.length + deltaMm);
            const deltaL = newL - initObj.length;
            (draft as BoxObject).length = Math.round(newL);

            // Shift origin along local -X by deltaL / 2 so +X face stays pinned
            const offsetLocal = new Vector3((-deltaL / 2) * 0.001, 0, 0);
            offsetLocal.applyEuler(userRotToEuler(initObj.transform.rotation));
            const deltaUser = worldToUser(offsetLocal);
            const p0 = initObj.transform.position;
            draft.transform.position = [
              Math.round((p0[0] + deltaUser[0]) * 10) / 10,
              Math.round((p0[1] + deltaUser[1]) * 10) / 10,
              Math.round((p0[2] + deltaUser[2]) * 10) / 10,
            ];
          },
        },
        // +Y face (User +Y is Three -Z)
        {
          id: 'box_posY',
          label: 'Width (Y)',
          localPos: [0, H / 2, -W / 2],
          localAxis: [0, 0, -1],
          getVal: (d) => (d as BoxObject).width,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as BoxObject;
            if (!initObj) return;
            const newW = Math.max(10, initObj.width + deltaMm);
            const deltaW = newW - initObj.width;
            (draft as BoxObject).width = Math.round(newW);

            // Shift origin along Three -Z by deltaW / 2
            const offsetLocal = new Vector3(0, 0, (-deltaW / 2) * 0.001);
            offsetLocal.applyEuler(userRotToEuler(initObj.transform.rotation));
            const deltaUser = worldToUser(offsetLocal);
            const p0 = initObj.transform.position;
            draft.transform.position = [
              Math.round((p0[0] + deltaUser[0]) * 10) / 10,
              Math.round((p0[1] + deltaUser[1]) * 10) / 10,
              Math.round((p0[2] + deltaUser[2]) * 10) / 10,
            ];
          },
        },
        // -Y face (User -Y is Three +Z)
        {
          id: 'box_negY',
          label: 'Width (Y)',
          localPos: [0, H / 2, W / 2],
          localAxis: [0, 0, 1],
          getVal: (d) => (d as BoxObject).width,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as BoxObject;
            if (!initObj) return;
            const newW = Math.max(10, initObj.width + deltaMm);
            const deltaW = newW - initObj.width;
            (draft as BoxObject).width = Math.round(newW);

            // Shift origin along Three +Z by deltaW / 2
            const offsetLocal = new Vector3(0, 0, (deltaW / 2) * 0.001);
            offsetLocal.applyEuler(userRotToEuler(initObj.transform.rotation));
            const deltaUser = worldToUser(offsetLocal);
            const p0 = initObj.transform.position;
            draft.transform.position = [
              Math.round((p0[0] + deltaUser[0]) * 10) / 10,
              Math.round((p0[1] + deltaUser[1]) * 10) / 10,
              Math.round((p0[2] + deltaUser[2]) * 10) / 10,
            ];
          },
        },
        // Top face (+Z in user / +Y in Three)
        {
          id: 'box_posZ',
          label: 'Height (Z)',
          localPos: [0, H, 0],
          localAxis: [0, 1, 0],
          getVal: (d) => (d as BoxObject).height,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as BoxObject;
            if (!initObj) return;
            const newH = Math.max(10, initObj.height + deltaMm);
            (draft as BoxObject).height = Math.round(newH);
            // Box origin is already at the base face, so base stays pinned!
          },
        },
        // Bottom face (-Z in user / -Y in Three)
        {
          id: 'box_negZ',
          label: 'Height (Z)',
          localPos: [0, 0, 0],
          localAxis: [0, -1, 0],
          getVal: (d) => (d as BoxObject).height,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as BoxObject;
            if (!initObj) return;
            const newH = Math.max(10, initObj.height + deltaMm);
            const deltaH = newH - initObj.height;
            (draft as BoxObject).height = Math.round(newH);

            // Shift origin along Three -Y by deltaH so top face stays pinned
            const offsetLocal = new Vector3(0, -deltaH * 0.001, 0);
            offsetLocal.applyEuler(userRotToEuler(initObj.transform.rotation));
            const deltaUser = worldToUser(offsetLocal);
            const p0 = initObj.transform.position;
            draft.transform.position = [
              Math.round((p0[0] + deltaUser[0]) * 10) / 10,
              Math.round((p0[1] + deltaUser[1]) * 10) / 10,
              Math.round((p0[2] + deltaUser[2]) * 10) / 10,
            ];
          },
        },
      ];
    }

    case 'cylinder': {
      const o = obj as CylinderObject;
      const len = mm(o.length);
      const r = mm(o.diameter) / 2;

      return [
        // Top cap handle
        {
          id: 'cyl_top',
          label: 'Length (Height)',
          localPos: [0, len, 0],
          localAxis: [0, 1, 0],
          getVal: (d) => (d as CylinderObject).length,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as CylinderObject;
            if (!initObj) return;
            const newL = Math.max(10, initObj.length + deltaMm);
            (draft as CylinderObject).length = Math.round(newL);
          },
        },
        // Bottom cap handle
        {
          id: 'cyl_bottom',
          label: 'Length (Height)',
          localPos: [0, 0, 0],
          localAxis: [0, -1, 0],
          getVal: (d) => (d as CylinderObject).length,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as CylinderObject;
            if (!initObj) return;
            const newL = Math.max(10, initObj.length + deltaMm);
            const deltaL = newL - initObj.length;
            (draft as CylinderObject).length = Math.round(newL);

            const offsetLocal = new Vector3(0, -deltaL * 0.001, 0);
            offsetLocal.applyEuler(userRotToEuler(initObj.transform.rotation));
            const deltaUser = worldToUser(offsetLocal);
            const p0 = initObj.transform.position;
            draft.transform.position = [
              Math.round((p0[0] + deltaUser[0]) * 10) / 10,
              Math.round((p0[1] + deltaUser[1]) * 10) / 10,
              Math.round((p0[2] + deltaUser[2]) * 10) / 10,
            ];
          },
        },
        // Radial equator handle (Diameter)
        {
          id: 'cyl_dia',
          label: 'Diameter',
          localPos: [r, len / 2, 0],
          localAxis: [1, 0, 0],
          getVal: (d) => (d as CylinderObject).diameter,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as CylinderObject;
            if (!initObj) return;
            const newD = Math.max(10, initObj.diameter + deltaMm * 2);
            (draft as CylinderObject).diameter = Math.round(newD);
          },
        },
      ];
    }

    case 'beam': {
      const o = obj as SteelBeamObject;
      const secDef = STEEL_CATALOGUE[o.sectionName] ?? STEEL_CATALOGUE[DEFAULT_SECTION];
      const L = mm(o.length);
      const D = mm(secDef.depth);

      let yOffset = 0;
      if (o.alignment === 'topCenter') yOffset = -D / 2;
      else if (o.alignment === 'bottomCenter') yOffset = D / 2;

      return [
        // End of beam (lengthen forward)
        {
          id: 'beam_end',
          label: 'Beam Length',
          localPos: [L, yOffset, 0],
          localAxis: [1, 0, 0],
          getVal: (d) => (d as SteelBeamObject).length,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as SteelBeamObject;
            if (!initObj) return;
            const newL = Math.max(50, initObj.length + deltaMm);
            (draft as SteelBeamObject).length = Math.round(newL);
          },
        },
        // Start of beam (lengthen backward)
        {
          id: 'beam_start',
          label: 'Beam Length',
          localPos: [0, yOffset, 0],
          localAxis: [-1, 0, 0],
          getVal: (d) => (d as SteelBeamObject).length,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as SteelBeamObject;
            if (!initObj) return;
            const newL = Math.max(50, initObj.length + deltaMm);
            const deltaL = newL - initObj.length;
            (draft as SteelBeamObject).length = Math.round(newL);

            const offsetLocal = new Vector3(-deltaL * 0.001, 0, 0);
            offsetLocal.applyEuler(userRotToEuler(initObj.transform.rotation));
            const deltaUser = worldToUser(offsetLocal);
            const p0 = initObj.transform.position;
            draft.transform.position = [
              Math.round((p0[0] + deltaUser[0]) * 10) / 10,
              Math.round((p0[1] + deltaUser[1]) * 10) / 10,
              Math.round((p0[2] + deltaUser[2]) * 10) / 10,
            ];
          },
        },
      ];
    }

    case 'polyShape': {
      const o = obj as PolyShapeObject;
      let cx = 0;
      let cz = 0;
      if (o.points.length > 0) {
        for (const p of o.points) {
          cx += mm(p[0]);
          cz += -mm(p[1]);
        }
        cx /= o.points.length;
        cz /= o.points.length;
      }
      const thickM = mm(o.thickness);

      return [
        {
          id: 'poly_thick',
          label: 'Thickness',
          localPos: [cx, thickM, cz],
          localAxis: [0, 1, 0],
          getVal: (d) => (d as PolyShapeObject).thickness,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as PolyShapeObject;
            if (!initObj) return;
            const newT = Math.max(5, initObj.thickness + deltaMm);
            (draft as PolyShapeObject).thickness = Math.round(newT);
          },
        },
      ];
    }

    case 'stairs': {
      const o = obj as StairsObject;
      const metrics = computeStairsMetrics(o);
      const totalRun = mm(metrics.totalRunMm);
      const totalRise = mm(metrics.totalRiseMm);
      const clearWidth = mm(o.width || 750);

      return [
        // Top riser handle (Total Rise)
        {
          id: 'stairs_rise',
          label: 'Floor Rise',
          localPos: [totalRun, totalRise, 0],
          localAxis: [0, 1, 0],
          getVal: (d) => (d as StairsObject).totalRise,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as StairsObject;
            if (!initObj) return;
            const newRise = Math.max(200, initObj.totalRise + deltaMm);
            const so = draft as StairsObject;
            so.totalRise = Math.round(newRise);
            so.numSteps = Math.max(1, Math.round(newRise / 190));
          },
        },
        // Lateral width handle
        {
          id: 'stairs_width',
          label: 'Clear Width',
          localPos: [totalRun / 2, totalRise / 2, clearWidth / 2],
          localAxis: [0, 0, 1],
          getVal: (d) => (d as StairsObject).width,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as StairsObject;
            if (!initObj) return;
            const newW = Math.max(500, Math.min(2000, initObj.width + deltaMm * 2));
            (draft as StairsObject).width = Math.round(newW);
          },
        },
      ];
    }

    case 'ladder': {
      const o = obj as LadderObject;
      const H = mm(o.height);
      const W = mm(o.width);

      return [
        // Top rung handle (Height)
        {
          id: 'ladder_height',
          label: 'Climb Height',
          localPos: [0, H, 0],
          localAxis: [0, 1, 0],
          getVal: (d) => (d as LadderObject).height,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as LadderObject;
            if (!initObj) return;
            const newH = Math.max(500, initObj.height + deltaMm);
            (draft as LadderObject).height = Math.round(newH);
          },
        },
        // Right stringer handle (Width)
        {
          id: 'ladder_width',
          label: 'Clear Width',
          localPos: [W / 2, H / 2, 0],
          localAxis: [1, 0, 0],
          getVal: (d) => (d as LadderObject).width,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as LadderObject;
            if (!initObj) return;
            const newW = Math.max(300, initObj.width + deltaMm * 2);
            (draft as LadderObject).width = Math.round(newW);
          },
        },
      ];
    }

    case 'gate': {
      const o = obj as SwingGateObject;
      const W = mm(o.width);
      const H = mm(o.height);

      return [
        // Latch post handle (Width)
        {
          id: 'gate_width',
          label: 'Clear Opening',
          localPos: [W / 2, H / 2, 0],
          localAxis: [1, 0, 0],
          getVal: (d) => (d as SwingGateObject).width,
          apply: (draft, deltaMm, initDoc) => {
            const initObj = initDoc.objects.find((x) => x.id === draft.id) as SwingGateObject;
            if (!initObj) return;
            const newW = Math.max(400, initObj.width + deltaMm);
            const deltaW = newW - initObj.width;
            (draft as SwingGateObject).width = Math.round(newW);

            // Shift origin along local +X by deltaW / 2 so left hinge stays pinned
            const offsetLocal = new Vector3((deltaW / 2) * 0.001, 0, 0);
            offsetLocal.applyEuler(userRotToEuler(initObj.transform.rotation));
            const deltaUser = worldToUser(offsetLocal);
            const p0 = initObj.transform.position;
            draft.transform.position = [
              Math.round((p0[0] + deltaUser[0]) * 10) / 10,
              Math.round((p0[1] + deltaUser[1]) * 10) / 10,
              Math.round((p0[2] + deltaUser[2]) * 10) / 10,
            ];
          },
        },
      ];
    }

    default:
      return [];
  }
}
