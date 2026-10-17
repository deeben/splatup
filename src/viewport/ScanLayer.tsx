import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box3,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  Points,
  PointsMaterial,
  Vector3,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { parseLas } from './loaders/lasLoader';
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
        if (cancelled) return;

        const ext = asset.fileName.split('.').pop()?.toLowerCase() || '';
        const isPly = ext === 'ply';
        const isLas = ext === 'las' || ext === 'laz';

        loaded = new Group();
        let tris = 0;
        let pts = 0;

        if (isLas) {
          // Parse ASPRS binary LiDAR format
          const res = parseLas(buf);
          const mat = new PointsMaterial({
            size: asset.pointSize ?? 0.015,
            vertexColors: res.hasColors,
            color: res.hasColors ? 0xffffff : 0x38bdf8,
            sizeAttenuation: true,
          });
          const points = new Points(res.geometry, mat);
          points.userData.originalMaterial = mat;
          points.userData.isPointCloud = true;
          loaded.add(points);
          pts = res.pointCount;
        } else if (isPly) {
          // Parse PLY mesh or point cloud
          const loader = new PLYLoader();
          const geom = loader.parse(buf);

          if (geom.index && geom.index.count > 0) {
            // Triangle mesh
            if (!geom.attributes.normal) geom.computeVertexNormals();
            geom.computeBoundsTree();
            const mat = new MeshStandardMaterial({
              vertexColors: Boolean(geom.attributes.color),
              roughness: 0.6,
              metalness: 0.1,
            });
            const mesh = new Mesh(geom, mat);
            mesh.userData.originalMaterial = mat;
            loaded.add(mesh);
            tris = geom.index.count / 3;
          } else {
            // Point cloud
            const mat = new PointsMaterial({
              size: asset.pointSize ?? 0.015,
              vertexColors: Boolean(geom.attributes.color),
              color: geom.attributes.color ? 0xffffff : 0x38bdf8,
              sizeAttenuation: true,
            });
            const points = new Points(geom, mat);
            points.userData.originalMaterial = mat;
            points.userData.isPointCloud = true;
            loaded.add(points);
            pts = geom.attributes.position.count;
          }
        } else {
          // Standard GLTF/GLB binary
          const gltf = await new GLTFLoader().parseAsync(buf, '');
          if (cancelled) return;
          loaded = gltf.scene;
          loaded.traverse((o) => {
            const m = o as Mesh;
            if (!m.isMesh) return;
            m.geometry.computeBoundsTree();
            tris += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
            m.userData.originalMaterial = m.material;
          });
        }

        loaded.userData.scanId = asset.id;
        setRoot(loaded);

        if (pts > 0) {
          setStatus(`Loaded ${asset.fileName} – ${pts.toLocaleString()} points`);
        } else {
          setStatus(`Loaded ${asset.fileName} – ${Math.round(tris).toLocaleString()} triangles`);
        }
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
        const anyObj = o as any;
        if (anyObj.geometry) {
          if (anyObj.geometry.disposeBoundsTree) anyObj.geometry.disposeBoundsTree();
          anyObj.geometry.dispose();
        }
        const mats = [o.userData.originalMaterial, o.userData.unlitMaterial].flat().filter(Boolean) as Material[];
        mats.forEach((mat) => {
          (mat as MeshStandardMaterial).map?.dispose();
          mat.dispose();
        });
      });
    };
    // Blob identity is stable per scan id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  // Apply display settings (opacity, clipping, unlit, point size) without reloading.
  useEffect(() => {
    if (!root) return;
    root.traverse((o) => {
      const anyObj = o as any;
      if (anyObj.isPoints) {
        const ptsMat = (anyObj.material as PointsMaterial);
        ptsMat.size = asset.pointSize ?? 0.015;
        const transparent = asset.opacity < 1;
        ptsMat.transparent = transparent;
        ptsMat.opacity = asset.opacity;
        ptsMat.clippingPlanes = planes;
        ptsMat.needsUpdate = true;
        return;
      }

      const m = o as Mesh;
      if (!m.isMesh) return;
      const orig = m.userData.originalMaterial as MeshStandardMaterial;
      let mat: Material = orig;
      if (asset.unlit) {
        if (!m.userData.unlitMaterial) {
          m.userData.unlitMaterial = new MeshBasicMaterial({
            map: orig?.map,
            color: orig?.map ? 0xffffff : (orig?.color ?? 0xffffff),
            vertexColors: orig?.vertexColors,
          });
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
  }, [root, asset.unlit, asset.opacity, asset.doubleSided, asset.pointSize, planes]);

  if (!root) return null;

  // Apply orientation: Z-up scans (LiDAR, CAD, iPhone PLY/LAS) rotate -90° around X to align with Three.js Y-up.
  const rotX = asset.orientation === 'z-up' ? -Math.PI / 2 : 0;

  return (
    <group rotation={[rotX, 0, 0]} visible={asset.visible}>
      <primitive object={root} />
    </group>
  );
}
