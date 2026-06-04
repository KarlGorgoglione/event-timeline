import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ForwardedRef,
  type Ref,
} from 'react';
import {
  VERSION,
  type Theme,
  type Time,
  type TimelineData,
  type TimelineEventMap,
} from '@timeline/core';
import { useTimeline, type TimelineOptions } from './useTimeline';

/**
 * Props for the {@link Timeline} component (Phase 1 subset, DESIGN.md §12).
 * `data`, `theme`, and `options` should be memoized by the host: they are
 * diffed by reference and re-applied only when the reference changes.
 */
export interface TimelineProps<TData = unknown> {
  data?: TimelineData<TData>;
  theme?: Partial<Theme>;
  options?: TimelineOptions;
  /** Class applied to the root container. */
  className?: string;
  /** Inline style merged over the default container style. */
  style?: CSSProperties;
  onReady?: () => void;
  onViewportChange?: (v: TimelineEventMap<TData>['viewportChange']) => void;
  onDataChange?: (d: TimelineEventMap<TData>['dataChange']) => void;
}

/** Imperative handle returned via `ref` (Phase 1 subset, DESIGN.md §12). */
export interface TimelineHandle<TData = unknown> {
  readonly version: string;
  fit(): void;
  panToTime(t: Time): void;
  getViewport(): TimelineEventMap<TData>['viewportChange'];
  resize(cssW: number, cssH: number, dpr: number): void;
  setData(data: TimelineData<TData>): void;
}

const containerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const canvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
};

const EMPTY_VIEWPORT: TimelineEventMap['viewportChange'] = {
  timeRange: [0, 0],
  scrollY: 0,
  pxPerMs: 0,
  visibleRowRange: [0, 0],
};

function TimelineInner<TData>(
  props: TimelineProps<TData>,
  ref: ForwardedRef<TimelineHandle<TData>>,
) {
  const { className, style, data, theme, options } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const engineRef = useTimeline<TData>({
    baseRef,
    overlayRef,
    containerRef,
    data,
    theme,
    options,
    onReady: props.onReady,
    onViewportChange: props.onViewportChange,
    onDataChange: props.onDataChange,
  });

  useImperativeHandle(
    ref,
    (): TimelineHandle<TData> => ({
      version: VERSION,
      fit: () => engineRef.current?.fit(),
      panToTime: (t) => engineRef.current?.panToTime(t),
      getViewport: () => engineRef.current?.getViewport() ?? EMPTY_VIEWPORT,
      resize: (w, h, dpr) => engineRef.current?.resize(w, h, dpr),
      setData: (d) => engineRef.current?.setData(d),
    }),
    [engineRef],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...containerStyle, ...style }}
      data-testid="timeline-root"
    >
      <canvas ref={baseRef} style={canvasStyle} />
      <canvas ref={overlayRef} style={canvasStyle} />
    </div>
  );
}

/**
 * Canvas timeline component. Owns the two stacked `<canvas>` layers and the
 * ResizeObserver, and drives the core engine imperatively (DESIGN.md §4, §12).
 */
export const Timeline = forwardRef(TimelineInner) as <TData = unknown>(
  props: TimelineProps<TData> & { ref?: Ref<TimelineHandle<TData>> },
) => ReturnType<typeof TimelineInner>;
