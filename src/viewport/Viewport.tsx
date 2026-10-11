import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei';
import { MOUSE } from 'three';
import { useApp } from '../core/store';
import { ScanLayer } from './ScanLayer';
import { DesignLayer } from './DesignLayer';
import { MeasureLayer } from './MeasureLayer';
import { FrameController, ToolController } from './controllers';
import { ViewController } from './ViewController';

export function Viewport() {
  const tool = useApp((s) => s.tool);
  const showGrid = useApp((s) => s.showGrid);
  const floorZ = useApp((s) => s.bounds?.min[2] ?? 0);

  const sceneAlignment = useApp((s) => s.doc.sceneAlignment ?? 0);
  const alignRad = (sceneAlignment * Math.PI) / 180;

  return (
    <Canvas
      className={`viewport tool-${tool}`}
      flat // no tone mapping: keep Scaniverse's baked colours faithful
      dpr={[1, 2]}
      camera={{ position: [4, 3, 5], fov: 50, near: 0.01, far: 500 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <color attach="background" args={['#15181d']} />
      <hemisphereLight args={['#ffffff', '#445566', 1.6]} />
      <directionalLight position={[5, 10, 4]} intensity={1.4} />

      <ScanLayer />
      <DesignLayer />
      <MeasureLayer />

      {showGrid && (
        <group rotation={[0, alignRad, 0]} position={[0, floorZ / 1000 - 0.002, 0]}>
          <Grid
            infiniteGrid
            cellSize={0.1}
            sectionSize={1}
            cellColor="#2b3340"
            sectionColor="#3d4a5c"
            fadeDistance={40}
            fadeStrength={1.5}
            userData={{ noPick: true }}
          />
        </group>
      )}

      <OrbitControls
        makeDefault
        enableDamping={false}
        zoomToCursor
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
      />
      <ToolController />
      <FrameController />
      <ViewController />

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        {/* three Y-up shown as user Z (height), three −Z as user Y */}
        <GizmoViewport axisColors={['#ef4444', '#3b82f6', '#22c55e']} labels={['X', 'Z', '−Y']} labelColor="#fff" />
      </GizmoHelper>
    </Canvas>
  );
}
