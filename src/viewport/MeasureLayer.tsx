import { useEffect, useRef } from 'react';
import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { useApp } from '../core/store';
import { userToWorldTuple } from '../core/frame';
import { fmtMm, measureParts } from '../core/units';
import type { Measurement, SnapResult, Vec3 } from '../core/types';
import { registry } from './registry';

const AXIS_COLORS = ['#ef4444', '#22c55e', '#3b82f6'];

export function MeasureLayer() {
  const measurements = useApp((s) => s.doc.measurements);
  const selection = useApp((s) => s.selection);
  const pendingA = useApp((s) => s.pendingA);
  const hover = useApp((s) => s.hover);
  const tool = useApp((s) => s.tool);
  const drawingPoints = useApp((s) => s.drawingPoints);
  const groupRef = useRef<Group>(null);

  useEffect(() => {
    registry.measureRoot = groupRef.current;
    return () => {
      registry.measureRoot = null;
    };
  }, []);

  const selId = selection?.type === 'measurement' ? selection.id : null;

  return (
    <group ref={groupRef} name="measurements">
      {measurements.map((m) => (
        <MeasurementView key={m.id} m={m} selected={m.id === selId} />
      ))}
      {pendingA && hover && tool === 'measure' && <PreviewLine a={pendingA} hover={hover} />}
      {pendingA && tool === 'measure' && <Endpoint p={pendingA} color="#facc15" />}
      {pendingA && hover && tool === 'align' && <AlignPreview a={pendingA} hover={hover} />}
      {pendingA && tool === 'align' && <Endpoint p={pendingA} color="#38bdf8" />}
      {(tool === 'polyShape' || tool === 'handrail' || tool === 'stairs' || tool === 'beam') && drawingPoints.length > 0 && (
        <DrawingPreview points={drawingPoints} hover={hover} tool={tool} />
      )}
      {hover && tool !== 'select' && <SnapMarker hover={hover} />}
    </group>
  );
}

function DrawingPreview({
  points,
  hover,
  tool,
}: {
  points: Vec3[];
  hover: SnapResult | null;
  tool: 'polyShape' | 'handrail' | 'stairs' | 'beam';
}) {
  const worldPts = points.map(userToWorldTuple);
  const color = tool === 'polyShape' ? '#10b981' : tool === 'beam' ? '#64748b' : '#f59e0b';

  return (
    <group name="drawing-preview">
      {/* Placed vertices */}
      {points.map((p, i) => (
        <Endpoint key={i} p={p} color={color} />
      ))}

      {/* Solid line between placed points */}
      {worldPts.length >= 2 && (
        <Line points={worldPts} color={color} lineWidth={3} depthTest={false} renderOrder={10} />
      )}

      {/* Rubberband line to cursor */}
      {hover && worldPts.length >= 1 && (
        <Line
          points={[worldPts[worldPts.length - 1], userToWorldTuple(hover.point)]}
          color="#38bdf8"
          lineWidth={2}
          dashed
          dashSize={0.03}
          gapSize={0.02}
          depthTest={false}
          renderOrder={10}
        />
      )}

      {/* Preview closing line back to point 0 for polygons */}
      {hover && tool === 'polyShape' && worldPts.length >= 2 && (
        <Line
          points={[userToWorldTuple(hover.point), worldPts[0]]}
          color="#10b981"
          lineWidth={1.5}
          dashed
          dashSize={0.02}
          gapSize={0.02}
          depthTest={false}
          renderOrder={10}
        />
      )}
    </group>
  );
}

function MeasurementView({ m, selected }: { m: Measurement; selected: boolean }) {
  const select = useApp((s) => s.select);
  const tool = useApp((s) => s.tool);
  const a = userToWorldTuple(m.a);
  const b = userToWorldTuple(m.b);
  const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const p = measureParts(m.a, m.b);
  const color = selected ? '#ffffff' : '#facc15';

  return (
    <group>
      <Line points={[a, b]} color={color} lineWidth={selected ? 3 : 2} depthTest={false} renderOrder={10} />
      <Endpoint p={m.a} color={color} />
      <Endpoint p={m.b} color={color} />
      <Html position={mid} center zIndexRange={[20, 10]} style={{ pointerEvents: tool === 'select' ? 'auto' : 'none' }}>
        <button
          className={`dim-label${selected ? ' selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            select({ type: 'measurement', id: m.id });
          }}
        >
          <span className="dim-name">{m.name}</span> {fmtMm(p.total)}
          {selected && (
            <span className="dim-detail">
              H {fmtMm(p.horizontal)} · V {fmtMm(p.vertical)}
            </span>
          )}
        </button>
      </Html>
    </group>
  );
}

function PreviewLine({ a, hover }: { a: Vec3; hover: SnapResult }) {
  const wa = userToWorldTuple(a);
  const wb = userToWorldTuple(hover.point);
  const mid: [number, number, number] = [(wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2, (wa[2] + wb[2]) / 2];
  const color = hover.axis != null ? AXIS_COLORS[hover.axis] : '#facc15';
  const p = measureParts(a, hover.point);
  return (
    <>
      <Line points={[wa, wb]} color={color} lineWidth={2} dashed dashSize={0.03} gapSize={0.02} depthTest={false} renderOrder={10} />
      <Html position={mid} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div className="dim-label preview">{fmtMm(p.total)}</div>
      </Html>
    </>
  );
}

function AlignPreview({ a, hover }: { a: Vec3; hover: SnapResult }) {
  const wa = userToWorldTuple(a);
  const wb = userToWorldTuple(hover.point);
  const mid: [number, number, number] = [(wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2, (wa[2] + wb[2]) / 2];
  const dx = hover.point[0] - a[0];
  const dy = hover.point[1] - a[1];
  const yawRad = Math.atan2(dy, dx);
  const yawDeg = Math.round(((yawRad * 180) / Math.PI) * 10) / 10;
  return (
    <>
      <Line points={[wa, wb]} color="#38bdf8" lineWidth={2} dashed dashSize={0.03} gapSize={0.02} depthTest={false} renderOrder={10} />
      <Html position={mid} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div className="dim-label preview" style={{ background: 'rgba(14, 165, 233, 0.95)', color: '#fff', borderColor: '#38bdf8', fontWeight: 600 }}>
          Align: {yawDeg}°
        </div>
      </Html>
    </>
  );
}

function Endpoint({ p, color }: { p: Vec3; color: string }) {
  const ref = useRef<Mesh>(null);
  useConstantScreenSize(ref, 0.004);
  return (
    <mesh ref={ref} position={userToWorldTuple(p)} renderOrder={11} userData={{ noPick: true }}>
      <sphereGeometry args={[1, 12, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

const SNAP_COLORS: Record<SnapResult['kind'], string> = {
  vertex: '#22c55e',
  corner: '#22c55e',
  face: '#38bdf8',
  axis: '#ffffff',
};

function SnapMarker({ hover }: { hover: SnapResult }) {
  const ref = useRef<Mesh>(null);
  const big = hover.kind === 'vertex' || hover.kind === 'corner';
  useConstantScreenSize(ref, big ? 0.008 : 0.005);
  const color = hover.axis != null ? AXIS_COLORS[hover.axis] : SNAP_COLORS[hover.kind];
  return (
    <mesh ref={ref} position={userToWorldTuple(hover.point)} renderOrder={12} userData={{ noPick: true }}>
      {big ? <boxGeometry args={[1.6, 1.6, 1.6]} /> : <sphereGeometry args={[1, 16, 12]} />}
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
    </mesh>
  );
}

/** Scale a mesh each frame so it keeps a roughly constant on-screen size. */
function useConstantScreenSize(ref: React.RefObject<Mesh | null>, factor: number) {
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    const d = camera.position.distanceTo(m.position);
    m.scale.setScalar(Math.max(d * factor, 0.0005));
  });
}
