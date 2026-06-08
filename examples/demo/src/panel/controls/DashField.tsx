import { SelectField, type SelectOption } from './SelectField';

/**
 * A stroke-dash control. The engine wants a `LineDash` (`number[]`, `[]` =
 * solid), which is awkward to edit raw — so this maps a small set of named
 * presets to patterns and back, presenting them as an ordinary dropdown.
 */
export interface DashFieldProps {
  label: string;
  value: number[];
  onChange: (value: number[]) => void;
}

const DASH_PATTERNS = {
  solid: [],
  dashed: [6, 3],
  dotted: [1, 3],
  'dash-dot': [6, 3, 1, 3],
} as const satisfies Record<string, readonly number[]>;

type DashPreset = keyof typeof DASH_PATTERNS;

const OPTIONS: ReadonlyArray<SelectOption<DashPreset>> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dash-dot', label: 'Dash-dot' },
];

/** Identify the preset a pattern came from (by value), defaulting to solid. */
function toPreset(value: number[]): DashPreset {
  const key = JSON.stringify(value);
  for (const preset of Object.keys(DASH_PATTERNS) as DashPreset[]) {
    if (JSON.stringify(DASH_PATTERNS[preset]) === key) return preset;
  }
  return 'solid';
}

export function DashField({ label, value, onChange }: DashFieldProps) {
  return (
    <SelectField<DashPreset>
      label={label}
      value={toPreset(value)}
      options={OPTIONS}
      onChange={(preset) => onChange([...DASH_PATTERNS[preset]])}
    />
  );
}
