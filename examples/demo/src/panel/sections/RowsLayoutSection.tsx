import {
  ColorField,
  DashField,
  Section,
  SelectField,
  SliderField,
  ToggleField,
  type SelectOption,
} from '../controls';
import type { LayoutKey, PlacementKey, StreamingLayoutKey } from '../config';
import type { SectionViewProps } from './types';

const LAYOUTS: ReadonlyArray<SelectOption<LayoutKey>> = [
  { value: 'byFirstEvent', label: 'By first event' },
  { value: 'barycenter', label: 'Barycenter (fewer crossings)' },
  { value: 'explicit', label: 'Explicit order' },
];

const PLACEMENTS: ReadonlyArray<SelectOption<PlacementKey>> = [
  { value: 'midpoint', label: 'Midpoint' },
  { value: 'sourceNode', label: 'Source node' },
];

const STREAMING: ReadonlyArray<SelectOption<StreamingLayoutKey>> = [
  { value: 'stable-append', label: 'Stable append' },
  { value: 'full', label: 'Full relayout' },
];

export function RowsLayoutSection({ config, bind }: SectionViewProps) {
  const t = config.theme;
  const o = config.options;
  const sep = t.rowSeparator;
  return (
    <Section title="Rows & layout">
      <SliderField
        label="Row height"
        unit="px"
        min={12}
        max={64}
        value={t.rowHeight}
        onChange={bind<number>('theme', 'rowHeight')}
      />
      <SliderField
        label="Row gap"
        unit="px"
        min={0}
        max={32}
        value={t.rowGap}
        onChange={bind<number>('theme', 'rowGap')}
      />
      <SliderField
        label="Label padding"
        unit="px"
        min={0}
        max={32}
        value={t.labelPadding}
        onChange={bind<number>('theme', 'labelPadding')}
      />
      <SliderField
        label="Line lead"
        unit="px"
        min={0}
        max={48}
        value={t.lineLeadPadding}
        onChange={bind<number>('theme', 'lineLeadPadding')}
      />
      <SliderField
        label="Marker gap"
        unit="px"
        min={0}
        max={32}
        value={t.markerGap}
        onChange={bind<number>('theme', 'markerGap')}
      />
      <SliderField
        label="Event label gap"
        unit="px"
        min={0}
        max={24}
        value={t.eventLabelGap}
        onChange={bind<number>('theme', 'eventLabelGap')}
      />

      <ToggleField
        label="Row separators"
        value={sep.enabled}
        onChange={bind<boolean>('theme', 'rowSeparator', 'enabled')}
      />
      <ColorField
        label="Separator color"
        value={sep.color}
        onChange={bind<string>('theme', 'rowSeparator', 'color')}
      />
      <SliderField
        label="Separator width"
        unit="px"
        min={0}
        max={4}
        step={0.5}
        value={sep.width}
        onChange={bind<number>('theme', 'rowSeparator', 'width')}
      />
      <DashField
        label="Separator dash"
        value={sep.dash}
        onChange={bind<number[]>('theme', 'rowSeparator', 'dash')}
      />

      <SelectField<LayoutKey>
        label="Layout"
        value={o.layout}
        options={LAYOUTS}
        onChange={bind<LayoutKey>('options', 'layout')}
      />
      <SelectField<PlacementKey>
        label="Event label placement"
        value={o.eventLabelPlacement}
        options={PLACEMENTS}
        onChange={bind<PlacementKey>('options', 'eventLabelPlacement')}
      />
      <ToggleField
        label="Multi-select"
        value={o.multiSelect}
        onChange={bind<boolean>('options', 'multiSelect')}
      />
      <SelectField<StreamingLayoutKey>
        label="Streaming layout"
        value={o.streamingLayout}
        options={STREAMING}
        onChange={bind<StreamingLayoutKey>('options', 'streamingLayout')}
      />
      <SliderField
        label="Layout debounce"
        unit="ms"
        min={0}
        max={500}
        step={10}
        value={o.layoutDebounceMs}
        onChange={bind<number>('options', 'layoutDebounceMs')}
      />
    </Section>
  );
}
