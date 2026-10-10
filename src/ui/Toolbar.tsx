import { useApp } from '../core/store';
import { Icon } from './Icon';
import type { Tool } from '../core/types';

export function Toolbar() {
  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);
  const gizmoMode = useApp((s) => s.gizmoMode);
  const setGizmoMode = useApp((s) => s.setGizmoMode);
  const gizmoSpace = useApp((s) => s.gizmoSpace);
  const toggleGizmoSpace = useApp((s) => s.toggleGizmoSpace);
  const gridSnap = useApp((s) => s.gridSnap);
  const setGridSnap = useApp((s) => s.setGridSnap);
  const showGrid = useApp((s) => s.showGrid);
  const setShowGrid = useApp((s) => s.setShowGrid);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const canUndo = useApp((s) => s.past.length > 0);
  const canRedo = useApp((s) => s.future.length > 0);
  const requestFrame = useApp((s) => s.requestFrame);
  const selection = useApp((s) => s.selection);

  const tools: { id: Tool; label: string; icon: string; shortcut: string }[] = [
    { id: 'select', label: 'Select', icon: 'select', shortcut: 'V' },
    { id: 'measure', label: 'Measure (Snap)', icon: 'measure', shortcut: 'M' },
    { id: 'align', label: 'Align Scene to Edge (2 Points)', icon: 'align', shortcut: 'A' },
    { id: 'box', label: 'Add Box / Duct Block', icon: 'box', shortcut: 'B' },
    { id: 'cylinder', label: 'Add Cylinder / Pipe', icon: 'cylinder', shortcut: 'C' },
    { id: 'polyShape', label: 'Custom Shape / Platform (Points)', icon: 'polyShape', shortcut: 'P' },
    { id: 'handrail', label: 'Monowills Handrail (Run)', icon: 'handrail', shortcut: 'H' },
    { id: 'gate', label: 'Safety Swing Gate', icon: 'gate', shortcut: '' },
    { id: 'ladder', label: 'Access Ladder (AS 1657)', icon: 'ladder', shortcut: '' },
    { id: 'stairs', label: 'Industrial Stairs (AS 1657)', icon: 'stairs', shortcut: 'T' },
    { id: 'beam', label: 'Structural Steel Beam (Aus)', icon: 'beam', shortcut: 'S' },
  ];

  return (
    <div className="toolbar-floating" role="toolbar" aria-label="Modelling tools">
      <div className="tool-group">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.shortcut})`}
          >
            <Icon name={t.icon} />
            <span className="tool-badge">{t.shortcut}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      {/* Gizmo Mode (when an object is selected) */}
      <div className="tool-group">
        <button
          type="button"
          className={`tool-btn ${gizmoMode === 'translate' ? 'active' : ''}`}
          onClick={() => setGizmoMode('translate')}
          title="Move / Translate (W)"
          disabled={selection?.type !== 'object'}
        >
          <Icon name="move" />
          <span className="tool-badge">W</span>
        </button>
        <button
          type="button"
          className={`tool-btn ${gizmoMode === 'rotate' ? 'active' : ''}`}
          onClick={() => setGizmoMode('rotate')}
          title="Rotate (E)"
          disabled={selection?.type !== 'object'}
        >
          <Icon name="rotate" />
          <span className="tool-badge">E</span>
        </button>
        <button
          type="button"
          className={`tool-btn ${gizmoSpace === 'local' ? 'active' : ''}`}
          onClick={toggleGizmoSpace}
          title={`Gizmo Space: ${gizmoSpace === 'local' ? 'Object Space (Aligned to Box)' : 'World Space'} (Q)`}
          disabled={selection?.type !== 'object'}
        >
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: -0.2 }}>
            {gizmoSpace === 'local' ? 'OBJ' : 'WLD'}
          </span>
          <span className="tool-badge">Q</span>
        </button>
        <button
          type="button"
          className={`tool-btn ${gridSnap ? 'active' : ''}`}
          onClick={() => setGridSnap(!gridSnap)}
          title={`Gizmo Snap: ${gridSnap ? '10mm / 15° (On)' : 'Free (Off)'} (G)`}
        >
          <Icon name="magnet" />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="tool-group">
        <button
          type="button"
          className={`tool-btn ${showGrid ? 'active' : ''}`}
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Grid"
        >
          <Icon name="grid" />
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={requestFrame}
          title="Frame All / Center View (F)"
        >
          <Icon name="frame" />
          <span className="tool-badge">F</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="tool-group">
        <button
          type="button"
          className="tool-btn"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (⌘Z / Ctrl+Z)"
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (⌘⇧Z / Ctrl+Y)"
        >
          <Icon name="redo" />
        </button>
      </div>
    </div>
  );
}
