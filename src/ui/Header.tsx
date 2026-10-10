import { useRef, useState } from 'react';
import { useApp } from '../core/store';
import { Icon } from './Icon';
import {
  exportMeasurementsCsv,
  exportProjectFile,
  importProjectFile,
  clearAutosave,
} from '../core/persist';

export function Header() {
  const doc = useApp((s) => s.doc);
  const commit = useApp((s) => s.commit);
  const addScan = useApp((s) => s.addScan);
  const setStatus = useApp((s) => s.setStatus);
  const resetProject = useApp((s) => s.resetProject);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const handleScanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addScan(file, file.name);
    e.target.value = '';
  };

  const handleProjectOpen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatus(`Opening ${file.name}…`);
      await importProjectFile(file);
      setStatus(`Opened ${file.name}`);
    } catch (err) {
      console.error(err);
      setStatus(`Failed to open project: ${(err as Error).message}`);
    }
    e.target.value = '';
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setStatus('Fetching sample scan 851.glb…');
    try {
      const res = await fetch('/samples/851.glb');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const blob = await res.blob();
      addScan(blob, '851.glb');
      setStatus('Sample scan 851.glb loaded successfully');
    } catch (err) {
      console.error(err);
      setStatus(`Could not load sample scan: ${(err as Error).message}`);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleNewProject = async () => {
    if (doc.objects.length > 0 || doc.scans.length > 0) {
      if (!window.confirm('Start a new project? Any unsaved edits will be cleared.')) return;
    }
    await clearAutosave();
    resetProject();
    setStatus('New project created');
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="app-logo">
          <span className="logo-box" />
          <span className="logo-text">SplatUp</span>
        </div>
        <div className="project-title-container">
          <input
            type="text"
            className="project-title-input"
            value={doc.name}
            onChange={(e) => {
              const name = e.target.value;
              commit((d) => {
                d.name = name;
              });
            }}
            title="Rename project"
          />
        </div>
      </div>

      <div className="header-actions">
        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb"
          style={{ display: 'none' }}
          onChange={handleScanUpload}
        />
        <input
          ref={projectInputRef}
          type="file"
          accept=".splatup,.zip"
          style={{ display: 'none' }}
          onChange={handleProjectOpen}
        />

        <button
          type="button"
          className="header-btn secondary"
          onClick={handleLoadSample}
          disabled={loadingSample}
          title="Load included 851.glb sample scan"
        >
          <Icon name="scan" size={16} />
          <span>{loadingSample ? 'Loading…' : 'Sample 851'}</span>
        </button>

        <button
          type="button"
          className="header-btn primary"
          onClick={() => fileInputRef.current?.click()}
          title="Import GLB 3D scan exported from Scaniverse"
        >
          <Icon name="import" size={16} />
          <span>Import Scan</span>
        </button>

        <div className="header-divider" />

        <button
          type="button"
          className="header-btn"
          onClick={() => projectInputRef.current?.click()}
          title="Open .splatup project file"
        >
          <Icon name="open" size={16} />
          <span>Open</span>
        </button>

        <button
          type="button"
          className="header-btn"
          onClick={() => exportProjectFile()}
          title="Save project (.splatup package with scans and models)"
        >
          <Icon name="save" size={16} />
          <span>Save</span>
        </button>

        <button
          type="button"
          className="header-btn"
          onClick={() => exportMeasurementsCsv()}
          title="Export CSV BOM and measurement schedule"
        >
          <Icon name="csv" size={16} />
          <span>Export CSV</span>
        </button>

        <button
          type="button"
          className="header-btn icon-only"
          onClick={handleNewProject}
          title="New Project"
        >
          <Icon name="file" size={16} />
        </button>
      </div>
    </header>
  );
}
