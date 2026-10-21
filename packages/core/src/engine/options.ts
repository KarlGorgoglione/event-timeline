// Engine options and their resolved form (DESIGN.md §6, §7, §11, §12).
//
// Hosts pass a sparse `TimelineEngineOptions`; `resolveConfig` fills every
// default and binds the style/label resolution functions once, so the rest of
// the engine reads one complete `EngineConfig`. Options can change at runtime
// (`setOptions`); the engine re-resolves and invalidates only what the changed
// keys affect.

import { bySourceTargetColumn } from '../cluster/strategies';
import type { ClusterStrategy } from '../cluster/types';
import { byFirstEvent } from '../layout/byFirstEvent';
import type { LayoutStrategy } from '../layout/types';
import type { OnDiagnostic } from '../model/diagnostics';
import type {
  ElementStyle,
  EventStyle,
  Theme,
  ThemeInput,
  TimelineElement,
  TimelineEvent,
} from '../model/types';
import {
  overlayStyle,
  type ElementStyleResolver,
  type EventStyleResolver,
} from '../render/resolveStyle';
import type {
  ClusteringConfig,
  EventLabelConfig,
  EventLabelPlacement,
  LodConfig,
} from '../scene/context';
import type { RendererLayers, RendererPreference } from '../render/types';
import type { RowMetrics, ZoomLimits } from '../scale/camera';
import type { TickFormatter } from '../scale/ticks';
import type { FrameSource } from './scheduler';
import { DAY_MS } from '../model/time';
import { resolveTheme, validateThemeFonts } from './theme';

/** Event collapsing/aggregation config (DESIGN.md §6); all fields defaulted. */
export interface ClusteringOptions {
  /** Collapse dense events into count markers. Default `true`. */
  enabled?: boolean;
  /** Keying strategy. Default `bySourceTargetColumn`. */
  strategy?: ClusterStrategy;
  /** Pixel separation under which same-key events merge. Default 12. */
  minSeparationPx?: number;
  /**
   * Zoomed far out, the most markers and arrows a frame draws for the
   * pair-keyed strategies (`bySourceTargetColumn`, `byElementPair`). Above
   * it, events are read from precomputed per-pair time bins, coarsened until
   * the window holds at most this many, instead of one by one — so a frame
   * costs the same at 50k events as at 5k. Other strategies always cluster
   * event by event. `Infinity` turns aggregation off. Default 4000.
   */
  maxMarkers?: number;
}

/** Level-of-detail config (DESIGN.md §6); all fields defaulted. */
export interface LodOptions {
  /** Zoom (CSS px per ms) at/above which per-event labels are drawn. */
  eventLabelMinPxPerMs?: number;
}

/** Arrow drawing details (DESIGN.md §1); all fields defaulted. */
export interface ArrowOptions {
  /**
   * Bridge arcs where a riser crosses another element's line. `'auto'`
   * (default) draws them while a frame would draw at most {@link hopBudget}
   * of them, and drops them in denser views where they cost the most and
   * show the least.
   */
  hops?: boolean | 'auto';
  /** Radius of a hop arc, CSS px. Default 4. */
  hopRadius?: number;
  /** Most hop arcs per frame for `hops: 'auto'` to draw them. Default 400. */
  hopBudget?: number;
  /** Horizontal nudge between arrows sharing a pixel column, CSS px. Default 2. */
  subLaneStep?: number;
  /** Most nudges applied in one column. Default 4. */
  subLaneMax?: number;
  /** Mark where an arrow lands with a dot on the target line. Default true. */
  targetDot?: boolean;
}

/** Label culling (DESIGN.md §4, §6); all fields defaulted. */
export interface LabelOptions {
  /** Most event and cluster labels drawn per frame. Default 400. */
  maxPerFrame?: number;
  /** Skip labels that would overlap one already drawn. Default true. */
  avoidCollisions?: boolean;
}

/**
 * Per-frame timing for one drawn layer (DESIGN.md §13), reported to the
 * optional `onFrameStats` sink after each layer draw.
 */
export interface FrameStats {
  layer: 'base' | 'overlay';
  /** Wall-clock cost of the layer's draw, in milliseconds. */
  durationMs: number;
}

/**
 * Data-driven per-item style overrides (DESIGN.md §11). Each callback runs
 * between the theme default and the item's own `.style`; most specific wins.
 */
export interface StyleResolvers<TData = unknown> {
  element?: ElementStyleResolver<TData>;
  event?: EventStyleResolver<TData>;
}

/**
 * Label/tick text formatters (DESIGN.md §11). When omitted the engine shows
 * the raw label (the id for an unlabelled element) and the built-in UTC tick
 * labels (§8).
 */
export interface Formatters<TData = unknown> {
  tickLabel?: TickFormatter;
  eventLabel?: (event: TimelineEvent<TData>) => string | undefined;
  elementLabel?: (element: TimelineElement<TData>) => string;
}

/** Accessible name and summary for the timeline region. */
export interface AccessibilityOptions {
  /** Accessible name. Default `'Timeline'`. */
  label?: string;
  /** Optional text summary, exposed through `aria-describedby`. */
  description?: string;
}

/** Pointer options (DESIGN.md §9). */
export interface PointerOptions {
  /**
   * Mouse buttons (`PointerEvent.button`) that may pan or click. Default `[0]`
   * (primary only), so a right-click opens the context menu instead of
   * changing the selection.
   */
  buttons?: readonly number[];
}

/**
 * When `setData` reframes the camera (DESIGN.md §3): `'auto'` (default)
 * fits the first dataset and any later one that lies outside the current
 * view; `'always'` fits every dataset; `'first'` only the first; `'never'`
 * leaves the camera to the host.
 */
export type FitOnDataChange = 'auto' | 'always' | 'first' | 'never';

/** Pan limits (DESIGN.md §3). */
export interface PanOptions {
  /**
   * `'none'` (default) pans freely; `'data'` keeps the visible window on the
   * data extent.
   */
  bounds?: 'none' | 'data';
}

/** Options that can be changed after construction with `setOptions`. */
export interface TimelineOptions<TData = unknown> {
  theme?: ThemeInput;
  onDiagnostic?: OnDiagnostic;
  /**
   * Base-layer rendering backend (DESIGN.md §4): a preference — `'auto'`
   * (default: WebGL2 when hardware-accelerated, else Canvas2D), `'webgl'` or
   * `'canvas2d'` — or a pair of host renderers for headless/custom drawing.
   */
  renderer?: RendererPreference | RendererLayers;
  layout?: LayoutStrategy;
  /**
   * Trailing-edge delay (ms) for coalescing incremental re-layouts under
   * `streamingLayout: 'full'` (DESIGN.md §7, §10). Default 120.
   */
  layoutDebounceMs?: number;
  /** Allow `ctrl`/`⌘`+click to extend the selection (DESIGN.md §9). */
  multiSelect?: boolean;
  /**
   * Re-layout policy for incremental mutations (§10). Default
   * `'stable-append'`: existing rows stay put and new elements append,
   * immediately. `'full'` re-runs the layout strategy on the debounced
   * {@link layoutDebounceMs} seam. `setData` always relayouts in full.
   */
  streamingLayout?: 'stable-append' | 'full';
  clustering?: ClusteringOptions;
  lod?: LodOptions;
  arrows?: ArrowOptions;
  labels?: LabelOptions;
  /**
   * Elements without events (DESIGN.md §1): `'hide'` (default) leaves them
   * out of the layout; `'show'` keeps their row and draws just the label.
   */
  emptyElements?: 'hide' | 'show';
  /**
   * Event-label placement (DESIGN.md §11): `'midpoint'` (default) beside the
   * riser at its vertical midpoint, or `'sourceNode'` above/below the source
   * dot. Placement only moves the label; its style is the same in both.
   */
  eventLabel?: { placement?: EventLabelPlacement };
  /** Data-driven per-item style overrides (DESIGN.md §11). */
  styleResolvers?: StyleResolvers<TData>;
  /** Label/tick text formatters (DESIGN.md §11). */
  formatters?: Formatters<TData>;
  /**
   * Optional per-frame timing sink (DESIGN.md §13). When omitted the draw
   * path takes no timing measurements at all.
   */
  onFrameStats?: (stats: FrameStats) => void;
  accessibility?: AccessibilityOptions;
  pointer?: PointerOptions;
  /**
   * Keyboard navigation while the timeline has focus (DESIGN.md §9): arrows
   * pan and scroll, +/− zoom, 0 fits the data, Escape clears the selection.
   * Default `true`.
   */
  keyboard?: boolean;
  /**
   * Zoom limits in CSS px per ms (DESIGN.md §3): `min` is the deepest
   * zoom-out (default `'fit'`, the whole dataset), `max` the deepest zoom-in
   * (default 20 px per minute).
   */
  zoom?: ZoomLimits;
  pan?: PanOptions;
  fitOnDataChange?: FitOnDataChange;
  /**
   * Locale(s) for the built-in header labels, which are always in UTC
   * (DESIGN.md §8). Default `'en-US'`.
   */
  locale?: string | readonly string[];
}

/** Construction options: everything settable at runtime plus the injected seams. */
export interface TimelineEngineOptions<
  TData = unknown,
> extends TimelineOptions<TData> {
  /** Frame scheduler. Default `requestAnimationFrame`. */
  scheduler?: FrameSource;
  /** Clock used to frame an empty timeline on "now". Default `Date.now`. */
  now?: () => number;
}

/** Default clustering merge distance in CSS px (§6). */
const DEFAULT_CLUSTER_MIN_SEPARATION_PX = 12;
/** Default marker budget of an aggregated (zoomed-out) frame (§6). */
const DEFAULT_CLUSTER_MAX_MARKERS = 4000;
/** Default label-LOD threshold: show event labels at ≥40 CSS px per day (§6). */
const DEFAULT_EVENT_LABEL_MIN_PX_PER_DAY = 40;
/** Default trailing-edge delay (ms) for coalesced incremental re-layout (§7). */
export const DEFAULT_LAYOUT_DEBOUNCE_MS = 120;

/** Every option resolved to a concrete value, plus bound resolution helpers. */
export interface EngineConfig<TData> {
  theme: Theme;
  metrics: RowMetrics;
  layout: LayoutStrategy;
  layoutDebounceMs: number;
  streamingLayout: 'stable-append' | 'full';
  multiSelect: boolean;
  clustering: ClusteringConfig;
  lod: LodConfig;
  arrows: Required<ArrowOptions>;
  labels: Required<LabelOptions>;
  emptyElements: 'hide' | 'show';
  eventLabel: EventLabelConfig;
  onFrameStats: ((stats: FrameStats) => void) | undefined;
  accessibility: { label: string; description: string | undefined };
  pointerButtons: readonly number[];
  keyboard: boolean;
  zoom: ZoomLimits;
  panBounds: 'none' | 'data';
  fitOnDataChange: FitOnDataChange;
  locale: string | readonly string[];
  /** §11 resolution: theme → resolver → per-item `.style`. */
  resolveElementStyle: (element: TimelineElement<TData>) => ElementStyle;
  /** Whether a style resolver exists (else unstyled items share the theme's). */
  hasElementResolver: boolean;
  hasEventResolver: boolean;
  resolveEventStyle: (event: TimelineEvent<TData>) => EventStyle;
  formatElementLabel: (element: TimelineElement<TData>) => string;
  formatEventLabel: (event: TimelineEvent<TData>) => string | undefined;
  tickFormatter: TickFormatter | undefined;
}

export function resolveConfig<TData>(
  options: TimelineOptions<TData>,
  onDiagnostic: OnDiagnostic,
): EngineConfig<TData> {
  const theme = validateThemeFonts(resolveTheme(options.theme), onDiagnostic);
  const elementResolver = options.styleResolvers?.element;
  const eventResolver = options.styleResolvers?.event;
  return {
    theme,
    metrics: {
      headerHeight: theme.header.height,
      rowHeight: theme.layout.rowHeight,
      rowGap: theme.layout.rowGap,
    },
    layout: options.layout ?? byFirstEvent,
    layoutDebounceMs: options.layoutDebounceMs ?? DEFAULT_LAYOUT_DEBOUNCE_MS,
    streamingLayout: options.streamingLayout ?? 'stable-append',
    multiSelect: options.multiSelect ?? false,
    clustering: {
      enabled: options.clustering?.enabled ?? true,
      strategy: options.clustering?.strategy ?? bySourceTargetColumn,
      minSeparationPx:
        options.clustering?.minSeparationPx ??
        DEFAULT_CLUSTER_MIN_SEPARATION_PX,
      maxMarkers: atLeastOne(
        options.clustering?.maxMarkers,
        DEFAULT_CLUSTER_MAX_MARKERS,
      ),
    },
    lod: {
      eventLabelMinPxPerMs:
        options.lod?.eventLabelMinPxPerMs ??
        DEFAULT_EVENT_LABEL_MIN_PX_PER_DAY / DAY_MS,
    },
    eventLabel: { placement: options.eventLabel?.placement ?? 'midpoint' },
    arrows: {
      hops: options.arrows?.hops ?? 'auto',
      hopRadius: options.arrows?.hopRadius ?? 4,
      hopBudget: options.arrows?.hopBudget ?? 400,
      subLaneStep: options.arrows?.subLaneStep ?? 2,
      subLaneMax: options.arrows?.subLaneMax ?? 4,
      targetDot: options.arrows?.targetDot ?? true,
    },
    labels: {
      maxPerFrame: options.labels?.maxPerFrame ?? 400,
      avoidCollisions: options.labels?.avoidCollisions ?? true,
    },
    emptyElements: options.emptyElements ?? 'hide',
    onFrameStats: options.onFrameStats,
    accessibility: {
      label: options.accessibility?.label ?? 'Timeline',
      description: options.accessibility?.description,
    },
    pointerButtons: options.pointer?.buttons ?? [0],
    keyboard: options.keyboard ?? true,
    zoom: options.zoom ?? {},
    panBounds: options.pan?.bounds ?? 'none',
    fitOnDataChange: options.fitOnDataChange ?? 'auto',
    locale: options.locale ?? 'en-US',
    hasElementResolver: elementResolver !== undefined,
    hasEventResolver: eventResolver !== undefined,
    resolveElementStyle: (element) =>
      overlayStyle(theme.element, elementResolver?.(element), element.style),
    resolveEventStyle: (event) =>
      overlayStyle(theme.event, eventResolver?.(event), event.style),
    formatElementLabel:
      options.formatters?.elementLabel ??
      ((element) =>
        typeof element.label === 'string' ? element.label : element.id),
    formatEventLabel:
      options.formatters?.eventLabel ?? ((event) => event.label),
    tickFormatter: options.formatters?.tickLabel,
  };
}

/** `value` when it is a number ≥ 1 (Infinity included), else `fallback`. */
function atLeastOne(value: number | undefined, fallback: number): number {
  return value !== undefined && value >= 1 ? value : fallback;
}
