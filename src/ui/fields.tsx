import { useEffect, useState, type ReactNode } from 'react';
import { evalExpr, fmtNum } from '../core/units';

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
