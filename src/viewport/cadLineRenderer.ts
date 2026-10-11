import {
  Box3,
  Color,
  DepthTexture,
  FloatType,
  Mesh,
  MeshNormalMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { StandardView } from '../core/types';
import { horizontalDir } from './ViewController';

export interface OrthoFrustumResult {
  camera: OrthographicCamera;
  center: Vector3;
  spanX: number;
  spanY: number;
}

/**
 * Computes a perfectly centered, aspect-ratio-matched OrthographicCamera
 * for any standard CAD elevation viewpoint.
 *
 * For 'top' (Plan view): camera looks down from +Y, with Front camera position at bottom of sheet.
 * For 'front', 'back', 'left', 'right': level horizontal elevation respecting world UP.
 * For 'isoLeft', 'isoRight': standard CAD isometric projection.
 */
export function setupOrthoCamera(
  view: StandardView,
  frontAngleDeg: number,
  designRoot: Object3D | null,
  measurementPoints: Vector3[] = [],
  aspect: number = 1600 / 1200,
  marginFactor: number = 1.25,
): OrthoFrustumResult {
  // 1. Calculate bounding points in world space
  const worldBox = new Box3();
  if (designRoot) {
    designRoot.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        if (mesh.geometry) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const gb = mesh.geometry.boundingBox;
          if (gb) {
            const tempBox = gb.clone().applyMatrix4(mesh.matrixWorld);
            worldBox.union(tempBox);
          }
        }
      }
    });
  }

  // Include measurement points to guarantee dimension callouts stay within drawing margins
  for (const mp of measurementPoints) {
    worldBox.expandByPoint(mp);
  }

  if (worldBox.isEmpty()) {
    worldBox.set(new Vector3(-1, 0, -1), new Vector3(1, 1.5, 1));
  }

  const center = worldBox.getCenter(new Vector3());
  const boxSize = worldBox.getSize(new Vector3());
  const maxDim = Math.max(boxSize.length(), 1.0);
  const D = maxDim * 3 + 10;

  // 2. Determine camera direction and up vectors
  const pos = center.clone();
  let up = new Vector3(0, 1, 0);

  switch (view) {
    case 'front': {
      const dir = horizontalDir(frontAngleDeg);
      pos.addScaledVector(dir, D);
      break;
    }
    case 'back': {
      const dir = horizontalDir(frontAngleDeg + 180);
      pos.addScaledVector(dir, D);
      break;
    }
    case 'left': {
      const dir = horizontalDir(frontAngleDeg - 90);
      pos.addScaledVector(dir, D);
      break;
    }
    case 'right': {
      const dir = horizontalDir(frontAngleDeg + 90);
      pos.addScaledVector(dir, D);
      break;
    }
    case 'top': {
      // Look straight down from above (+Y).
      // Front camera position must appear at the BOTTOM of the sheet.
      // Screen top is camera UP, so UP points in the BACK direction (opposite front).
      pos.y += D;
      up = horizontalDir(frontAngleDeg + 180);
      break;
    }
    case 'bottom': {
      pos.y -= D;
      up = horizontalDir(frontAngleDeg);
      break;
    }
    case 'isoLeft': {
      // South-West Isometric: 45° between Left and Front, pitch ~35.264° (standard CAD isometric)
      const hDir = horizontalDir(frontAngleDeg - 45);
      const pitchRad = Math.atan(1 / Math.SQRT2); // 35.264°
      const cosP = Math.cos(pitchRad);
      const sinP = Math.sin(pitchRad);
      pos.x += hDir.x * cosP * D;
      pos.y += sinP * D;
      pos.z += hDir.z * cosP * D;
      break;
    }
    case 'isoRight': {
      const hDir = horizontalDir(frontAngleDeg + 45);
      const pitchRad = Math.atan(1 / Math.SQRT2);
      const cosP = Math.cos(pitchRad);
      const sinP = Math.sin(pitchRad);
      pos.x += hDir.x * cosP * D;
      pos.y += sinP * D;
      pos.z += hDir.z * cosP * D;
      break;
    }
  }

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, D * 4);
  camera.position.copy(pos);
  camera.up.copy(up).normalize();
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  // 3. Project world bounding corners to camera space
  const corners: Vector3[] = [
    new Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
    new Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
    new Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
    new Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
    new Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
    new Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
    new Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
    new Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z),
    ...measurementPoints,
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const pCam = new Vector3();
  for (const c of corners) {
    pCam.copy(c).applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, pCam.x);
    maxX = Math.max(maxX, pCam.x);
    minY = Math.min(minY, pCam.y);
    maxY = Math.max(maxY, pCam.y);
    minZ = Math.min(minZ, pCam.z);
    maxZ = Math.max(maxZ, pCam.z);
  }

  let spanX = Math.max((maxX - minX) * marginFactor, 0.6);
  let spanY = Math.max((maxY - minY) * marginFactor, 0.6);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Preserve isotropic aspect ratio without distortion
  if (spanX / spanY < aspect) {
    spanX = spanY * aspect;
  } else {
    spanY = spanX / aspect;
  }

  camera.left = midX - spanX / 2;
  camera.right = midX + spanX / 2;
  camera.bottom = midY - spanY / 2;
  camera.top = midY + spanY / 2;

  // Distance along look vector is -z in camera space
  camera.near = Math.max(0.01, -maxZ - 5);
  camera.far = -minZ + 15;
  camera.updateProjectionMatrix();

  return { camera, center, spanX, spanY };
}

// Post-processing CAD Hidden-Line Edge Detection Shaders
const POST_VERT_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG_SHADER = /* glsl */ `
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uDepthThreshold;
uniform float uNormalThreshold;

varying vec2 vUv;

float getDepth(vec2 uv) {
  return texture2D(tDepth, uv).r;
}

vec3 getNormal(vec2 uv) {
  return texture2D(tNormal, uv).rgb * 2.0 - 1.0;
}

void main() {
  vec2 invRes = 1.0 / uResolution;

  float dC = getDepth(vUv);
  bool isBgC = (dC >= 0.9999);

  // 3x3 Neighborhood:
  // uv00  uv10  uv20
  // uv01  (vUv) uv21
  // uv02  uv12  uv22
  vec2 uv00 = vUv + vec2(-invRes.x, -invRes.y);
  vec2 uv10 = vUv + vec2(0.0,       -invRes.y);
  vec2 uv20 = vUv + vec2(invRes.x,  -invRes.y);

  vec2 uv01 = vUv + vec2(-invRes.x, 0.0);
  vec2 uv21 = vUv + vec2(invRes.x,  0.0);

  vec2 uv02 = vUv + vec2(-invRes.x, invRes.y);
  vec2 uv12 = vUv + vec2(0.0,       invRes.y);
  vec2 uv22 = vUv + vec2(invRes.x,  invRes.y);

  float d00 = getDepth(uv00);
  float d10 = getDepth(uv10);
  float d20 = getDepth(uv20);
  float d01 = getDepth(uv01);
  float d21 = getDepth(uv21);
  float d02 = getDepth(uv02);
  float d12 = getDepth(uv12);
  float d22 = getDepth(uv22);

  // Background and geometry neighbor presence
  bool anyBg = (d00 >= 0.9999 || d10 >= 0.9999 || d20 >= 0.9999 ||
                d01 >= 0.9999 ||                  d21 >= 0.9999 ||
                d02 >= 0.9999 || d12 >= 0.9999 || d22 >= 0.9999);
  bool anyGeom = (d00 < 0.9999 || d10 < 0.9999 || d20 < 0.9999 ||
                  d01 < 0.9999 ||                  d21 < 0.9999 ||
                  d02 < 0.9999 || d12 < 0.9999 || d22 < 0.9999);

  float edge = 0.0;

  // 1. Outer Silhouette: Boundary between 3D model and white background.
  // Both sides of the boundary are marked to give a solid 2px outline.
  if ((!isBgC && anyBg) || (isBgC && anyGeom)) {
    edge = 1.0;
  }

  // 2. Interior Occlusion Edges: Discontinuity between overlapping components.
  // Using 2nd derivative (Laplacian difference) prevents false edge detection on continuous tilted planes.
  if (edge < 0.5 && !isBgC) {
    float lapX = abs(d21 + d01 - 2.0 * dC);
    float lapY = abs(d12 + d10 - 2.0 * dC);
    float lapD1 = abs(d22 + d00 - 2.0 * dC);
    float lapD2 = abs(d20 + d02 - 2.0 * dC);
    float depthDiscontinuity = max(max(lapX, lapY), max(lapD1, lapD2));

    if (depthDiscontinuity > uDepthThreshold) {
      edge = 1.0;
    }
  }

  // 3. Crease / Corner Edges: Normal discontinuity (sharp folds, flanges, 90° corners).
  if (edge < 0.5 && !isBgC) {
    vec3 n00 = getNormal(uv00);
    vec3 n10 = getNormal(uv10);
    vec3 n20 = getNormal(uv20);
    vec3 n01 = getNormal(uv01);
    vec3 n21 = getNormal(uv21);
    vec3 n02 = getNormal(uv02);
    vec3 n12 = getNormal(uv12);
    vec3 n22 = getNormal(uv22);

    vec3 sobelNormX = (n20 + 2.0 * n21 + n22) - (n00 + 2.0 * n01 + n02);
    vec3 sobelNormY = (n02 + 2.0 * n12 + n22) - (n00 + 2.0 * n10 + n20);
    float normGrad = sqrt(dot(sobelNormX, sobelNormX) + dot(sobelNormY, sobelNormY));

    if (normGrad > uNormalThreshold) {
      edge = 1.0;
    }
  }

  // Pure CAD drafting style:
  // Edge = Pure Black vec4(0.0, 0.0, 0.0, 1.0)
  // Fill/Background = Pure White vec4(1.0, 1.0, 1.0, 1.0)
  gl_FragColor = vec4(mix(vec3(1.0), vec3(0.0), edge), 1.0);
}
`;

/**
 * Renders an orthographic elevation view in pure black-and-white CAD line drawing style
 * (opaque white faces with hidden-line removal and solid black feature/silhouette lines).
 */
export function renderCadElevationLineDrawing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: OrthographicCamera,
  width: number,
  height: number,
) {
  // 1. Create off-screen render target with hardware depth texture
  const renderTarget = new WebGLRenderTarget(width, height, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    format: RGBAFormat,
    depthBuffer: true,
  });
  renderTarget.depthTexture = new DepthTexture(width, height, FloatType);

  const hiddenLines: Object3D[] = [];
  scene.traverse((child) => {
    if ((child as any).isLine || (child as any).isLineSegments || (child as any).isLine2) {
      if (child.visible) {
        child.visible = false;
        hiddenLines.push(child);
      }
    }
  });

  const prevOverrideMaterial = scene.overrideMaterial;
  const prevBackground = scene.background;
  const normalMaterial = new MeshNormalMaterial();

  try {
    scene.overrideMaterial = normalMaterial;
    scene.background = new Color('#808080'); // Neutral normal (0, 0, 0) for background

    renderer.setRenderTarget(renderTarget);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
  } finally {
    scene.overrideMaterial = prevOverrideMaterial;
    scene.background = prevBackground;
    for (const l of hiddenLines) {
      l.visible = true;
    }
  }

  // 3. Prepare Pass 2: Screen-space edge detection to main framebuffer
  const postMaterial = new ShaderMaterial({
    vertexShader: POST_VERT_SHADER,
    fragmentShader: POST_FRAG_SHADER,
    uniforms: {
      tNormal: { value: renderTarget.texture },
      tDepth: { value: renderTarget.depthTexture },
      uResolution: { value: new Vector2(width, height) },
      uDepthThreshold: { value: 0.0025 },
      uNormalThreshold: { value: 0.45 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const postQuad = new Mesh(new PlaneGeometry(2, 2), postMaterial);
  const postScene = new Scene();
  postScene.add(postQuad);

  const postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Render to screen / main canvas buffer
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);

  // Clean up WebGL resources
  postQuad.geometry.dispose();
  postMaterial.dispose();
  normalMaterial.dispose();
  renderTarget.dispose();
}
