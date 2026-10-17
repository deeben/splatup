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
  StairsObject,
  SteelBeamObject,
  SwingGateObject,
} from '../core/types';
import { computePolyMetrics } from '../viewport/geometry/polyPrism';
import { computeStairsMetrics } from '../viewport/geometry/stairs';
import { STEEL_CATALOGUE, DEFAULT_SECTION } from '../viewport/geometry/steelSections';
import { registry } from '../viewport/registry';

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
  const frontViewAngle = doc.frontViewAngle ?? doc.sceneAlignment ?? 0;
  const setFrontViewAngle = useApp((s) => s.setFrontViewAngle);
  const rotateFrontView = useApp((s) => s.rotateFrontView);
  const activeStandardView = useApp((s) => s.activeStandardView);
  const setView = useApp((s) => s.setView);

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

            {obj.kind === 'stairs' && (() => {
              const so = obj as StairsObject;
              const metrics = computeStairsMetrics(so);
              return (
                <>
                  <div className={`compliance-badge ${metrics.isCompliant ? 'ok' : 'warn'}`}>
                    <Icon name={metrics.isCompliant ? 'check' : 'warning'} size={14} />
                    <span>{metrics.complianceMsg}</span>
                  </div>

                  <div className="kpi-grid" style={{ marginBottom: 8 }}>
                    <div className="kpi-card">
                      <div className="kpi-label">Risers & Going</div>
                      <div className="kpi-value-sm">
                        {metrics.numRisers} @ {metrics.riseMm}mm
                      </div>
                    </div>
                    <div className="kpi-card">
                      <div className="kpi-label">Total Run / Slope</div>
                      <div className="kpi-value-sm">
                        {fmtMm(metrics.totalRunMm)} ({metrics.slopeDeg}°)
                      </div>
                    </div>
                  </div>

                  <NumberField
                    label="Floor Rise"
                    value={so.totalRise}
                    min={200}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        const s = o as StairsObject;
                        s.totalRise = v;
                        s.numSteps = Math.max(1, Math.round(v / 190));
                      })
                    }
                  />

                  <NumberField
                    label="Steps (Risers)"
                    value={so.numSteps}
                    min={1}
                    max={50}
                    suffix=""
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as StairsObject).numSteps = Math.round(v);
                      })
                    }
                  />

                  <NumberField
                    label="Tread Going"
                    value={so.going}
                    min={200}
                    max={400}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as StairsObject).going = v;
                      })
                    }
                  />

                  <NumberField
                    label="Clear Width"
                    value={so.width}
                    min={500}
                    max={2000}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as StairsObject).width = v;
                      })
                    }
                  />

                  <div className="field">
                    <span className="field-label">Stringer Channel</span>
                    <select
                      className="field-select"
                      value={so.stringerSection}
                      onChange={(e) =>
                        updateObject(obj.id, (o) => {
                          (o as StairsObject).stringerSection = e.target.value as '200PFC' | '250PFC' | '150PFC';
                        })
                      }
                    >
                      <option value="200PFC">200 PFC (Standard)</option>
                      <option value="250PFC">250 PFC (Heavy / Long)</option>
                      <option value="150PFC">150 PFC (Light)</option>
                    </select>
                  </div>

                  <div className="field">
                    <span className="field-label">Handrails</span>
                    <select
                      className="field-select"
                      value={so.handrailSide}
                      onChange={(e) =>
                        updateObject(obj.id, (o) => {
                          (o as StairsObject).handrailSide = e.target.value as 'both' | 'left' | 'right' | 'none';
                        })
                      }
                    >
                      <option value="both">Both Sides</option>
                      <option value="left">Left Only</option>
                      <option value="right">Right Only</option>
                      <option value="none">None</option>
                    </select>
                  </div>

                  {so.handrailSide !== 'none' && (
                    <>
                      <div className="field">
                        <span className="field-label">Rail Height</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="mini-add-btn"
                            style={{
                              padding: '3px 8px',
                              background: so.handrailHeight === 1000 ? '#facc15' : undefined,
                              color: so.handrailHeight === 1000 ? '#000' : undefined,
                              fontWeight: so.handrailHeight === 1000 ? 700 : 500,
                            }}
                            onClick={() =>
                              updateObject(obj.id, (o) => {
                                (o as StairsObject).handrailHeight = 1000;
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
                              background: so.handrailHeight === 900 ? '#facc15' : undefined,
                              color: so.handrailHeight === 900 ? '#000' : undefined,
                              fontWeight: so.handrailHeight === 900 ? 700 : 500,
                            }}
                            onClick={() =>
                              updateObject(obj.id, (o) => {
                                (o as StairsObject).handrailHeight = 900;
                              })
                            }
                          >
                            900 mm (Std)
                          </button>
                        </div>
                      </div>

                      <label className="toggle-row">
                        <span>100mm Sloping Kickplate</span>
                        <input
                          type="checkbox"
                          checked={so.hasKickplate}
                          onChange={(e) =>
                            updateObject(obj.id, (o) => {
                              (o as StairsObject).hasKickplate = e.target.checked;
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                </>
              );
            })()}

            {obj.kind === 'beam' && (() => {
              const bo = obj as SteelBeamObject;
              const secDef = STEEL_CATALOGUE[bo.sectionName] ?? STEEL_CATALOGUE[DEFAULT_SECTION];
              const totalMassKg = (secDef.mass * bo.length) / 1000;

              return (
                <>
                  <div className="kpi-grid" style={{ marginBottom: 8 }}>
                    <div className="kpi-card">
                      <div className="kpi-label">Unit Mass</div>
                      <div className="kpi-value-sm">{secDef.mass} kg/m</div>
                    </div>
                    <div className="kpi-card">
                      <div className="kpi-label">Total Mass</div>
                      <div className="kpi-value-sm">{totalMassKg.toFixed(1)} kg</div>
                    </div>
                  </div>

                  <div className="info-row" style={{ marginBottom: 8 }}>
                    <span>Profile (D × B):</span>
                    <span className="info-val">{secDef.depth} × {secDef.flangeWidth} mm</span>
                  </div>

                  <div className="field">
                    <span className="field-label">Section Profile</span>
                    <select
                      className="field-select"
                      style={{ maxWidth: 160 }}
                      value={bo.sectionName}
                      onChange={(e) =>
                        updateObject(obj.id, (o) => {
                          (o as SteelBeamObject).sectionName = e.target.value;
                        })
                      }
                    >
                      <optgroup label="Universal Beams (UB)">
                        {Object.values(STEEL_CATALOGUE)
                          .filter((s) => s.category === 'UB')
                          .map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.label} ({s.mass} kg/m)
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Universal Columns (UC)">
                        {Object.values(STEEL_CATALOGUE)
                          .filter((s) => s.category === 'UC')
                          .map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.label} ({s.mass} kg/m)
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Parallel Flange Channels (PFC)">
                        {Object.values(STEEL_CATALOGUE)
                          .filter((s) => s.category === 'PFC')
                          .map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.label} ({s.mass} kg/m)
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Square Hollow Sections (SHS)">
                        {Object.values(STEEL_CATALOGUE)
                          .filter((s) => s.category === 'SHS')
                          .map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.label} ({s.mass} kg/m)
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Rectangular Hollow Sections (RHS)">
                        {Object.values(STEEL_CATALOGUE)
                          .filter((s) => s.category === 'RHS')
                          .map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.label} ({s.mass} kg/m)
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Equal Angles (EA)">
                        {Object.values(STEEL_CATALOGUE)
                          .filter((s) => s.category === 'EA')
                          .map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.label} ({s.mass} kg/m)
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>

                  <NumberField
                    label="Length"
                    value={bo.length}
                    min={10}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as SteelBeamObject).length = v;
                      })
                    }
                  />

                  <div className="field">
                    <span className="field-label">Alignment</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 6px',
                          background: bo.alignment === 'topCenter' ? '#facc15' : undefined,
                          color: bo.alignment === 'topCenter' ? '#000' : undefined,
                          fontWeight: bo.alignment === 'topCenter' ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as SteelBeamObject).alignment = 'topCenter';
                          })
                        }
                        title="Top of Steel (TOS)"
                      >
                        TOS (Top)
                      </button>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 6px',
                          background: bo.alignment === 'center' ? '#facc15' : undefined,
                          color: bo.alignment === 'center' ? '#000' : undefined,
                          fontWeight: bo.alignment === 'center' ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as SteelBeamObject).alignment = 'center';
                          })
                        }
                        title="Centerline"
                      >
                        Center
                      </button>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 6px',
                          background: bo.alignment === 'bottomCenter' ? '#facc15' : undefined,
                          color: bo.alignment === 'bottomCenter' ? '#000' : undefined,
                          fontWeight: bo.alignment === 'bottomCenter' ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as SteelBeamObject).alignment = 'bottomCenter';
                          })
                        }
                        title="Bottom of Steel (BOS)"
                      >
                        BOS (Bot)
                      </button>
                    </div>
                  </div>

                  <NumberField
                    label="Roll Angle"
                    suffix="°"
                    value={bo.rollAngle ?? 0}
                    onCommit={(v) =>
                      updateObject(obj.id, (o) => {
                        (o as SteelBeamObject).rollAngle = v;
                      })
                    }
                  />

                  <div className="field">
                    <span className="field-label">Roll Presets</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 6px',
                          background: (bo.rollAngle ?? 0) === 0 ? '#facc15' : undefined,
                          color: (bo.rollAngle ?? 0) === 0 ? '#000' : undefined,
                          fontWeight: (bo.rollAngle ?? 0) === 0 ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as SteelBeamObject).rollAngle = 0;
                          })
                        }
                      >
                        0° (Vertical)
                      </button>
                      <button
                        type="button"
                        className="mini-add-btn"
                        style={{
                          padding: '3px 6px',
                          background: (bo.rollAngle ?? 0) === 90 ? '#facc15' : undefined,
                          color: (bo.rollAngle ?? 0) === 90 ? '#000' : undefined,
                          fontWeight: (bo.rollAngle ?? 0) === 90 ? 700 : 500,
                        }}
                        onClick={() =>
                          updateObject(obj.id, (o) => {
                            (o as SteelBeamObject).rollAngle = 90;
                          })
                        }
                      >
                        90° (Flat)
                      </button>
                    </div>
                  </div>
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
            <span className="panel-badge scan-badge">
              {s.fileName.split('.').pop()?.toUpperCase() || 'SCAN'}
            </span>
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
              <span>Type:</span>
              <span className="info-val">
                {s.fileName.toLowerCase().endsWith('.las') || s.fileName.toLowerCase().endsWith('.laz')
                  ? 'ASPRS LiDAR Point Cloud'
                  : s.fileName.toLowerCase().endsWith('.ply')
                  ? 'PLY 3D Scan'
                  : 'GLB Textured Mesh'}
              </span>
            </div>
            <div className="info-row">
              <span>Size:</span>
              <span className="info-val">{fmtBytes(s.byteSize)}</span>
            </div>
          </div>

          <div className="section-group">
            <div className="section-title">Display Settings</div>

            <div className="field">
              <span className="field-label">Coordinate Up-Axis</span>
              <select
                className="field-select"
                value={s.orientation ?? (s.fileName.match(/\.(las|laz|ply)$/i) ? 'z-up' : 'y-up')}
                onChange={(e) => updateScan(s.id, { orientation: e.target.value as 'y-up' | 'z-up' })}
              >
                <option value="z-up">Z-Up (CAD / LiDAR standard)</option>
                <option value="y-up">Y-Up (GLTF / Blender standard)</option>
              </select>
            </div>

            {(s.fileName.match(/\.(las|laz|ply)$/i) || s.pointSize != null) && (
              <NumberField
                label="Point Size"
                value={Math.round((s.pointSize ?? 0.015) * 1000)}
                suffix="mm"
                min={1}
                max={100}
                onCommit={(v) => updateScan(s.id, { pointSize: v / 1000 })}
              />
            )}

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

            {!s.fileName.match(/\.(las|laz)$/i) && (
              <>
                <label className="toggle-row" title="True scan vertex colours without 3D directional shading">
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
              </>
            )}
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

        {/* Front View Direction */}
        <div className="section-group">
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Front View Direction</span>
            <button
              type="button"
              className="mini-add-btn"
              onClick={() => registry.setFrontFromCurrentCamera?.(true)}
              title="Set current camera horizontal orientation as Front View (squares to alignment)"
            >
              Set Current as Front
            </button>
          </div>
          <div className="subtext" style={{ marginBottom: 8 }}>
            Front direction used for Elevations, Plan view, and PDF drawing exports.
          </div>
          <NumberField
            label="Front Angle"
            suffix="°"
            value={frontViewAngle}
            onCommit={(v) => setFrontViewAngle(v)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 4 }}>
            <button
              type="button"
              className="mini-add-btn"
              style={{
                background: frontViewAngle === sceneAlignment ? 'rgba(56, 189, 248, 0.25)' : undefined,
                color: frontViewAngle === sceneAlignment ? '#38bdf8' : undefined,
                fontWeight: frontViewAngle === sceneAlignment ? 700 : 500,
              }}
              onClick={() => {
                setFrontViewAngle(sceneAlignment);
                setView('front');
              }}
              title="Face 1 (0° to grid)"
            >
              Face 0°
            </button>
            <button
              type="button"
              className="mini-add-btn"
              style={{
                background: frontViewAngle === (sceneAlignment + 90) % 360 ? 'rgba(56, 189, 248, 0.25)' : undefined,
                color: frontViewAngle === (sceneAlignment + 90) % 360 ? '#38bdf8' : undefined,
                fontWeight: frontViewAngle === (sceneAlignment + 90) % 360 ? 700 : 500,
              }}
              onClick={() => {
                setFrontViewAngle((sceneAlignment + 90) % 360);
                setView('front');
              }}
              title="Face 2 (+90° to grid)"
            >
              +90°
            </button>
            <button
              type="button"
              className="mini-add-btn"
              style={{
                background: frontViewAngle === (sceneAlignment + 180) % 360 ? 'rgba(56, 189, 248, 0.25)' : undefined,
                color: frontViewAngle === (sceneAlignment + 180) % 360 ? '#38bdf8' : undefined,
                fontWeight: frontViewAngle === (sceneAlignment + 180) % 360 ? 700 : 500,
              }}
              onClick={() => {
                setFrontViewAngle((sceneAlignment + 180) % 360);
                setView('front');
              }}
              title="Face 3 (180° to grid)"
            >
              180°
            </button>
            <button
              type="button"
              className="mini-add-btn"
              style={{
                background: frontViewAngle === (sceneAlignment + 270) % 360 ? 'rgba(56, 189, 248, 0.25)' : undefined,
                color: frontViewAngle === (sceneAlignment + 270) % 360 ? '#38bdf8' : undefined,
                fontWeight: frontViewAngle === (sceneAlignment + 270) % 360 ? 700 : 500,
              }}
              onClick={() => {
                setFrontViewAngle((sceneAlignment + 270) % 360);
                setView('front');
              }}
              title="Face 4 (270° to grid)"
            >
              270°
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              className="mini-add-btn"
              style={{ flex: 1 }}
              onClick={() => rotateFrontView(-90)}
              title="Turn Front 90° counter-clockwise"
            >
              ⟲ -90°
            </button>
            <button
              type="button"
              className="mini-add-btn"
              style={{ flex: 1 }}
              onClick={() => rotateFrontView(90)}
              title="Turn Front 90° clockwise"
            >
              ⟳ +90°
            </button>
            <button
              type="button"
              className="mini-add-btn"
              style={{ flex: 1 }}
              onClick={() => rotateFrontView(180)}
              title="Flip Front 180°"
            >
              ⇄ Flip 180°
            </button>
          </div>
        </div>

        {/* Standard Views */}
        <div className="section-group">
          <div className="section-title">Standard Aligned Views</div>
          <div className="subtext" style={{ marginBottom: 8 }}>
            Quick switch between drafting elevations, plan view, and isometric views.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { id: 'top', label: 'Top (Plan)', shortcut: '5' },
              { id: 'front', label: 'Front Elev', shortcut: '1' },
              { id: 'back', label: 'Back Elev', shortcut: '2' },
              { id: 'left', label: 'Left Elev', shortcut: '3' },
              { id: 'right', label: 'Right Elev', shortcut: '4' },
              { id: 'isoLeft', label: 'ISO Left', shortcut: '7' },
              { id: 'isoRight', label: 'ISO Right', shortcut: '8' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                className="mini-add-btn"
                style={{
                  padding: '6px 4px',
                  textAlign: 'center',
                  background: activeStandardView === v.id ? 'rgba(56, 189, 248, 0.25)' : undefined,
                  borderColor: activeStandardView === v.id ? 'rgba(56, 189, 248, 0.5)' : undefined,
                  color: activeStandardView === v.id ? '#38bdf8' : undefined,
                  fontWeight: activeStandardView === v.id ? 700 : 500,
                }}
                onClick={() => setView(v.id as any)}
                title={`${v.label} (${v.shortcut})`}
              >
                {v.label}
              </button>
            ))}
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
