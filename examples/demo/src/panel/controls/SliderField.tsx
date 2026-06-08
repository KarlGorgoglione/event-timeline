import { useId } from 'react';
import { Field } from './Field';

/**
 * A numeric control pairing a range slider (coarse, draggable) with a number
 * input (precise) over one value, plus an optional unit caption. Both inputs
 * write the same value, so the two stay in sync automatically.
 */
export interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: SliderFieldProps) {
  const id = useId();
  const emit = (raw: string) => {
    const next = Number(raw);
    if (!Number.isNaN(next)) onChange(next);
  };
  return (
    <Field label={label} htmlFor={id}>
      <span className="etd-slider">
        <input
          type="range"
          className="etd-slider__range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => emit(e.target.value)}
        />
        <input
          id={id}
          type="number"
          className="etd-slider__num"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => emit(e.target.value)}
        />
        {unit !== undefined && <span className="etd-slider__unit">{unit}</span>}
      </span>
    </Field>
  );
}
