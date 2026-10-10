import { useApp } from '../core/store';
import { fmtMm } from '../core/units';

export function StatusBar() {
  const status = useApp((s) => s.status);
  const hover = useApp((s) => s.hover);
  const tool = useApp((s) => s.tool);
  const pendingA = useApp((s) => s.pendingA);

  const defaultHint =
    tool === 'measure'
      ? pendingA
        ? 'Click 2nd point to finish · Hold Shift to lock axis · Esc to cancel'
        : 'Click 1st point on scan or block · Esc to cancel'
      : tool === 'polyShape'
        ? 'Click corners to draw platform/duct polygon · Click 1st point or Enter to close · Esc to cancel'
        : tool === 'handrail'
          ? 'Click start point of Monowills handrail · Click end point to place · Esc to cancel'
          : tool === 'gate'
            ? 'Click on floor/scan surface to place Monowills safety swing gate'
            : tool === 'ladder'
              ? 'Click on floor/scan surface to place AS 1657 access ladder'
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
          <span className="unit-badge">mm</span>
          <span className="unit-badge">Z-Up</span>
        </div>
      </div>
    </footer>
  );
}
