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
  type Selection,
  type SelectionInput,
  type StyleResolvers,
  type ThemeInput,
  type Time,
  type TimelineData,
  type TimelineElement,
  type TimelineEngine,
  type TimelineEvent,
  type TimelineEventMap,
  type ViewportState,
} from '@event-timeline/core';
import { useTimeline, type TimelineOptions } from './useTimeline';
import { placeTooltip, Tooltip } from './Tooltip';

/**
 * Props for the {@link Timeline} component (DESIGN.md §12). `options`,
 * `theme`, `styleResolvers` and `formatters` may be passed inline: they are
 * compared field by field and only real changes reach the engine. Functions
 * inside them are compared by reference, so a new function redraws.
 */
export interface TimelineProps<TData = unknown> {
  data?: TimelineData<TData>;
  theme?: ThemeInput;
  options?: TimelineOptions<TData>;
  /** Data-driven per-item style overrides (DESIGN.md §11). */
  styleResolvers?: StyleResolvers<TData>;
  /** Label/tick text formatters (DESIGN.md §11). */
  formatters?: Formatters<TData>;
  /** Show the hover tooltip. Default true. */
  tooltip?: boolean;
  /**
   * Custom tooltip content; return `null` to show no tooltip for a hit. The
   * default shows the formatted label (and a member list for clusters).
   */
  renderTooltip?: (hit: HitResult<TData>) => ReactNode;
  /** Class applied to the root container. */
  className?: string;
  /** Inline style merged over the default container style. */
  style?: CSSProperties;
  onReady?: () => void;
  /** The first frame was drawn. */
  onFirstFrame?: () => void;
  onViewportChange?: (v: TimelineEventMap<TData>['viewportChange']) => void;
  onDataChange?: (d: TimelineEventMap<TData>['dataChange']) => void;
  onHover?: (hit: HitResult<TData> | null) => void;
  onClick?: (e: TimelineEventMap<TData>['click']) => void;
  onSelectionChange?: (selection: Selection) => void;
}

/** Imperative handle returned via `ref` (DESIGN.md §12). */
export interface TimelineHandle<TData = unknown> {
  readonly version: string;
  /** The underlying engine, or null before mount / after unmount. */
  readonly engine: TimelineEngine<TData> | null;
  fit(): void;
  panToTime(t: Time): void;
  zoomToRange(start: Time, end: Time): void;
  zoomIn(factor?: number): void;
  zoomOut(factor?: number): void;
  setScrollY(scrollY: number): void;
  scrollToElement(id: string): void;
  revealEvent(id: string): void;
  select(selection: SelectionInput): void;
  getSelection(): Selection;
  clearSelection(): void;
  /** The visible window, or null while no engine exists. */
  getViewport(): ViewportState | null;
  /** The base layer's backend, or null while no engine exists. */
  getRendererBackend(): string | null;
  setData(data: TimelineData<TData>): void;
  /** A snapshot of the engine's dataset (null while no engine exists). */
  getData(): TimelineData<TData> | null;
  // Streaming (DESIGN.md §10): incremental updates that bypass `data`.
  addEvents(events: readonly TimelineEvent<TData>[]): void;
  removeEvents(ids: readonly string[]): void;
  updateEvent(id: string, patch: Partial<TimelineEvent<TData>>): void;
  addElements(elements: readonly TimelineElement<TData>[]): void;
  removeElements(ids: readonly string[]): void;
  updateElement(id: string, patch: Partial<TimelineElement<TData>>): void;
}

const containerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const EMPTY_SELECTION: Selection = { elements: [], events: [] };

function TimelineInner<TData>(
  props: TimelineProps<TData>,
  ref: ForwardedRef<TimelineHandle<TData>>,
) {
  const { className, style, data, theme, options, styleResolvers, formatters } =
    props;
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  // The pointer position lives in a ref: moving the pointer only moves the
  // tooltip element, it never re-renders the component.
  const pointer = useRef({ x: 0, y: 0 });
  const [hover, setHover] = useState<HitResult<TData> | null>(null);

  const engineRef = useTimeline<TData>({
    containerRef,
    data,
    theme,
    options,
    styleResolvers,
    formatters,
    onReady: props.onReady,
    onFirstFrame: props.onFirstFrame,
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
      get engine() {
        return engineRef.current;
      },
      fit: () => engineRef.current?.fit(),
      panToTime: (t) => engineRef.current?.panToTime(t),
      zoomToRange: (s, e) => engineRef.current?.zoomToRange(s, e),
      zoomIn: (factor) => engineRef.current?.zoomIn(factor),
      zoomOut: (factor) => engineRef.current?.zoomOut(factor),
      setScrollY: (y) => engineRef.current?.setScrollY(y),
      scrollToElement: (id) => engineRef.current?.scrollToElement(id),
      revealEvent: (id) => engineRef.current?.revealEvent(id),
      select: (selection) => engineRef.current?.select(selection),
      getSelection: () => engineRef.current?.getSelection() ?? EMPTY_SELECTION,
      clearSelection: () => engineRef.current?.clearSelection(),
      getViewport: () => engineRef.current?.getViewport() ?? null,
      getRendererBackend: () => engineRef.current?.getRendererBackend() ?? null,
      setData: (d) => engineRef.current?.setData(d),
      getData: () => engineRef.current?.getData() ?? null,
      addEvents: (e) => engineRef.current?.addEvents(e),
      removeEvents: (ids) => engineRef.current?.removeEvents(ids),
      updateEvent: (id, patch) => engineRef.current?.updateEvent(id, patch),
      addElements: (el) => engineRef.current?.addElements(el),
      removeElements: (ids) => engineRef.current?.removeElements(ids),
      updateElement: (id, patch) => engineRef.current?.updateElement(id, patch),
    }),
    [engineRef],
  );

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointer.current = { x: e.clientX, y: e.clientY };
    if (tooltipRef.current !== null) {
      placeTooltip(tooltipRef.current, e.clientX, e.clientY);
    }
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...containerStyle, ...style }}
      data-testid="timeline-root"
      onPointerMove={onPointerMove}
    >
      {props.tooltip !== false ? (
        <Tooltip
          ref={tooltipRef}
          hit={hover}
          x={pointer.current.x}
          y={pointer.current.y}
          render={props.renderTooltip}
          formatters={formatters}
          theme={theme}
        />
      ) : null}
    </div>
  );
}

/**
 * Canvas timeline component. Mounts a core engine into its container and
 * keeps it in sync with the props (DESIGN.md §4, §12).
 */
export const Timeline = forwardRef(TimelineInner) as <TData = unknown>(
  props: TimelineProps<TData> & { ref?: Ref<TimelineHandle<TData>> },
) => ReturnType<typeof TimelineInner>;
