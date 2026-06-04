import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Timeline,
  barycenter,
  byFirstEvent,
  explicit,
  type Formatters,
  type HitResult,
  type LayoutStrategy,
  type StyleResolvers,
  type Theme,
  type TimelineHandle,
} from '@timeline/react';
import { demoData } from './fixture';
import { makeSynthetic, type DemoDatum } from './synthetic';
import { makeAmlScenario } from './scenario';

const LAYOUT_NAMES = ['byFirstEvent', 'barycenter', 'explicit'] as const;
type LayoutName = (typeof LAYOUT_NAMES)[number];
const LAYOUTS: Record<LayoutName, LayoutStrategy> = {
  byFirstEvent,
  barycenter,
  explicit,
};

// --- Phase 6 customisation (§11) ---------------------------------------------

/** A light theme as a partial override; `resolveTheme` merges it over the dark
 * default. Demonstrates the host-driven theming surface (no preset shipped in
 * core, per the chosen demo-only approach). */
const lightTheme: Partial<Theme> = {
  background: '#f7f8fa',
  gridlineColor: 'rgba(0,0,0,0.10)',
  headerTextColor: '#5a6472',
  hoverColor: '#d97706',
  selectionColor: '#2563eb',
  clusterColor: '#b45309',
  element: {
    lineColor: '#2563eb',
    lineWidth: 2,
    labelColor: '#1f2933',
    labelFont: '12px system-ui, sans-serif',
    iconSize: 16,
  },
  event: {
    arrowColor: '#52606d',
    arrowWidth: 1,
    arrowheadSize: 6,
    labelColor: '#1f2933',
    labelFont: '11px system-ui, sans-serif',
    nodeRadius: 3,
  },
};

/** Five-colour palette for the data-driven style resolvers. Bucket 0 is a muted
 * grey so AML-scenario background activity recedes and tagged patterns pop
 * (buckets 1–4 map to the four patterns); the other datasets use 0–4 as before. */
const PALETTE = ['#6b7280', '#98c379', '#61afef', '#c678dd', '#e5c07b'];

/** Maps a `DemoDatum` category bucket to a palette colour (data-driven, §11).
 * Both datasets carry the payload, so the resolvers read it directly; an absent
 * category falls back to bucket 0. */
function paletteColor(category = 0): string {
  return PALETTE[category % PALETTE.length] as string;
}

/** Short human label for the status bar (mirrors the default tooltip content). */
function describeHit(hit: HitResult<DemoDatum> | null): string {
  if (hit === null) return '—';
  switch (hit.kind) {
    case 'event': {
      const p = hit.event.data?.pattern;
      const route = `${hit.event.sourceId} → ${hit.event.targetId}`;
      return `event ${hit.event.id} (${route})${p ? ` ⚠ ${p}` : ''}`;
    }
    case 'element': {
      const k = hit.element.data?.kind;
      const p = hit.element.data?.pattern;
      return `element ${hit.element.id}${k ? ` [${k}]` : ''}${
        p ? ` ⚠ ${p}` : ''
      }`;
    }
    case 'cluster':
      return `${hit.count} events`;
  }
}

/**
 * Phase 6 demo: theming & customisation (§11) on top of Phase 4 scale/LOD. The
 * "theme" toggle swaps a light `Partial<Theme>` over the dark default; "colours"
 * turns on data-driven style resolvers (lines/arrows coloured by category); and
 * "labels" turns on formatters (upper-cased element labels, prefixed events).
 * Underneath: the temporal index culls by binary search, dense events collapse
 * into "×N" cluster markers, and per-event labels appear past the LOD threshold.
 * "Fit" reframes; "10k"/"50k" swap in synthetic datasets (drag to pan, ctrl/⌘+
 * wheel to zoom). "AML" swaps in a ~100-entity client/counterparty scenario with
 * four labelled transaction-monitoring patterns (structuring, circular,
 * pass-through, fan-out); enable "colours" to paint each flow by its pattern and
 * hover a "⚠" row/arrow to see the pattern named in the status bar.
 */
export function App() {
  const ref = useRef<TimelineHandle<DemoDatum>>(null);
  const [big, setBig] = useState(false);
  const [huge, setHuge] = useState(false);
  const [aml, setAml] = useState(false);
  const [layoutName, setLayoutName] = useState<LayoutName>('byFirstEvent');
  const [themed, setThemed] = useState(false);
  const [coloured, setColoured] = useState(false);
  const [labelled, setLabelled] = useState(false);
  const [hover, setHover] = useState<HitResult<DemoDatum> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewport, setViewport] = useState({ pxPerMs: 0, scrollY: 0 });

  // Stable callbacks so the engine isn't re-created on every render (§12).
  const onHover = useCallback(
    (hit: HitResult<DemoDatum> | null) => setHover(hit),
    [],
  );
  const onSelectionChange = useCallback(
    (ids: string[]) => setSelected(ids),
    [],
  );
  const onViewportChange = useCallback(
    (v: { pxPerMs: number; scrollY: number }) =>
      setViewport({ pxPerMs: v.pxPerMs, scrollY: v.scrollY }),
    [],
  );
  // A new `options` reference (on layout change) re-creates the engine and
  // re-runs layout (§12 referential-stability contract).
  const options = useMemo(
    () => ({ multiSelect: true, layout: LAYOUTS[layoutName] }),
    [layoutName],
  );

  // Phase 6 props, memoized so the engine isn't re-created every render (§12).
  // Each is undefined when its toggle is off, so the engine falls back to the
  // dark theme / per-item `.style` / raw labels respectively.
  const theme = useMemo(() => (themed ? lightTheme : undefined), [themed]);
  const styleResolvers = useMemo<StyleResolvers<DemoDatum> | undefined>(
    () =>
      coloured
        ? {
            element: (e) => ({ lineColor: paletteColor(e.data?.category) }),
            event: (e) => ({ arrowColor: paletteColor(e.data?.category) }),
          }
        : undefined,
    [coloured],
  );
  const formatters = useMemo<Formatters<DemoDatum> | undefined>(
    () =>
      labelled
        ? {
            elementLabel: (e) => (e.label ?? e.id).toUpperCase(),
            eventLabel: (e) => `» ${e.label ?? e.id}`,
          }
        : undefined,
    [labelled],
  );

  // Memoized so the referential-stability contract holds (§12): a stable `data`
  // reference avoids a full setData on every render. The 10k set is built once;
  // the 50k set is built lazily the first time it is shown (§15 acceptance).
  const synthetic = useMemo(() => makeSynthetic(), []);
  const synthetic50k = useMemo(
    () => (huge ? makeSynthetic(50_000, 400, 2) : null),
    [huge],
  );
  const amlData = useMemo(() => makeAmlScenario(), []);
  const data = aml
    ? amlData
    : (synthetic50k ?? (big ? synthetic : demoData));

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
        }}
      >
        <h1 style={{ margin: 0, font: '600 14px system-ui' }}>
          react-timeline · demo
        </h1>
        <button
          type="button"
          onClick={() => ref.current?.fit()}
          style={{ font: '12px system-ui' }}
        >
          Fit
        </button>
        <button
          type="button"
          data-testid="toggle-dataset"
          onClick={() => setBig((v) => !v)}
          style={{ font: '12px system-ui' }}
        >
          {big ? 'Sample' : '10k'}
        </button>
        <button
          type="button"
          data-testid="toggle-50k"
          onClick={() => setHuge((v) => !v)}
          style={{ font: '12px system-ui' }}
        >
          {huge ? 'Sample' : '50k'}
        </button>
        <button
          type="button"
          data-testid="toggle-aml"
          onClick={() => setAml((v) => !v)}
          style={{ font: '12px system-ui' }}
        >
          {aml ? 'AML ✓' : 'AML'}
        </button>
        <button
          type="button"
          data-testid="toggle-layout"
          onClick={() =>
            setLayoutName((name) => {
              const next =
                (LAYOUT_NAMES.indexOf(name) + 1) % LAYOUT_NAMES.length;
              return LAYOUT_NAMES[next]!;
            })
          }
          style={{ font: '12px system-ui' }}
        >
          layout: {layoutName}
        </button>
        <button
          type="button"
          data-testid="toggle-theme"
          onClick={() => setThemed((v) => !v)}
          style={{ font: '12px system-ui' }}
        >
          theme: {themed ? 'light' : 'dark'}
        </button>
        <button
          type="button"
          data-testid="toggle-resolvers"
          onClick={() => setColoured((v) => !v)}
          style={{ font: '12px system-ui' }}
        >
          colours: {coloured ? 'on' : 'off'}
        </button>
        <button
          type="button"
          data-testid="toggle-formatters"
          onClick={() => setLabelled((v) => !v)}
          style={{ font: '12px system-ui' }}
        >
          labels: {labelled ? 'on' : 'off'}
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Timeline<DemoDatum>
          ref={ref}
          data={data}
          theme={theme}
          options={options}
          styleResolvers={styleResolvers}
          formatters={formatters}
          onHover={onHover}
          onSelectionChange={onSelectionChange}
          onViewportChange={onViewportChange}
          style={{ background: themed ? lightTheme.background : '#161b22' }}
        />
      </div>
      <footer
        style={{
          display: 'flex',
          gap: 16,
          padding: '6px 12px',
          font: '12px system-ui',
          color: '#9aa4b2',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span data-testid="status-hover">hover: {describeHit(hover)}</span>
        <span data-testid="status-selected">
          selected: {selected.length === 0 ? '—' : selected.join(', ')}
        </span>
        <span data-testid="status-pxperms">pxPerMs: {viewport.pxPerMs}</span>
        <span data-testid="status-scrolly">scrollY: {viewport.scrollY}</span>
      </footer>
    </main>
  );
}
