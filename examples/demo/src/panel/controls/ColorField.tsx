import { useId } from 'react';
import { Field } from './Field';

/**
 * A colour control. The native `<input type="color">` swatch only understands
 * `#rrggbb`, but the theme uses `transparent` and `rgba(...)` too — so the hex
 * **text input is the source of truth** and round-trips any CSS colour, while
 * the swatch is a best-effort picker that writes back a hex when used.
 */
export interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const id = useId();
  const swatch = HEX.test(value) ? value : '#000000';
  return (
    <Field label={label} htmlFor={id}>
      <span className="etd-color">
        <input
          type="color"
          className="etd-color__swatch"
          value={swatch}
          aria-label={`${label} swatch`}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={id}
          type="text"
          className="etd-color__hex"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </Field>
  );
}
