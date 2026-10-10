import { useApp } from '../core/store';
import { NumberField, TextField } from './fields';
import { fmtBytes, fmtMm, measureParts } from '../core/units';
import { Icon } from './Icon';
import type {
  BoxObject,
  CylinderObject,
  HandrailObject,
  LadderObject,
  PolyShapeObject,
  SwingGateObject,
} from '../core/types';
import { computePolyMetrics } from '../viewport/geometry/polyPrism';

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
  const setTool = useApp((s) => s.setTool);
  const setSceneAlignment = useApp((s) => s.setSceneAlignment);
  const sceneAlignment = doc.sceneAlignment ?? 0;

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

            {obj.kind === 'polyShape' && (() => {
              const po = obj as PolyShapeObject;
              const metrics = computePolyMetrics(po.points, po.thickness);
              return (
                <>
                  <div className="kpi-grid" style={{ marginBottom: 8 }}>
                    <div className="kpi-card">
                      <div className="kpi-label">Planar Area</div>
                      <div className="kpi-value-sm">{metrics.areaM2.toFixed(2)} m²</div>
                    </div>
                    <div className="kpi-card">
                      <div className="kpi-label">Perimeter</div>
                      <div className="kpi-value-sm">{fmtMm(metrics.perimeterMm)}</div>
                    </div>
                  </div>
                  <NumberField
                    label="Thickness"
                    value={po.thickness}
                    min={1}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as PolyShapeObject).thickness = v;
                      })
                    }
                  />
                  <div className="info-row">
                    <span>Vertices:</span>
                    <span className="info-val">{po.points.length} points</span>
                  </div>
                </>
              );
            })()}

            {obj.kind === 'handrail' && (() => {
              const ho = obj as HandrailObject;
              let totalLengthMm = 0;
              for (let i = 0; i < ho.points.length - 1; i++) {
                const a = ho.points[i];
                const b = ho.points[i + 1];
                totalLengthMm += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
              }
              const stanchionCount = Math.max(2, Math.ceil(totalLengthMm / ho.stanchionSpacing) + 1);

              return (
                <>
                  <div className="kpi-grid" style={{ marginBottom: 8 }}>
                    <div className="kpi-card">
                      <div className="kpi-label">Run Length</div>
                      <div className="kpi-value-sm">{(totalLengthMm / 1000).toFixed(2)} m</div>
                    </div>
                    <div className="kpi-card">
                      <div className="kpi-label">Stanchions</div>
                      <div className="kpi-value-sm">{stanchionCount} posts</div>
                    </div>
                  </div>

                  <div className="field">
                    <span className="field-label">Height (AS 1657)</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 8px',
                          background: ho.height === 1000 ? '#facc15' : undefined,
                          color: ho.height === 1000 ? '#000' : undefined,
                          fontWeight: ho.height === 1000 ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as HandrailObject).height = 1000;
                          })
                        }
                      >
                        1000 mm (Std)
                      </button>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 8px',
                          background: ho.height === 900 ? '#facc15' : undefined,
                          color: ho.height === 900 ? '#000' : undefined,
                          fontWeight: ho.height === 900 ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as HandrailObject).height = 900;
                          })
                        }
                      >
                        900 mm
                      </button>
                    </div>
                  </div>

                  <NumberField
                    label="Post Spacing"
                    value={ho.stanchionSpacing}
                    min={500}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as HandrailObject).stanchionSpacing = v;
                      })
                    }
                  />

                  <NumberField
                    label="Pipe OD"
                    value={ho.pipeDiameter}
                    min={25}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as HandrailObject).pipeDiameter = v;
                      })
                    }
                  />

                  <label className="toggle-row">
                    <span>100mm Kickplate (Toeboard)</span>
                    <input
                      type="checkbox"
                      checked={ho.hasKickplate}
                      onChange={(e) =>
                        updateObject(obj.id, (o) => {
                          (o as HandrailObject).hasKickplate = e.target.checked;
                        })
                      }
                    />
                  </label>

                  <label className="toggle-row">
                    <span>Mid / Knee Rail</span>
                    <input
                      type="checkbox"
                      checked={ho.hasMidrail}
                      onChange={(e) =>
                        updateObject(obj.id, (o) => {
                          (o as HandrailObject).hasMidrail = e.target.checked;
                        })
                      }
                    />
                  </label>
                </>
              );
            })()}

            {obj.kind === 'gate' && (() => {
              const go = obj as SwingGateObject;
              return (
                <>
                  <NumberField
                    label="Clear Opening"
                    value={go.width}
                    min={400}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as SwingGateObject).width = v;
                      })
                    }
                  />
                  <div className="field">
                    <span className="field-label">Height</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 8px',
                          background: go.height === 1000 ? '#facc15' : undefined,
                          color: go.height === 1000 ? '#000' : undefined,
                          fontWeight: go.height === 1000 ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as SwingGateObject).height = 1000;
                          })
                        }
                      >
                        1000 mm
                      </button>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 8px',
                          background: go.height === 900 ? '#facc15' : undefined,
                          color: go.height === 900 ? '#000' : undefined,
                          fontWeight: go.height === 900 ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as SwingGateObject).height = 900;
                          })
                        }
                      >
                        900 mm
                      </button>
                    </div>
                  </div>

                  <label className="slider-row">
                    <div className="slider-label-row">
                      <span>Swing Angle</span>
                      <span>{Math.round(go.swingAngle)}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      step="5"
                      value={go.swingAngle}
                      onChange={(e) =>
                        updateObject(obj.id, (o) => {
                          (o as SwingGateObject).swingAngle = parseFloat(e.target.value);
                        })
                      }
                    />
                  </label>

                  <label className="toggle-row">
                    <span>Bottom Toe Bar</span>
                    <input
                      type="checkbox"
                      checked={go.hasKickplate}
                      onChange={(e) =>
                        updateObject(obj.id, (o) => {
                          (o as SwingGateObject).hasKickplate = e.target.checked;
                        })
                      }
                    />
                  </label>
                </>
              );
            })()}

            {obj.kind === 'ladder' && (() => {
              const lo = obj as LadderObject;
              const rungCount = Math.floor(lo.height / lo.rungSpacing);
              return (
                <>
                  <div className="kpi-grid" style={{ marginBottom: 8 }}>
                    <div className="kpi-card">
                      <div className="kpi-label">Vertical Climb</div>
                      <div className="kpi-value-sm">{fmtMm(lo.height)}</div>
                    </div>
                    <div className="kpi-card">
                      <div className="kpi-label">Rungs</div>
                      <div className="kpi-value-sm">{rungCount} rungs</div>
                    </div>
                  </div>

                  <NumberField
                    label="Climb Height"
                    value={lo.height}
                    min={500}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as LadderObject).height = v;
                      })
                    }
                  />

                  <NumberField
                    label="Clear Width"
                    value={lo.width}
                    min={300}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as LadderObject).width = v;
                      })
                    }
                  />

                  <NumberField
                    label="Rung Spacing"
                    value={lo.rungSpacing}
                    min={200}
                    max={350}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as LadderObject).rungSpacing = v;
                      })
                    }
                  />

                  <label className="toggle-row">
                    <span>Safety Cage (AS 1657 &gt;3m)</span>
                    <input
                      type="checkbox"
                      checked={lo.hasCage}
                      onChange={(e) =>
                        updateObject(obj.id, (o) => {
                          (o as LadderObject).hasCage = e.target.checked;
                        })
                      }
                    />
                  </label>
                </>
              );
            })()}
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
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Rotation (deg)</span>
              {sceneAlignment !== obj.transform.rotation[2] && (
                <button
                  type="button"
                  className="mini-add-btn"
                  onClick={() =>
                    updateObject(obj.id, (o) => {
                      o.transform.rotation[2] = sceneAlignment;
                    })
                  }
                  title={`Align this object's yaw rotation to the scene orientation (${sceneAlignment}°)`}
                >
                  Square to Scene ({sceneAlignment}°)
                </button>
              )}
            </div>
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
        {/* Scene Alignment / Site Orientation */}
        <div className="section-group">
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Scene Alignment</span>
            <button
              type="button"
              className="mini-add-btn"
              onClick={() => setTool('align')}
              title="Align scene by clicking two points along a wall or edge (A)"
            >
              Align to 2 Points...
            </button>
          </div>
          <div className="subtext" style={{ marginBottom: 8 }}>
            Rotates the CAD grid and squares all newly placed objects to the scan.
          </div>
          <NumberField
            label="Orientation"
            suffix="°"
            value={sceneAlignment}
            onCommit={(v) => setSceneAlignment(v)}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              className="mini-add-btn"
              style={{ flex: 1 }}
              onClick={() => setSceneAlignment(0)}
              title="Reset scene alignment to 0°"
            >
              0° (Reset)
            </button>
            <button
              type="button"
              className="mini-add-btn"
              style={{ flex: 1 }}
              onClick={() => setSceneAlignment((sceneAlignment + 45) % 360)}
              title="Rotate +45°"
            >
              +45°
            </button>
            <button
              type="button"
              className="mini-add-btn"
              style={{ flex: 1 }}
              onClick={() => setSceneAlignment((sceneAlignment + 90) % 360)}
              title="Rotate +90°"
            >
              +90°
            </button>
            <button
              type="button"
              className="mini-add-btn"
              style={{ flex: 1 }}
              onClick={() => setSceneAlignment((sceneAlignment - 45 + 360) % 360)}
              title="Rotate -45°"
            >
              -45°
            </button>
          </div>
        </div>

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
