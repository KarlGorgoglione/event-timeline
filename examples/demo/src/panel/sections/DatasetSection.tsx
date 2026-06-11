import {
  Section,
  SelectField,
  ToggleField,
  type SelectOption,
} from '../controls';
import type { DatasetKey, RendererKey } from '../config';
import type { SectionViewProps } from './types';

const DATASETS: ReadonlyArray<SelectOption<DatasetKey>> = [
  { value: 'default', label: 'Default (hand-built)' },
  { value: 'aml', label: 'AML scenario' },
  { value: 'synthetic10k', label: '10k synthetic' },
  { value: 'synthetic50k', label: '50k synthetic' },
];

const RENDERERS: ReadonlyArray<SelectOption<RendererKey>> = [
  { value: 'auto', label: 'Auto' },
  { value: 'canvas2d', label: 'Canvas 2D' },
  { value: 'webgl', label: 'WebGL' },
];

interface DatasetSectionProps extends SectionViewProps {
  onFit: () => void;
}

export function DatasetSection({ config, bind, onFit }: DatasetSectionProps) {
  return (
    <Section title="Dataset" defaultOpen>
      <SelectField<DatasetKey>
        label="Dataset"
        value={config.dataset}
        options={DATASETS}
        onChange={bind<DatasetKey>('dataset')}
      />
      <SelectField<RendererKey>
        label="Renderer"
        value={config.options.renderer}
        options={RENDERERS}
        onChange={bind<RendererKey>('options', 'renderer')}
      />
      <ToggleField
        label="Live stream"
        value={config.streaming}
        onChange={bind<boolean>('streaming')}
      />
      <div className="etd-field">
        <span className="etd-field__label">View</span>
        <div className="etd-field__control">
          <button type="button" className="etd-btn" onClick={onFit}>
            Fit
          </button>
        </div>
      </div>
    </Section>
  );
}
