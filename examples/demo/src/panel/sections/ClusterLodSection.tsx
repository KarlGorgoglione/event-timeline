import {
  Section,
  SelectField,
  SliderField,
  ToggleField,
  type SelectOption,
} from '../controls';
import type { ClusterKey } from '../config';
import type { SectionViewProps } from './types';

const STRATEGIES: ReadonlyArray<SelectOption<ClusterKey>> = [
  { value: 'bySourceTargetColumn', label: 'Source→target column' },
  { value: 'byElementPair', label: 'Element pair' },
  { value: 'byPixelColumn', label: 'Pixel column' },
  { value: 'byDay', label: 'Calendar day' },
];

export function ClusterLodSection({ config, bind }: SectionViewProps) {
  const c = config.options.clustering;
  return (
    <Section title="Clustering & LOD">
      <ToggleField
        label="Clustering"
        value={c.enabled}
        onChange={bind<boolean>('options', 'clustering', 'enabled')}
      />
      <SelectField<ClusterKey>
        label="Cluster strategy"
        value={c.strategy}
        options={STRATEGIES}
        onChange={bind<ClusterKey>('options', 'clustering', 'strategy')}
      />
      <SliderField
        label="Min separation"
        unit="px"
        min={2}
        max={64}
        value={c.minSeparationPx}
        onChange={bind<number>('options', 'clustering', 'minSeparationPx')}
      />
      <SliderField
        label="Event labels at"
        unit="px/day"
        min={1}
        max={200}
        value={config.options.lodEventLabelPxPerDay}
        onChange={bind<number>('options', 'lodEventLabelPxPerDay')}
      />
    </Section>
  );
}
