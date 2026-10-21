// React ↔ engine bridge (DESIGN.md §12).
//
// Creates one engine per component instance and mounts it into the container;
// the engine owns its canvases, resizing and DPR tracking. Props are synced
// imperatively after each render, sending only fields that actually changed
// (compared structurally), so inline objects never rebuild or even redraw the
// engine, and React stays out of the render loop. Browser APIs are only
// touched inside effects, keeping the binding SSR-safe; setup and teardown are
// idempotent, so StrictMode's double mount is harmless.

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  TimelineEngine,
  type Diagnostic,
  type FrameStats,
  type Formatters,
  type HitResult,
  type Selection,
  type StyleResolvers,
  type ThemeInput,
  type TimelineData,
  type TimelineEventMap,
  type TimelineOptions as EngineOptions,
} from '@event-timeline/core';
import { changedFields } from './optionsDiff';

/**
 * Engine options for the `options` prop: every runtime engine option except
 * the ones with their own props (`theme`, `styleResolvers`, `formatters`).
 * Fields are compared by content, so passing them inline is fine.
 */
export type TimelineOptions<TData = unknown> = Omit<
  EngineOptions<TData>,
  'theme' | 'styleResolvers' | 'formatters'
>;

export interface UseTimelineArgs<TData> {
  containerRef: RefObject<HTMLElement | null>;
  data?: TimelineData<TData>;
  theme?: ThemeInput;
  options?: TimelineOptions<TData>;
  styleResolvers?: StyleResolvers<TData>;
  formatters?: Formatters<TData>;
  onReady?: () => void;
  onFirstFrame?: () => void;
  onViewportChange?: (v: TimelineEventMap<TData>['viewportChange']) => void;
  onDataChange?: (d: TimelineEventMap<TData>['dataChange']) => void;
  onHover?: (hit: HitResult<TData> | null) => void;
  onClick?: (e: TimelineEventMap<TData>['click']) => void;
  onSelectionChange?: (selection: Selection) => void;
}

// useLayoutEffect warns during server rendering; nothing runs there anyway.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useTimeline<TData>(
  args: UseTimelineArgs<TData>,
): RefObject<TimelineEngine<TData> | null> {
  const { containerRef, data } = args;
  const engineRef = useRef<TimelineEngine<TData> | null>(null);
  const latest = useRef(args);
  latest.current = args;
  const applied = useRef<EngineOptions<TData>>({});
  const appliedData = useRef<TimelineData<TData> | undefined>(undefined);

  // Stable forwarders, so inline sink callbacks never count as a change.
  const sinks = useRef({
    onDiagnostic: (d: Diagnostic) => latest.current.options?.onDiagnostic?.(d),
    onFrameStats: (s: FrameStats) => latest.current.options?.onFrameStats?.(s),
  });

  const engineOptions = (): EngineOptions<TData> => {
    const { options, theme, styleResolvers, formatters } = latest.current;
    return {
      ...options,
      theme,
      styleResolvers,
      formatters,
      onDiagnostic: options?.onDiagnostic
        ? sinks.current.onDiagnostic
        : undefined,
      onFrameStats: options?.onFrameStats
        ? sinks.current.onFrameStats
        : undefined,
    };
  };

  // Engine lifecycle: one engine for the component's lifetime.
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const initial = engineOptions();
    const engine = new TimelineEngine<TData>(initial);
    applied.current = initial;
    const cb = latest;
    const off = [
      engine.on('ready', () => cb.current.onReady?.()),
      engine.on('firstFrame', () => cb.current.onFirstFrame?.()),
      engine.on('viewportChange', (v) => cb.current.onViewportChange?.(v)),
      engine.on('dataChange', (d) => cb.current.onDataChange?.(d)),
      engine.on('hover', (hit) => cb.current.onHover?.(hit)),
      engine.on('click', (e) => cb.current.onClick?.(e)),
      engine.on('selectionChange', (s) => cb.current.onSelectionChange?.(s)),
    ];
    engine.mount(container);
    const initialData = cb.current.data;
    if (initialData) engine.setData(initialData);
    appliedData.current = initialData;
    engineRef.current = engine;
    return () => {
      for (const unsubscribe of off) unsubscribe();
      engine.dispose();
      engineRef.current = null;
      appliedData.current = undefined;
    };
    // The engine lives as long as its container; everything else syncs below.
  }, [containerRef]);

  // Option sync after every render: only changed fields reach the engine.
  useIsomorphicLayoutEffect(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    const next = engineOptions();
    const patch = changedFields(applied.current, next);
    applied.current = next;
    if (patch !== null) engine.setOptions(patch);
  });

  // Data sync: a full setData whenever the `data` reference changes (§10).
  useIsomorphicLayoutEffect(() => {
    const engine = engineRef.current;
    if (engine === null || data === appliedData.current) return;
    if (data) engine.setData(data);
    appliedData.current = data;
  }, [data]);

  return engineRef;
}
