import type { Vec3 } from './types';

const nf = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 });

/** Format a length in millimetres, e.g. "2,450 mm". */
export function fmtMm(v: number): string {
  return `${nf.format(v)} mm`;
}

export function fmtNum(v: number): string {
  return nf1.format(v);
}

export function fmtBytes(b: number): string {
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b > 1e3) return `${(b / 1e3).toFixed(0)} kB`;
  return `${b} B`;
}

export function dist(a: Vec3, b: Vec3) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

export function measureParts(a: Vec3, b: Vec3) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return {
    total: Math.hypot(dx, dy, dz),
    horizontal: Math.hypot(dx, dy),
    vertical: Math.abs(dz),
    dx,
    dy,
    dz,
  };
}

/**
 * Evaluate a simple arithmetic expression typed into a dimension field,
 * e.g. "1200+2*75". Returns null if invalid.
 */
export function evalExpr(input: string): number | null {
  const s = input.replace(/,/g, '').replace(/mm/gi, '').trim();
  if (!s) return null;
  if (!/^[\d+\-*/().\s]+$/.test(s)) return null;
  try {
    // Restricted to digits/operators by the regex above.
    const v = Function(`"use strict"; return (${s});`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function uid(prefix = ''): string {
  return prefix + crypto.randomUUID().slice(0, 8);
}
