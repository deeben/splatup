import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box3,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Vector3,
  type Material,
  type MeshStandardMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useApp } from '../core/store';
import { worldToUser } from '../core/frame';
import { registry } from './registry';
import type { ScanAsset } from '../core/types';

/** All loaded scans live under one group so picking/framing can find them. */
export function ScanLayer() {
  const scans = useApp((s) => s.doc.scans);
  const files = useApp((s) => s.scanFiles);
  const clipHeight = useApp((s) => s.doc.view.clipHeight);
  const groupRef = useRef<Group>(null);
  const [loadedCount, setLoadedCount] = useState(0);

  // Section plane: keep geometry with world y <= clip (user Z mm → metres).
  const clipPlane = useMemo(() => new Plane(new Vector3(0, -1, 0), 0), []);
  clipPlane.constant = clipHeight == null ? 0 : clipHeight / 1000;
  const clipOn = clipHeight != null;
  const planes = useMemo(() => (clipOn ? [clipPlane] : null), [clipOn, clipPlane]);

  useEffect(() => {
    registry.scanRoot = groupRef.current;
    return () => {
      registry.scanRoot = null;
    };
  }, []);

  // Recompute combined bounds whenever a scan loads/unloads or visibility changes.
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const box = new Box3();
    g.children.forEach((c) => c.visible && box.expandByObject(c));
    const st = useApp.getState();
    if (box.isEmpty()) return st.setBounds(null);
    const a = worldToUser(box.min);
    const b = worldToUser(box.max);
    st.setBounds({
      min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
      max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
    });
  }, [loadedCount, scans]);

  return (
    <group ref={groupRef} name="scans">
      {scans.map((s) =>
        files[s.id] ? (
          <ScanModel
            key={s.id}
            asset={s}
            blob={files[s.id]}
            planes={planes}
            onLoaded={() => setLoadedCount((n) => n + 1)}
          />
        ) : null,
      )}
    </group>
  );
}

interface ScanModelProps {
  asset: ScanAsset;
  blob: Blob;
  planes: Plane[] | null;
  onLoaded: () => void;
}

function ScanModel({ asset, blob, planes, onLoaded }: ScanModelProps) {
  const [root, setRoot] = useState<Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: Group | null = null;
    const { setStatus, requestFrame } = useApp.getState();
    setStatus(`Loading ${asset.fileName}…`);
    (async () => {
      try {
        const buf = await blob.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(buf, '');
        if (cancelled) return;
        loaded = gltf.scene;
        let tris = 0;
        loaded.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          m.geometry.computeBoundsTree();
          tris += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
          m.userData.originalMaterial = m.material;
        });
        loaded.userData.scanId = asset.id;
        setRoot(loaded);
        setStatus(`Loaded ${asset.fileName} – ${Math.round(tris).toLocaleString()} triangles`);
        requestFrame();
        onLoaded();
      } catch (e) {
        console.error(e);
        setStatus(`Failed to load ${asset.fileName}: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      loaded?.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry.disposeBoundsTree();
        m.geometry.dispose();
        const mats = [m.userData.originalMaterial, m.userData.unlitMaterial].flat().filter(Boolean) as Material[];
        mats.forEach((mat) => {
          (mat as MeshStandardMaterial).map?.dispose();
          mat.dispose();
        });
      });
    };
    // Blob identity is stable per scan id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  // Apply display settings without reloading.
  useEffect(() => {
    if (!root) return;
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const orig = m.userData.originalMaterial as MeshStandardMaterial;
      let mat: Material = orig;
      if (asset.unlit) {
        if (!m.userData.unlitMaterial) {
          m.userData.unlitMaterial = new MeshBasicMaterial({ map: orig.map, color: orig.map ? 0xffffff : orig.color });
        }
        mat = m.userData.unlitMaterial as Material;
      }
      const transparent = asset.opacity < 1;
      mat.transparent = transparent;
      mat.opacity = asset.opacity;
      mat.depthWrite = !transparent;
      mat.side = asset.doubleSided ? DoubleSide : FrontSide;
      mat.clippingPlanes = planes;
      mat.needsUpdate = true;
      m.material = mat;
      m.renderOrder = transparent ? 1 : 0;
    });
  }, [root, asset.unlit, asset.opacity, asset.doubleSided, planes]);

  if (!root) return null;
  return <primitive object={root} visible={asset.visible} />;
}
