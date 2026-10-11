/**
 * Pure TypeScript PDF-1.4 Generator for SplatUp Engineering Drawing Sheets.
 * Generates standards-compliant A4 Landscape engineering drawing sheets
 * with multi-view elevations, isometric projections, title blocks, and schedules.
 * Zero external dependencies.
 */

export interface ColorRgb {
  r: number; // 0 to 1
  g: number; // 0 to 1
  b: number; // 0 to 1
}

export const PDF_COLORS = {
  white: { r: 1, g: 1, b: 1 },
  black: { r: 0.1, g: 0.12, b: 0.15 },
  darkNavy: { r: 0.08, g: 0.12, b: 0.18 },
  borderGrey: { r: 0.75, g: 0.8, b: 0.85 },
  lightGrey: { r: 0.95, g: 0.96, b: 0.98 },
  headerBg: { r: 0.12, g: 0.16, b: 0.22 },
  cyanAccent: { r: 0.05, g: 0.55, b: 0.85 },
  amberAccent: { r: 0.92, g: 0.6, b: 0.08 },
  textDim: { r: 0.45, g: 0.5, b: 0.58 },
  textMain: { r: 0.1, g: 0.12, b: 0.15 },
};

export function hexToRgb(hex: string): ColorRgb {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16) / 255,
      g: parseInt(clean.slice(2, 4), 16) / 255,
      b: parseInt(clean.slice(4, 6), 16) / 255,
    };
  }
  return PDF_COLORS.textMain;
}

function sanitizeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/°/g, ' deg')
    .replace(/×/g, 'x')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[–—]/g, '-')
    .replace(/•/g, '*')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

interface ImageObj {
  id: number;
  refName: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

interface PageData {
  width: number;
  height: number;
  commands: string[];
  images: ImageObj[];
}

export class PdfWriter {
  // A4 Landscape dimensions in points (72 pt/inch = 25.4mm/72)
  readonly defaultWidth = 841.89; // 297mm
  readonly defaultHeight = 595.28; // 210mm

  private pages: PageData[] = [];
  private currentPage: PageData | null = null;
  private imageCounter = 0;

  constructor() {
    this.addPage();
  }

  addPage(width = this.defaultWidth, height = this.defaultHeight): this {
    const page: PageData = {
      width,
      height,
      commands: [],
      images: [],
    };
    this.pages.push(page);
    this.currentPage = page;
    return this;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /**
   * Embeds a JPEG image onto the current page.
   * x, y specify top-left coordinate in points (top-down).
   */
  addImage(
    jpegBytes: Uint8Array,
    widthPx: number,
    heightPx: number,
    x: number,
    yTop: number,
    widthPt: number,
    heightPt: number,
  ): this {
    if (!this.currentPage) this.addPage();
    const page = this.currentPage!;

    this.imageCounter++;
    const refName = `Im${this.imageCounter}`;

    const imgObj: ImageObj = {
      id: 0, // will be assigned during assembly
      refName,
      bytes: jpegBytes,
      width: widthPx,
      height: heightPx,
    };
    page.images.push(imgObj);

    // Convert top-down y coordinate to PDF bottom-up coordinate
    const yPdf = page.height - yTop - heightPt;

    // Transformation matrix: [w 0 0 h x y cm]
    page.commands.push(
      'q',
      `${widthPt.toFixed(2)} 0 0 ${heightPt.toFixed(2)} ${x.toFixed(2)} ${yPdf.toFixed(2)} cm`,
      `/${refName} Do`,
      'Q',
    );

    return this;
  }

  /**
   * Draws text on current page (x, yTop in top-down points).
   */
  drawText(
    text: string,
    x: number,
    yTop: number,
    options?: {
      font?: 'regular' | 'bold';
      size?: number;
      color?: ColorRgb;
      align?: 'left' | 'center' | 'right';
    },
  ): this {
    if (!this.currentPage) this.addPage();
    const page = this.currentPage!;
    const font = options?.font === 'bold' ? '/F2' : '/F1';
    const size = options?.size ?? 10;
    const color = options?.color ?? PDF_COLORS.textMain;
    const clean = sanitizeText(text);

    // Estimate text width for alignment (average character width ~0.55 of font size)
    let drawX = x;
    const approxWidth = clean.length * size * 0.52;
    if (options?.align === 'center') {
      drawX = x - approxWidth / 2;
    } else if (options?.align === 'right') {
      drawX = x - approxWidth;
    }

    const yPdf = page.height - yTop - size * 0.85;

    page.commands.push(
      'BT',
      `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg`,
      `${font} ${size.toFixed(1)} Tf`,
      `${drawX.toFixed(2)} ${yPdf.toFixed(2)} Td`,
      `(${clean}) Tj`,
      'ET',
    );

    return this;
  }

  /**
   * Draws a filled and/or stroked rectangle (top-down coordinates).
   */
  drawRect(
    x: number,
    yTop: number,
    w: number,
    h: number,
    options?: {
      fill?: ColorRgb;
      stroke?: ColorRgb;
      lineWidth?: number;
    },
  ): this {
    if (!this.currentPage) this.addPage();
    const page = this.currentPage!;
    const yPdf = page.height - yTop - h;

    page.commands.push('q');
    if (options?.lineWidth != null) {
      page.commands.push(`${options.lineWidth.toFixed(2)} w`);
    }
    if (options?.stroke) {
      page.commands.push(
        `${options.stroke.r.toFixed(3)} ${options.stroke.g.toFixed(3)} ${options.stroke.b.toFixed(3)} RG`,
      );
    }
    if (options?.fill) {
      page.commands.push(
        `${options.fill.r.toFixed(3)} ${options.fill.g.toFixed(3)} ${options.fill.b.toFixed(3)} rg`,
      );
    }

    page.commands.push(`${x.toFixed(2)} ${yPdf.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);

    if (options?.fill && options?.stroke) {
      page.commands.push('B');
    } else if (options?.fill) {
      page.commands.push('f');
    } else if (options?.stroke) {
      page.commands.push('S');
    }
    page.commands.push('Q');

    return this;
  }

  /**
   * Draws a line from (x1, y1) to (x2, y2) in top-down points.
   */
  drawLine(
    x1: number,
    y1Top: number,
    x2: number,
    y2Top: number,
    options?: {
      stroke?: ColorRgb;
      lineWidth?: number;
    },
  ): this {
    if (!this.currentPage) this.addPage();
    const page = this.currentPage!;
    const y1Pdf = page.height - y1Top;
    const y2Pdf = page.height - y2Top;

    page.commands.push('q');
    if (options?.lineWidth != null) {
      page.commands.push(`${options.lineWidth.toFixed(2)} w`);
    }
    const color = options?.stroke ?? PDF_COLORS.borderGrey;
    page.commands.push(
      `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} RG`,
      `${x1.toFixed(2)} ${y1Pdf.toFixed(2)} m ${x2.toFixed(2)} ${y2Pdf.toFixed(2)} l S`,
      'Q',
    );

    return this;
  }

  /**
   * Assembles all objects into a valid, standard PDF-1.4 binary byte array.
   */
  build(): Uint8Array {
    interface ObjEntry {
      id: number;
      content: string;
      streamBytes?: Uint8Array;
    }

    const objects: ObjEntry[] = [];
    function addObj(content: string, streamBytes?: Uint8Array): number {
      const id = objects.length + 1;
      objects.push({ id, content, streamBytes });
      return id;
    }

    const catalogId = 1;
    const pagesId = 2;
    const fontRegId = 3;
    const fontBoldId = 4;

    objects.push({ id: catalogId, content: `<</Type /Catalog /Pages ${pagesId} 0 R>>` });
    objects.push({ id: pagesId, content: '' }); // updated below
    objects.push({ id: fontRegId, content: '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>' });
    objects.push({ id: fontBoldId, content: '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>>' });

    const pageObjIds: number[] = [];

    for (const page of this.pages) {
      // Create image XObjects
      const xObjMap: Record<string, number> = {};
      for (const img of page.images) {
        const imgId = addObj(
          `<</Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length}>>`,
          img.bytes,
        );
        img.id = imgId;
        xObjMap[img.refName] = imgId;
      }

      let xObjDict = '';
      if (Object.keys(xObjMap).length > 0) {
        xObjDict = '/XObject << ' + Object.entries(xObjMap).map(([k, v]) => `/${k} ${v} 0 R`).join(' ') + ' >>';
      }

      // Page commands stream
      const streamStr = page.commands.join('\n');
      const streamBytes = new TextEncoder().encode(streamStr);
      const contentId = addObj(`<</Length ${streamBytes.length}>>`, streamBytes);

      // Page object
      const pageId = addObj(
        `<</Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] /Resources << /Font << /F1 ${fontRegId} 0 R /F2 ${fontBoldId} 0 R >> ${xObjDict} >> /Contents ${contentId} 0 R>>`,
      );
      pageObjIds.push(pageId);
    }

    // Set Kids on Pages object
    objects[pagesId - 1].content = `<</Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length}>>`;

    // Serialize all objects to binary buffer with byte offsets
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let currentOffset = 0;

    function pushStr(str: string) {
      const b = new TextEncoder().encode(str);
      chunks.push(b);
      currentOffset += b.length;
    }

    function pushBytes(b: Uint8Array) {
      chunks.push(b);
      currentOffset += b.length;
    }

    pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    for (const obj of objects) {
      offsets.push(currentOffset);
      pushStr(`${obj.id} 0 obj\n${obj.content}\n`);
      if (obj.streamBytes) {
        pushStr('stream\n');
        pushBytes(obj.streamBytes);
        pushStr('\nendstream\n');
      }
      pushStr('endobj\n');
    }

    const xrefOffset = currentOffset;
    pushStr(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
    for (const offset of offsets) {
      const pad = String(offset).padStart(10, '0');
      pushStr(`${pad} 00000 n \n`);
    }

    pushStr(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    // Concatenate all chunks
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const c of chunks) {
      result.set(c, pos);
      pos += c.length;
    }

    return result;
  }
}

// -----------------------------------------------------------------------------
// High-Level Engineering Drawing Package Generator
// -----------------------------------------------------------------------------

import type {
  Project,
  BoxObject,
  CylinderObject,
  PolyShapeObject,
  HandrailObject,
  LadderObject,
  SwingGateObject,
  StairsObject,
  SteelBeamObject,
} from './types';
import type { CapturedView } from '../viewport/registry';
import { STEEL_CATALOGUE, DEFAULT_SECTION } from '../viewport/geometry/steelSections';
import { computePolyMetrics } from '../viewport/geometry/polyPrism';

function drawSheetBorderAndTitleBlock(
  pdf: PdfWriter,
  sheetNum: number,
  totalSheets: number,
  sheetTitle: string,
  doc: Project,
) {
  const pageW = 841.89;
  const pageH = 595.28;
  const margin = 20;

  // Outer drawing sheet border
  pdf.drawRect(margin, margin, pageW - margin * 2, pageH - margin * 2, {
    stroke: PDF_COLORS.darkNavy,
    lineWidth: 1.5,
  });

  // Top header bar
  const headerH = 26;
  pdf.drawRect(margin, margin, pageW - margin * 2, headerH, {
    fill: PDF_COLORS.headerBg,
    stroke: PDF_COLORS.darkNavy,
    lineWidth: 1,
  });

  // SplatUp branding & project title
  pdf.drawText('SPLATUP', margin + 12, margin + 7, {
    font: 'bold',
    size: 13,
    color: PDF_COLORS.amberAccent,
  });
  pdf.drawText('|  3D SCAN RETROFIT & MODELLING', margin + 78, margin + 8, {
    font: 'regular',
    size: 9,
    color: PDF_COLORS.borderGrey,
  });

  const frontAngle = (doc.frontViewAngle ?? doc.sceneAlignment ?? 0).toFixed(1);
  const alignAngle = (doc.sceneAlignment ?? 0).toFixed(1);
  pdf.drawText(
    `SITE ALIGN: ${alignAngle} deg  |  FRONT REF: ${frontAngle} deg  |  Z-UP`,
    pageW - margin - 12,
    margin + 8,
    {
      font: 'bold',
      size: 9,
      color: PDF_COLORS.cyanAccent,
      align: 'right',
    },
  );

  // Bottom Title Block (Australian Standard AS 1100 Style)
  const tbW = 280;
  const tbH = 65;
  const tbX = pageW - margin - tbW;
  const tbY = pageH - margin - tbH;

  pdf.drawRect(tbX, tbY, tbW, tbH, {
    fill: PDF_COLORS.white,
    stroke: PDF_COLORS.darkNavy,
    lineWidth: 1.2,
  });

  // Title block dividers
  pdf.drawLine(tbX, tbY + 22, tbX + tbW, tbY + 22, { stroke: PDF_COLORS.borderGrey, lineWidth: 0.8 });
  pdf.drawLine(tbX, tbY + 44, tbX + tbW, tbY + 44, { stroke: PDF_COLORS.borderGrey, lineWidth: 0.8 });
  pdf.drawLine(tbX + 160, tbY + 22, tbX + 160, tbY + tbH, { stroke: PDF_COLORS.borderGrey, lineWidth: 0.8 });

  // Project Title
  pdf.drawText('PROJECT:', tbX + 8, tbY + 6, { font: 'bold', size: 7, color: PDF_COLORS.textDim });
  pdf.drawText(doc.name || 'Untitled Project', tbX + 54, tbY + 5, {
    font: 'bold',
    size: 10,
    color: PDF_COLORS.darkNavy,
  });

  // Sheet Title
  pdf.drawText('DRAWING:', tbX + 8, tbY + 28, { font: 'bold', size: 7, color: PDF_COLORS.textDim });
  pdf.drawText(sheetTitle, tbX + 54, tbY + 27, {
    font: 'bold',
    size: 8,
    color: PDF_COLORS.darkNavy,
  });

  // Scale & Units
  pdf.drawText('UNITS / SCALE:', tbX + 166, tbY + 28, { font: 'bold', size: 7, color: PDF_COLORS.textDim });
  pdf.drawText('MILLIMETRES (mm) / N.T.S.', tbX + 166, tbY + 36, {
    font: 'regular',
    size: 7,
    color: PDF_COLORS.textMain,
  });

  // Date & Sheet Number
  const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  pdf.drawText(`DATE: ${dateStr}`, tbX + 8, tbY + 50, { font: 'regular', size: 7.5, color: PDF_COLORS.textDim });

  pdf.drawText(`SHEET ${sheetNum} OF ${totalSheets}`, tbX + tbW - 10, tbY + 50, {
    font: 'bold',
    size: 9,
    color: PDF_COLORS.cyanAccent,
    align: 'right',
  });
}

function drawViewportContainer(
  pdf: PdfWriter,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  subTitle?: string,
) {
  // Container border
  pdf.drawRect(x, y, w, h, {
    fill: PDF_COLORS.white,
    stroke: PDF_COLORS.borderGrey,
    lineWidth: 0.8,
  });

  // Viewport label header
  const headerH = 18;
  pdf.drawRect(x, y, w, headerH, {
    fill: PDF_COLORS.lightGrey,
    stroke: PDF_COLORS.borderGrey,
    lineWidth: 0.6,
  });

  pdf.drawText(title, x + 8, y + 4, {
    font: 'bold',
    size: 8.5,
    color: PDF_COLORS.darkNavy,
  });

  if (subTitle) {
    pdf.drawText(subTitle, x + w - 8, y + 5, {
      font: 'regular',
      size: 7,
      color: PDF_COLORS.textDim,
      align: 'right',
    });
  }
}

/**
 * Generates full multi-page engineering drawing package (PDF)
 * containing standard elevations (Front, Top, Left, Right, ISO) and member schedule.
 */
export async function generateElevationsPdf(
  capturedViews: CapturedView[],
  doc: Project,
): Promise<Blob> {
  const pdf = new PdfWriter();
  const totalSheets = 5;

  const viewMap = new Map<string, CapturedView>();
  for (const v of capturedViews) {
    viewMap.set(v.id, v);
  }

  const topView = viewMap.get('top');
  const frontView = viewMap.get('front');
  const leftView = viewMap.get('left');
  const rightView = viewMap.get('right');
  const backView = viewMap.get('back');
  const isoView = viewMap.get('isoLeft') || viewMap.get('isoRight');

  // ===========================================================================
  // SHEET 1: GENERAL ARRANGEMENT (MULTI-VIEW SHEET)
  // ===========================================================================
  drawSheetBorderAndTitleBlock(pdf, 1, totalSheets, 'GENERAL ARRANGEMENT & ELEVATIONS', doc);

  // 1. Top View (Plan View) - Top Left
  if (topView) {
    const vx = 30;
    const vy = 54;
    const vw = 245;
    const vh = 205;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'PLAN VIEW (LOOKING DOWN)', 'Front at Bottom');
    pdf.addImage(topView.jpegBytes, topView.width, topView.height, vx + 2, vy + 20, vw - 4, vh - 22);
  }

  // 2. Isometric 3D View - Top Middle
  if (isoView) {
    const vx = 285;
    const vy = 54;
    const vw = 250;
    const vh = 205;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'ISOMETRIC 3D VIEW (45 deg)', 'South-West Projection');
    pdf.addImage(isoView.jpegBytes, isoView.width, isoView.height, vx + 2, vy + 20, vw - 4, vh - 22);
  }

  // 3. Project Notes & Summary - Top Right
  const nx = 545;
  const ny = 54;
  const nw = 265;
  const nh = 205;
  pdf.drawRect(nx, ny, nw, nh, {
    fill: PDF_COLORS.lightGrey,
    stroke: PDF_COLORS.borderGrey,
    lineWidth: 0.8,
  });
  pdf.drawText('GENERAL NOTES & SPECIFICATIONS', nx + 10, ny + 8, {
    font: 'bold',
    size: 9,
    color: PDF_COLORS.darkNavy,
  });

  const notes = [
    '1. All dimensions are in millimetres (mm) unless noted.',
    '2. Standard engineering elevations generated from 3D model.',
    '3. Top view oriented with Front camera at bottom of page.',
    '4. Point cloud scan data excluded for engineering clarity.',
    '5. Handrails conform to Monowills specification / AS 1657.',
    '6. Stairs designed with PFC stringers per AS 1657 standard.',
    '7. Structural steel profiles detailed per AS/NZS 3679.1.',
  ];
  let noteY = ny + 26;
  for (const n of notes) {
    pdf.drawText(n, nx + 10, noteY, { font: 'regular', size: 7.5, color: PDF_COLORS.textMain });
    noteY += 13;
  }

  // Mini summary card
  pdf.drawRect(nx + 10, ny + 125, nw - 20, 68, {
    fill: PDF_COLORS.white,
    stroke: PDF_COLORS.borderGrey,
    lineWidth: 0.6,
  });
  pdf.drawText('ASSEMBLY SUMMARY', nx + 18, ny + 132, { font: 'bold', size: 8, color: PDF_COLORS.cyanAccent });

  let totalSteelWeight = 0;
  for (const o of doc.objects) {
    if (o.kind === 'beam') {
      const bo = o as SteelBeamObject;
      const sec = STEEL_CATALOGUE[bo.sectionName] ?? STEEL_CATALOGUE[DEFAULT_SECTION];
      totalSteelWeight += (sec.mass * bo.length) / 1000;
    }
  }

  pdf.drawText(`Modelled Primitives: ${doc.objects.length} components`, nx + 18, ny + 146, { font: 'regular', size: 8 });
  pdf.drawText(`Total Steel Weight: ${totalSteelWeight.toFixed(1)} kg`, nx + 18, ny + 158, { font: 'regular', size: 8 });
  pdf.drawText(`Site Alignment: ${(doc.sceneAlignment ?? 0).toFixed(1)} deg`, nx + 18, ny + 170, { font: 'regular', size: 8 });
  pdf.drawText(`Front Elevation Reference: ${(doc.frontViewAngle ?? doc.sceneAlignment ?? 0).toFixed(1)} deg`, nx + 18, ny + 182, { font: 'regular', size: 8 });

  // 4. Front Elevation - Bottom Left
  if (frontView) {
    const vx = 30;
    const vy = 270;
    const vw = 245;
    const vh = 225;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'FRONT ELEVATION', 'Level Horizon (Pitch 0 deg)');
    pdf.addImage(frontView.jpegBytes, frontView.width, frontView.height, vx + 2, vy + 20, vw - 4, vh - 22);
  }

  // 5. Left Elevation - Bottom Middle
  if (leftView) {
    const vx = 285;
    const vy = 270;
    const vw = 250;
    const vh = 225;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'LEFT ELEVATION', '90 deg to Left of Front');
    pdf.addImage(leftView.jpegBytes, leftView.width, leftView.height, vx + 2, vy + 20, vw - 4, vh - 22);
  }

  // 6. Right Elevation - Bottom Right
  if (rightView) {
    const vx = 545;
    const vy = 270;
    const vw = 265;
    const vh = 225;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'RIGHT ELEVATION', '90 deg to Right of Front');
    pdf.addImage(rightView.jpegBytes, rightView.width, rightView.height, vx + 2, vy + 20, vw - 4, vh - 22);
  }

  // ===========================================================================
  // SHEET 2: DETAILED PLAN VIEW (TOP VIEW - LOOKING DOWN)
  // ===========================================================================
  pdf.addPage();
  drawSheetBorderAndTitleBlock(pdf, 2, totalSheets, 'PLAN VIEW (TOP VIEW - LOOKING DOWN)', doc);

  if (topView) {
    const vx = 30;
    const vy = 54;
    const vw = 780;
    const vh = 440;
    drawViewportContainer(
      pdf,
      vx,
      vy,
      vw,
      vh,
      'PLAN VIEW (LOOKING DOWN)',
      'Front camera orientation located at bottom of sheet',
    );
    pdf.addImage(topView.jpegBytes, topView.width, topView.height, vx + 4, vy + 22, vw - 8, vh - 26);

    // Orientation compass indicator in bottom left of view
    const cx = vx + 16;
    const cy = vy + vh - 60;
    pdf.drawRect(cx, cy, 140, 50, { fill: PDF_COLORS.white, stroke: PDF_COLORS.borderGrey, lineWidth: 0.6 });
    pdf.drawText('ORIENTATION (TOP VIEW):', cx + 8, cy + 6, { font: 'bold', size: 7, color: PDF_COLORS.textDim });
    pdf.drawText('TOP OF SHEET: BACK', cx + 8, cy + 18, { font: 'regular', size: 7 });
    pdf.drawText('BOTTOM OF SHEET: FRONT', cx + 8, cy + 28, { font: 'bold', size: 7, color: PDF_COLORS.cyanAccent });
    pdf.drawText('LEFT: LEFT  |  RIGHT: RIGHT', cx + 8, cy + 38, { font: 'regular', size: 7 });
  }

  // ===========================================================================
  // SHEET 3: FRONT & REAR ELEVATIONS
  // ===========================================================================
  pdf.addPage();
  drawSheetBorderAndTitleBlock(pdf, 3, totalSheets, 'FRONT & REAR ELEVATIONS', doc);

  if (frontView) {
    const vx = 30;
    const vy = 54;
    const vw = 780;
    const vh = 215;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'FRONT ELEVATION', 'Primary Viewing Elevation · Respects UP');
    pdf.addImage(frontView.jpegBytes, frontView.width, frontView.height, vx + 4, vy + 22, vw - 8, vh - 26);
  }

  if (backView) {
    const vx = 30;
    const vy = 280;
    const vw = 780;
    const vh = 215;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'REAR ELEVATION (180 deg)', 'Opposite Front Elevation · Respects UP');
    pdf.addImage(backView.jpegBytes, backView.width, backView.height, vx + 4, vy + 22, vw - 8, vh - 26);
  }

  // ===========================================================================
  // SHEET 4: SIDE ELEVATIONS (LEFT & RIGHT)
  // ===========================================================================
  pdf.addPage();
  drawSheetBorderAndTitleBlock(pdf, 4, totalSheets, 'SIDE ELEVATIONS (LEFT & RIGHT)', doc);

  if (leftView) {
    const vx = 30;
    const vy = 54;
    const vw = 385;
    const vh = 440;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'LEFT ELEVATION', '90 deg to Left of Front Elevation');
    pdf.addImage(leftView.jpegBytes, leftView.width, leftView.height, vx + 4, vy + 22, vw - 8, vh - 26);
  }

  if (rightView) {
    const vx = 425;
    const vy = 54;
    const vw = 385;
    const vh = 440;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'RIGHT ELEVATION', '90 deg to Right of Front Elevation');
    pdf.addImage(rightView.jpegBytes, rightView.width, rightView.height, vx + 4, vy + 22, vw - 8, vh - 26);
  }

  // ===========================================================================
  // SHEET 5: ISOMETRIC 3D VIEW & BILL OF MATERIALS (BOM)
  // ===========================================================================
  pdf.addPage();
  drawSheetBorderAndTitleBlock(pdf, 5, totalSheets, 'ISOMETRIC VIEW & MEMBER SCHEDULE', doc);

  // Isometric Hero View (Top Half)
  if (isoView) {
    const vx = 30;
    const vy = 54;
    const vw = 780;
    const vh = 200;
    drawViewportContainer(pdf, vx, vy, vw, vh, 'ISOMETRIC 3D VIEW (45 deg PITCH)', 'South-West Isometric Overview');
    pdf.addImage(isoView.jpegBytes, isoView.width, isoView.height, vx + 4, vy + 22, vw - 8, vh - 26);
  }

  // Bill of Materials Schedule Table (Bottom Half)
  const tx = 30;
  const ty = 264;
  const tw = 780;
  const th = 230;

  pdf.drawRect(tx, ty, tw, th, {
    fill: PDF_COLORS.white,
    stroke: PDF_COLORS.borderGrey,
    lineWidth: 0.8,
  });

  // Table Title Bar
  pdf.drawRect(tx, ty, tw, 20, {
    fill: PDF_COLORS.headerBg,
    stroke: PDF_COLORS.darkNavy,
    lineWidth: 0.8,
  });
  pdf.drawText('STRUCTURAL MEMBER & PRIMITIVE SCHEDULE (BILL OF MATERIALS)', tx + 10, ty + 5, {
    font: 'bold',
    size: 8.5,
    color: PDF_COLORS.white,
  });

  // Table Column Headers
  const colY = ty + 20;
  const colH = 16;
  pdf.drawRect(tx, colY, tw, colH, {
    fill: PDF_COLORS.lightGrey,
    stroke: PDF_COLORS.borderGrey,
    lineWidth: 0.6,
  });

  const cols = [
    { label: 'ITEM', x: tx + 8, w: 32 },
    { label: 'OBJECT NAME', x: tx + 40, w: 160 },
    { label: 'TYPE', x: tx + 200, w: 85 },
    { label: 'PRIMARY DIMS (mm)', x: tx + 285, w: 170 },
    { label: 'SPECIFICATION / PROFILE', x: tx + 455, w: 185 },
    { label: 'MASS (kg)', x: tx + 640, w: 70 },
    { label: 'STATUS', x: tx + 710, w: 60 },
  ];

  for (const c of cols) {
    pdf.drawText(c.label, c.x, colY + 4, { font: 'bold', size: 7, color: PDF_COLORS.textDim });
  }

  // Table Rows
  let rowY = colY + colH;
  const maxRows = 10;
  const items = doc.objects.slice(0, maxRows);

  let totalMass = 0;
  let itemIndex = 1;

  for (const o of items) {
    const isEven = itemIndex % 2 === 0;
    if (isEven) {
      pdf.drawRect(tx, rowY, tw, 15, { fill: PDF_COLORS.lightGrey });
    }
    pdf.drawLine(tx, rowY + 15, tx + tw, rowY + 15, { stroke: PDF_COLORS.borderGrey, lineWidth: 0.4 });

    let typeStr = o.kind.toUpperCase();
    let dimsStr = '-';
    let specStr = '-';
    let massStr = '-';

    if (o.kind === 'beam') {
      const bo = o as SteelBeamObject;
      const sec = STEEL_CATALOGUE[bo.sectionName] ?? STEEL_CATALOGUE[DEFAULT_SECTION];
      const m = (sec.mass * bo.length) / 1000;
      totalMass += m;
      typeStr = `BEAM (${sec.category})`;
      dimsStr = `L = ${bo.length} mm (${sec.depth} x ${sec.flangeWidth})`;
      specStr = `${sec.label} (${sec.mass} kg/m)`;
      massStr = `${m.toFixed(1)} kg`;
    } else if (o.kind === 'stairs') {
      const so = o as StairsObject;
      typeStr = 'STAIRS (AS 1657)';
      dimsStr = `Rise: ${so.totalRise} mm | W: ${so.width} mm`;
      specStr = `${so.stringerSection} Stringers · ${so.numSteps} Risers`;
    } else if (o.kind === 'handrail') {
      const ho = o as HandrailObject;
      typeStr = 'HANDRAIL (AS 1657)';
      dimsStr = `H = ${ho.height} mm · OD ${ho.pipeDiameter} mm`;
      specStr = `${ho.hasKickplate ? '100mm Kickplate' : ''} ${ho.hasMidrail ? 'Midrail' : ''}`;
    } else if (o.kind === 'box') {
      const bo = o as BoxObject;
      typeStr = 'BOX / DUCT';
      dimsStr = `${bo.length} x ${bo.width} x ${bo.height} mm`;
      specStr = 'Fabricated Sheet / Block';
    } else if (o.kind === 'cylinder') {
      const co = o as CylinderObject;
      typeStr = 'PIPE / CYLINDER';
      dimsStr = `Dia ${co.diameter} mm x L ${co.length} mm`;
      specStr = 'Circular Section';
    } else if (o.kind === 'polyShape') {
      const po = o as PolyShapeObject;
      const m = computePolyMetrics(po.points, po.thickness);
      typeStr = 'SLAB / PLATFORM';
      dimsStr = `Area: ${m.areaM2.toFixed(2)} m2 · T = ${po.thickness} mm`;
      specStr = `${po.points.length} Point Perimeter`;
    } else if (o.kind === 'ladder') {
      const lo = o as LadderObject;
      typeStr = 'LADDER (AS 1657)';
      dimsStr = `H = ${lo.height} mm · W = ${lo.width} mm`;
      specStr = lo.hasCage ? 'With Safety Cage' : 'Standard Rungs';
    } else if (o.kind === 'gate') {
      const go = o as SwingGateObject;
      typeStr = 'SWING GATE (AS 1657)';
      dimsStr = `W = ${go.width} mm · H = ${go.height} mm`;
      specStr = `Self-Closing Gate · ${go.hasKickplate ? 'With Kickplate' : 'Open'}`;
    }

    pdf.drawText(String(itemIndex), cols[0].x, rowY + 3.5, { font: 'regular', size: 7 });
    pdf.drawText(o.name, cols[1].x, rowY + 3.5, { font: 'bold', size: 7 });
    pdf.drawText(typeStr, cols[2].x, rowY + 3.5, { font: 'regular', size: 6.8 });
    pdf.drawText(dimsStr, cols[3].x, rowY + 3.5, { font: 'regular', size: 6.8 });
    pdf.drawText(specStr, cols[4].x, rowY + 3.5, { font: 'regular', size: 6.8 });
    pdf.drawText(massStr, cols[5].x, rowY + 3.5, { font: 'bold', size: 7 });
    pdf.drawText('PROPOSED', cols[6].x, rowY + 3.5, { font: 'regular', size: 6.5, color: PDF_COLORS.cyanAccent });

    rowY += 15;
    itemIndex++;
  }

  // Summary Row at bottom of table
  pdf.drawRect(tx, ty + th - 20, tw, 20, {
    fill: PDF_COLORS.lightGrey,
    stroke: PDF_COLORS.borderGrey,
    lineWidth: 0.6,
  });
  pdf.drawText(
    `TOTAL ITEMS: ${doc.objects.length} members modelled`,
    tx + 12,
    ty + th - 14,
    { font: 'bold', size: 8, color: PDF_COLORS.darkNavy },
  );
  if (totalMass > 0) {
    pdf.drawText(
      `TOTAL STEEL MASS: ${totalMass.toFixed(1)} kg`,
      tx + tw - 20,
      ty + th - 14,
      { font: 'bold', size: 8, color: PDF_COLORS.amberAccent, align: 'right' },
    );
  }

  const pdfBytes = pdf.build();
  return new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
}

