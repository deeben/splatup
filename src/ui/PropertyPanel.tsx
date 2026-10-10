import { useApp } from '../core/store';
import { NumberField, TextField } from './fields';
import { fmtBytes, fmtMm, measureParts } from '../core/units';
import { Icon } from './Icon';
import type { BoxObject, CylinderObject } from '../core/types';

const COLOR_PRESETS = [
  { label: 'Amber (Duct)', color: '#f59e0b' },
  { label: 'Cyan (Supply)', color: '#38bdf8' },
  { label: 'Green (Platform)', color: '#22c55e' },
  { label: 'Red (Hoist / Crane)', color: '#ef4444' },
  { label: 'Purple (Exhaust)', color: '#a855f7' },
  { label: 'Steel Grey', color: '#94a3b8' },
  { label: 'White', color: '#f8fafc' },
];

export function PropertyPanel() {
  const selection = useApp((s) => s.selection);
  const doc = useApp((s) => s.doc);
  const bounds = useApp((s) => s.bounds);
  const deleteSelection = useApp((s) => s.deleteSelection);
  const duplicateObject = useApp((s) => s.duplicateObject);
  const updateObject = useApp((s) => s.updateObject);
  const updateScan = useApp((s) => s.updateScan);
  const renameMeasurement = useApp((s) => s.renameMeasurement);
  const commit = useApp((s) => s.commit);
  const removeScan = useApp((s) => s.removeScan);
  const gizmoSpace = useApp((s) => s.gizmoSpace);
  const setGizmoSpace = useApp((s) => s.setGizmoSpace);

  if (selection?.type === 'object') {
    const obj = doc.objects.find((o) => o.id === selection.id);
    if (!obj) return null;

    return (
      <aside className="panel-drawer right-drawer">
        <div className="panel-header">
          <div className="panel-title-row">
            <span className="panel-badge">{obj.kind.toUpperCase()}</span>
            <input
              type="text"
              className="panel-name-input"
              value={obj.name}
              onChange={(e) => {
                const name = e.target.value;
                updateObject(obj.id, (o) => {
                  o.name = name;
                });
              }}
              aria-label="Object Name"
            />
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => duplicateObject(obj.id)}
              title="Duplicate (Ctrl+D)"
            >
              <Icon name="copy" size={16} />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              onClick={deleteSelection}
              title="Delete (Del / Backspace)"
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>

        <div className="panel-body">
          {/* Dimensions Section */}
          <div className="section-group">
            <div className="section-title">Dimensions (mm)</div>
            {obj.kind === 'box' && (
              <>
                <NumberField
                  label="Length (X)"
                  value={(obj as BoxObject).length}
                  min={1}
                  onCommit={(v) =>
                    updateObject(obj.id, (o) => {
                      (o as BoxObject).length = v;
                    })
                  }
                />
                <NumberField
                  label="Width (Y)"
                  value={(obj as BoxObject).width}
                  min={1}
                  onCommit={(v) =>
                    updateObject(obj.id, (o) => {
                      (o as BoxObject).width = v;
                    })
                  }
                />
                <NumberField
                  label="Height (Z)"
                  value={(obj as BoxObject).height}
                  min={1}
                  onCommit={(v) =>
                    updateObject(obj.id, (o) => {
                      (o as BoxObject).height = v;
                    })
                  }
                />
              </>
            )}

            {obj.kind === 'cylinder' && (
              <>
                <NumberField
                  label="Diameter"
                  value={(obj as CylinderObject).diameter}
                  min={1}
                  onCommit={(v) =>
                    updateObject(obj.id, (o) => {
                      (o as CylinderObject).diameter = v;
                    })
                  }
                />
                <NumberField
                  label="Length (Z)"
                  value={(obj as CylinderObject).length}
                  min={1}
                  onCommit={(v) =>
                    updateObject(obj.id, (o) => {
                      (o as CylinderObject).length = v;
                    })
                  }
                />
              </>
            )}
          </div>

          {/* Position Section */}
          <div className="section-group">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Position (mm)</span>
              <button
                type="button"
                className="mini-add-btn"
                onClick={() => setGizmoSpace(gizmoSpace === 'local' ? 'world' : 'local')}
                title="Toggle Gizmo alignment between Object (local) and World space (Q)"
              >
                {gizmoSpace === 'local' ? 'Object Space' : 'World Space'}
              </button>
            </div>
            <NumberField
              label="X"
              value={obj.transform.position[0]}
              onCommit={(v) =>
                updateObject(obj.id, (o) => {
                  o.transform.position[0] = v;
                })
              }
            />
            <NumberField
              label="Y"
              value={obj.transform.position[1]}
              onCommit={(v) =>
                updateObject(obj.id, (o) => {
                  o.transform.position[1] = v;
                })
              }
            />
            <NumberField
              label="Z"
              value={obj.transform.position[2]}
              onCommit={(v) =>
                updateObject(obj.id, (o) => {
                  o.transform.position[2] = v;
                })
              }
            />
          </div>

          {/* Rotation Section */}
          <div className="section-group">
            <div className="section-title">Rotation (deg)</div>
            <NumberField
              label="Yaw (Z)"
              suffix="°"
              value={obj.transform.rotation[2]}
              onCommit={(v) =>
                updateObject(obj.id, (o) => {
                  o.transform.rotation[2] = v;
                })
              }
            />
            <NumberField
              label="Pitch (Y)"
              suffix="°"
              value={obj.transform.rotation[1]}
              onCommit={(v) =>
                updateObject(obj.id, (o) => {
                  o.transform.rotation[1] = v;
                })
              }
            />
            <NumberField
              label="Roll (X)"
              suffix="°"
              value={obj.transform.rotation[0]}
              onCommit={(v) =>
                updateObject(obj.id, (o) => {
                  o.transform.rotation[0] = v;
                })
              }
            />
          </div>

          {/* Appearance Section */}
          <div className="section-group">
            <div className="section-title">Appearance & Color</div>
            <div className="color-palette">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.color}
                  type="button"
                  className={`color-swatch ${obj.color === p.color ? 'active' : ''}`}
                  style={{ backgroundColor: p.color }}
                  title={p.label}
                  onClick={() =>
                    updateObject(obj.id, (o) => {
                      o.color = p.color;
                    })
                  }
                />
              ))}
              <input
                type="color"
                className="color-picker-input"
                value={obj.color}
                onChange={(e) => {
                  const c = e.target.value;
                  updateObject(obj.id, (o) => {
                    o.color = c;
                  });
                }}
                title="Custom color"
              />
            </div>
          </div>
        </div>
      </aside>
    );
  }

  if (selection?.type === 'measurement') {
    const m = doc.measurements.find((x) => x.id === selection.id);
    if (!m) return null;
    const p = measureParts(m.a, m.b);

    return (
      <aside className="panel-drawer right-drawer">
        <div className="panel-header">
          <div className="panel-title-row">
            <span className="panel-badge measure-badge">MEASURE</span>
            <TextField
              label=""
              value={m.name}
              onCommit={(name) => renameMeasurement(m.id, name)}
            />
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="icon-btn danger"
              onClick={deleteSelection}
              title="Delete measurement"
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>

        <div className="panel-body">
          <div className="kpi-card highlight">
            <div className="kpi-label">True 3D Distance</div>
            <div className="kpi-value">{fmtMm(p.total)}</div>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Horizontal Span</div>
              <div className="kpi-value-sm">{fmtMm(p.horizontal)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Vertical Δ (Height)</div>
              <div className="kpi-value-sm">{fmtMm(p.vertical)}</div>
            </div>
          </div>

          <div className="section-group">
            <div className="section-title">Component Deltas</div>
            <div className="delta-row">
              <span className="delta-tag x">ΔX</span>
              <span className="delta-val">{fmtMm(Math.abs(p.dx))}</span>
            </div>
            <div className="delta-row">
              <span className="delta-tag y">ΔY</span>
              <span className="delta-val">{fmtMm(Math.abs(p.dy))}</span>
            </div>
            <div className="delta-row">
              <span className="delta-tag z">ΔZ</span>
              <span className="delta-val">{fmtMm(Math.abs(p.dz))}</span>
            </div>
          </div>

          <div className="section-group">
            <div className="section-title">Point A (Start)</div>
            <div className="coords-text">
              X: {fmtMm(m.a[0])} · Y: {fmtMm(m.a[1])} · Z: {fmtMm(m.a[2])}
            </div>
          </div>

          <div className="section-group">
            <div className="section-title">Point B (End)</div>
            <div className="coords-text">
              X: {fmtMm(m.b[0])} · Y: {fmtMm(m.b[1])} · Z: {fmtMm(m.b[2])}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  if (selection?.type === 'scan') {
    const s = doc.scans.find((x) => x.id === selection.id);
    if (!s) return null;

    return (
      <aside className="panel-drawer right-drawer">
        <div className="panel-header">
          <div className="panel-title-row">
            <span className="panel-badge scan-badge">SCAN</span>
            <span className="panel-title-text">{s.name}</span>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="icon-btn danger"
              onClick={() => removeScan(s.id)}
              title="Remove scan"
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>

        <div className="panel-body">
          <div className="section-group">
            <div className="section-title">Source File</div>
            <div className="info-row">
              <span>File:</span>
              <span className="info-val">{s.fileName}</span>
            </div>
            <div className="info-row">
              <span>Size:</span>
              <span className="info-val">{fmtBytes(s.byteSize)}</span>
            </div>
          </div>

          <div className="section-group">
            <div className="section-title">Display Settings</div>
            <label className="toggle-row">
              <span>Visible</span>
              <input
                type="checkbox"
                checked={s.visible}
                onChange={(e) => updateScan(s.id, { visible: e.target.checked })}
              />
            </label>

            <label className="slider-row">
              <div className="slider-label-row">
                <span>Opacity</span>
                <span>{Math.round(s.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={s.opacity}
                onChange={(e) => updateScan(s.id, { opacity: parseFloat(e.target.value) })}
              />
            </label>

            <label className="toggle-row" title="True Scaniverse vertex colours without 3D directional shading">
              <div>
                <div>Unlit Shader</div>
                <div className="subtext">Original scan colours</div>
              </div>
              <input
                type="checkbox"
                checked={s.unlit}
                onChange={(e) => updateScan(s.id, { unlit: e.target.checked })}
              />
            </label>

            <label className="toggle-row">
              <span>Double Sided</span>
              <input
                type="checkbox"
                checked={s.doubleSided}
                onChange={(e) => updateScan(s.id, { doubleSided: e.target.checked })}
              />
            </label>
          </div>
        </div>
      </aside>
    );
  }

  // Default: Project & View Settings
  const clipHeight = doc.view.clipHeight;
  const clipActive = clipHeight != null;
  const minZ = bounds ? bounds.min[2] : 0;
  const maxZ = bounds ? bounds.max[2] : 5000;

  return (
    <aside className="panel-drawer right-drawer">
      <div className="panel-header">
        <div className="panel-title-text">Project & View</div>
      </div>

      <div className="panel-body">
        {/* Section Cut / Height Clip */}
        <div className="section-group">
          <div className="section-title">Section Plane / Cut-away</div>
          <div className="subtext" style={{ marginBottom: 8 }}>
            Slice scan from the top to look inside rooms or duct runs.
          </div>

          <label className="toggle-row">
            <span>Enable Cut-away</span>
            <input
              type="checkbox"
              checked={clipActive}
              onChange={(e) => {
                const next = e.target.checked ? (bounds ? (bounds.min[2] + bounds.max[2]) / 2 : 2500) : null;
                commit((d) => {
                  d.view.clipHeight = next;
                });
              }}
            />
          </label>

          {clipActive && (
            <>
              <NumberField
                label="Cut Height (Z)"
                value={clipHeight}
                onCommit={(v) =>
                  commit((d) => {
                    d.view.clipHeight = v;
                  })
                }
              />
              <input
                type="range"
                className="section-slider"
                min={minZ}
                max={maxZ}
                step="50"
                value={clipHeight}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  commit((d) => {
                    d.view.clipHeight = val;
                  });
                }}
              />
            </>
          )}
        </div>

        {/* Scan Bounds Info */}
        {bounds && (
          <div className="section-group">
            <div className="section-title">Scan Extents</div>
            <div className="info-row">
              <span>Width (X):</span>
              <span className="info-val">{fmtMm(bounds.max[0] - bounds.min[0])}</span>
            </div>
            <div className="info-row">
              <span>Depth (Y):</span>
              <span className="info-val">{fmtMm(bounds.max[1] - bounds.min[1])}</span>
            </div>
            <div className="info-row">
              <span>Height (Z):</span>
              <span className="info-val">{fmtMm(bounds.max[2] - bounds.min[2])}</span>
            </div>
          </div>
        )}

        {/* Quick Summary */}
        <div className="section-group">
          <div className="section-title">Document Summary</div>
          <div className="info-row">
            <span>Scans:</span>
            <span className="info-val">{doc.scans.length}</span>
          </div>
          <div className="info-row">
            <span>Block Models:</span>
            <span className="info-val">{doc.objects.length}</span>
          </div>
          <div className="info-row">
            <span>Measurements:</span>
            <span className="info-val">{doc.measurements.length}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
