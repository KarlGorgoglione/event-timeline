import {
  ColorField,
  DashField,
  FontField,
  Section,
  SliderField,
  type FontValue,
} from '../controls';
import type { SectionViewProps } from './types';

export function ElementsSection({ config, bind }: SectionViewProps) {
  const el = config.theme.element;
  return (
    <Section title="Elements">
      <ColorField
        label="Line color"
        value={el.lineColor}
        onChange={bind<string>('theme', 'element', 'lineColor')}
      />
      <SliderField
        label="Line width"
        unit="px"
        min={0.5}
        max={8}
        step={0.5}
        value={el.lineWidth}
        onChange={bind<number>('theme', 'element', 'lineWidth')}
      />
      <DashField
        label="Line dash"
        value={el.lineDash}
        onChange={bind<number[]>('theme', 'element', 'lineDash')}
      />
      <ColorField
        label="Label color"
        value={el.labelColor}
        onChange={bind<string>('theme', 'element', 'labelColor')}
      />
      <FontField
        label="Label font"
        value={el.labelFont}
        onChange={bind<FontValue>('theme', 'element', 'labelFont')}
      />
      <SliderField
        label="Icon size"
        unit="px"
        min={0}
        max={48}
        value={el.iconSize}
        onChange={bind<number>('theme', 'element', 'iconSize')}
      />
    </Section>
  );
}
