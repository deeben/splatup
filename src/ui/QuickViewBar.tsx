import { useState, useRef, useEffect } from 'react';
import { useApp } from '../core/store';
import { Icon } from './Icon';
import { registry } from '../viewport/registry';
import type { StandardView } from '../core/types';

interface ViewBtn {
  id: StandardView;
  label: string;
  tooltip: string;
  shortcut: string;
}

const VIEWS: ViewBtn[] = [
  { id: 'top', label: 'Top', tooltip: 'Top View (Plan) · Front at bottom', shortcut: '5' },
  { id: 'front', label: 'Front', tooltip: 'Front Elevation · Respects UP', shortcut: '1' },
  { id: 'back', label: 'Back', tooltip: 'Back Elevation (180°)', shortcut: '2' },
  { id: 'left', label: 'Left', tooltip: 'Left Elevation (90° left)', shortcut: '3' },
  { id: 'right', label: 'Right', tooltip: 'Right Elevation (90° right)', shortcut: '4' },
  { id: 'isoLeft', label: 'ISO L', tooltip: 'Isometric Left (45° pitch, 45° azimuth)', shortcut: '7' },
  { id: 'isoRight', label: 'ISO R', tooltip: 'Isometric Right (45° pitch, 45° azimuth)', shortcut: '8' },
];

export function QuickViewBar() {
  const activeView = useApp((s) => s.activeStandardView);
  const setView = useApp((s) => s.setView);
  const sceneAlignment = useApp((s) => s.doc.sceneAlignment ?? 0);
  const frontViewAngle = useApp((s) => s.doc.frontViewAngle ?? s.doc.sceneAlignment ?? 0);
  const rotateFrontView = useApp((s) => s.rotateFrontView);
  const setFrontViewAngle = useApp((s) => s.setFrontViewAngle);
  const setTool = useApp((s) => s.setTool);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocClick);
    return () => document.removeEventListener('pointerdown', onDocClick);
  }, [menuOpen]);

  const handleSetFrontFromCamera = (snap = true) => {
    registry.setFrontFromCurrentCamera?.(snap);
    setMenuOpen(false);
  };

  return (
    <div className="quick-view-bar" role="toolbar" aria-label="Standard Views">
      <div className="view-pill-group">
        <span className="view-bar-label">VIEWS</span>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`view-pill-btn ${activeView === v.id ? 'active' : ''}`}
            onClick={() => setView(v.id)}
            title={`${v.tooltip} (${v.shortcut})`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="view-bar-divider" />

      <div className="view-front-group" ref={menuRef}>
        <button
          type="button"
          className="view-pill-btn action-btn"
          onClick={() => handleSetFrontFromCamera(true)}
          title={`Set current view orientation as Front View (squares to alignment ${sceneAlignment.toFixed(1)}°) · Current Front: ${frontViewAngle.toFixed(1)}°`}
        >
          <Icon name="camera" size={14} />
          <span>Set Front</span>
        </button>

        <button
          type="button"
          className={`view-pill-btn menu-btn ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          title="Front View & Alignment Options"
        >
          <Icon name="chevronDown" size={12} />
        </button>

        {menuOpen && (
          <div className="view-menu-popover">
            <div className="view-menu-header">
              <span className="view-menu-title">FRONT ORIENTATION</span>
              <span className="view-menu-tag">{frontViewAngle.toFixed(1)}°</span>
            </div>

            <div className="view-menu-section">
              <button
                type="button"
                className="view-menu-item"
                onClick={() => handleSetFrontFromCamera(true)}
              >
                <Icon name="target" size={14} />
                <div className="view-menu-text">
                  <span className="item-title">Set Current as Front (Square)</span>
                  <span className="item-desc">Snaps to nearest 90° face on scene grid</span>
                </div>
              </button>

              <button
                type="button"
                className="view-menu-item"
                onClick={() => handleSetFrontFromCamera(false)}
              >
                <Icon name="camera" size={14} />
                <div className="view-menu-text">
                  <span className="item-title">Set Current as Front (Exact)</span>
                  <span className="item-desc">Uses current angle without snapping</span>
                </div>
              </button>

              <button
                type="button"
                className="view-menu-item"
                onClick={() => {
                  setTool('align');
                  setMenuOpen(false);
                }}
              >
                <Icon name="align" size={14} />
                <div className="view-menu-text">
                  <span className="item-title">Align Scene to 2 Points... (A)</span>
                  <span className="item-desc">Click two points along wall or datum</span>
                </div>
              </button>
            </div>

            <div className="view-menu-divider" />

            <div className="view-menu-sublabel">Select Front Face (Grid Relative)</div>
            <div className="view-menu-grid">
              <button
                type="button"
                className={`view-menu-pill ${frontViewAngle === sceneAlignment ? 'selected' : ''}`}
                onClick={() => {
                  setFrontViewAngle(sceneAlignment);
                  setView('front');
                  setMenuOpen(false);
                }}
              >
                0° (Face 1)
              </button>
              <button
                type="button"
                className={`view-menu-pill ${frontViewAngle === (sceneAlignment + 90) % 360 ? 'selected' : ''}`}
                onClick={() => {
                  setFrontViewAngle((sceneAlignment + 90) % 360);
                  setView('front');
                  setMenuOpen(false);
                }}
              >
                +90° (Face 2)
              </button>
              <button
                type="button"
                className={`view-menu-pill ${frontViewAngle === (sceneAlignment + 180) % 360 ? 'selected' : ''}`}
                onClick={() => {
                  setFrontViewAngle((sceneAlignment + 180) % 360);
                  setView('front');
                  setMenuOpen(false);
                }}
              >
                180° (Face 3)
              </button>
              <button
                type="button"
                className={`view-menu-pill ${frontViewAngle === (sceneAlignment + 270) % 360 ? 'selected' : ''}`}
                onClick={() => {
                  setFrontViewAngle((sceneAlignment + 270) % 360);
                  setView('front');
                  setMenuOpen(false);
                }}
              >
                270° (Face 4)
              </button>
            </div>

            <div className="view-menu-sublabel" style={{ marginTop: 8 }}>Rotate Front Direction</div>
            <div className="view-menu-btn-row">
              <button
                type="button"
                className="view-menu-action"
                onClick={() => rotateFrontView(-90)}
                title="Rotate Front 90° counter-clockwise"
              >
                ⟲ -90°
              </button>
              <button
                type="button"
                className="view-menu-action"
                onClick={() => rotateFrontView(90)}
                title="Rotate Front 90° clockwise"
              >
                ⟳ +90°
              </button>
              <button
                type="button"
                className="view-menu-action"
                onClick={() => rotateFrontView(180)}
                title="Flip Front 180°"
              >
                ⇄ Flip 180°
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
