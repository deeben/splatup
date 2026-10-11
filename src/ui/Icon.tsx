/** Minimal inline SVG icon set (stroke icons, 18px). */
const paths: Record<string, string> = {
  select: 'M5 3l12 9-5 1 3 6-2 1-3-6-4 4z',
  measure: 'M3 17L17 3M6 14l2 2M9 11l2 2M12 8l2 2M3 17l2 2 14-14-2-2',
  box: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  cylinder: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  rotate: 'M20 12a8 8 0 11-3-6.2M20 4v5h-5',
  frame: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  import: 'M12 3v12M7 10l5 5 5-5M4 17v3h16v-3',
  open: 'M3 6h6l2 2h10v11H3z',
  save: 'M5 3h11l3 3v15H5zM8 3v5h8V3M8 21v-7h8v7',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  csv: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 004.4-1.1',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  magnet: 'M6 3v8a6 6 0 0012 0V3h-4v8a2 2 0 01-4 0V3zM6 7h4M14 7h4',
  scan: 'M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M7 12h10',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  polyShape: 'M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2zM12 2v18M20 6.5L12 11 4 6.5',
  handrail: 'M3 7h18M3 13h18M3 19h18M5 7v12M12 7v12M19 7v12',
  gate: 'M3 5v14M7 6h10v12H7zM7 11h10M17 11v2M21 5v14',
  ladder: 'M7 2v20M17 2v20M7 6h10M7 10h10M7 14h10M7 18h10',
  align: 'M12 2l4 8-4-2-4 2 4-8zM12 22l-4-8 4 2 4-2-4 8z',
  stairs: 'M3 20h4v-4h4v-4h4v-4h5',
  beam: 'M5 5h14M12 5v14M5 19h14M7 5v2M17 5v2M7 17v2M17 17v2',
  check: 'M20 6L9 17l-5-5',
  warning: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  target: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6a6 6 0 100 12 6 6 0 000-12zM12 2v4M12 18v4M2 12h4M18 12h4',
  compass: 'M12 22a10 10 0 100-20 10 10 0 000 20zM16.2 7.8l-2.8 7-7 2.8 2.8-7 7-2.8z',
  camera: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z',
  chevronDown: 'M6 9l6 6 6-6',
};

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name] ?? ''} />
    </svg>
  );
}
