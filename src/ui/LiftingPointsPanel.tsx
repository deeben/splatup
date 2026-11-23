import type { CSSProperties } from 'react';
import { useApp } from '../core/store';
import { uid } from '../core/units';
import { NumberField } from './fields';
import type { BeamLiftingPoint, LiftingPointType, SteelBeamObject } from '../core/types';
import { STEEL_CATALOGUE, DEFAULT_SECTION } from '../viewport/geometry/steelSections';
import {
  LIFTING_LABEL,
  autoLateral,
  liftingPointMass,
  nearestWll,
  padeyeSize,
  rudBoltSize,
  wllOptions,
} from '../viewport/geometry/liftingPoints';

/**
 * "Lifting Points" section of the property panel for a steel beam: add,
 * edit and remove padeyes / RUD load rings. Each edit is one undo step.
 */
export function LiftingPointsPanel({ beam }: { beam: SteelBeamObject }) {
  const updateObject = useApp((s) => s.updateObject);
  const points = beam.liftingPoints ?? [];
  const sec = STEEL_CATALOGUE[beam.sectionName] ?? STEEL_CATALOGUE[DEFAULT_SECTION];

  const edit = (fn: (list: BeamLiftingPoint[], b: SteelBeamObject) => void) =>
    updateObject(beam.id, (o) => {
      const b = o as SteelBeamObject;
      b.liftingPoints ??= [];
      fn(b.liftingPoints, b);
      if (b.liftingPoints.length === 0) delete b.liftingPoints;
    });

  const editPoint = (id: string, fn: (p: BeamLiftingPoint) => void) =>
    edit((list) => {
      const p = list.find((x) => x.id === id);
      if (p) fn(p);
    });

  const add = (type: LiftingPointType) =>
    edit((list, b) => {
      list.push({
        id: uid('lp_'),
        type,
        offset: Math.round(biggestGapMid(list.map((p) => p.offset), b.length)),
        // Padeyes usually hang a chain block under the beam; rings usually lift the beam itself.
        face: type === 'padeye' ? 'bottom' : 'top',
        wll: type === 'padeye' ? 2 : 2.5,
        orientation: 'along',
      });
    });

  const spreadEvenly = () =>
    edit((list, b) => {
      const sorted = [...list].sort((a, c) => a.offset - c.offset);
      sorted.forEach((p, i) => {
        p.offset = Math.round((b.length * (i + 1)) / (sorted.length + 1));
      });
    });

  return (
    <div className="section-group">
      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Lifting Points</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="mini-add-btn" onClick={() => add('padeye')} title="Add a welded padeye plate">
            + Padeye
          </button>
          <button type="button" className="mini-add-btn" onClick={() => add('rudWeld')} title="Add a RUD-style load ring">
            + RUD Ring
          </button>
        </span>
      </div>

      {points.length === 0 && (
        <div className="subtext">Padeyes and RUD load rings fitted to this beam. Drag the blue handles at each eye to slide it along the beam.</div>
      )}

      {points.map((p, i) => {
        const lateralAuto = autoLateral(sec, p);
        return (
          <div key={p.id} style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {i + 1}. {LIFTING_LABEL[p.type]}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="subtext">{liftingPointMass(p).toFixed(1)} kg</span>
                <button
                  type="button"
                  className="mini-add-btn"
                  title="Remove this lifting point"
                  onClick={() => edit((list) => list.splice(list.findIndex((x) => x.id === p.id), 1))}
                >
                  ✕
                </button>
              </span>
            </div>

            <div className="field">
              <span className="field-label">Type</span>
              <select
                className="field-select"
                value={p.type}
                onChange={(e) =>
                  editPoint(p.id, (d) => {
                    d.type = e.target.value as LiftingPointType;
                    d.wll = nearestWll(d.type, d.wll);
                    delete d.lateral; // auto position differs for bolt-on
                  })
                }
              >
                <option value="padeye">Padeye (welded plate)</option>
                <option value="rudWeld">RUD ring – weld-on</option>
                <option value="rudBolt">RUD ring – bolt-on swivel</option>
              </select>
            </div>

            <div className="field">
              <span className="field-label">WLL</span>
              <select
                className="field-select"
                value={p.wll}
                onChange={(e) => editPoint(p.id, (d) => void (d.wll = parseFloat(e.target.value)))}
              >
                {wllOptions(p.type).map((w) => (
                  <option key={w} value={w}>
                    {w} t{sizeNote(p.type, w)}
                  </option>
                ))}
              </select>
            </div>

            <NumberField
              label="From Start"
              value={p.offset}
              min={0}
              max={beam.length}
              title="Distance along the beam from its start point"
              onCommit={(v) => editPoint(p.id, (d) => void (d.offset = v))}
            />

            <div className="field">
              <span className="field-label">Face</span>
              <Toggle
                options={[
                  ['top', 'Top flange'],
                  ['bottom', 'Bottom flange'],
                ]}
                value={p.face}
                onChange={(v) => editPoint(p.id, (d) => void (d.face = v as BeamLiftingPoint['face']))}
              />
            </div>

            <div className="field">
              <span className="field-label">{p.type === 'padeye' ? 'Plate' : 'Ring'}</span>
              <Toggle
                options={[
                  ['along', 'In line'],
                  ['across', 'Across'],
                ]}
                value={p.orientation}
                onChange={(v) => editPoint(p.id, (d) => void (d.orientation = v as BeamLiftingPoint['orientation']))}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ flex: 1 }}>
                <NumberField
                  label={p.lateral == null ? 'Across (auto)' : 'Across'}
                  value={p.lateral ?? lateralAuto}
                  min={-sec.flangeWidth / 2}
                  max={sec.flangeWidth / 2}
                  title="Offset across the flange from the section centreline. Bolt-on rings default to the middle of a flange outstand, clear of the web."
                  onCommit={(v) => editPoint(p.id, (d) => void (d.lateral = v))}
                />
              </div>
              {p.lateral != null && (
                <button
                  type="button"
                  className="mini-add-btn"
                  title="Back to the automatic position"
                  onClick={() => editPoint(p.id, (d) => void delete d.lateral)}
                >
                  Auto
                </button>
              )}
            </div>
          </div>
        );
      })}

      {points.length > 1 && (
        <button type="button" className="mini-add-btn" style={{ alignSelf: 'flex-start', padding: '3px 8px' }} onClick={spreadEvenly}>
          Space evenly along beam
        </button>
      )}

      {points.length > 0 && (
        <div className="subtext">Sizes are indicative for layout. Padeye design, welds and rated hardware to be confirmed by the engineer.</div>
      )}
    </div>
  );
}

const CARD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-surface-raised)',
};

function Toggle({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className="mini-add-btn"
          style={{
            padding: '3px 6px',
            background: value === v ? '#facc15' : undefined,
            color: value === v ? '#000' : undefined,
            fontWeight: value === v ? 700 : 500,
          }}
          onClick={() => value !== v && onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Extra hint in the WLL dropdown: shackle for padeyes, bolt size for bolt-on rings. */
function sizeNote(type: LiftingPointType, wll: number): string {
  if (type === 'padeye') return ` · ${padeyeSize(wll).shackle.split(' ')[0]} shackle`;
  if (type === 'rudBolt') return ` · M${rudBoltSize(wll).bolt}`;
  return '';
}

/** Middle of the largest empty stretch of beam, so a new point doesn't land on an old one. */
function biggestGapMid(offsets: number[], length: number): number {
  const stops = [0, ...offsets.filter((x) => x >= 0 && x <= length).sort((a, b) => a - b), length];
  if (stops.length === 2) return length / 2;
  let best = 0;
  let mid = length / 2;
  for (let i = 1; i < stops.length; i++) {
    const gap = stops[i] - stops[i - 1];
    if (gap > best) {
      best = gap;
      mid = (stops[i] + stops[i - 1]) / 2;
    }
  }
  return mid;
}
