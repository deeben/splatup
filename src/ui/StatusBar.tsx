import { useApp } from '../core/store';
import { fmtMm } from '../core/units';

export function StatusBar() {
  const status = useApp((s) => s.status);
  const hover = useApp((s) => s.hover);
  const tool = useApp((s) => s.tool);
  const pendingA = useApp((s) => s.pendingA);

  const sceneAlignment = useApp((s) => s.doc.sceneAlignment ?? 0);
  const frontViewAngle = useApp((s) => s.doc.frontViewAngle ?? s.doc.sceneAlignment ?? 0);
  const activeView = useApp((s) => s.activeStandardView);
  const setView = useApp((s) => s.setView);
  const setTool = useApp((s) => s.setTool);

  const defaultHint =
    tool === 'measure'
      ? pendingA
        ? 'Click 2nd point to finish · Hold Shift to lock axis · Esc to cancel'
        : 'Click 1st point on scan or block · Esc to cancel'
      : tool === 'align'
        ? pendingA
          ? 'Click 2nd point along wall or edge to set scene alignment · Esc to cancel'
          : 'Click 1st point along a wall or beam in scan to align scene · Esc to cancel'
      : tool === 'polyShape'
        ? 'Click corners to draw platform/duct polygon · Click 1st point or Enter to close · Esc to cancel'
        : tool === 'handrail'
          ? 'Click start point of Monowills handrail · Click end point to place · Esc to cancel'
          : tool === 'gate'
            ? 'Click on floor/scan surface to place Monowills safety swing gate'
            : tool === 'ladder'
              ? 'Click on floor/scan surface to place AS 1657 access ladder'
              : tool === 'stairs'
                ? 'Click bottom landing, then top landing to place AS 1657 stairs · Esc to cancel'
                : tool === 'beam'
                  ? 'Click start point, then end point to place steel beam · Esc to cancel'
                  : tool === 'box'
                    ? 'Click on scan surface to place box · Esc to cancel'
                    : tool === 'cylinder'
                      ? 'Click on scan surface to place cylinder/duct · Esc to cancel'
                      : 'Double-click scan to orbit target · Left-drag orbit · Right/Mid-drag pan · Wheel zoom';

  const displayStatus = status || defaultHint;

  return (
    <footer className="app-statusbar">
      <div className="status-left">
        <span className="status-dot" />
        <span className="status-message">{displayStatus}</span>
      </div>

      <div className="status-right">
        {hover && (
          <div className="snap-indicator">
            <span className={`snap-pill snap-${hover.kind}`}>
              {hover.axis != null
                ? `Axis ${hover.axis === 0 ? 'X' : hover.axis === 1 ? 'Y' : 'Z'}`
                : hover.kind.toUpperCase()}
            </span>
            <span className="snap-coords">
              [{fmtMm(hover.point[0])}, {fmtMm(hover.point[1])}, {fmtMm(hover.point[2])}]
            </span>
          </div>
        )}

        <div className="status-units">
          <button
            type="button"
            className="unit-badge"
            style={{
              cursor: 'pointer',
              background: sceneAlignment !== 0 ? 'rgba(14, 165, 233, 0.25)' : undefined,
              color: sceneAlignment !== 0 ? '#38bdf8' : undefined,
              border: sceneAlignment !== 0 ? '1px solid rgba(14, 165, 233, 0.4)' : undefined,
            }}
            onClick={() => setTool('align')}
            title="Scene Alignment (A) — Click to square scene to an edge"
          >
            🧭 Align {sceneAlignment.toFixed(1)}°
          </button>
          <button
            type="button"
            className="unit-badge"
            style={{
              cursor: 'pointer',
              background: activeView ? 'rgba(56, 189, 248, 0.25)' : undefined,
              color: activeView ? '#38bdf8' : undefined,
              border: activeView ? '1px solid rgba(56, 189, 248, 0.4)' : undefined,
            }}
            onClick={() => setView('front')}
            title={`Active View: ${activeView ? activeView.toUpperCase() : 'Custom Perspective'} · Front reference: ${frontViewAngle.toFixed(1)}° · Click for Front View (1)`}
          >
            👁 {activeView ? activeView.toUpperCase() : `Front ${frontViewAngle.toFixed(1)}°`}
          </button>
          <span className="unit-badge">mm</span>
          <span className="unit-badge">Z-Up</span>
        </div>
      </div>
    </footer>
  );
}
