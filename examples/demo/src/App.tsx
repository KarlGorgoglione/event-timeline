import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Timeline,
  type HitResult,
  type TimelineHandle,
} from '@event-timeline/react';
import { demoData } from './fixture';
import { makeStreamBatch, makeSynthetic, type DemoDatum } from './synthetic';
import { makeAmlScenario } from './scenario';
import { useDemoConfig } from './panel/useDemoConfig';
import {
  buildFormatters,
  buildOptions,
  buildResolvers,
  buildTheme,
} from './panel/buildProps';
import { Panel } from './panel/Panel';

/** Events appended per streaming tick, and the tick interval (Phase 7, §10). */
const STREAM_BATCH = 12;
const STREAM_INTERVAL_MS = 250;

/** Short human label for the status strip (mirrors the default tooltip content). */
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
 * The demo: a Canvas-2D timeline plus a floating glass customization panel that
 * drives the full §11 look-and-feel surface. All editable state lives in a
 * single `DemoConfig` (see `panel/config.ts`); pure builders turn its `theme`
 * and `options` slices into the memoised engine props, and `useDeferredValue`
 * keeps slider drags smooth by letting the (engine-rebuilding) prop updates lag
 * the input under load — the §12 referential-stability contract holds because
 * each prop is memoised on its own slice.
 */
export function App() {
  const ref = useRef<TimelineHandle<DemoDatum>>(null);
  const { config, bind, apply } = useDemoConfig();

  const [hover, setHover] = useState<HitResult<DemoDatum> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewport, setViewport] = useState({ pxPerMs: 0, scrollY: 0 });
  const [streamCount, setStreamCount] = useState(0);
  // Latest visible time window — streamed batches land inside it so new events
  // appear wherever the user is looking. A ref avoids re-running the interval
  // effect on every pan/zoom; the counter keeps streamed ids unique across
  // dataset switches (a switch's setData clears prior streamed events).
  const viewRef = useRef<[number, number]>([0, 0]);
  const streamCounterRef = useRef(0);

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
    (v: { pxPerMs: number; scrollY: number; timeRange: [number, number] }) => {
      viewRef.current = v.timeRange;
      setViewport({ pxPerMs: v.pxPerMs, scrollY: v.scrollY });
    },
    [],
  );

  // Engine props, each memoised on its own config slice so editing a colour
  // never churns `options` and vice versa (§12). Theme/options are deferred so
  // rapid edits don't rebuild the engine faster than it can keep up at 50k.
  const deferredTheme = useDeferredValue(config.theme);
  const deferredOptions = useDeferredValue(config.options);
  const theme = useMemo(() => buildTheme(deferredTheme), [deferredTheme]);
  const options = useMemo(
    () => buildOptions(deferredOptions),
    [deferredOptions],
  );
  const styleResolvers = useMemo(
    () => buildResolvers(config.resolvers),
    [config.resolvers],
  );
  const formatters = useMemo(
    () => buildFormatters(config.formatters),
    [config.formatters],
  );

  // Custom tooltip: events show their UTC date under the label (§9, §12).
  const renderTooltip = useCallback((hit: HitResult<DemoDatum>) => {
    switch (hit.kind) {
      case 'event': {
        const date = new Date(hit.event.time).toISOString().slice(0, 10);
        const label =
          hit.event.label ?? `${hit.event.sourceId} → ${hit.event.targetId}`;
        return (
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span>{label}</span>
            <span style={{ opacity: 0.7 }}>{date}</span>
          </span>
        );
      }
      case 'element':
        return hit.element.label;
      case 'cluster':
        return `${hit.count} events`;
    }
  }, []);

  // Datasets are memoised for a stable `data` reference (§12): the 10k set is
  // built once, the 50k set lazily the first time it is selected (§15).
  const synthetic = useMemo(() => makeSynthetic(), []);
  const synthetic50k = useMemo(
    () =>
      config.dataset === 'synthetic50k' ? makeSynthetic(50_000, 400, 2) : null,
    [config.dataset],
  );
  const amlData = useMemo(() => makeAmlScenario(), []);
  const data = useMemo(() => {
    switch (config.dataset) {
      case 'aml':
        return amlData;
      case 'synthetic50k':
        return synthetic50k ?? demoData;
      case 'synthetic10k':
        return synthetic;
      default:
        return demoData;
    }
  }, [config.dataset, synthetic, synthetic50k, amlData]);

  // A dataset switch's prop `setData` clears prior streamed events, so reset the
  // displayed count to match (ids stay unique via the counter ref).
  useEffect(() => {
    setStreamCount(0);
  }, [data]);

  // Phase 7 streaming (§10): while on, append a small batch via the imperative
  // `addEvents` each tick — no full `setData`, so existing rows stay put.
  useEffect(() => {
    if (!config.streaming) return;
    const id = setInterval(() => {
      const handle = ref.current;
      const [tStart, tEnd] = viewRef.current;
      if (handle === null || tEnd <= tStart) return;
      const batch = makeStreamBatch(
        data.elements,
        streamCounterRef.current,
        STREAM_BATCH,
        tStart,
        tEnd,
      );
      streamCounterRef.current += batch.length;
      handle.addEvents(batch);
      setStreamCount((n) => n + batch.length);
    }, STREAM_INTERVAL_MS);
    return () => clearInterval(id);
  }, [config.streaming, data]);

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: config.theme.background,
      }}
    >
      <Timeline<DemoDatum>
        ref={ref}
        data={data}
        theme={theme}
        options={options}
        styleResolvers={styleResolvers}
        formatters={formatters}
        renderTooltip={renderTooltip}
        onHover={onHover}
        onSelectionChange={onSelectionChange}
        onViewportChange={onViewportChange}
        style={{ background: config.theme.background }}
      />
      <Panel
        config={config}
        bind={bind}
        apply={apply}
        onFit={() => ref.current?.fit()}
        status={{
          hover: describeHit(hover),
          selected,
          pxPerMs: viewport.pxPerMs,
          scrollY: viewport.scrollY,
          streamed: streamCount,
        }}
      />
    </main>
  );
}
