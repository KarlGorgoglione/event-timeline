import { useId } from 'react';
import { Field } from './Field';

/** One choice in a {@link SelectField}; `value` is the stored key, `label` the caption. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A generic enum dropdown over string-keyed options. Constraining the value to
 * `string` keeps the `<select>`'s string event value safe to narrow back to `T`.
 */
export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        className="etd-select"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
