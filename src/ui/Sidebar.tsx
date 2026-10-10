import { useState } from 'react';
import { useApp } from '../core/store';
import { Icon } from './Icon';
import { fmtMm, measureParts } from '../core/units';

export function Sidebar() {
  const doc = useApp((s) => s.doc);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const updateObject = useApp((s) => s.updateObject);
  const updateScan = useApp((s) => s.updateScan);
  const setTool = useApp((s) => s.setTool);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`panel-drawer left-drawer ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title-text">Outliner</div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand Outliner' : 'Collapse Outliner'}
        >
          <span style={{ fontSize: 13 }}>{collapsed ? '▶' : '◀'}</span>
        </button>
      </div>

      {!collapsed && (
        <div className="panel-body outliner-scroll">
          {/* SCANS SECTION */}
          <div className="outliner-section">
            <div className="outliner-section-header">
              <span className="outliner-section-title">
                <Icon name="scan" size={14} /> Scans ({doc.scans.length})
              </span>
            </div>

            <div className="outliner-list">
              {doc.scans.length === 0 ? (
                <div className="outliner-empty">No scans loaded. Drop a GLB or click Import.</div>
              ) : (
                doc.scans.map((s) => {
                  const isSelected = selection?.type === 'scan' && selection.id === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`outliner-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => select({ type: 'scan', id: s.id })}
                    >
                      <button
                        type="button"
                        className="vis-toggle"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateScan(s.id, { visible: !s.visible });
                        }}
                        title={s.visible ? 'Hide scan' : 'Show scan'}
                      >
                        <Icon name={s.visible ? 'eye' : 'eyeOff'} size={14} />
                      </button>
                      <span className="outliner-label" title={s.name}>
                        {s.name}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* OBJECTS SECTION */}
          <div className="outliner-section">
            <div className="outliner-section-header">
              <span className="outliner-section-title">
                <Icon name="box" size={14} /> Block Models ({doc.objects.length})
              </span>
              <div className="header-actions">
                <button
                  type="button"
                  className="mini-add-btn"
                  onClick={() => setTool('box')}
                  title="Add Box Block"
                >
                  + Box
                </button>
                <button
                  type="button"
                  className="mini-add-btn"
                  onClick={() => setTool('polyShape')}
                  title="Draw Custom Shape / Platform (P)"
                >
                  + Shape
                </button>
                <button
                  type="button"
                  className="mini-add-btn"
                  onClick={() => setTool('handrail')}
                  title="Draw Monowills Handrail Run (H)"
                >
                  + Rail
                </button>
                <button
                  type="button"
                  className="mini-add-btn"
                  onClick={() => setTool('stairs')}
                  title="Draw / Place Industrial Stairs (T)"
                >
                  + Stairs
                </button>
                <button
                  type="button"
                  className="mini-add-btn"
                  onClick={() => setTool('beam')}
                  title="Draw / Place Steel Beam (S)"
                >
                  + Beam
                </button>
              </div>
            </div>

            <div className="outliner-list">
              {doc.objects.length === 0 ? (
                <div className="outliner-empty">No block models. Click + Box or + Cyl to place.</div>
              ) : (
                doc.objects.map((o) => {
                  const isSelected = selection?.type === 'object' && selection.id === o.id;
                  return (
                    <div
                      key={o.id}
                      className={`outliner-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => select({ type: 'object', id: o.id })}
                    >
                      <button
                        type="button"
                        className="vis-toggle"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateObject(o.id, (obj) => {
                            obj.visible = !obj.visible;
                          });
                        }}
                        title={o.visible ? 'Hide' : 'Show'}
                      >
                        <Icon name={o.visible ? 'eye' : 'eyeOff'} size={14} />
                      </button>
                      <span className="swatch-dot" style={{ backgroundColor: o.color }} />
                      <span className="outliner-label" title={o.name}>
                        {o.name}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* MEASUREMENTS SECTION */}
          <div className="outliner-section">
            <div className="outliner-section-header">
              <span className="outliner-section-title">
                <Icon name="measure" size={14} /> Measurements ({doc.measurements.length})
              </span>
              <button
                type="button"
                className="mini-add-btn"
                onClick={() => setTool('measure')}
                title="Measure distance"
              >
                + Measure
              </button>
            </div>

            <div className="outliner-list">
              {doc.measurements.length === 0 ? (
                <div className="outliner-empty">No measurements taken. Press M to measure.</div>
              ) : (
                doc.measurements.map((m) => {
                  const isSelected = selection?.type === 'measurement' && selection.id === m.id;
                  const p = measureParts(m.a, m.b);
                  return (
                    <div
                      key={m.id}
                      className={`outliner-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => select({ type: 'measurement', id: m.id })}
                    >
                      <span className="outliner-badge">M</span>
                      <span className="outliner-label" title={m.name}>
                        {m.name}
                      </span>
                      <span className="outliner-val">{fmtMm(p.total)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
