import { get, set, del, keys } from 'idb-keyval';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { useApp } from './store';
import type { Project } from './types';

/**
 * Local-first persistence.
 *  - Autosave: project JSON + scan blobs in IndexedDB (survives reloads, works offline).
 *  - Files: `.splatup` = zip { project.json, scans/<id>.glb } via File System Access API
 *    where available, falling back to a download.
 */

const DOC_KEY = 'splatup:doc';
const scanKey = (id: string) => `splatup:scan:${id}`;

export async function restoreAutosave(): Promise<boolean> {
  const doc = await get<Project>(DOC_KEY);
  if (!doc || doc.version !== 1) return false;
  const files: Record<string, Blob> = {};
  for (const s of doc.scans) {
    const b = await get<Blob>(scanKey(s.id));
    if (b) files[s.id] = b;
  }
  useApp.getState().loadProject(doc, files);
  return true;
}

let timer: ReturnType<typeof setTimeout> | undefined;
const savedBlobs = new Set<string>();

/** Subscribe to document changes and autosave (debounced). */
export function startAutosave() {
  return useApp.subscribe((s, prev) => {
    if (s.doc === prev.doc && s.scanFiles === prev.scanFiles) return;
    clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), 600);
  });
}

async function saveNow() {
  const { doc, scanFiles } = useApp.getState();
  await set(DOC_KEY, doc);
  for (const [id, blob] of Object.entries(scanFiles)) {
    if (savedBlobs.has(id)) continue;
    await set(scanKey(id), blob);
    savedBlobs.add(id);
  }
  // Garbage-collect blobs no longer referenced (and not in undo history).
  const { past, future } = useApp.getState();
  const live = new Set([doc, ...past, ...future].flatMap((d) => d.scans.map((s) => s.id)));
  for (const k of await keys()) {
    const ks = String(k);
    if (ks.startsWith('splatup:scan:') && !live.has(ks.slice('splatup:scan:'.length))) {
      await del(k);
      savedBlobs.delete(ks.slice('splatup:scan:'.length));
    }
  }
}

export async function clearAutosave() {
  for (const k of await keys()) if (String(k).startsWith('splatup:')) await del(k);
  savedBlobs.clear();
}

// ---------------------------------------------------------------- .splatup files

export async function exportProjectFile() {
  const { doc, scanFiles } = useApp.getState();
  const entries: Zippable = {
    'project.json': strToU8(JSON.stringify(doc, null, 2)),
  };
  for (const s of doc.scans) {
    const blob = scanFiles[s.id];
    if (blob) entries[`scans/${s.id}.glb`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  const zipped = zipSync(entries, { level: 6 });
  const blob = new Blob([zipped as BlobPart], { type: 'application/zip' });
  await saveBlob(blob, `${safeName(doc.name)}.splatup`, 'SplatUp project', { 'application/zip': ['.splatup'] });
}

export async function importProjectFile(file: Blob) {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const json = zip['project.json'];
  if (!json) throw new Error('Not a SplatUp project (project.json missing)');
  const doc = JSON.parse(strFromU8(json)) as Project;
  const files: Record<string, Blob> = {};
  for (const s of doc.scans) {
    const data = zip[`scans/${s.id}.glb`];
    if (data) files[s.id] = new Blob([data as BlobPart], { type: 'model/gltf-binary' });
  }
  savedBlobs.clear();
  useApp.getState().loadProject(doc, files);
}

export async function exportMeasurementsCsv() {
  const { doc } = useApp.getState();
  const rows = [['Name', 'Total (mm)', 'Horizontal (mm)', 'Vertical (mm)', 'dX', 'dY', 'dZ', 'Ax', 'Ay', 'Az', 'Bx', 'By', 'Bz']];
  for (const m of doc.measurements) {
    const [dx, dy, dz] = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]];
    rows.push([
      m.name,
      Math.hypot(dx, dy, dz),
      Math.hypot(dx, dy),
      Math.abs(dz),
      dx,
      dy,
      dz,
      ...m.a,
      ...m.b,
    ].map((v) => (typeof v === 'number' ? v.toFixed(1) : `"${v.replace(/"/g, '""')}"`)));
  }
  rows.push([]);
  rows.push(['Object', 'Type', 'L/Dia (mm)', 'W/Len (mm)', 'H (mm)', 'X', 'Y', 'Z', 'RotX', 'RotY', 'RotZ']);
  for (const o of doc.objects) {
    let dims: (number | string)[] = ['', '', ''];
    if (o.kind === 'box') dims = [o.length, o.width, o.height];
    else if (o.kind === 'cylinder') dims = [o.diameter, o.length, ''];
    else if (o.kind === 'polyShape') dims = [o.points.length + ' pts', '', o.thickness];
    else if (o.kind === 'handrail') dims = [o.stanchionSpacing, '', o.height];
    else if (o.kind === 'gate') dims = [o.width, '', o.height];
    else if (o.kind === 'ladder') dims = [o.width, '', o.height];
    else if (o.kind === 'stairs') dims = [o.width, o.numSteps * o.going, o.totalRise];
    else if (o.kind === 'beam') dims = [o.length, o.sectionName, o.alignment];

    rows.push([o.name, o.kind, ...dims, ...o.transform.position, ...o.transform.rotation].map((v) =>
      typeof v === 'number' ? v.toFixed(1) : `"${String(v).replace(/"/g, '""')}"`,
    ));
  }
  const csv = rows.map((r) => r.join(',')).join('\n');
  await saveBlob(new Blob([csv], { type: 'text/csv' }), `${safeName(doc.name)}-schedule.csv`, 'CSV', {
    'text/csv': ['.csv'],
  });
}

// ---------------------------------------------------------------- helpers

type SavePickerWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>;
};

async function saveBlob(blob: Blob, suggestedName: string, description: string, accept: Record<string, string[]>) {
  const w = window as SavePickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName, types: [{ description, accept }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: suggestedName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function safeName(s: string) {
  return s.replace(/[^\w\- ]+/g, '').trim() || 'splatup';
}
