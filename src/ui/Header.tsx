import { useEffect, useRef, useState } from 'react';
import { useApp } from '../core/store';
import { Icon } from './Icon';
import {
  exportMeasurementsCsv,
  exportProjectFile,
  importProjectFile,
  clearAutosave,
  exportElevationsPdf,
  exportDesignGlb,
  exportViewImagesZip,
} from '../core/persist';

export function Header() {
  const doc = useApp((s) => s.doc);
  const commit = useApp((s) => s.commit);
  const addScan = useApp((s) => s.addScan);
  const setStatus = useApp((s) => s.setStatus);
  const resetProject = useApp((s) => s.resetProject);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [exportMenuOpen]);

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

  const handleNewProject = async () => {
    if (doc.objects.length > 0 || doc.scans.length > 0) {
      if (!window.confirm('Start a new project? Any unsaved edits will be cleared.')) return;
    }
    await clearAutosave();
    resetProject();
    setStatus('New project created');
  };

  const handleExportPdf = async () => {
    setExportMenuOpen(false);
    await exportElevationsPdf();
  };

  const handleExportGlb = async () => {
    setExportMenuOpen(false);
    await exportDesignGlb();
  };

  const handleExportCsv = async () => {
    setExportMenuOpen(false);
    await exportMeasurementsCsv();
  };

  const handleExportImages = async () => {
    setExportMenuOpen(false);
    await exportViewImagesZip();
  };

  const handleExportProject = async () => {
    setExportMenuOpen(false);
    await exportProjectFile();
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="app-logo">
          <img src="/splatup-icon.png" alt="SplatUp Icon" className="app-logo-icon" />
          <img src="/splatup-text.png" alt="SplatUp" className="app-logo-text" />
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
          accept=".glb,.gltf,.ply,.las,.laz"
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
          className="header-btn primary"
          onClick={() => fileInputRef.current?.click()}
          title="Import 3D scan (GLB mesh, PLY point cloud/mesh, or LAS LiDAR)"
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

        {/* Unified Export Menu */}
        <div className="export-menu-container" ref={exportMenuRef}>
          <button
            type="button"
            className={`header-btn ${exportMenuOpen ? 'active' : ''}`}
            onClick={() => setExportMenuOpen(!exportMenuOpen)}
            title="Export drawings, models, schedules, and project package"
          >
            <Icon name="export" size={16} />
            <span>Export</span>
            <Icon name="chevronDown" size={12} />
          </button>

          {exportMenuOpen && (
            <div className="export-menu-popover">
              <div className="export-menu-header">
                <span className="export-menu-title">EXPORT DRAWINGS & DATA</span>
                <span className="export-menu-tag">{doc.objects.length} PRIMITIVES</span>
              </div>

              <div className="export-menu-section">
                <button
                  type="button"
                  className="export-menu-item highlight"
                  onClick={handleExportPdf}
                  title="Generate multi-sheet A4 PDF drawing package with Front, Top, Left, Right & ISO elevations"
                >
                  <div className="export-item-icon pdf">
                    <Icon name="pdf" size={18} />
                  </div>
                  <div className="export-menu-text">
                    <div className="export-item-header">
                      <span className="item-title">PDF Drawing Package</span>
                      <span className="export-badge">AS 1100</span>
                    </div>
                    <span className="item-desc">
                      5-sheet elevations (Front, Top, Left, Right & ISO) + BOM schedule (scans excluded)
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="export-menu-item"
                  onClick={handleExportGlb}
                  title="Export retrofitted CAD primitives as standard GLTF/GLB (scan excluded)"
                >
                  <div className="export-item-icon glb">
                    <Icon name="cube" size={18} />
                  </div>
                  <div className="export-menu-text">
                    <div className="export-item-header">
                      <span className="item-title">3D GLB Model (Primitives Only)</span>
                      <span className="export-badge">.glb</span>
                    </div>
                    <span className="item-desc">
                      Clean 3D mesh of steel beams, stairs, handrails & ductwork for Revit/Navisworks
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="export-menu-item"
                  onClick={handleExportCsv}
                  title="Export itemized bill of materials and measurement schedule"
                >
                  <div className="export-item-icon csv">
                    <Icon name="csv" size={18} />
                  </div>
                  <div className="export-menu-text">
                    <div className="export-item-header">
                      <span className="item-title">CSV Bill of Materials</span>
                      <span className="export-badge">.csv</span>
                    </div>
                    <span className="item-desc">
                      Steel member schedule, lengths, mass totals & point-to-point measurements
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="export-menu-item"
                  onClick={handleExportImages}
                  title="Export all elevation views as high-resolution JPEG images"
                >
                  <div className="export-item-icon zip">
                    <Icon name="camera" size={18} />
                  </div>
                  <div className="export-menu-text">
                    <div className="export-item-header">
                      <span className="item-title">Elevation View Images (ZIP)</span>
                      <span className="export-badge">.zip</span>
                    </div>
                    <span className="item-desc">
                      High-resolution orthographic renders of each elevation view
                    </span>
                  </div>
                </button>
              </div>

              <div className="view-menu-divider" />

              <div className="export-menu-section">
                <button
                  type="button"
                  className="export-menu-item"
                  onClick={handleExportProject}
                  title="Save complete project archive including scan data"
                >
                  <div className="export-item-icon project">
                    <Icon name="save" size={18} />
                  </div>
                  <div className="export-menu-text">
                    <div className="export-item-header">
                      <span className="item-title">SplatUp Project File (.splatup)</span>
                      <span className="export-badge">Package</span>
                    </div>
                    <span className="item-desc">
                      Includes 3D scan data, CAD models, annotations & alignment
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

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
