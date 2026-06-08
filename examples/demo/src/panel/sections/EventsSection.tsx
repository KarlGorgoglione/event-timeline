import {
  ColorField,
  DashField,
  FontField,
  Section,
  SliderField,
  type FontValue,
} from '../controls';
import type { SectionViewProps } from './types';

export function EventsSection({ config, bind }: SectionViewProps) {
  const ev = config.theme.event;
  return (
    <Section title="Events">
      <ColorField
        label="Arrow color"
        value={ev.arrowColor}
        onChange={bind<string>('theme', 'event', 'arrowColor')}
      />
      <SliderField
        label="Arrow width"
        unit="px"
        min={0.5}
        max={6}
        step={0.5}
        value={ev.arrowWidth}
        onChange={bind<number>('theme', 'event', 'arrowWidth')}
      />
      <DashField
        label="Arrow dash"
        value={ev.arrowDash}
        onChange={bind<number[]>('theme', 'event', 'arrowDash')}
      />
      <SliderField
        label="Arrowhead size"
        unit="px"
        min={0}
        max={16}
        value={ev.arrowheadSize}
        onChange={bind<number>('theme', 'event', 'arrowheadSize')}
      />
      <SliderField
        label="Node radius"
        unit="px"
        min={0}
        max={10}
        step={0.5}
        value={ev.nodeRadius}
        onChange={bind<number>('theme', 'event', 'nodeRadius')}
      />
      <ColorField
        label="Label color"
        value={ev.labelColor}
        onChange={bind<string>('theme', 'event', 'labelColor')}
      />
      <FontField
        label="Label font"
        value={ev.labelFont}
        onChange={bind<FontValue>('theme', 'event', 'labelFont')}
      />
      <ColorField
        label="Label box fill"
        value={ev.labelBoxBackground}
        onChange={bind<string>('theme', 'event', 'labelBoxBackground')}
      />
      <ColorField
        label="Label box border"
        value={ev.labelBoxBorderColor}
        onChange={bind<string>('theme', 'event', 'labelBoxBorderColor')}
      />
      <SliderField
        label="Label box border width"
        unit="px"
        min={0}
        max={4}
        step={0.5}
        value={ev.labelBoxBorderWidth}
        onChange={bind<number>('theme', 'event', 'labelBoxBorderWidth')}
      />
      <DashField
        label="Label box dash"
        value={ev.labelBoxBorderDash}
        onChange={bind<number[]>('theme', 'event', 'labelBoxBorderDash')}
      />
      <SliderField
        label="Label box padding"
        unit="px"
        min={0}
        max={12}
        value={ev.labelBoxPadding}
        onChange={bind<number>('theme', 'event', 'labelBoxPadding')}
      />
    </Section>
  );
}
