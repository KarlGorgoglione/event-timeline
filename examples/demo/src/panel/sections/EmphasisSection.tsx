import { ColorField, Section, SliderField } from '../controls';
import type { SectionViewProps } from './types';

export function EmphasisSection({ config, bind }: SectionViewProps) {
  const t = config.theme;
  return (
    <Section title="Emphasis & clusters">
      <ColorField
        label="Hover color"
        value={t.hoverColor}
        onChange={bind<string>('theme', 'hoverColor')}
      />
      <ColorField
        label="Selection color"
        value={t.selectionColor}
        onChange={bind<string>('theme', 'selectionColor')}
      />
      <SliderField
        label="Hover width bonus"
        unit="px"
        min={0}
        max={6}
        step={0.5}
        value={t.hoverWidthBonus}
        onChange={bind<number>('theme', 'hoverWidthBonus')}
      />
      <SliderField
        label="Selection width bonus"
        unit="px"
        min={0}
        max={6}
        step={0.5}
        value={t.selectionWidthBonus}
        onChange={bind<number>('theme', 'selectionWidthBonus')}
      />
      <SliderField
        label="Emphasis radius bonus"
        unit="px"
        min={0}
        max={6}
        step={0.5}
        value={t.emphasisRadiusBonus}
        onChange={bind<number>('theme', 'emphasisRadiusBonus')}
      />
      <ColorField
        label="Cluster color"
        value={t.clusterColor}
        onChange={bind<string>('theme', 'clusterColor')}
      />
      <ColorField
        label="Cluster text"
        value={t.clusterTextColor}
        onChange={bind<string>('theme', 'clusterTextColor')}
      />
      <SliderField
        label="Cluster marker bonus"
        unit="px"
        min={0}
        max={8}
        step={0.5}
        value={t.clusterMarkerBonus}
        onChange={bind<number>('theme', 'clusterMarkerBonus')}
      />
    </Section>
  );
}
