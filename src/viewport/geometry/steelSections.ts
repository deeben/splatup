import {
  BufferGeometry,
  Shape,
  ExtrudeGeometry,
} from 'three';
import type { SteelBeamObject } from '../../core/types';
import { mm } from '../../core/frame';

export interface SectionDef {
  name: string;
  category: 'UB' | 'UC' | 'PFC' | 'SHS' | 'RHS' | 'EA';
  depth: number;       // D (mm)
  flangeWidth: number; // B (mm)
  webThick: number;    // tw (mm)
  flangeThick: number; // tf (mm)
  rootRadius?: number; // r (mm)
  mass: number;        // kg/m
  label: string;
}

/**
 * Standard Australian Structural Steel Sections Catalogue
 * Source: Australian Steel Detailing Chart (AS 3679.1 / AS 1163)
 */
export const STEEL_CATALOGUE: Record<string, SectionDef> = {
  // Universal Beams (UB)
  '610UB125': { name: '610UB125', category: 'UB', depth: 612, flangeWidth: 229, webThick: 11.9, flangeThick: 19.6, mass: 125, label: '610 UB 125' },
  '610UB113': { name: '610UB113', category: 'UB', depth: 607, flangeWidth: 228, webThick: 11.2, flangeThick: 17.3, mass: 113, label: '610 UB 113' },
  '610UB101': { name: '610UB101', category: 'UB', depth: 602, flangeWidth: 228, webThick: 10.6, flangeThick: 14.8, mass: 101, label: '610 UB 101' },
  '530UB92':  { name: '530UB92',  category: 'UB', depth: 533, flangeWidth: 209, webThick: 10.2, flangeThick: 15.6, mass: 92.4, label: '530 UB 92' },
  '530UB82':  { name: '530UB82',  category: 'UB', depth: 528, flangeWidth: 209, webThick: 9.6,  flangeThick: 13.2, mass: 82.0, label: '530 UB 82' },
  '460UB82':  { name: '460UB82',  category: 'UB', depth: 460, flangeWidth: 191, webThick: 9.9,  flangeThick: 16.0, mass: 82.1, label: '460 UB 82' },
  '460UB74':  { name: '460UB74',  category: 'UB', depth: 457, flangeWidth: 190, webThick: 9.1,  flangeThick: 14.5, mass: 74.6, label: '460 UB 74.6' },
  '460UB67':  { name: '460UB67',  category: 'UB', depth: 454, flangeWidth: 190, webThick: 8.5,  flangeThick: 12.7, mass: 67.1, label: '460 UB 67.1' },
  '410UB60':  { name: '410UB60',  category: 'UB', depth: 406, flangeWidth: 178, webThick: 7.8,  flangeThick: 12.8, mass: 59.7, label: '410 UB 59.7' },
  '410UB54':  { name: '410UB54',  category: 'UB', depth: 403, flangeWidth: 178, webThick: 7.6,  flangeThick: 10.9, mass: 53.7, label: '410 UB 53.7' },
  '360UB57':  { name: '360UB57',  category: 'UB', depth: 359, flangeWidth: 172, webThick: 8.0,  flangeThick: 13.0, mass: 56.7, label: '360 UB 56.7' },
  '360UB51':  { name: '360UB51',  category: 'UB', depth: 356, flangeWidth: 171, webThick: 7.3,  flangeThick: 11.5, mass: 50.7, label: '360 UB 50.7' },
  '360UB45':  { name: '360UB45',  category: 'UB', depth: 352, flangeWidth: 171, webThick: 6.9,  flangeThick: 9.7,  mass: 44.7, label: '360 UB 44.7' },
  '310UB46':  { name: '310UB46',  category: 'UB', depth: 307, flangeWidth: 166, webThick: 6.7,  flangeThick: 11.8, mass: 46.2, label: '310 UB 46.2' },
  '310UB40':  { name: '310UB40',  category: 'UB', depth: 304, flangeWidth: 165, webThick: 6.1,  flangeThick: 10.2, mass: 40.4, label: '310 UB 40.4' },
  '310UB32':  { name: '310UB32',  category: 'UB', depth: 298, flangeWidth: 149, webThick: 5.5,  flangeThick: 8.6,  mass: 32.0, label: '310 UB 32.0' },
  '250UB37':  { name: '250UB37',  category: 'UB', depth: 256, flangeWidth: 146, webThick: 6.4,  flangeThick: 10.9, mass: 37.3, label: '250 UB 37.3' },
  '250UB31':  { name: '250UB31',  category: 'UB', depth: 252, flangeWidth: 146, webThick: 6.1,  flangeThick: 8.6,  mass: 31.4, label: '250 UB 31.4' },
  '250UB26':  { name: '250UB26',  category: 'UB', depth: 248, flangeWidth: 124, webThick: 5.0,  flangeThick: 8.0,  mass: 25.7, label: '250 UB 25.7' },
  '200UB30':  { name: '200UB30',  category: 'UB', depth: 207, flangeWidth: 134, webThick: 6.3,  flangeThick: 9.6,  mass: 29.8, label: '200 UB 29.8' },
  '200UB25':  { name: '200UB25',  category: 'UB', depth: 203, flangeWidth: 133, webThick: 5.8,  flangeThick: 7.8,  mass: 25.4, label: '200 UB 25.4' },
  '200UB22':  { name: '200UB22',  category: 'UB', depth: 202, flangeWidth: 133, webThick: 5.0,  flangeThick: 7.0,  mass: 22.3, label: '200 UB 22.3' },
  '200UB18':  { name: '200UB18',  category: 'UB', depth: 198, flangeWidth: 99,  webThick: 4.5,  flangeThick: 7.0,  mass: 18.2, label: '200 UB 18.2' },
  '180UB22':  { name: '180UB22',  category: 'UB', depth: 179, flangeWidth: 90,  webThick: 6.0,  flangeThick: 10.0, mass: 22.2, label: '180 UB 22.2' },
  '180UB18':  { name: '180UB18',  category: 'UB', depth: 175, flangeWidth: 90,  webThick: 5.0,  flangeThick: 8.0,  mass: 18.1, label: '180 UB 18.1' },
  '180UB16':  { name: '180UB16',  category: 'UB', depth: 173, flangeWidth: 90,  webThick: 5.0,  flangeThick: 7.0,  mass: 16.1, label: '180 UB 16.1' },
  '150UB18':  { name: '150UB18',  category: 'UB', depth: 155, flangeWidth: 75,  webThick: 6.0,  flangeThick: 9.5,  mass: 18.0, label: '150 UB 18.0' },
  '150UB14':  { name: '150UB14',  category: 'UB', depth: 150, flangeWidth: 75,  webThick: 5.0,  flangeThick: 7.0,  mass: 14.0, label: '150 UB 14.0' },

  // Universal Columns (UC)
  '310UC158': { name: '310UC158', category: 'UC', depth: 327, flangeWidth: 311, webThick: 15.7, flangeThick: 25.0, mass: 158, label: '310 UC 158' },
  '310UC137': { name: '310UC137', category: 'UC', depth: 321, flangeWidth: 309, webThick: 13.8, flangeThick: 21.7, mass: 137, label: '310 UC 137' },
  '310UC118': { name: '310UC118', category: 'UC', depth: 315, flangeWidth: 307, webThick: 11.9, flangeThick: 18.7, mass: 118, label: '310 UC 118' },
  '310UC97':  { name: '310UC97',  category: 'UC', depth: 308, flangeWidth: 305, webThick: 9.9,  flangeThick: 15.4, mass: 96.8, label: '310 UC 96.8' },
  '250UC90':  { name: '250UC90',  category: 'UC', depth: 260, flangeWidth: 256, webThick: 10.5, flangeThick: 17.3, mass: 89.5, label: '250 UC 89.5' },
  '250UC73':  { name: '250UC73',  category: 'UC', depth: 254, flangeWidth: 254, webThick: 8.6,  flangeThick: 14.2, mass: 72.9, label: '250 UC 72.9' },
  '200UC60':  { name: '200UC60',  category: 'UC', depth: 210, flangeWidth: 205, webThick: 9.3,  flangeThick: 14.2, mass: 59.5, label: '200 UC 59.5' },
  '200UC52':  { name: '200UC52',  category: 'UC', depth: 206, flangeWidth: 204, webThick: 8.0,  flangeThick: 12.5, mass: 52.2, label: '200 UC 52.2' },
  '200UC46':  { name: '200UC46',  category: 'UC', depth: 203, flangeWidth: 203, webThick: 7.3,  flangeThick: 11.0, mass: 46.2, label: '200 UC 46.2' },
  '150UC37':  { name: '150UC37',  category: 'UC', depth: 162, flangeWidth: 154, webThick: 8.1,  flangeThick: 11.5, mass: 37.2, label: '150 UC 37.2' },
  '150UC30':  { name: '150UC30',  category: 'UC', depth: 158, flangeWidth: 153, webThick: 6.5,  flangeThick: 9.4,  mass: 30.0, label: '150 UC 30.0' },
  '150UC23':  { name: '150UC23',  category: 'UC', depth: 152, flangeWidth: 152, webThick: 6.0,  flangeThick: 6.8,  mass: 23.4, label: '150 UC 23.4' },
  '100UC15':  { name: '100UC15',  category: 'UC', depth: 97,  flangeWidth: 99,  webThick: 5.0,  flangeThick: 7.0,  mass: 14.8, label: '100 UC 14.8' },

  // Parallel Flange Channels (PFC)
  '380PFC':    { name: '380PFC',   category: 'PFC', depth: 380, flangeWidth: 100, webThick: 10.0, flangeThick: 17.5, mass: 55.2, label: '380 x 100 PFC' },
  '300PFC':    { name: '300PFC',   category: 'PFC', depth: 300, flangeWidth: 90,  webThick: 8.0,  flangeThick: 16.0, mass: 40.1, label: '300 x 90 PFC' },
  '250PFC':    { name: '250PFC',   category: 'PFC', depth: 250, flangeWidth: 90,  webThick: 8.0,  flangeThick: 15.0, mass: 35.5, label: '250 x 90 PFC' },
  '230PFC':    { name: '230PFC',   category: 'PFC', depth: 230, flangeWidth: 75,  webThick: 6.5,  flangeThick: 12.0, mass: 25.1, label: '230 x 75 PFC' },
  '200PFC':    { name: '200PFC',   category: 'PFC', depth: 200, flangeWidth: 75,  webThick: 6.0,  flangeThick: 12.0, mass: 22.9, label: '200 x 75 PFC' },
  '180PFC':    { name: '180PFC',   category: 'PFC', depth: 180, flangeWidth: 75,  webThick: 6.0,  flangeThick: 11.0, mass: 20.9, label: '180 x 75 PFC' },
  '150PFC':    { name: '150PFC',   category: 'PFC', depth: 150, flangeWidth: 75,  webThick: 6.0,  flangeThick: 9.5,  mass: 17.7, label: '150 x 75 PFC' },
  '125PFC':    { name: '125PFC',   category: 'PFC', depth: 125, flangeWidth: 65,  webThick: 5.0,  flangeThick: 8.5,  mass: 13.0, label: '125 x 65 PFC' },
  '100PFC':    { name: '100PFC',   category: 'PFC', depth: 100, flangeWidth: 50,  webThick: 5.0,  flangeThick: 8.0,  mass: 10.2, label: '100 x 50 PFC' },
  '75PFC':     { name: '75PFC',    category: 'PFC', depth: 75,  flangeWidth: 40,  webThick: 4.5,  flangeThick: 7.0,  mass: 7.0,  label: '75 x 40 PFC' },

  // Square Hollow Sections (SHS)
  '200x200 SHS': { name: '200x200 SHS', category: 'SHS', depth: 200, flangeWidth: 200, webThick: 9.0, flangeThick: 9.0, mass: 52.5, label: '200 x 200 x 9.0 SHS' },
  '150x150 SHS': { name: '150x150 SHS', category: 'SHS', depth: 150, flangeWidth: 150, webThick: 6.0, flangeThick: 6.0, mass: 26.4, label: '150 x 150 x 6.0 SHS' },
  '100x100 SHS': { name: '100x100 SHS', category: 'SHS', depth: 100, flangeWidth: 100, webThick: 5.0, flangeThick: 5.0, mass: 14.4, label: '100 x 100 x 5.0 SHS' },
  '75x75 SHS':   { name: '75x75 SHS',   category: 'SHS', depth: 75,  flangeWidth: 75,  webThick: 4.0, flangeThick: 4.0, mass: 8.6,  label: '75 x 75 x 4.0 SHS' },

  // Rectangular Hollow Sections (RHS)
  '200x100 RHS': { name: '200x100 RHS', category: 'RHS', depth: 200, flangeWidth: 100, webThick: 6.0, flangeThick: 6.0, mass: 26.4, label: '200 x 100 x 6.0 RHS' },
  '150x100 RHS': { name: '150x100 RHS', category: 'RHS', depth: 150, flangeWidth: 100, webThick: 5.0, flangeThick: 5.0, mass: 18.3, label: '150 x 100 x 5.0 RHS' },
  '100x50 RHS':  { name: '100x50 RHS',  category: 'RHS', depth: 100, flangeWidth: 50,  webThick: 4.0, flangeThick: 4.0, mass: 8.6,  label: '100 x 50 x 4.0 RHS' },

  // Equal Angles (EA)
  '150x150 EA': { name: '150x150 EA', category: 'EA', depth: 150, flangeWidth: 150, webThick: 12.0, flangeThick: 12.0, mass: 26.8, label: '150 x 150 x 12 EA' },
  '100x100 EA': { name: '100x100 EA', category: 'EA', depth: 100, flangeWidth: 100, webThick: 8.0,  flangeThick: 8.0,  mass: 12.1, label: '100 x 100 x 8 EA' },
  '90x90 EA':   { name: '90x90 EA',   category: 'EA', depth: 90,  flangeWidth: 90,  webThick: 8.0,  flangeThick: 8.0,  mass: 10.6, label: '90 x 90 x 8 EA' },
  '75x75 EA':   { name: '75x75 EA',   category: 'EA', depth: 75,  flangeWidth: 75,  webThick: 6.0,  flangeThick: 6.0,  mass: 6.8,  label: '75 x 75 x 6 EA' },
  '65x65 EA':   { name: '65x65 EA',   category: 'EA', depth: 65,  flangeWidth: 65,  webThick: 6.0,  flangeThick: 6.0,  mass: 5.8,  label: '65 x 65 x 6 EA' },
};

export const DEFAULT_SECTION = '250UB37';

/**
 * Creates 2D Three.js Shape for an Australian steel profile in local YZ cross-section.
 * Profile coordinate conventions:
 *   Y = height (depth D), from bottom flange (0) to top flange (D) or centered.
 *   Z = width across flanges (B), centered (-B/2 to +B/2).
 */
function createSectionProfileShape(sec: SectionDef): Shape {
  const shape = new Shape();
  const D = mm(sec.depth);
  const B = mm(sec.flangeWidth);
  const tw = mm(sec.webThick);
  const tf = mm(sec.flangeThick);

  if (sec.category === 'UB' || sec.category === 'UC') {
    // 12-point I-beam polygon (symmetric)
    const z1 = -B / 2;
    const z2 = -tw / 2;
    const z3 = tw / 2;
    const z4 = B / 2;

    const y0 = -D / 2;
    const y1 = -D / 2 + tf;
    const y2 = D / 2 - tf;
    const y3 = D / 2;

    shape.moveTo(z1, y3); // top-left
    shape.lineTo(z4, y3); // top-right
    shape.lineTo(z4, y2);
    shape.lineTo(z3, y2);
    shape.lineTo(z3, y1);
    shape.lineTo(z4, y1);
    shape.lineTo(z4, y0); // bottom-right
    shape.lineTo(z1, y0); // bottom-left
    shape.lineTo(z1, y1);
    shape.lineTo(z2, y1);
    shape.lineTo(z2, y2);
    shape.lineTo(z1, y2);
    shape.closePath();
  } else if (sec.category === 'PFC') {
    // 8-point C-channel profile (flanges point to +Z)
    const z0 = -B / 2;       // web back
    const z1 = -B / 2 + tw;  // web inner face
    const z2 = B / 2;        // flange toe

    const y0 = -D / 2;
    const y1 = -D / 2 + tf;
    const y2 = D / 2 - tf;
    const y3 = D / 2;

    shape.moveTo(z0, y3);
    shape.lineTo(z2, y3);
    shape.lineTo(z2, y2);
    shape.lineTo(z1, y2);
    shape.lineTo(z1, y1);
    shape.lineTo(z2, y1);
    shape.lineTo(z2, y0);
    shape.lineTo(z0, y0);
    shape.closePath();
  } else if (sec.category === 'EA') {
    // 6-point L-angle profile
    const z0 = -B / 2;
    const z1 = -B / 2 + tw;
    const z2 = B / 2;

    const y0 = -D / 2;
    const y1 = -D / 2 + tf;
    const y2 = D / 2;

    shape.moveTo(z0, y2);
    shape.lineTo(z1, y2);
    shape.lineTo(z1, y1);
    shape.lineTo(z2, y1);
    shape.lineTo(z2, y0);
    shape.lineTo(z0, y0);
    shape.closePath();
  } else {
    // Hollow Box (SHS / RHS)
    const z0 = -B / 2;
    const z1 = B / 2;
    const y0 = -D / 2;
    const y1 = D / 2;

    // Outer rectangle
    shape.moveTo(z0, y1);
    shape.lineTo(z1, y1);
    shape.lineTo(z1, y0);
    shape.lineTo(z0, y0);
    shape.closePath();

    // Inner hole
    const hole = new Shape();
    hole.moveTo(z0 + tw, y1 - tf);
    hole.lineTo(z0 + tw, y0 + tf);
    hole.lineTo(z1 - tw, y0 + tf);
    hole.lineTo(z1 - tw, y1 - tf);
    hole.closePath();
    shape.holes.push(hole);
  }

  return shape;
}

/**
 * Builds full watertight 3D steel beam geometry with exact cross-section profile.
 */
export function buildSteelBeamGeometry(obj: SteelBeamObject): {
  geometry: BufferGeometry;
  snapPoints: [number, number, number][];
  secDef: SectionDef;
  massKg: number;
} {
  const secDef = STEEL_CATALOGUE[obj.sectionName] ?? STEEL_CATALOGUE[DEFAULT_SECTION];
  const L = mm(obj.length); // along local X
  const D = mm(secDef.depth);
  const B = mm(secDef.flangeWidth);

  const profileShape = createSectionProfileShape(secDef);

  // Extrude along normal axis (Z in Shape space)
  const extrudeGeom = new ExtrudeGeometry(profileShape, {
    depth: L,
    bevelEnabled: false,
  });

  // Reorient extruded geometry:
  // Shape was on YZ plane, Extrude extruded along +Z.
  // We want the beam length to run along +X (standard SplatUp convention),
  // with Depth D along Three Y (Up), and Flange Width B along Three Z.
  // Rotate around Y by -90 deg so +Z becomes +X:
  extrudeGeom.rotateY(-Math.PI / 2);

  // Offset according to Cardinal Point / Alignment:
  // Default is 'center' (y=0, z=0).
  // 'topCenter': Top-Of-Steel (TOS) is at y=0, so shift geometry DOWN by D/2.
  // 'bottomCenter': Bottom-Of-Steel (BOS) is at y=0, so shift geometry UP by D/2.
  let yOffset = 0;
  if (obj.alignment === 'topCenter') {
    yOffset = -D / 2;
  } else if (obj.alignment === 'bottomCenter') {
    yOffset = D / 2;
  }

  if (yOffset !== 0) {
    extrudeGeom.translate(0, yOffset, 0);
  }

  // Optional roll angle (around longitudinal X axis)
  if (obj.rollAngle && Math.abs(obj.rollAngle) > 0.01) {
    const rollRad = (obj.rollAngle * Math.PI) / 180;
    extrudeGeom.rotateX(rollRad);
  }

  // Calculate snap points at critical engineering locations
  // 1. Centerline start, mid, end
  // 2. Top-Of-Steel (TOS) start, mid, end
  // 3. Bottom-Of-Steel (BOS) start, mid, end
  // 4. Four corner nodes at both ends
  const snapPoints: [number, number, number][] = [
    // Centerline
    [0, yOffset, 0],
    [L / 2, yOffset, 0],
    [L, yOffset, 0],
    // Top of Steel
    [0, yOffset + D / 2, 0],
    [L / 2, yOffset + D / 2, 0],
    [L, yOffset + D / 2, 0],
    // Bottom of Steel
    [0, yOffset - D / 2, 0],
    [L / 2, yOffset - D / 2, 0],
    [L, yOffset - D / 2, 0],
    // Flange top corners (start)
    [0, yOffset + D / 2, -B / 2],
    [0, yOffset + D / 2, B / 2],
    // Flange bottom corners (start)
    [0, yOffset - D / 2, -B / 2],
    [0, yOffset - D / 2, B / 2],
    // Flange top corners (end)
    [L, yOffset + D / 2, -B / 2],
    [L, yOffset + D / 2, B / 2],
    // Flange bottom corners (end)
    [L, yOffset - D / 2, -B / 2],
    [L, yOffset - D / 2, B / 2],
  ];

  const massKg = (secDef.mass * obj.length) / 1000;

  return {
    geometry: extrudeGeom,
    snapPoints,
    secDef,
    massKg,
  };
}
