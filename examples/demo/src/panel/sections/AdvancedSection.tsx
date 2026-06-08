import { Section, ToggleField } from '../controls';
import type { SectionViewProps } from './types';

/**
 * Toggles for the data-driven hooks (§11): the palette resolvers and the label
 * formatters. Kept as plain on/off switches so the feature surface stays
 * exercised in the demo even though the panel edits the theme directly.
 */
export function AdvancedSection({ config, bind }: SectionViewProps) {
  return (
    <Section title="Data hooks">
      <ToggleField
        label="Data-driven colours"
        value={config.resolvers}
        onChange={bind<boolean>('resolvers')}
      />
      <ToggleField
        label="Uppercase labels"
        value={config.formatters}
        onChange={bind<boolean>('formatters')}
      />
    </Section>
  );
}
