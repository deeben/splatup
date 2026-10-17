import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Vector3,
} from 'three';

export interface LasParseResult {
  geometry: BufferGeometry;
  pointCount: number;
  hasColors: boolean;
  bounds: Box3;
  header: {
    version: string;
    format: number;
    scale: [number, number, number];
    offset: [number, number, number];
  };
}

/**
 * High-performance binary LAS (ASPRS 1.0 - 1.4) parser.
 * Reads raw LiDAR coordinates and 16-bit RGB vertex colors into a Three.js BufferGeometry.
 */
export function parseLas(arrayBuffer: ArrayBuffer): LasParseResult {
  const view = new DataView(arrayBuffer);

  // 1. Signature Check ("LASF")
  const sig = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (sig !== 'LASF') {
    throw new Error(`Invalid LAS file: header signature "${sig}" does not match "LASF"`);
  }

  // 2. Version and Header Info
  const vMajor = view.getUint8(24);
  const vMinor = view.getUint8(25);
  const offsetToPoints = view.getUint32(96, true);
  const pointFormat = view.getUint8(104);
  const pointRecordLength = view.getUint16(105, true);
  const numPointsLegacy = view.getUint32(107, true);

  // Coordinates Scale and Offset
  const sx = view.getFloat64(131, true);
  const sy = view.getFloat64(139, true);
  const sz = view.getFloat64(147, true);
  const ox = view.getFloat64(155, true);
  const oy = view.getFloat64(163, true);
  const oz = view.getFloat64(171, true);

  // Handle LAS 1.4 64-bit point count if present
  let numPoints = numPointsLegacy;
  if (vMajor === 1 && vMinor >= 4 && arrayBuffer.byteLength >= 255) {
    const pCount64 = Number(view.getBigUint64(247, true));
    if (pCount64 > 0) numPoints = pCount64;
  }

  // Sanity check buffer bounds
  const availablePoints = Math.floor((arrayBuffer.byteLength - offsetToPoints) / pointRecordLength);
  if (numPoints > availablePoints) {
    numPoints = availablePoints;
  }

  // Determine RGB color offset within the point record
  // Format 2: 26 bytes (record 0 + RGB at offset 20)
  // Format 3: 34 bytes (record 1 + RGB at offset 28)
  // Format 7, 8: 36/38 bytes (record 6 + RGB at offset 30)
  let rgbOffset = -1;
  if (pointFormat === 2) rgbOffset = 20;
  else if (pointFormat === 3) rgbOffset = 28;
  else if (pointFormat === 7 || pointFormat === 8) rgbOffset = 30;

  const positions = new Float32Array(numPoints * 3);
  const colors = rgbOffset >= 0 ? new Float32Array(numPoints * 3) : null;

  const bounds = new Box3();
  const tempV = new Vector3();

  // Parse points
  for (let i = 0; i < numPoints; i++) {
    const ptr = offsetToPoints + i * pointRecordLength;
    const rx = view.getInt32(ptr, true);
    const ry = view.getInt32(ptr + 4, true);
    const rz = view.getInt32(ptr + 8, true);

    // Coordinate relative to header offset:
    // This preserves millimetre precision in 32-bit float without UTM offset jitter.
    const x = rx * sx;
    const y = ry * sy;
    const z = rz * sz;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    tempV.set(x, y, z);
    bounds.expandByPoint(tempV);

    if (colors && rgbOffset >= 0) {
      const r = view.getUint16(ptr + rgbOffset, true);
      const g = view.getUint16(ptr + rgbOffset + 2, true);
      const b = view.getUint16(ptr + rgbOffset + 4, true);

      // Check if scanner wrote 16-bit or 8-bit values
      if (r > 255 || g > 255 || b > 255) {
        colors[i * 3] = r / 65535;
        colors[i * 3 + 1] = g / 65535;
        colors[i * 3 + 2] = b / 65535;
      } else {
        colors[i * 3] = r / 255;
        colors[i * 3 + 1] = g / 255;
        colors[i * 3 + 2] = b / 255;
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  if (colors) {
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }

  return {
    geometry,
    pointCount: numPoints,
    hasColors: Boolean(colors),
    bounds,
    header: {
      version: `${vMajor}.${vMinor}`,
      format: pointFormat,
      scale: [sx, sy, sz],
      offset: [ox, oy, oz],
    },
  };
}
