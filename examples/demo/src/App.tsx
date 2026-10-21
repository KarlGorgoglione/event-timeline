// The showcase: a top bar, the timeline stage and the inspector, around one
// `<Timeline>`. State lives in a reducer (mirrored to the URL); the engine is
// driven only through props and the handle, as a host app would drive it.

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Timeline,
  type DataChangeCounts,
  type Diagnostic,
  type FrameStats,
  type Formatters,
  type HitResult,
  type Selection,
  type TimelineHandle,
  type TimelineEventMap,
  type ViewportState,
} from '@event-timeline/react';
import {
  baseHooks,
  baseOptions,
  baseTheme,
  reducer,
  variantOf,
  type Action,
} from './app/state';
import { applyEdits } from './app/paths';
import { toTimelineOptions } from './app/options';
import { stateFromUrl, urlFromState } from './app/urlState';
import { createStore, Ring } from './app/store';
import {
  DemoContext,
  type DemoRuntime,
  type LiveSettings,
  type LogEntry,
  type TimedFrame,
} from './app/context';
import { useScenarioData } from './app/useScenarioData';
import { useLiveStream, useScaleStream } from './app/useStreams';
import { scenarioById } from './scenarios';
import { presetById, type ThemePreset } from './themes/presets';
import { readableOn, withAlpha } from './ui/color';
import type { Datum, HooksState, Scenario } from './scenarios/types';
import { TopBar } from './ui/shell/TopBar';
import { Stage } from './ui/shell/Stage';
import { Inspector } from './ui/shell/Inspector';
import { ShortcutsDialog } from './ui/shell/ShortcutsDialog';
import { RichTooltip } from './ui/shared/RichTooltip';

const NO_SELECTION: Selection = { elements: [], events: [] };

function buildFormatters(
  scenario: Scenario,
  hooks: HooksState,
): Formatters<Datum> | undefined {
  const base = hooks.formatters ? scenario.formatters?.() : undefined;
  if (hooks.eventLabels) return base;
  return { ...base, eventLabel: () => undefined };
}

/** The page chrome follows the preset (and the accent, the selection colour). */
function applyChrome(preset: ThemePreset, accent: string, canvas: string) {
  const root = document.documentElement;
  const c = preset.chrome;
  const vars: Record<string, string> = {
    '--page': c.page,
    '--surface': c.surface,
    '--raised': c.raised,
    '--border': c.border,
    '--text': c.text,
    '--muted': c.muted,
    '--glow': c.glow,
    '--canvas': canvas,
    '--accent': accent,
    '--accent-ink': readableOn(accent),
    '--accent-soft': withAlpha(accent, 0.16),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.scheme = preset.scheme;
  root.style.colorScheme = preset.scheme;
}

function describeHit(hit: HitResult<Datum> | null): string {
  if (hit === null) return 'none';
  if (hit.kind === 'cluster') return `cluster ×${hit.count}`;
  return hit.kind === 'event'
    ? `event ${hit.event.id}`
    : `element ${hit.element.id}`;
}

export function App() {
  const [state, rawDispatch] = useReducer(reducer, undefined, () =>
    stateFromUrl(location.search, location.hash),
  );
  const scenario = scenarioById(state.scenario);
  const preset = presetById(state.preset);
  const variant = variantOf(state);
  const {
    preset: presetId,
    density,
    themeEdits,
    optionEdits,
    hookEdits,
  } = state;

  // --- Derived props (memoised on the slices they read, §12) ---------------
  const theme = useMemo(
    () => applyEdits(baseTheme({ preset: presetId, density }), themeEdits),
    [presetId, density, themeEdits],
  );
  const options = useMemo(
    () => applyEdits(baseOptions(scenario), optionEdits),
    [scenario, optionEdits],
  );
  const hooks = useMemo(
    () => ({ ...baseHooks(scenario), ...hookEdits }),
    [scenario, hookEdits],
  );

  // --- URL and chrome -------------------------------------------------------
  useEffect(() => {
    const id = setTimeout(() => {
      history.replaceState(
        null,
        '',
        `${location.pathname}${urlFromState(state)}`,
      );
    }, 250);
    return () => clearTimeout(id);
  }, [state]);

  const accent = theme.emphasis.selectionColor;
  useLayoutEffect(
    () => applyChrome(preset, accent, theme.background),
    [preset, accent, theme.background],
  );

  // --- Fast stores ----------------------------------------------------------
  const [stores] = useState(() => ({
    viewport: createStore<ViewportState | null>(null),
    dataRevision: createStore(0),
    counts: createStore({ elements: 0, events: 0 }),
    frames: new Ring<TimedFrame>(480),
    log: new Ring<LogEntry>(200),
    diagnostics: createStore<readonly Diagnostic[]>([]),
  }));
  const logEvent = useCallback(
    (type: string, text: string) =>
      stores.log.push({ at: Date.now(), type, text }),
    [stores],
  );

  // --- Data ------------------------------------------------------------------
  const {
    data,
    loading,
    replaceData: replace,
  } = useScenarioData(scenario, variant);
  // Diagnostics describe the current dataset: clear them before a new one is
  // handed to the engine (which reports during setData).
  const dispatch = useCallback(
    (action: Action) => {
      if (action.type === 'scenario' || action.type === 'variant') {
        stores.diagnostics.set([]);
      }
      rawDispatch(action);
    },
    [stores],
  );
  const replaceData = useCallback(
    (next: typeof data) => {
      stores.diagnostics.set([]);
      replace(next);
    },
    [stores, replace],
  );
  const handle = useRef<TimelineHandle<Datum>>(null);
  const [backend, setBackend] = useState('—');
  const [version, setVersion] = useState('');
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);

  const readBackend = useCallback(() => {
    setBackend(handle.current?.getRendererBackend() ?? '—');
  }, []);

  // --- Engine options with the app-wired callbacks ---------------------------
  const onDiagnostic = useCallback(
    (d: Diagnostic) => {
      stores.diagnostics.set([...stores.diagnostics.get(), d].slice(-200));
      logEvent(
        'diagnostic',
        `${d.code}${d.id === undefined ? '' : ` (${d.kind} ${d.id})`}`,
      );
      // The fallback is reported before the new backend is installed.
      if (d.code === 'renderer-fallback') queueMicrotask(readBackend);
    },
    [stores, logEvent, readBackend],
  );
  const onFrameStats = useCallback(
    (s: FrameStats) => stores.frames.push({ ...s, at: performance.now() }),
    [stores],
  );
  const deferredOptions = useDeferredValue(options);
  const timelineOptions = useMemo(
    () => ({
      ...toTimelineOptions(deferredOptions),
      onDiagnostic,
      onFrameStats,
    }),
    [deferredOptions, onDiagnostic, onFrameStats],
  );
  // A renderer change swaps backends in place once the binding applied it
  // (child effects run first), so read it back here.
  useEffect(readBackend, [timelineOptions.renderer, readBackend]);

  const deferredTheme = useDeferredValue(theme);
  const styleResolvers = useMemo(
    () => (hooks.colours ? scenario.resolvers?.(preset) : undefined),
    [scenario, preset, hooks.colours],
  );
  const formatters = useMemo(
    () => buildFormatters(scenario, hooks),
    [scenario, hooks],
  );

  // --- Focus the scenario's window when its data lands ------------------------
  useEffect(() => {
    if (loading) return;
    const h = handle.current;
    if (h === null) return;
    h.clearSelection();
    const focus = scenario.focus?.(data);
    if (focus) h.zoomToRange(focus[0], focus[1]);
    else h.fit();
    // Data changes only on load; the scenario is read for its focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading]);

  // Canvas-drawn element icons follow the preset (`updateElement`, §10).
  const icons = useMemo(() => scenario.icons?.(preset), [scenario, preset]);
  useEffect(() => {
    if (loading || icons === undefined) return;
    for (const [id, icon] of icons) handle.current?.updateElement(id, { icon });
  }, [icons, data, loading]);

  // --- Streams -------------------------------------------------------------------
  const [live, setLiveState] = useState<LiveSettings>({
    running: true,
    rate: 4,
    follow: true,
    cap: 4000,
  });
  const setLive = useCallback(
    (patch: Partial<LiveSettings>) => setLiveState((s) => ({ ...s, ...patch })),
    [],
  );
  useLiveStream(handle, data, scenario.id === 'live' && !loading, live);
  const [scaleStream, setScaleStream] = useState(false);
  useEffect(() => setScaleStream(false), [scenario.id, variant]);
  useScaleStream(
    handle,
    data,
    scenario.id === 'scale' && !loading && scaleStream,
  );

  // --- Engine events -----------------------------------------------------------
  const lastHover = useRef('');
  const lastViewportLog = useRef(0);
  const onReady = useCallback(() => {
    setVersion(handle.current?.version ?? '');
    logEvent('ready', 'engine constructed');
  }, [logEvent]);
  const onFirstFrame = useCallback(() => {
    readBackend();
    logEvent('firstFrame', 'first frame drawn');
  }, [readBackend, logEvent]);
  const onHover = useCallback(
    (hit: HitResult<Datum> | null) => {
      const text = describeHit(hit);
      if (text === lastHover.current) return;
      lastHover.current = text;
      logEvent('hover', text);
    },
    [logEvent],
  );
  const onClick = useCallback(
    (e: TimelineEventMap<Datum>['click']) =>
      logEvent(
        'click',
        `${describeHit(e.hit)}${e.modifiers.ctrlOrMeta ? ' + ctrl/⌘' : ''}`,
      ),
    [logEvent],
  );
  const onSelectionChange = useCallback(
    (s: Selection) => {
      setSelection(s);
      logEvent(
        'selectionChange',
        `${s.elements.length} elements, ${s.events.length} events`,
      );
    },
    [logEvent],
  );
  const onViewportChange = useCallback(
    (v: ViewportState) => {
      stores.viewport.set(v);
      const now = performance.now();
      if (now - lastViewportLog.current > 600) {
        lastViewportLog.current = now;
        logEvent(
          'viewportChange',
          `rows ${v.visibleRowRange[0]}–${v.visibleRowRange[1]}`,
        );
      }
    },
    [stores, logEvent],
  );
  // Count what the engine holds (valid items only), at most once a frame.
  const countPending = useRef(false);
  const onDataChange = useCallback(
    (c: DataChangeCounts) => {
      stores.dataRevision.set(stores.dataRevision.get() + 1);
      logEvent(
        'dataChange',
        `events +${c.events.added} −${c.events.removed} ~${c.events.updated}`,
      );
      if (countPending.current) return;
      countPending.current = true;
      requestAnimationFrame(() => {
        countPending.current = false;
        const held = handle.current?.getData();
        stores.counts.set({
          elements: held?.elements.length ?? 0,
          events: held?.events.length ?? 0,
        });
      });
    },
    [stores, logEvent],
  );

  // --- Tooltip -------------------------------------------------------------------
  const labelOf = useMemo(() => {
    const labels = new Map(data.elements.map((e) => [e.id, e.label ?? e.id]));
    return (id: string) => labels.get(id) ?? id;
  }, [data]);
  const renderTooltip = useMemo(
    () =>
      hooks.tooltip === 'rich'
        ? (hit: HitResult<Datum>) => (
            <RichTooltip
              hit={hit}
              scenario={scenario}
              preset={preset}
              labelOf={labelOf}
            />
          )
        : undefined,
    [hooks.tooltip, scenario, preset, labelOf],
  );

  // --- Shortcuts -------------------------------------------------------------------
  const shortcuts = useRef<HTMLDialogElement>(null);
  const openShortcuts = useCallback(() => shortcuts.current?.showModal(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === '?') {
        e.preventDefault();
        openShortcuts();
      } else if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('#timeline-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openShortcuts]);

  const runtime: DemoRuntime = {
    state,
    dispatch,
    scenario,
    variant,
    preset,
    theme,
    options,
    hooks,
    data,
    loading,
    replaceData,
    selection,
    handle,
    backend,
    version,
    viewport: stores.viewport,
    dataRevision: stores.dataRevision,
    counts: stores.counts,
    frames: stores.frames,
    log: stores.log,
    diagnostics: stores.diagnostics,
    live,
    setLive,
    scaleStream,
    setScaleStream,
    openShortcuts,
  };

  return (
    <DemoContext.Provider value={runtime}>
      <div className="app" data-view={state.view}>
        <TopBar />
        <div className="workspace">
          <Stage>
            <Timeline<Datum>
              ref={handle}
              data={data}
              theme={deferredTheme}
              options={timelineOptions}
              styleResolvers={styleResolvers}
              formatters={formatters}
              tooltip={hooks.tooltip !== 'off'}
              renderTooltip={renderTooltip}
              onReady={onReady}
              onFirstFrame={onFirstFrame}
              onHover={onHover}
              onClick={onClick}
              onSelectionChange={onSelectionChange}
              onViewportChange={onViewportChange}
              onDataChange={onDataChange}
            />
          </Stage>
          <Inspector />
        </div>
        <ShortcutsDialog ref={shortcuts} />
      </div>
    </DemoContext.Provider>
  );
}
