import {
  ColorField,
  DashField,
  FontField,
  Section,
  SliderField,
  type FontValue,
} from '../controls';
import type { SectionViewProps } from './types';

export function CanvasSection({ config, bind }: SectionViewProps) {
  const t = config.theme;
  return (
    <Section title="Canvas & header">
      <ColorField
        label="Background"
        value={t.background}
        onChange={bind<string>('theme', 'background')}
      />
      <ColorField
        label="Gridline color"
        value={t.gridlineColor}
        onChange={bind<string>('theme', 'gridlineColor')}
      />
      <SliderField
        label="Gridline width"
        unit="px"
        min={0}
        max={6}
        step={0.5}
        value={t.gridlineWidth}
        onChange={bind<number>('theme', 'gridlineWidth')}
      />
      <DashField
        label="Gridline dash"
        value={t.gridlineDash}
        onChange={bind<number[]>('theme', 'gridlineDash')}
      />
      <ColorField
        label="Header text"
        value={t.headerTextColor}
        onChange={bind<string>('theme', 'headerTextColor')}
      />
      <FontField
        label="Header font"
        value={t.headerFont}
        onChange={bind<FontValue>('theme', 'headerFont')}
      />
      <SliderField
        label="Header height"
        unit="px"
        min={28}
        max={80}
        value={t.headerHeight}
        onChange={bind<number>('theme', 'headerHeight')}
      />
      <SliderField
        label="Major tick pos"
        min={0}
        max={1}
        step={0.02}
        value={t.headerMajorTickRatio}
        onChange={bind<number>('theme', 'headerMajorTickRatio')}
      />
      <SliderField
        label="Minor tick pos"
        min={0}
        max={1}
        step={0.02}
        value={t.headerMinorTickRatio}
        onChange={bind<number>('theme', 'headerMinorTickRatio')}
      />
    </Section>
  );
}
