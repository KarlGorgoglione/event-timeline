import { useState } from 'react';
import './Panel.css';
import { DEFAULT_CONFIG, PRESETS, type DemoConfig } from './config';
import type { Bind } from './useDemoConfig';
import {
  AdvancedSection,
  CanvasSection,
  ClusterLodSection,
  DatasetSection,
  ElementsSection,
  EmphasisSection,
  EventsSection,
  RowsLayoutSection,
} from './sections';

/** Read-only status values rendered in the panel's footer strip. */
export interface PanelStatus {
  hover: string;
  selected: string[];
  pxPerMs: number;
  scrollY: number;
  streamed: number;
  /** The backend the engine actually selected (may differ under 'auto'). */
  renderer: string;
}

export interface PanelProps {
  config: DemoConfig;
  bind: Bind;
  apply: (config: DemoConfig) => void;
  onFit: () => void;
  status: PanelStatus;
}

export function Panel({ config, bind, apply, onFit, status }: PanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Presets swap the look only; reset restores defaults. Both keep the
  // dataset and renderer choices (neither is part of a "look").
  const applyPreset = (
    theme: DemoConfig['theme'],
    options: DemoConfig['options'],
  ) =>
    apply({
      ...config,
      theme,
      options: { ...options, renderer: config.options.renderer },
    });
  const reset = () =>
    apply({
      ...DEFAULT_CONFIG,
      dataset: config.dataset,
      options: { ...DEFAULT_CONFIG.options, renderer: config.options.renderer },
    });

  if (collapsed) {
    return (
      <aside className="etd-panel etd-panel--collapsed">
        <button
          type="button"
          className="etd-panel__toggle"
          aria-label="Open customization panel"
          aria-expanded={false}
          onClick={() => setCollapsed(false)}
        >
          ⚙
        </button>
      </aside>
    );
  }

  return (
    <aside className="etd-panel" aria-label="Customization">
      <header className="etd-panel__header">
        <span className="etd-panel__title">Customize</span>
        <button
          type="button"
          className="etd-panel__toggle"
          aria-label="Collapse customization panel"
          aria-expanded
          onClick={() => setCollapsed(true)}
        >
          ×
        </button>
      </header>

      <div className="etd-panel__presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="etd-chip"
            onClick={() => applyPreset(p.theme, p.options)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="etd-chip etd-chip--reset"
          onClick={reset}
        >
          ↺ Reset
        </button>
      </div>

      <div className="etd-panel__body">
        <DatasetSection config={config} bind={bind} onFit={onFit} />
        <CanvasSection config={config} bind={bind} />
        <RowsLayoutSection config={config} bind={bind} />
        <ElementsSection config={config} bind={bind} />
        <EventsSection config={config} bind={bind} />
        <EmphasisSection config={config} bind={bind} />
        <ClusterLodSection config={config} bind={bind} />
        <AdvancedSection config={config} bind={bind} />
      </div>

      <footer className="etd-panel__status">
        <span data-testid="status-hover">hover: {status.hover}</span>
        <span data-testid="status-selected">
          selected:{' '}
          {status.selected.length === 0 ? '—' : status.selected.join(', ')}
        </span>
        <span data-testid="status-pxperms">pxPerMs: {status.pxPerMs}</span>
        <span data-testid="status-scrolly">scrollY: {status.scrollY}</span>
        <span data-testid="status-streamed">streamed: {status.streamed}</span>
        <span data-testid="status-renderer">renderer: {status.renderer}</span>
      </footer>
    </aside>
  );
}
