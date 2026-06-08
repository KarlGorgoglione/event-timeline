import { useId } from 'react';
import { Field } from './Field';
import type { SelectOption } from './SelectField';

/**
 * A font edited as structured `{ size, family }` rather than a CSS shorthand
 * string, so the size slides and the family picks cleanly. The host serialises
 * it back to a `"<size>px <family>"` shorthand when building the theme. Rendered
 * as one {@link Field} row whose control holds both inputs side by side.
 */
export interface FontValue {
  size: number;
  family: string;
}

export interface FontFieldProps {
  label: string;
  value: FontValue;
  onChange: (value: FontValue) => void;
  families?: ReadonlyArray<SelectOption<string>>;
}

const DEFAULT_FAMILIES: ReadonlyArray<SelectOption<string>> = [
  { value: 'system-ui, sans-serif', label: 'System' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Georgia, serif', label: 'Serif' },
  { value: 'ui-monospace, monospace', label: 'Mono' },
];

export function FontField({
  label,
  value,
  onChange,
  families = DEFAULT_FAMILIES,
}: FontFieldProps) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <span className="etd-font">
        <input
          id={id}
          type="number"
          className="etd-font__size"
          min={8}
          max={32}
          step={1}
          value={value.size}
          aria-label={`${label} size`}
          onChange={(e) => {
            const size = Number(e.target.value);
            if (!Number.isNaN(size)) onChange({ ...value, size });
          }}
        />
        <select
          className="etd-select etd-font__family"
          value={value.family}
          aria-label={`${label} family`}
          onChange={(e) => onChange({ ...value, family: e.target.value })}
        >
          {families.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </span>
    </Field>
  );
}
