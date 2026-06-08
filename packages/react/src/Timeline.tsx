import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  VERSION,
  type Formatters,
  type HitResult,
  type StyleResolvers,
  type Theme,
  type Time,
  type TimelineData,
  type TimelineElement,
  type TimelineEvent,
  type TimelineEventMap,
} from '@event-timeline/core';
import { useTimeline, type TimelineOptions } from './useTimeline';
import { Tooltip } from './Tooltip';

/**
 * Props for the {@link Timeline} component (Phase 1 subset, DESIGN.md §12).
 * `data`, `theme`, and `options` should be memoized by the host: they are
 * diffed by reference and re-applied only when the reference changes.
 */
export interface TimelineProps<TData = unknown> {
  data?: TimelineData<TData>;
  theme?: Partial<Theme>;
  options?: TimelineOptions;
  /** Data-driven per-item style overrides (DESIGN.md §11, §12); memoize. */
  styleResolvers?: StyleResolvers<TData>;
  /** Label/tick text formatters (DESIGN.md §11, §12); memoize. */
  formatters?: Formatters<TData>;
  /** Optional host renderer for tooltip content; defaults to label-only text. */
  renderTooltip?: (hit: HitResult<TData>) => ReactNode;
  /** Class applied to the root container. */
  className?: string;
  /** Inline style merged over the default container style. */
  style?: CSSProperties;
  onReady?: () => void;
  onViewportChange?: (v: TimelineEventMap<TData>['viewportChange']) => void;
  onDataChange?: (d: TimelineEventMap<TData>['dataChange']) => void;
  onHover?: (hit: HitResult<TData> | null) => void;
  onClick?: (e: TimelineEventMap<TData>['click']) => void;
  onSelectionChange?: (ids: string[]) => void;
}

/** Imperative handle returned via `ref` (DESIGN.md §12). */
export interface TimelineHandle<TData = unknown> {
  readonly version: string;
  fit(): void;
  panToTime(t: Time): void;
  zoomToRange(start: Time, end: Time): void;
  setScrollY(scrollY: number): void;
  select(ids: string[]): void;
  getViewport(): TimelineEventMap<TData>['viewportChange'];
  resize(cssW: number, cssH: number, dpr: number): void;
  setData(data: TimelineData<TData>): void;
  // Streaming methods (DESIGN.md §10): incremental updates that bypass the
  // prop-driven full `setData`, for high-frequency hosts.
  addEvents(events: readonly TimelineEvent<TData>[]): void;
  removeEvents(ids: readonly string[]): void;
  addElements(elements: readonly TimelineElement<TData>[]): void;
  updateElement(id: string, patch: Partial<TimelineElement<TData>>): void;
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
  const { className, style, data, theme, options, styleResolvers, formatters } =
    props;
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Hover hit (from the engine) and the pointer position (from the DOM) drive
  // the HTML tooltip. Tracking position in React keeps canvas hit-testing in
  // the engine while text rendering stays crisp HTML (§9).
  const [hover, setHover] = useState<HitResult<TData> | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const engineRef = useTimeline<TData>({
    baseRef,
    overlayRef,
    containerRef,
    data,
    theme,
    options,
    styleResolvers,
    formatters,
    onReady: props.onReady,
    onViewportChange: props.onViewportChange,
    onDataChange: props.onDataChange,
    onHover: (hit) => {
      setHover(hit);
      props.onHover?.(hit);
    },
    onClick: props.onClick,
    onSelectionChange: props.onSelectionChange,
  });

  useImperativeHandle(
    ref,
    (): TimelineHandle<TData> => ({
      version: VERSION,
      fit: () => engineRef.current?.fit(),
      panToTime: (t) => engineRef.current?.panToTime(t),
      zoomToRange: (s, e) => engineRef.current?.zoomToRange(s, e),
      setScrollY: (y) => engineRef.current?.setScrollY(y),
      select: (ids) => engineRef.current?.select(ids),
      getViewport: () => engineRef.current?.getViewport() ?? EMPTY_VIEWPORT,
      resize: (w, h, dpr) => engineRef.current?.resize(w, h, dpr),
      setData: (d) => engineRef.current?.setData(d),
      addEvents: (e) => engineRef.current?.addEvents(e),
      removeEvents: (ids) => engineRef.current?.removeEvents(ids),
      addElements: (el) => engineRef.current?.addElements(el),
      updateElement: (id, patch) => engineRef.current?.updateElement(id, patch),
    }),
    [engineRef],
  );

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) =>
    setPointer({ x: e.clientX, y: e.clientY });

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...containerStyle, ...style }}
      data-testid="timeline-root"
      onPointerMove={onPointerMove}
    >
      <canvas ref={baseRef} style={canvasStyle} />
      <canvas ref={overlayRef} style={canvasStyle} />
      <Tooltip
        hit={hover}
        x={pointer.x}
        y={pointer.y}
        render={props.renderTooltip}
      />
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
