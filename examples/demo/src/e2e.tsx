// End-to-end fixture page (DESIGN.md §14; audit T-10).
//
// A full-viewport <Timeline> with no customization panel. The Playwright
// specs configure it through the URL (`?renderer=…&dataset=…`) and the
// `window.__e2e` API rather than by clicking demo controls, so reworking the
// demo can't break them. The status strip under the timeline carries the same
// test ids as the demo's.

import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  Timeline,
  type HitResult,
  type Selection,
  type ThemeInput,
  type TimelineHandle,
  type TimelineOptions,
} from '@event-timeline/react';
import { demoData } from './fixture';
import { makeAmlScenario } from './scenario';
import { makeSynthetic, type DemoDatum } from './synthetic';
import type { DatasetKey } from './panel/config';
import { PRESETS } from './panel/config';
import {
  buildFormatters,
  buildResolvers,
  buildTheme,
} from './panel/buildProps';

export interface E2EApi {
  setDataset(name: DatasetKey): void;
  /** Merge into the current options (one level deep). */
  setOptions(patch: TimelineOptions): void;
  /** Merge into the current theme, group by group. */
  patchTheme(patch: ThemeInput): void;
  /** Switch to a named demo theme preset ('Dark', 'Light', …). */
  setPreset(label: string): void;
  /** Data-driven colours and upper-casing label formatters (§11). */
  setDataHooks(hooks: { colours?: boolean; labels?: boolean }): void;
  fit(): void;
}

declare global {
  interface Window {
    __e2e?: E2EApi;
  }
}

function dataset(name: DatasetKey) {
  switch (name) {
    case 'aml':
      return makeAmlScenario();
    case 'synthetic10k':
      return makeSynthetic();
    case 'synthetic50k':
      return makeSynthetic(50_000, 400, 2);
    default:
      return demoData;
  }
}

function presetTheme(label: string): ThemeInput {
  const preset = PRESETS.find((p) => p.label === label) ?? PRESETS[0]!;
  return buildTheme(preset.theme);
}

function describeHit(hit: HitResult<DemoDatum> | null): string {
  if (hit === null) return '—';
  switch (hit.kind) {
    case 'event':
      return `event ${hit.event.id}`;
    case 'element':
      return `element ${hit.element.id}`;
    case 'cluster':
      return `${hit.count} events`;
  }
}

function E2E() {
  const params = new URLSearchParams(location.search);
  const ref = useRef<TimelineHandle<DemoDatum>>(null);
  const [data, setData] = useState(() =>
    dataset((params.get('dataset') ?? 'default') as DatasetKey),
  );
  const [options, setOptions] = useState<TimelineOptions>(() => {
    const renderer = params.get('renderer');
    return renderer === 'canvas2d' || renderer === 'webgl' ? { renderer } : {};
  });
  const [theme, setTheme] = useState(() => presetTheme('Dark'));
  const [hooks, setHooks] = useState({ colours: false, labels: false });
  const styleResolvers = useMemo(
    () => buildResolvers(hooks.colours),
    [hooks.colours],
  );
  const formatters = useMemo(
    () => buildFormatters(hooks.labels),
    [hooks.labels],
  );

  const [hover, setHover] = useState('—');
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState({ pxPerMs: 0, scrollY: 0 });
  const [backend, setBackend] = useState('—');

  window.__e2e = {
    setDataset: (name) => setData(dataset(name)),
    setOptions: (patch) => setOptions((o) => ({ ...o, ...patch })),
    patchTheme: (patch) =>
      setTheme((t) => {
        const next: Record<string, unknown> = { ...t };
        for (const [key, value] of Object.entries(patch)) {
          const prev = (t as Record<string, unknown>)[key];
          next[key] =
            typeof value === 'object' && typeof prev === 'object'
              ? { ...prev, ...value }
              : value;
        }
        return next;
      }),
    setPreset: (label) => setTheme(presetTheme(label)),
    setDataHooks: (next) => setHooks((h) => ({ ...h, ...next })),
    fit: () => ref.current?.fit(),
  };

  const onReady = useCallback(
    () => setBackend(ref.current?.getRendererBackend() ?? '—'),
    [],
  );
  // A renderer change switches backends in place: read the new one back once
  // the binding has applied the options (child effects run first).
  useEffect(() => {
    setBackend(ref.current?.getRendererBackend() ?? '—');
  }, [options]);
  const onHover = useCallback(
    (hit: HitResult<DemoDatum> | null) => setHover(describeHit(hit)),
    [],
  );
  const onSelectionChange = useCallback(
    (selection: Selection) =>
      setSelected([
        ...selection.elements.map((id) => `element ${id}`),
        ...selection.events.map((id) => `event ${id}`),
      ]),
    [],
  );
  const onViewportChange = useCallback(
    (v: { pxPerMs: number; scrollY: number }) =>
      setView({ pxPerMs: v.pxPerMs, scrollY: v.scrollY }),
    [],
  );

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Timeline<DemoDatum>
          ref={ref}
          data={data}
          theme={theme}
          options={options}
          styleResolvers={styleResolvers}
          formatters={formatters}
          onReady={onReady}
          onHover={onHover}
          onSelectionChange={onSelectionChange}
          onViewportChange={onViewportChange}
        />
      </div>
      <footer
        style={{
          display: 'flex',
          gap: 16,
          padding: '4px 8px',
          font: '12px system-ui, sans-serif',
        }}
      >
        <span data-testid="status-hover">hover: {hover}</span>
        <span data-testid="status-selected">
          selected: {selected.length === 0 ? '—' : selected.join(', ')}
        </span>
        <span data-testid="status-pxperms">pxPerMs: {view.pxPerMs}</span>
        <span data-testid="status-scrolly">scrollY: {view.scrollY}</span>
        <span data-testid="status-renderer">renderer: {backend}</span>
      </footer>
    </main>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <E2E />
  </StrictMode>,
);
