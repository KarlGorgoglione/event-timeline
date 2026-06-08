import { useId } from 'react';
import { Field } from './Field';

/**
 * A boolean control rendered as an accessible pill switch. It is a real
 * `<input type="checkbox" role="switch">` styled in CSS, so it stays keyboard-
 * and screen-reader-friendly while looking like a toggle.
 */
export interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleField({ label, value, onChange }: ToggleFieldProps) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="etd-switch"
        checked={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Field>
  );
}
