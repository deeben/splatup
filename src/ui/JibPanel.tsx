import { useApp } from '../core/store';
import { LiveRange, NumberField } from './fields';
import type { JibCraneObject } from '../core/types';
import { STEEL_CATALOGUE } from '../viewport/geometry/steelSections';
import { computeJibMetrics } from '../viewport/geometry/jibCrane';

const SWL_OPTIONS = [250, 500, 1000, 2000, 3000, 5000];

/** Two-way (or more) toggle in the same style as the beam alignment buttons. */
function Choice<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; title: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className="mini-add-btn"
              title={opt.title}
              style={{
                padding: '3px 6px',
                background: on ? '#facc15' : undefined,
                color: on ? '#000' : undefined,
                fontWeight: on ? 700 : 500,
              }}
              onClick={() => onPick(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionSelect({
  label,
  value,
  categories,
  onPick,
}: {
  label: string;
  value: string;
  categories: ('UB' | 'UC')[];
  onPick: (v: string) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <select className="field-select" style={{ maxWidth: 160 }} value={value} onChange={(e) => onPick(e.target.value)}>
        {categories.map((cat) => (
          <optgroup key={cat} label={cat === 'UB' ? 'Universal Beams (UB)' : 'Universal Columns (UC)'}>
            {Object.values(STEEL_CATALOGUE)
              .filter((s) => s.category === cat)
              .map((s) => (
                <option key={s.name} value={s.name}>
                  {s.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Properties for a column-mounted jib crane. */
export function JibPanel({ obj }: { obj: JibCraneObject }) {
  const updateObject = useApp((s) => s.updateObject);
  const m = computeJibMetrics(obj);
  const set = (fn: (o: JibCraneObject) => unknown) =>
    updateObject(obj.id, (o) => {
      fn(o as JibCraneObject);
    });

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 8 }}>
        <div className="kpi-card">
          <div className="kpi-label">SWL</div>
          <div className="kpi-value-sm">{obj.swl >= 1000 ? `${obj.swl / 1000} t` : `${obj.swl} kg`}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Est. Steel Mass</div>
          <div className="kpi-value-sm">{m.massKg.toFixed(0)} kg</div>
        </div>
      </div>

      <Choice
        label="Mounting"
        value={obj.mounting}
        options={[
          { value: 'boltOn', label: 'Bolt-on', title: 'Clamp plates either side of the column flange, M24 through-rods. No welding to the column.' },
          { value: 'weldOn', label: 'Weld-on', title: 'Bracket plates fillet welded straight to the column flange.' },
        ]}
        onPick={(v) => set((o) => (o.mounting = v))}
      />

      <Choice
        label="Bracing"
        value={obj.bracing}
        options={[
          { value: 'lowHeadroom', label: 'Low headroom', title: 'Boom at the top, knee brace underneath. Little steel above the boom, but the brace stops the hoist short of the column.' },
          { value: 'overBraced', label: 'Over-braced', title: 'Tie bar above the boom to a top bracket. Needs headroom above, but the hoist can run almost to the column.' },
        ]}
        onPick={(v) => set((o) => (o.bracing = v))}
      />

      <NumberField label="Span (pin to tip)" value={obj.span} min={800} max={10000} onCommit={(v) => set((o) => (o.span = v))} />
      <NumberField
        label="Pin Centres"
        title={obj.bracing === 'lowHeadroom' ? 'Vertical distance from the top pin down to the bottom pin' : 'Vertical distance from the boom pin up to the tie-bar pin'}
        value={obj.bracketCentres}
        min={400}
        max={4000}
        onCommit={(v) => set((o) => (o.bracketCentres = v))}
      />

      <SectionSelect label="Boom Section" value={obj.boomSection} categories={['UB', 'UC']} onPick={(v) => set((o) => (o.boomSection = v))} />
      <SectionSelect label="Column Section" value={obj.columnSection} categories={['UC', 'UB']} onPick={(v) => set((o) => (o.columnSection = v))} />

      <div className="field">
        <span className="field-label">SWL</span>
        <select className="field-select" style={{ maxWidth: 160 }} value={obj.swl} onChange={(e) => set((o) => (o.swl = Number(e.target.value)))}>
          {SWL_OPTIONS.map((kg) => (
            <option key={kg} value={kg}>
              {kg >= 1000 ? `${kg / 1000} t` : `${kg} kg`}
            </option>
          ))}
        </select>
      </div>

      <label className="slider-row">
        <div className="slider-label-row">
          <span>Slew Angle</span>
          <span>{Math.round(obj.slewAngle)}°</span>
        </div>
        <LiveRange
          min="-90"
          max="90"
          step="5"
          value={obj.slewAngle}
          apply={(d, v) => {
            const o = d.objects.find((x) => x.id === obj.id);
            if (o) (o as JibCraneObject).slewAngle = v;
          }}
        />
      </label>

      <label className="toggle-row">
        <span>Show Hoist &amp; Trolley</span>
        <input type="checkbox" checked={obj.showHoist} onChange={(e) => set((o) => (o.showHoist = e.target.checked))} />
      </label>

      {obj.showHoist && (
        <label className="slider-row">
          <div className="slider-label-row">
            <span>Trolley Position</span>
            <span>{m.trolleyPosition} mm</span>
          </div>
          <LiveRange
            min={m.minHookApproach}
            max={m.maxHookReach}
            step="50"
            value={m.trolleyPosition}
            apply={(d, v) => {
              const o = d.objects.find((x) => x.id === obj.id);
              if (o) (o as JibCraneObject).trolleyPosition = v;
            }}
          />
        </label>
      )}

      <label className="toggle-row">
        <span>Show Column Stub</span>
        <input type="checkbox" checked={obj.showColumn} onChange={(e) => set((o) => (o.showColumn = e.target.checked))} />
      </label>

      <div className="info-row">
        <span>Hook reach from pin:</span>
        <span className="info-val">
          {m.minHookApproach}–{m.maxHookReach} mm
        </span>
      </div>
      <div className="info-row">
        <span>Steel above TOS:</span>
        <span className="info-val">{m.headroomAboveTos} mm</span>
      </div>
      <div className="info-row">
        <span>Brackets below TOS:</span>
        <span className="info-val">{m.bracketDepthBelowTos} mm</span>
      </div>
      <div className="info-row" style={{ marginBottom: 8 }}>
        <span>Brace:</span>
        <span className="info-val">{m.braceLabel}</span>
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.4 }}>
        Origin is on the column face at top of boom. Bracket, pin and brace sizes are
        typical proportions for layout and clash checks, not a structural design.
      </div>
    </>
  );
}
