// React ↔ engine bridge (DESIGN.md §12).
//
// Instantiates the core engine once, owns the ResizeObserver, and syncs props
// to the engine imperatively so React stays out of the render loop. All
// browser APIs (ResizeObserver, devicePixelRatio) are touched inside effects,
// never at import/render, keeping the binding SSR-safe; setup/teardown is
// idempotent so React StrictMode's double-invoke is safe.

import { useEffect, useRef, type RefObject } from 'react';
import {
  TimelineEngine,
  type HitResult,
  type OnDiagnostic,
  type Theme,
  type TimelineData,
  type TimelineEventMap,
} from '@timeline/core';

export interface TimelineOptions {
  onDiagnostic?: OnDiagnostic;
  /** Allow `ctrl`/`⌘`+click to extend the selection (DESIGN.md §9). */
  multiSelect?: boolean;
}

export interface UseTimelineArgs<TData> {
  baseRef: RefObject<HTMLCanvasElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  data?: TimelineData<TData>;
  theme?: Partial<Theme>;
  options?: TimelineOptions;
  onReady?: () => void;
  onViewportChange?: (v: TimelineEventMap<TData>['viewportChange']) => void;
  onDataChange?: (d: TimelineEventMap<TData>['dataChange']) => void;
  onHover?: (hit: HitResult<TData> | null) => void;
  onClick?: (e: TimelineEventMap<TData>['click']) => void;
  onSelectionChange?: (ids: string[]) => void;
}

export function useTimeline<TData>(
  args: UseTimelineArgs<TData>,
): RefObject<TimelineEngine<TData> | null> {
  const { baseRef, overlayRef, containerRef, data, theme, options } = args;
  const engineRef = useRef<TimelineEngine<TData> | null>(null);

  // Keep the latest callbacks/data in refs so the setup effect doesn't re-run
  // when the host passes fresh inline functions each render.
  const callbacks = useRef(args);
  callbacks.current = args;
  const dataRef = useRef(data);
  dataRef.current = data;
  const appliedData = useRef<TimelineData<TData> | undefined>(undefined);

  // Engine lifecycle. Re-creates only when theme/options change by reference
  // (hosts memoize these — §12 referential-stability contract).
  useEffect(() => {
    const base = baseRef.current;
    const overlay = overlayRef.current;
    const container = containerRef.current;
    if (base === null || overlay === null || container === null) return;

    const engine = new TimelineEngine<TData>(base, overlay, {
      theme,
      onDiagnostic: options?.onDiagnostic,
      multiSelect: options?.multiSelect,
    });
    engineRef.current = engine;

    const off = [
      engine.on('ready', () => callbacks.current.onReady?.()),
      engine.on('viewportChange', (v) =>
        callbacks.current.onViewportChange?.(v),
      ),
      engine.on('dataChange', (d) => callbacks.current.onDataChange?.(d)),
      engine.on('hover', (hit) => callbacks.current.onHover?.(hit)),
      engine.on('click', (e) => callbacks.current.onClick?.(e)),
      engine.on('selectionChange', (s) =>
        callbacks.current.onSelectionChange?.(s.ids),
      ),
    ];

    const applySize = (cssW: number, cssH: number) =>
      engine.resize(cssW, cssH, window.devicePixelRatio || 1);

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) applySize(rect.width, rect.height);
    });
    observer.observe(container);

    const rect = container.getBoundingClientRect();
    applySize(rect.width, rect.height);

    if (dataRef.current) {
      engine.setData(dataRef.current);
      appliedData.current = dataRef.current;
    }

    return () => {
      for (const unsubscribe of off) unsubscribe();
      observer.disconnect();
      engine.dispose();
      engineRef.current = null;
      appliedData.current = undefined;
    };
  }, [baseRef, overlayRef, containerRef, theme, options]);

  // Data sync: full setData whenever the `data` reference changes (§10, §12).
  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null || data === appliedData.current) return;
    if (data) engine.setData(data);
    appliedData.current = data;
  }, [data]);

  return engineRef;
}
