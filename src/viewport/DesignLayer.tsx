import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  type Group,
  type Object3D,
} from 'three';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { useApp } from '../core/store';
import { eulerToUserRot, mm, userRotToEuler, userToWorldTuple, worldToUser } from '../core/frame';
import { registry } from './registry';
import type {
  BoxObject,
  CylinderObject,
  DesignObject,
  HandrailObject,
  LadderObject,
  PolyShapeObject,
  StairsObject,
  SteelBeamObject,
  SwingGateObject,
} from '../core/types';
import { buildPolyPrismGeometry } from './geometry/polyPrism';
import { buildAccessLadder, buildMonowillsHandrail, buildSwingGate } from './geometry/monowills';
import { buildStairsGeometry } from './geometry/stairs';
import { buildSteelBeamGeometry } from './geometry/steelSections';

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

function MeshEdges({
  geometry,
  color,
  threshold = 20,
}: {
  geometry: BufferGeometry;
  color: string;
  threshold?: number;
}) {
  const edgesGeom = useMemo(() => new EdgesGeometry(geometry, threshold), [geometry, threshold]);
  useEffect(() => {
    return () => {
      edgesGeom.dispose();
    };
  }, [edgesGeom]);

  return (
    <lineSegments geometry={edgesGeom} userData={{ noPick: true }}>
      <lineBasicMaterial color={color} depthTest={true} />
    </lineSegments>
  );
}

function DesignObjectView({ obj, selected }: { obj: DesignObject; selected: boolean }) {
  const position = userToWorldTuple(obj.transform.position);
  const rotation = useMemo(() => userRotToEuler(obj.transform.rotation), [obj.transform.rotation]);
  const edgeColor = useMemo(
    () => (selected ? '#ffffff' : new Color(obj.color).multiplyScalar(0.55).getStyle()),
    [obj.color, selected],
  );

  const { geometry, offsetY, snapPoints, showEdges } = useMemo(() => shapeFor(obj), [obj]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <group
      name={obj.id}
      position={position}
      rotation={rotation}
      visible={obj.visible}
      userData={{ objectId: obj.id, snapPoints }}
    >
      <mesh
        geometry={geometry}
        position={[0, offsetY, 0]}
        renderOrder={2}
      >
        <meshStandardMaterial
          color={obj.color}
          transparent
          opacity={selected ? 0.92 : 0.82}
          roughness={0.5}
          metalness={0.15}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
        {showEdges && <MeshEdges geometry={geometry} color={edgeColor} threshold={20} />}
      </mesh>
    </group>
  );
}

/** Geometry (metres, three frame) + snap points in group-local coordinates. */
function shapeFor(obj: DesignObject) {
  if (obj.kind === 'box') {
    const o = obj as BoxObject;
    const L = mm(o.length);
    const H = mm(o.height);
    const W = mm(o.width); // user Y ↔ three -Z
    const xs = [-L / 2, 0, L / 2];
    const ys = [0, H / 2, H];
    const zs = [-W / 2, 0, W / 2];
    const snapPoints: [number, number, number][] = [];
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          if (!(x === 0 && y === H / 2 && z === 0)) snapPoints.push([x, y, z]);
        }
      }
    }
    return {
      geometry: new BoxGeometry(L, H, W),
      offsetY: H / 2,
      snapPoints,
      showEdges: true,
    };
  }

  if (obj.kind === 'cylinder') {
    const o = obj as CylinderObject;
    const r = mm(o.diameter) / 2;
    const len = mm(o.length);
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
      geometry: new CylinderGeometry(r, r, len, 48),
      offsetY: len / 2,
      snapPoints,
      showEdges: true,
    };
  }

  if (obj.kind === 'polyShape') {
    const o = obj as PolyShapeObject;
    const geom = buildPolyPrismGeometry(o.points, o.thickness);
    const snapPoints: [number, number, number][] = [];
    const thickM = mm(o.thickness);
    for (const p of o.points) {
      const bx = mm(p[0]);
      const by = mm(p[2]);
      const bz = -mm(p[1]);
      snapPoints.push([bx, by, bz]);
      snapPoints.push([bx, by + thickM, bz]);
    }
    return {
      geometry: geom,
      offsetY: 0,
      snapPoints,
      showEdges: true,
    };
  }

  if (obj.kind === 'handrail') {
    const o = obj as HandrailObject;
    const res = buildMonowillsHandrail(o);
    return {
      geometry: res.geometry,
      offsetY: 0,
      snapPoints: res.snapPoints,
      showEdges: false,
    };
  }

  if (obj.kind === 'gate') {
    const o = obj as SwingGateObject;
    const res = buildSwingGate(o);
    return {
      geometry: res.geometry,
      offsetY: 0,
      snapPoints: res.snapPoints,
      showEdges: false,
    };
  }

  if (obj.kind === 'ladder') {
    const o = obj as LadderObject;
    const res = buildAccessLadder(o);
    return {
      geometry: res.geometry,
      offsetY: 0,
      snapPoints: res.snapPoints,
      showEdges: false,
    };
  }

  if (obj.kind === 'stairs') {
    const o = obj as StairsObject;
    const res = buildStairsGeometry(o);
    return {
      geometry: res.geometry,
      offsetY: 0,
      snapPoints: res.snapPoints,
      showEdges: false,
    };
  }

  if (obj.kind === 'beam') {
    const o = obj as SteelBeamObject;
    const res = buildSteelBeamGeometry(o);
    return {
      geometry: res.geometry,
      offsetY: 0,
      snapPoints: res.snapPoints,
      showEdges: true,
    };
  }

  return {
    geometry: new BoxGeometry(0.5, 0.5, 0.5),
    offsetY: 0.25,
    snapPoints: [],
    showEdges: true,
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
