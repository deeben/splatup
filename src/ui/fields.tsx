import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Draft } from 'immer';
import { evalExpr, fmtNum } from '../core/units';
import { useApp } from '../core/store';
import type { Project } from '../core/types';

interface NumberFieldProps {
  label: ReactNode;
  value: number;
  onCommit: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  title?: string;
}

/**
 * Numeric input that commits on Enter/blur (one undo step per edit) and
 * accepts arithmetic, e.g. "1200+2*50".
 */
export function NumberField({ label, value, onCommit, suffix = 'mm', min, max, title }: NumberFieldProps) {
  const [text, setText] = useState(fmtNum(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(fmtNum(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    // Untouched field: don't commit the rounded display value over the real one.
    if (text.trim() === fmtNum(value)) return setInvalid(false);
    const v = evalExpr(text);
    if (v == null || (min != null && v < min) || (max != null && v > max)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (Math.abs(v - value) > 1e-6) onCommit(v);
    else setText(fmtNum(value));
  };

  return (
    <label className="field" title={title}>
      <span className="field-label">{label}</span>
      <span className={`field-input${invalid ? ' invalid' : ''}`}>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
              (e.target as HTMLInputElement).select();
            }
            if (e.key === 'Escape') {
              setText(fmtNum(value));
              (e.target as HTMLInputElement).blur();
            }
          }}
          onFocus={(e) => e.target.select()}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const t = text.trim();
    if (t && t !== value) onCommit(t);
    else setText(value);
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </span>
    </label>
  );
}

/**
 * Range slider that updates the document live while dragging but records a
 * single undo step when the drag (or keyboard nudge) ends.
 */
export function LiveRange({
  value,
  min,
  max,
  step,
  className,
  apply,
}: {
  value: number;
  min: number | string;
  max: number | string;
  step: number | string;
  className?: string;
  /** Write the new value into the draft document. */
  apply: (d: Draft<Project>, v: number) => void;
}) {
  const snapshot = useRef<Project | null>(null);

  const finish = () => {
    if (snapshot.current) {
      useApp.getState().commitChange(snapshot.current);
      snapshot.current = null;
    }
  };

  return (
    <input
      type="range"
      className={className}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!snapshot.current) snapshot.current = useApp.getState().doc;
        useApp.getState().updateDocLive((d) => apply(d, v));
      }}
      onPointerUp={finish}
      onKeyUp={finish}
      onBlur={finish}
    />
  );
}
