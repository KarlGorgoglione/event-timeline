import type { ReactNode } from 'react';

/**
 * The single label + control row used by every panel control (DRY): one place
 * owns the grid layout, the label, and the optional hint, so the concrete
 * controls only render their input. `htmlFor` ties the label to a single
 * focusable input for accessibility; composite controls (e.g. a font's
 * size + family) omit it and render a plain caption instead.
 */
export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <div className="etd-field">
      {htmlFor !== undefined ? (
        <label className="etd-field__label" htmlFor={htmlFor} title={hint}>
          {label}
        </label>
      ) : (
        <span className="etd-field__label" title={hint}>
          {label}
        </span>
      )}
      <div className="etd-field__control">{children}</div>
    </div>
  );
}
