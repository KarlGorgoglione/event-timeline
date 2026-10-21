// Form controls. Each input is bare (labelled by `aria-label`) so the same
// control serves a field row in the editor and a quick control in Simple view;
// `FieldRow` adds the label, the key path, the hint and the reset button.

import { useId, useState, type ReactNode } from 'react';
import { formatColor, parseColor, toHex } from './color';
import {
  FAMILIES,
  formatFont,
  parseFont,
  type FontValue,
} from '../themes/fonts';
import type { Choice } from '../schema/fields';
import { Reset } from './icons';

// --- Field row ---------------------------------------------------------------

export interface FieldRowProps {
  label: string;
  hint?: string;
  /** Key path, shown as code under the label. */
  path?: string;
  modified?: boolean;
  disabled?: boolean;
  onReset?: () => void;
  htmlFor?: string;
  children: ReactNode;
}

export function FieldRow({
  label,
  hint,
  path,
  modified = false,
  disabled = false,
  onReset,
  htmlFor,
  children,
}: FieldRowProps) {
  return (
    <div
      className="field"
      data-modified={modified || undefined}
      data-disabled={disabled || undefined}
    >
      <div className="field__head">
        <label className="field__label" htmlFor={htmlFor} title={hint}>
          {modified && <span className="field__dot" aria-label="modified" />}
          {label}
        </label>
        {path !== undefined && <code className="field__path">{path}</code>}
      </div>
      <div className="field__control">
        <fieldset disabled={disabled} className="field__fieldset">
          {children}
        </fieldset>
        {onReset !== undefined && (
          <button
            type="button"
            className="icon-btn icon-btn--sm field__reset"
            onClick={onReset}
            disabled={!modified}
            title="Reset to default"
            aria-label={`Reset ${label}`}
          >
            <Reset size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// --- Inputs ------------------------------------------------------------------

interface InputProps<T> {
  value: T;
  onChange: (value: T) => void;
  label: string;
  id?: string;
}

/**
 * Colour: a swatch (painted by CSS, so any colour shows truthfully, over a
 * checkerboard for alpha), the native picker for the hue, an alpha slider and
 * the text, which is the source of truth: a stored `rgba(…)` or `transparent`
 * is kept verbatim until the user edits it.
 */
export function ColorInput({ value, onChange, label, id }: InputProps<string>) {
  const parsed = parseColor(value);
  const alpha = parsed?.a ?? 1;
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="color">
      <span className="color__swatch" style={{ ['--swatch' as string]: value }}>
        <input
          type="color"
          value={parsed ? toHex(parsed) : '#000000'}
          aria-label={`${label}: pick`}
          onChange={(e) => {
            const picked = parseColor(e.target.value);
            if (picked) onChange(formatColor({ ...picked, a: parsed?.a || 1 }));
          }}
        />
      </span>
      <input
        type="range"
        className="color__alpha"
        min={0}
        max={100}
        value={Math.round(alpha * 100)}
        disabled={parsed === null}
        aria-label={`${label}: opacity`}
        title={`Opacity ${Math.round(alpha * 100)}%`}
        style={{
          ['--swatch' as string]: parsed ? toHex(parsed) : 'transparent',
        }}
        onChange={(e) => {
          if (parsed)
            onChange(
              formatColor({ ...parsed, a: Number(e.target.value) / 100 }),
            );
        }}
      />
      <input
        id={id}
        type="text"
        className="input input--mono color__text"
        spellCheck={false}
        value={draft ?? value}
        aria-label={label}
        onChange={(e) => {
          setDraft(e.target.value);
          if (CSS.supports('color', e.target.value)) onChange(e.target.value);
        }}
        onBlur={() => setDraft(null)}
      />
    </span>
  );
}

export interface NumberInputProps extends InputProps<number> {
  min: number;
  max: number;
  step: number;
  unit?: string;
}

/** A range slider for feel plus a number box for precision. */
export function NumberInput({
  value,
  onChange,
  label,
  id,
  min,
  max,
  step,
  unit,
}: NumberInputProps) {
  const emit = (raw: string) => {
    const n = Number(raw);
    if (raw !== '' && Number.isFinite(n)) onChange(n);
  };
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  return (
    <span className="number">
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ['--fill' as string]: `${pct}%` }}
        onChange={(e) => emit(e.target.value)}
      />
      <span className="number__box">
        <input
          id={id}
          type="number"
          className="input input--mono"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={`${label} value`}
          onChange={(e) => emit(e.target.value)}
        />
        {unit !== undefined && <span className="number__unit">{unit}</span>}
      </span>
    </span>
  );
}

export function Toggle({ value, onChange, label, id }: InputProps<boolean>) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="switch"
      checked={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export interface ChoiceInputProps extends InputProps<string> {
  options: readonly Choice[];
}

export function Select({
  value,
  onChange,
  label,
  id,
  options,
}: ChoiceInputProps) {
  return (
    <select
      id={id}
      className="input select"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A radio group drawn as a pill of buttons. */
export function Segmented({
  value,
  onChange,
  label,
  options,
  size = 'md',
}: ChoiceInputProps & { size?: 'sm' | 'md' }) {
  const name = useId();
  return (
    <span
      className={`segmented segmented--${size}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className="segmented__item"
          data-active={o.value === value || undefined}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </span>
  );
}

const DASHES: ReadonlyArray<{ label: string; dash: number[] }> = [
  { label: 'Solid', dash: [] },
  { label: 'Dashed', dash: [6, 4] },
  { label: 'Dotted', dash: [1, 3] },
  { label: 'Dash-dot', dash: [6, 3, 1, 3] },
];

/** Dash presets drawn as their own pattern; any other pattern stays editable as text. */
export function DashInput({ value, onChange, label }: InputProps<number[]>) {
  const key = value.join(',');
  return (
    <span className="dash" role="radiogroup" aria-label={label}>
      {DASHES.map((d) => (
        <button
          key={d.label}
          type="button"
          role="radio"
          aria-checked={d.dash.join(',') === key}
          className="dash__item"
          title={`${d.label} [${d.dash.join(', ')}]`}
          onClick={() => onChange([...d.dash])}
        >
          <svg width="28" height="8" aria-hidden="true">
            <line
              x1="1"
              y1="4"
              x2="27"
              y2="4"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={d.dash.length ? d.dash.join(' ') : undefined}
            />
          </svg>
          <span className="sr-only">{d.label}</span>
        </button>
      ))}
      <input
        type="text"
        className="input input--mono dash__text"
        value={`[${value.join(', ')}]`}
        aria-label={`${label} pattern`}
        onChange={(e) => {
          const nums = e.target.value
            .replace(/[[\]\s]/g, '')
            .split(',')
            .filter(Boolean)
            .map(Number);
          if (nums.every((n) => Number.isFinite(n) && n >= 0)) onChange(nums);
        }}
      />
    </span>
  );
}

const FAMILY_CHOICES: readonly Choice[] = [
  { value: FAMILIES.inter, label: 'Inter' },
  { value: FAMILIES.mono, label: 'JetBrains Mono' },
  { value: FAMILIES.serif, label: 'Georgia (serif)' },
  { value: FAMILIES.system, label: 'System UI' },
];

const WEIGHTS: readonly Choice[] = [
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
];

/** A CSS font shorthand edited as family, weight, size and italic. */
export function FontInput({ value, onChange, label }: InputProps<string>) {
  const font = parseFont(value);
  if (font === null) {
    return (
      <input
        type="text"
        className="input input--mono"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const set = (patch: Partial<FontValue>) =>
    onChange(formatFont({ ...font, ...patch }));
  const families = FAMILY_CHOICES.some((f) => f.value === font.family)
    ? FAMILY_CHOICES
    : [{ value: font.family, label: font.family }, ...FAMILY_CHOICES];
  return (
    <span className="font">
      <select
        className="input select font__family"
        value={font.family}
        aria-label={`${label}: family`}
        onChange={(e) => set({ family: e.target.value })}
      >
        {families.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        className="input select font__weight"
        value={String(font.weight)}
        aria-label={`${label}: weight`}
        onChange={(e) => set({ weight: Number(e.target.value) })}
      >
        {WEIGHTS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="input input--mono font__size"
        min={6}
        max={40}
        step={0.5}
        value={font.size}
        aria-label={`${label}: size in px`}
        onChange={(e) => {
          const size = Number(e.target.value);
          if (size > 0) set({ size });
        }}
      />
      <button
        type="button"
        className="chip font__italic"
        aria-pressed={font.italic}
        title="Italic"
        onClick={() => set({ italic: !font.italic })}
      >
        <em>I</em>
      </button>
    </span>
  );
}

export function TextInput({
  value,
  onChange,
  label,
  id,
  placeholder,
}: InputProps<string> & { placeholder?: string }) {
  return (
    <input
      id={id}
      type="text"
      className="input"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
