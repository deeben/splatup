import { useEffect, useMemo, useRef, useState } from 'react';
import { Color, type Group, type Object3D } from 'three';
import { Edges, TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { useApp } from '../core/store';
import { eulerToUserRot, mm, userRotToEuler, userToWorldTuple, worldToUser } from '../core/frame';
import { registry } from './registry';
import type { DesignObject } from '../core/types';

export function DesignLayer() {
  const objects = useApp((s) => s.doc.objects);
  const selection = useApp((s) => s.selection);
  const groupRef = useRef<Group>(null);

  useEffect(() => {
    registry.designRoot = groupRef.current;
    return () => {
      registry.designRoot = null;
    };
  }, []);

  const selectedId = selection?.type === 'object' ? selection.id : null;

  return (
    <>
      <group ref={groupRef} name="design">
        {objects.map((o) => (
          <DesignObjectView key={o.id} obj={o} selected={o.id === selectedId} />
        ))}
      </group>
      {selectedId && <Gizmo id={selectedId} />}
    </>
  );
}

function DesignObjectView({ obj, selected }: { obj: DesignObject; selected: boolean }) {
  const position = userToWorldTuple(obj.transform.position);
  const rotation = useMemo(() => userRotToEuler(obj.transform.rotation), [obj.transform.rotation]);
  const edgeColor = useMemo(
    () => (selected ? '#ffffff' : new Color(obj.color).multiplyScalar(0.55).getStyle()),
    [obj.color, selected],
  );

  const { geometry, offsetY, snapPoints } = useMemo(() => shapeFor(obj), [obj]);

  return (
    <group
      name={obj.id}
      position={position}
      rotation={rotation}
      visible={obj.visible}
      userData={{ objectId: obj.id, snapPoints }}
    >
      <mesh position={[0, offsetY, 0]} renderOrder={2}>
        {geometry}
        <meshStandardMaterial
          color={obj.color}
          transparent
          opacity={selected ? 0.9 : 0.78}
          roughness={0.6}
          metalness={0.1}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
        <Edges color={edgeColor} threshold={20} userData={{ noPick: true }} />
      </mesh>
    </group>
  );
}

/** Geometry (metres, three frame) + snap points in group-local coordinates. */
function shapeFor(obj: DesignObject) {
  if (obj.kind === 'box') {
    const L = mm(obj.length);
    const H = mm(obj.height);
    const W = mm(obj.width); // user Y ↔ three -Z
    const xs = [-L / 2, 0, L / 2];
    const ys = [0, H / 2, H];
    const zs = [-W / 2, 0, W / 2];
    const snapPoints: [number, number, number][] = [];
    // Corners, edge midpoints and face centres (all 27 lattice points except the body centre).
    for (const x of xs) for (const y of ys) for (const z of zs) if (!(x === 0 && y === H / 2 && z === 0)) snapPoints.push([x, y, z]);
    return {
      geometry: <boxGeometry args={[L, H, W]} />,
      offsetY: H / 2,
      snapPoints,
    };
  }
  const r = mm(obj.diameter) / 2;
  const len = mm(obj.length);
  const snapPoints: [number, number, number][] = [
    [0, 0, 0],
    [0, len, 0],
    [0, len / 2, 0],
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    snapPoints.push([Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r, len, Math.sin(a) * r]);
  }
  return {
    geometry: <cylinderGeometry args={[r, r, len, 48]} />,
    offsetY: len / 2,
    snapPoints,
  };
}

function Gizmo({ id }: { id: string }) {
  const scene = useThree((s) => s.scene);
  const mode = useApp((s) => s.gizmoMode);
  const space = useApp((s) => s.gizmoSpace);
  const gridSnap = useApp((s) => s.gridSnap);
  const tool = useApp((s) => s.tool);
  const objects = useApp((s) => s.doc.objects);
  const [target, setTarget] = useState<Object3D | null>(null);
  const ref = useRef<TransformControlsImpl>(null);

  useEffect(() => {
    setTarget(scene.getObjectByName(id) ?? null);
  }, [scene, id, objects]);

  useEffect(() => {
    registry.transformControls = ref.current;
    return () => {
      registry.transformControls = null;
    };
  });

  if (!target || tool !== 'select') return null;

  const commit = () => {
    const o = target;
    const position = worldToUser(o.position).map((v) => Math.round(v * 10) / 10) as [number, number, number];
    const rotation = eulerToUserRot(o.rotation);
    useApp.getState().updateObject(id, (d) => {
      d.transform.position = position;
      d.transform.rotation = rotation;
    });
  };

  return (
    <TransformControls
      ref={ref}
      object={target}
      mode={mode}
      space={space}
      translationSnap={gridSnap ? 0.01 : null}
      rotationSnap={gridSnap ? Math.PI / 12 : null}
      size={0.8}
      onMouseUp={commit}
    />
  );
}
