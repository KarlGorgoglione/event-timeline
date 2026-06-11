// The composition root and public engine API (DESIGN.md §2, §4, §12).
//
// A thin facade that wires the store, camera, layout, renderer, scheduler,
// emitter, and pan controller together and owns the per-frame draw assembly.
// It contains no coordinate math of its own (delegates to Camera) and no
// validation of its own (delegates to DataStore).

import { byFirstEvent } from '../layout/byFirstEvent';
import { stableAppend } from '../layout/stableAppend';
import type { LayoutStrategy } from '../layout/types';
import { bySourceTargetColumn } from '../cluster/strategies';
import type { ClusterStrategy } from '../cluster/types';
import { computeRowLayout, type RowLayout } from '../layout/positions';
import type { OnDiagnostic } from '../model/diagnostics';
import { DataStore, type DataChangeCounts } from '../model/store';
import type {
  ElementStyle,
  EventStyle,
  TimelineData,
  TimelineElement,
  TimelineEvent,
  Theme,
  Time,
} from '../model/types';
import { buildArrows } from '../render/arrows';
import { createRenderer } from '../render/createRenderer';
import {
  hairlineOffset,
  scaleFontToDevice,
  snapDevice,
} from '../render/device';
import { buildElementLines, markerReserveLeftPx } from '../render/elementLines';
import { buildRowSeparators } from '../render/separators';
import { IconCache, isIconUrl } from '../render/iconCache';
import { visibleRowBand } from '../render/rowBand';
import {
  scaleDash,
  snapArrowheads,
  snapIcons,
  snapLabels,
  snapLines,
  snapNodes,
  snapRects,
} from '../render/snap';
import type {
  BuildContext,
  ClusteringConfig,
  EventLabelConfig,
  EventLabelPlacement,
  LodConfig,
  ResolveIcon,
} from '../render/specs';
import type {
  LineSegment,
  Renderer,
  RendererBackend,
  RendererPreference,
} from '../render/types';
import {
  Camera,
  computeZoomBounds,
  fit,
  type FitInset,
  type RowMetrics,
  type Viewport,
} from '../scale/camera';
import { generateTicks, type TickFormatter } from '../scale/ticks';
import {
  overlayStyle,
  type ElementStyleResolver,
  type EventStyleResolver,
} from '../render/resolveStyle';
import { PointerController, type PointerHost } from '../interaction/pointer';
import { buildHitGrid, type HitGrid } from '../interaction/hitGrid';
import { hitTest } from '../interaction/hitTest';
import type { HitResult } from '../interaction/hit';
import { nextSelection, sameSet } from '../interaction/selection';
import type { HitTarget } from '../render/specs';
import { debounce, type Debounced } from './debounce';
import { TypedEmitter, type TimelineEventMap } from './emitter';
import { FrameScheduler, type DirtyFlags } from './scheduler';
import { resolveTheme } from './theme';

/**
 * Upper bound on the memoised `measureText` width cache (§4). Visible boxed
 * labels are LOD- and viewport-gated, so the live working set is far smaller;
 * the cap only stops historical/off-screen labels from accumulating without
 * bound under a long stream (which never calls `setData`). On overflow the
 * cache is cleared wholesale — the next frame cheaply re-measures only the few
 * labels actually on screen.
 */
const MEASURE_CACHE_MAX = 8192;

/** Event collapsing/aggregation config (DESIGN.md §6); all fields defaulted. */
export interface ClusteringOptions {
  /** Collapse dense events into count markers. Default `true`. */
  enabled?: boolean;
  /** Keying strategy. Default `bySourceTargetColumn`. */
  strategy?: ClusterStrategy;
  /** Pixel separation under which same-key events merge. Default 12. */
  minSeparationPx?: number;
}

/** Level-of-detail config (DESIGN.md §6); all fields defaulted. */
export interface LodOptions {
  /** Zoom (CSS px per ms) at/above which per-event labels are drawn. */
  eventLabelMinPxPerMs?: number;
}

/**
 * Per-frame timing for one drawn layer (DESIGN.md §13). Emitted to the optional
 * `onFrameStats` sink after each layer draw so hosts and the perf benchmark can
 * assert the §13 budgets (≤16ms base, ≤4ms overlay at 50k) without the engine
 * itself depending on `performance` or any logging implementation (DIP).
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
 * Label/tick text formatters (DESIGN.md §11). When omitted the engine echoes the
 * raw label (and the built-in UTC tick formatter of §8).
 */
export interface Formatters<TData = unknown> {
  tickLabel?: TickFormatter;
  eventLabel?: (event: TimelineEvent<TData>) => string;
  elementLabel?: (element: TimelineElement<TData>) => string;
}

export interface TimelineEngineOptions<TData = unknown> {
  theme?: Partial<Theme>;
  onDiagnostic?: OnDiagnostic;
  /**
   * Rendering backend (DESIGN.md §4, §16). `'auto'` (default) uses WebGL2 when
   * it is available and hardware-accelerated, falling back to Canvas2D;
   * `'webgl'` forces WebGL2 whenever the API exists (even software-rendered);
   * `'canvas2d'` skips probing. Note a canvas is permanently bound to its
   * first context type — switching backends needs fresh canvas elements.
   */
  renderer?: RendererPreference;
  layout?: LayoutStrategy;
  /**
   * Trailing-edge delay (ms) for coalescing incremental re-layouts (DESIGN.md
   * §7, §10). Applies only to the incremental seam ({@link scheduleLayoutRecompute});
   * a full `setData` always recomputes synchronously. Default 120.
   */
  layoutDebounceMs?: number;
  /** Allow `ctrl`/`⌘`+click to extend the selection (DESIGN.md §9). */
  multiSelect?: boolean;
  /**
   * Re-layout policy for incremental mutations (`addEvents`/… §10). Default
   * `'stable-append'`: existing rows stay put and new elements append, applied
   * synchronously so updates appear at once with no jarring reshuffle (§7).
   * `'full'` opts into re-running the configured {@link layout} strategy on the
   * debounced {@link layoutDebounceMs} seam. `setData` always relayouts in full.
   */
  streamingLayout?: 'stable-append' | 'full';
  clustering?: ClusteringOptions;
  lod?: LodOptions;
  /**
   * Event-label placement (DESIGN.md §11): where each event's label sits relative
   * to its arrow. `'sourceNode'` centres it above/below the source node dot
   * (direction-aware); `'midpoint'` (default) places it beside the riser at its
   * vertical midpoint. Placement only moves the label — its style (text + the
   * themeable {@link EventStyle} `labelBox*` box) is identical in every placement.
   */
  eventLabel?: { placement?: EventLabelPlacement };
  /** Data-driven per-item style overrides (DESIGN.md §11). */
  styleResolvers?: StyleResolvers<TData>;
  /** Label/tick text formatters (DESIGN.md §11). */
  formatters?: Formatters<TData>;
  /**
   * Optional per-frame timing sink (DESIGN.md §13). When supplied, each layer
   * draw is bracketed with `performance.now()` and reported; when omitted the
   * draw path stays allocation- and measurement-free (zero overhead).
   */
  onFrameStats?: (stats: FrameStats) => void;
}

/** Minimum pixel spacing header labels need (§8). */
const MIN_LABEL_GAP_PX = 64;
const MS_PER_DAY = 86_400_000;
/** Default clustering merge distance in CSS px (§6). */
const DEFAULT_CLUSTER_MIN_SEPARATION_PX = 12;
/** Default label-LOD threshold: show event labels at ≥40 CSS px per day (§6). */
const DEFAULT_EVENT_LABEL_MIN_PX_PER_DAY = 40;
/** Default trailing-edge delay (ms) for coalesced incremental re-layout (§7). */
const DEFAULT_LAYOUT_DEBOUNCE_MS = 120;

export class TimelineEngine<TData = unknown> {
  private readonly theme: Theme;
  private readonly metrics: RowMetrics;
  private readonly store: DataStore<TData>;
  private readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly scheduler: FrameScheduler;
  private readonly emitter = new TypedEmitter<TimelineEventMap<TData>>();
  private readonly pointer: PointerController;
  private readonly multiSelect: boolean;
  private readonly layoutStrategy: LayoutStrategy;
  /** Incremental re-layout policy (DESIGN.md §7, §10). */
  private readonly streamingLayout: 'stable-append' | 'full';
  /**
   * Coalesced incremental re-layout (DESIGN.md §7). Streaming mutations
   * (`addEvents`/`removeEvents`, §10) call {@link scheduleLayoutRecompute} so a
   * burst re-runs layout once; `setData` bypasses this and recomputes inline.
   */
  private readonly debouncedRecomputeLayout: Debounced<[]>;
  /** Resolved per-frame LOD/clustering config (DESIGN.md §6). */
  private readonly lod: LodConfig;
  private readonly clustering: ClusteringConfig;
  /** Resolved event-label placement config (DESIGN.md §11). */
  private readonly eventLabel: EventLabelConfig;
  /** Memoised text widths for label-box sizing (§4 "caller caches measureText"). */
  private readonly measureCache = new Map<string, number>();
  /**
   * §11 style/label resolution, bound once from the theme + host resolvers. The
   * builders receive these via `BuildContext`, so resolution lives in one place.
   */
  private readonly resolveElementStyle: (
    element: TimelineElement<TData>,
  ) => ElementStyle;
  private readonly resolveEventStyle: (
    event: TimelineEvent<TData>,
  ) => EventStyle;
  private readonly formatElementLabel: (
    element: TimelineElement<TData>,
  ) => string;
  private readonly formatEventLabel: (
    event: TimelineEvent<TData>,
  ) => string | undefined;
  private readonly tickFormatter: TickFormatter | undefined;
  /** Optional per-frame timing sink (DESIGN.md §13); undefined disables timing. */
  private readonly onFrameStats?: (stats: FrameStats) => void;
  private readonly iconCache = new IconCache(() =>
    this.scheduler.markDirty('base'),
  );

  /**
   * Resolve an element icon for the current frame (§1, §11): a preloaded image
   * is used directly when decoded, a URL is loaded/cached (skipped until ready),
   * and any other string (emoji/glyph) is drawn as text by the builder.
   */
  private readonly resolveIcon: ResolveIcon = (icon) => {
    if (typeof icon !== 'string') {
      return icon.complete && icon.naturalWidth > 0
        ? { kind: 'image', image: icon }
        : { kind: 'none' };
    }
    if (isIconUrl(icon)) {
      const image = this.iconCache.get(icon);
      return image ? { kind: 'image', image } : { kind: 'none' };
    }
    return { kind: 'text', text: icon };
  };

  /**
   * Cached text measurement passed to builders via `BuildContext` (§4): wraps the
   * renderer's `measureText` and memoises by font+text. The font is the CSS-px
   * shorthand (dpr-independent), so the cache stays valid across zoom.
   */
  private readonly measureText = (
    text: string,
    font: string,
  ): { width: number } => {
    const key = `${font} ${text}`;
    let width = this.measureCache.get(key);
    if (width === undefined) {
      width = this.renderer.measureText(text, font).width;
      // Bound the cache so a long stream of unique labels can't grow it without
      // limit (§4); clearing is safe because re-measurement is cheap.
      if (this.measureCache.size >= MEASURE_CACHE_MAX)
        this.measureCache.clear();
      this.measureCache.set(key, width);
    }
    return { width };
  };

  private viewport: Viewport = { cssWidth: 0, cssHeight: 0 };
  private dpr = 1;
  private rowLayout: RowLayout = computeRowLayout([], {
    headerHeight: 0,
    rowHeight: 0,
    rowGap: 0,
  });
  private hasFitted = false;
  private disposed = false;

  // --- Interaction state (Phase 3, §9) ---
  /** Hit grid + targets rebuilt each base draw; reused during pure hover (§5). */
  private hitGrid: HitGrid<TData> | null = null;
  private frameTargets: HitTarget<TData>[] = [];
  /** Latest cursor position pending a (frame-coalesced) hit-test, or null. */
  private pendingPointer: { x: number; y: number } | null = null;
  private hovered: HitResult<TData> | null = null;
  private readonly selectedIds = new Set<string>();

  constructor(
    baseCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    options: TimelineEngineOptions<TData> = {},
  ) {
    this.theme = resolveTheme(options.theme);
    this.metrics = {
      headerHeight: this.theme.headerHeight,
      rowHeight: this.theme.rowHeight,
      rowGap: this.theme.rowGap,
    };
    this.layoutStrategy = options.layout ?? byFirstEvent;
    this.streamingLayout = options.streamingLayout ?? 'stable-append';
    this.debouncedRecomputeLayout = debounce(() => {
      if (this.disposed) return;
      this.recomputeLayout('full');
      this.scheduler.markDirty('base');
      this.emitViewportChange();
    }, options.layoutDebounceMs ?? DEFAULT_LAYOUT_DEBOUNCE_MS);
    this.multiSelect = options.multiSelect ?? false;
    this.clustering = {
      enabled: options.clustering?.enabled ?? true,
      strategy: options.clustering?.strategy ?? bySourceTargetColumn,
      minSeparationPx:
        options.clustering?.minSeparationPx ??
        DEFAULT_CLUSTER_MIN_SEPARATION_PX,
    };
    this.lod = {
      eventLabelMinPxPerMs:
        options.lod?.eventLabelMinPxPerMs ??
        DEFAULT_EVENT_LABEL_MIN_PX_PER_DAY / MS_PER_DAY,
    };
    this.eventLabel = {
      placement: options.eventLabel?.placement ?? 'midpoint',
    };
    // Bind §11 resolution once: theme → resolver → per-item `.style`. The theme is
    // fixed per engine instance, so binding here (not per frame) is correct.
    const elementResolver = options.styleResolvers?.element;
    this.resolveElementStyle = (element) =>
      overlayStyle(
        this.theme.element,
        elementResolver?.(element),
        element.style,
      );
    const eventResolver = options.styleResolvers?.event;
    this.resolveEventStyle = (event) =>
      overlayStyle(this.theme.event, eventResolver?.(event), event.style);
    this.formatElementLabel =
      options.formatters?.elementLabel ??
      ((element) => element.label ?? element.id);
    this.formatEventLabel =
      options.formatters?.eventLabel ?? ((event) => event.label);
    this.tickFormatter = options.formatters?.tickLabel;
    this.onFrameStats = options.onFrameStats;
    this.store = new DataStore<TData>({ onDiagnostic: options.onDiagnostic });
    this.camera = new Camera(this.metrics);
    this.renderer = createRenderer(
      baseCanvas,
      overlayCanvas,
      this.theme.background,
      {
        preference: options.renderer ?? 'auto',
        // A restored GL context comes back blank; re-measure defensively and
        // redraw (the overlay redraws with the base, §4).
        onContextRestored: () => {
          this.measureCache.clear();
          this.scheduler.markDirty('base');
        },
      },
    );
    this.scheduler = new FrameScheduler((dirty) => this.drawFrame(dirty));
    // The overlay is the topmost layer, so it receives pointer events; the
    // pointer controller attaches there (base draws beneath it). The controller
    // is a pure input translator — all camera/hit-test math lives in this host.
    this.pointer = new PointerController(overlayCanvas, this.pointerHost());

    queueMicrotask(() => {
      if (!this.disposed) this.emitter.emit('ready', undefined);
    });
  }

  // --- Public API ---

  setData(data: TimelineData<TData>): void {
    // A full data swap retires the previous labels; drop their measurements so
    // the cache reflects only the live dataset (§4).
    this.measureCache.clear();
    const counts = this.store.setData(data);
    this.recomputeLayout('full');
    this.maybeFit();
    this.emitter.emit('dataChange', counts);
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  /** Incrementally insert events without a full rebuild (DESIGN.md §10). */
  addEvents(events: readonly TimelineEvent<TData>[]): void {
    this.applyMutation(this.store.addEvents(events));
  }

  /** Remove events by id (DESIGN.md §10). */
  removeEvents(ids: readonly string[]): void {
    this.applyMutation(this.store.removeEvents(ids));
  }

  /** Append elements with stable-append layout (DESIGN.md §7, §10). */
  addElements(elements: readonly TimelineElement<TData>[]): void {
    this.applyMutation(this.store.addElements(elements));
  }

  /** Patch an element's label/icon/style/order in place (DESIGN.md §10). */
  updateElement(id: string, patch: Partial<TimelineElement<TData>>): void {
    this.applyMutation(this.store.updateElement(id, patch));
  }

  /**
   * Shared tail for the incremental mutations (§10): a no-op change emits and
   * redraws nothing; otherwise re-layout (stable-append by default, §7), emit
   * `dataChange`, and mark the base dirty. Streaming never refits — that would
   * jerk the camera mid-stream.
   */
  private applyMutation(counts: DataChangeCounts): void {
    if (counts.added === 0 && counts.removed === 0 && counts.updated === 0) {
      return;
    }
    this.scheduleLayoutRecompute();
    this.emitter.emit('dataChange', counts);
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.viewport = { cssWidth, cssHeight };
    this.dpr = dpr;
    this.renderer.resize(snapDevice(cssWidth, dpr), snapDevice(cssHeight, dpr));
    this.camera.setPxPerMs(this.camera.state.pxPerMs, this.zoomBounds());
    this.maybeFit();
    this.camera.clampScrollY(this.rowLayout.contentHeight, this.viewport);
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  fit(): void {
    fit(
      this.camera,
      this.store.getDataExtent(),
      this.viewport,
      this.now(),
      this.fitInset(),
    );
    this.hasFitted = true;
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  panToTime(t: Time): void {
    this.camera.setOriginTime(t);
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  /** Frame a time range across the viewport width (DESIGN.md §12). */
  zoomToRange(start: Time, end: Time): void {
    const span = end - start;
    if (!(span > 0) || this.viewport.cssWidth <= 0) return;
    this.camera.setOriginTime(start);
    this.camera.setPxPerMs(this.viewport.cssWidth / span, this.zoomBounds());
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  /**
   * Set the vertical scroll offset in CSS px (DESIGN.md §3, §12), clamped to the
   * content height. Pairs with {@link getViewport} and {@link zoomToRange} so a
   * host that must recreate the engine (e.g. the React binding rebuilding on a
   * theme/options change, §12) can restore the prior view instead of letting the
   * fresh engine snap back to fit.
   */
  setScrollY(scrollY: number): void {
    this.camera.setScrollY(scrollY);
    this.camera.clampScrollY(this.rowLayout.contentHeight, this.viewport);
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  /**
   * Replace the selection imperatively (DESIGN.md §9, §12). Ids are the
   * `kind:id` composites produced by hit-testing (see {@link hitId}), so an
   * element and an event sharing a raw id stay distinct. A no-op replacement
   * emits nothing and skips the overlay redraw.
   */
  select(ids: string[]): void {
    const next = new Set(ids);
    if (sameSet(this.selectedIds, next)) return;
    this.selectedIds.clear();
    for (const id of next) this.selectedIds.add(id);
    this.emitter.emit('selectionChange', { ids: [...this.selectedIds] });
    this.scheduler.markDirty('overlay');
  }

  getViewport(): TimelineEventMap<TData>['viewportChange'] {
    const { scrollY, pxPerMs } = this.camera.state;
    const timeRange: [number, number] = [
      this.camera.screenXToTime(0),
      this.camera.screenXToTime(this.viewport.cssWidth),
    ];
    const top = Math.max(
      0,
      Math.floor(this.camera.screenYToRow(this.metrics.headerHeight)),
    );
    const bottom = Math.min(
      this.rowLayout.rowCount,
      Math.ceil(this.camera.screenYToRow(this.viewport.cssHeight)),
    );
    return {
      timeRange,
      scrollY,
      pxPerMs,
      visibleRowRange: [top, Math.max(top, bottom)],
    };
  }

  on<K extends keyof TimelineEventMap<TData>>(
    key: K,
    fn: (payload: TimelineEventMap<TData>[K]) => void,
  ): () => void {
    return this.emitter.on(key, fn);
  }

  off<K extends keyof TimelineEventMap<TData>>(
    key: K,
    fn: (payload: TimelineEventMap<TData>[K]) => void,
  ): void {
    this.emitter.off(key, fn);
  }

  /** Which backend the renderer factory selected (§4): for host diagnostics. */
  getRendererBackend(): RendererBackend {
    return this.renderer.backend;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.debouncedRecomputeLayout.cancel();
    // Scheduler first so no draw can touch released GPU resources.
    this.scheduler.dispose();
    this.renderer.dispose?.();
    this.pointer.dispose();
    this.emitter.clear();
  }

  // --- Internals ---

  private now(): Time {
    return Date.now();
  }

  private zoomBounds() {
    return computeZoomBounds(
      this.store.getDataExtent(),
      this.viewport,
      this.now(),
      this.fitInset(),
    );
  }

  /**
   * Edge space reserved when fitting (§3): a left gutter so the leftmost line's
   * start marker (icon + label, §1) clears the viewport edge instead of being
   * clipped. Derived from the theme so host themes scale it. With no elements
   * there are no markers, so nothing is reserved (the empty-state window stays
   * centred on `now`, §3.1).
   */
  private fitInset(): FitInset {
    if (this.store.getElements().length === 0) return {};
    return { left: markerReserveLeftPx(this.theme) };
  }

  /**
   * Recompute row order + positions (DESIGN.md §7). `'full'` runs the configured
   * strategy (used by `setData` and the opt-in streaming relayout); `'stable-append'`
   * keeps existing rows and appends new elements (the streaming default, §10).
   */
  private recomputeLayout(mode: 'full' | 'stable-append' = 'full'): void {
    const orderedIds =
      mode === 'full'
        ? this.layoutStrategy.order(
            this.store.getElements(),
            this.store.getEvents(),
          )
        : stableAppend(this.rowLayout.orderedIds, this.store.getElements());
    this.rowLayout = computeRowLayout(orderedIds, this.metrics);
    this.camera.clampScrollY(this.rowLayout.contentHeight, this.viewport);
  }

  /**
   * Apply layout after an *incremental* mutation (DESIGN.md §7, §10). By default
   * (`streamingLayout: 'stable-append'`) this runs synchronously so new rows and
   * extents appear at once with no reshuffle; under `'full'` a burst is coalesced
   * into one trailing strategy recompute via the debounced seam. Full `setData`
   * bypasses this and recomputes synchronously so `fit`/scroll-clamp see
   * `contentHeight` immediately.
   */
  private scheduleLayoutRecompute(): void {
    if (this.streamingLayout === 'full') {
      this.debouncedRecomputeLayout();
    } else {
      this.recomputeLayout('stable-append');
    }
  }

  /**
   * Frame the view before the first explicit fit. With data, fit to it once and
   * latch (`hasFitted`). Without data, frame the default window on `now` (§3.1)
   * but stay un-latched, so real data still auto-fits when it arrives.
   */
  private maybeFit(): void {
    if (this.hasFitted || this.viewport.cssWidth <= 0) return;
    if (this.store.getDataExtent() !== null) {
      this.fit();
      return;
    }
    fit(this.camera, null, this.viewport, this.now(), this.fitInset());
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  /** Mark the base layer dirty and emit the new viewport (any camera change). */
  private onCameraChange(): void {
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  /**
   * The semantic-intent sink for the pointer controller (§9). The controller
   * does no math; every camera mutation and hit-test is applied here so the
   * Camera stays the single source of coordinate truth (§3).
   */
  private pointerHost(): PointerHost {
    return {
      panBy: (dx, dy) => {
        this.camera.panByPixels(dx, dy);
        this.camera.clampScrollY(this.rowLayout.contentHeight, this.viewport);
        this.onCameraChange();
      },
      zoomBy: (factor, cursorX) => {
        this.camera.zoomAboutCursor(factor, cursorX, this.zoomBounds());
        this.onCameraChange();
      },
      scrollBy: (dy) => {
        this.camera.panByPixels(0, -dy);
        this.camera.clampScrollY(this.rowLayout.contentHeight, this.viewport);
        this.onCameraChange();
      },
      hoverAt: (x, y) => {
        // Coalesced to one hit-test per frame: store the latest position and
        // let the overlay draw resolve it (§9).
        this.pendingPointer = { x, y };
        this.scheduler.markDirty('overlay');
      },
      clickAt: (x, y, mods) => this.onClick(x, y, mods),
      leave: () => {
        this.pendingPointer = null;
        if (this.hovered !== null) {
          this.hovered = null;
          this.emitter.emit('hover', null);
          this.scheduler.markDirty('overlay');
        }
      },
    };
  }

  /** Resolve a click against the current hit grid: emit click + update selection. */
  private onClick(
    x: number,
    y: number,
    mods: { ctrlOrMeta: boolean; shift: boolean },
  ): void {
    const hit = this.hitGrid ? hitTest(this.hitGrid, x, y) : null;
    if (hit !== null) this.emitter.emit('click', { hit, modifiers: mods });

    // A cluster is an ephemeral aggregate, not a selectable entity: clicking it
    // expands the collapsed events by zooming to their span (§6), leaving the
    // selection untouched.
    if (hit?.kind === 'cluster') {
      this.expandCluster(hit.events);
      return;
    }

    const result = nextSelection(
      this.selectedIds,
      hit !== null ? hitId(hit) : null,
      mods,
      this.multiSelect,
    );
    if (result.changed) {
      this.selectedIds.clear();
      for (const id of result.ids) this.selectedIds.add(id);
      this.emitter.emit('selectionChange', { ids: result.ids });
      this.scheduler.markDirty('overlay');
    }
  }

  /** Zoom to a clicked cluster's member time span, expanding it (§6). */
  private expandCluster(events: readonly { time: Time }[]): void {
    let min = Infinity;
    let max = -Infinity;
    for (const event of events) {
      if (event.time < min) min = event.time;
      if (event.time > max) max = event.time;
    }
    // zoomToRange no-ops on a zero/negative span (e.g. same-instant clusters).
    if (Number.isFinite(min)) this.zoomToRange(min, max);
  }

  private emitViewportChange(): void {
    if (this.viewport.cssWidth <= 0 || !(this.camera.state.pxPerMs > 0)) return;
    this.emitter.emit('viewportChange', this.getViewport());
  }

  private drawFrame(dirty: DirtyFlags): void {
    if (this.disposed) return;
    if (dirty.base) this.timed('base', this.drawBase);
    // The overlay highlights this frame's `frameTargets`, which `drawBase`
    // rebuilds at the current camera position. So it must re-render whenever the
    // base moved — not only on overlay-only (hover/selection) changes —
    // otherwise a pan/zoom slides the content while a stale highlight stays
    // pinned to its old screen position. (§4's independence is the *other*
    // direction: an overlay-only change never forces a base redraw.)
    if (dirty.base || dirty.overlay) this.timed('overlay', this.drawOverlay);
  }

  /**
   * Run one layer's draw, reporting its wall-clock cost to `onFrameStats` when a
   * sink is set (DESIGN.md §13). With no sink the draw runs directly — no
   * `performance.now()` calls, no allocation — so timing is truly opt-in.
   */
  private timed(layer: 'base' | 'overlay', draw: () => void): void {
    if (this.onFrameStats === undefined) {
      draw.call(this);
      return;
    }
    const start = performance.now();
    draw.call(this);
    this.onFrameStats({ layer, durationMs: performance.now() - start });
  }

  private drawBase(): void {
    const { cssWidth, cssHeight } = this.viewport;
    const { headerHeight } = this.metrics;
    const dpr = this.dpr;
    this.renderer.beginFrame('base');

    const ticks = generateTicks(
      this.camera.screenXToTime(0),
      this.camera.screenXToTime(cssWidth),
      this.camera.state.pxPerMs,
      MIN_LABEL_GAP_PX,
      this.tickFormatter,
    );

    // Major gridlines run from the header bottom down through the content; drawn
    // before content so element lines and arrows sit over them. Gridlines build
    // directly in device px (they bypass the spec/snap pass), so their dash is
    // dpr-scaled inline here — the lone exception to the §3 single snap boundary.
    const gridWidth = Math.max(1, snapDevice(this.theme.gridlineWidth, dpr));
    const gridDash = scaleDash(this.theme.gridlineDash, dpr);
    const gridSegments: LineSegment[] = ticks.major.map((tick) => {
      const x =
        snapDevice(this.camera.timeToScreenX(tick.time), dpr) +
        hairlineOffset(gridWidth);
      return {
        x1: x,
        y1: snapDevice(headerHeight, dpr),
        x2: x,
        y2: snapDevice(cssHeight, dpr),
      };
    });
    this.renderer.drawLines({
      color: this.theme.gridlineColor,
      width: gridWidth,
      dash: gridDash,
      segments: gridSegments,
    });

    // Content: build CSS-px primitives, snap to device px, draw bottom-to-top
    // (lines → risers → source nodes → arrowheads → labels → icons).
    const ctx: BuildContext<TData> = {
      camera: this.camera,
      rowLayout: this.rowLayout,
      data: this.store,
      viewport: this.viewport,
      theme: this.theme,
      band: visibleRowBand(
        this.camera,
        this.viewport,
        this.rowLayout.rowCount,
        headerHeight,
      ),
      resolveIcon: this.resolveIcon,
      lod: this.lod,
      clustering: this.clustering,
      eventLabel: this.eventLabel,
      measureText: this.measureText,
      resolveElementStyle: this.resolveElementStyle,
      resolveEventStyle: this.resolveEventStyle,
      formatElementLabel: this.formatElementLabel,
      formatEventLabel: this.formatEventLabel,
    };
    const elements = buildElementLines(ctx);
    const arrows = buildArrows(ctx);

    // Rebuild the hit-test index from this frame's visible primitives (§5). It
    // is reused unchanged for pure hover until the next base redraw.
    this.frameTargets = [...elements.targets, ...arrows.targets];
    this.hitGrid = buildHitGrid(this.frameTargets);

    // Row separators sit under the content (like gridlines) so element lines and
    // arrows draw over them. No-op unless theme.rowSeparator.enabled (§11).
    for (const spec of buildRowSeparators(ctx)) {
      this.renderer.drawLines(snapLines(spec, dpr));
    }
    for (const spec of elements.lines) {
      this.renderer.drawLines(snapLines(spec, dpr));
    }
    for (const spec of arrows.lines) {
      this.renderer.drawLines(snapLines(spec, dpr));
    }
    for (const spec of arrows.nodes) {
      this.renderer.drawNodes(snapNodes(spec, dpr));
    }
    for (const spec of arrows.arrowheads) {
      this.renderer.drawArrowheads(snapArrowheads(spec, dpr));
    }
    // Source-node label boxes (§11): background then border, both above the
    // arrows/nodes but behind the label text drawn next.
    for (const spec of arrows.boxes) {
      const rect = snapRects(spec, dpr);
      for (const it of rect.items) {
        this.renderer.fillRect(it.x, it.y, it.w, it.h, rect.color);
      }
    }
    for (const spec of arrows.boxBorders) {
      this.renderer.drawLines(snapLines(spec, dpr));
    }
    for (const spec of arrows.labels) {
      this.renderer.drawText(snapLabels(spec, dpr));
    }
    for (const spec of elements.labels) {
      this.renderer.drawText(snapLabels(spec, dpr));
    }
    this.renderer.drawImages(snapIcons(elements.icons, dpr));

    // Header is drawn last (§4): mask any content that bled into the header
    // band, then draw the baseline separator and the adaptive tick labels.
    this.renderer.fillRect(
      0,
      0,
      snapDevice(cssWidth, dpr),
      snapDevice(headerHeight, dpr),
      this.theme.background,
    );
    const baselineY = snapDevice(headerHeight, dpr) + hairlineOffset(gridWidth);
    this.renderer.drawLines({
      color: this.theme.gridlineColor,
      width: gridWidth,
      dash: gridDash,
      segments: [
        { x1: 0, y1: baselineY, x2: snapDevice(cssWidth, dpr), y2: baselineY },
      ],
    });

    const headerFont = scaleFontToDevice(this.theme.headerFont, dpr);
    this.renderer.drawText({
      color: this.theme.headerTextColor,
      font: headerFont,
      baseline: 'middle',
      align: 'center',
      items: ticks.major.map((tick) => ({
        x: snapDevice(this.camera.timeToScreenX(tick.time), dpr),
        y: snapDevice(headerHeight * this.theme.headerMajorTickRatio, dpr),
        text: tick.label,
      })),
    });
    this.renderer.drawText({
      color: this.theme.headerTextColor,
      font: headerFont,
      baseline: 'middle',
      align: 'center',
      items: ticks.minor.map((tick) => ({
        x: snapDevice(this.camera.timeToScreenX(tick.time), dpr),
        y: snapDevice(headerHeight * this.theme.headerMinorTickRatio, dpr),
        text: tick.label,
      })),
    });

    this.renderer.endFrame('base');
  }

  /**
   * Overlay pass (DESIGN.md §4, §9): resolve the pending hover against the hit
   * grid (emitting `hover` only on change), then redraw the hovered and selected
   * primitives in the highlight/selection colours. It reuses this frame's
   * `frameTargets` geometry — no recompute — and never touches the base layer,
   * so hover/selection stay independent of the expensive base redraw.
   */
  private drawOverlay(): void {
    this.resolveHover();
    this.renderer.beginFrame('overlay');

    const dpr = this.dpr;
    const hoveredKey = this.hovered !== null ? hitId(this.hovered) : null;
    // Highlighting an element also lights its connected events (§9): collect the
    // hovered/selected *element* ids so an arrow touching one is highlighted too.
    const hoveredElementId =
      this.hovered?.kind === 'element' ? this.hovered.element.id : null;
    const selectedElementIds = elementIdsFromKeys(this.selectedIds);

    for (const target of this.frameTargets) {
      const emphasis = this.highlightColorFor(
        target,
        hoveredKey,
        hoveredElementId,
        selectedElementIds,
      );
      if (emphasis !== null) {
        this.drawHighlight(target, emphasis.color, emphasis.widthBonus, dpr);
      }
    }

    this.renderer.endFrame('overlay');
  }

  /**
   * Overlay emphasis (colour + extra stroke width) for a target, or null when it
   * should not highlight. A target highlights when it is itself hovered/selected,
   * or — for an event/cluster — when one of its endpoints is a hovered/selected
   * element (§9). Hover wins over selection.
   */
  private highlightColorFor(
    target: HitTarget<TData>,
    hoveredKey: string | null,
    hoveredElementId: string | null,
    selectedElementIds: ReadonlySet<string>,
  ): { color: string; widthBonus: number } | null {
    const key = targetKey(target);
    const hovered =
      key === hoveredKey ||
      (hoveredElementId !== null && touchesElement(target, hoveredElementId));
    if (hovered) {
      return {
        color: this.theme.hoverColor,
        widthBonus: this.theme.hoverWidthBonus,
      };
    }
    const selected =
      this.selectedIds.has(key) ||
      touchesAnyElement(target, selectedElementIds);
    if (selected) {
      return {
        color: this.theme.selectionColor,
        widthBonus: this.theme.selectionWidthBonus,
      };
    }
    return null;
  }

  /** Run the coalesced hit-test for the latest cursor position and emit on change. */
  private resolveHover(): void {
    if (this.pendingPointer === null || this.hitGrid === null) return;
    const hit = hitTest(
      this.hitGrid,
      this.pendingPointer.x,
      this.pendingPointer.y,
    );
    const nextKey = hit !== null ? hitId(hit) : null;
    const prevKey = this.hovered !== null ? hitId(this.hovered) : null;
    if (nextKey !== prevKey) {
      this.hovered = hit;
      this.emitter.emit('hover', hit);
    }
  }

  /**
   * Redraw one target's geometry in `color`, thickened by `widthBonus`, on the
   * overlay. Highlights are always solid: emphasis is a thicker solid stroke over
   * the (possibly dashed) base line, and `HitTarget` carries no dash to reproduce.
   */
  private drawHighlight(
    target: HitTarget<TData>,
    color: string,
    widthBonus: number,
    dpr: number,
  ): void {
    const radiusBonus = this.theme.emphasisRadiusBonus;
    if (target.kind === 'element') {
      this.renderer.drawLines(
        snapLines(
          {
            color,
            width: target.width + widthBonus,
            segments: [
              { x1: target.x1, y1: target.y, x2: target.x2, y2: target.y },
            ],
          },
          dpr,
        ),
      );
      return;
    }
    if (target.kind === 'cluster') {
      if (target.segments.length > 0) {
        this.renderer.drawLines(
          snapLines(
            {
              color,
              width: target.width + widthBonus,
              segments: target.segments,
            },
            dpr,
          ),
        );
      }
      this.renderer.drawNodes(
        snapNodes(
          {
            color,
            radius: target.markerSize + radiusBonus,
            items: [target.marker],
          },
          dpr,
        ),
      );
      return;
    }
    this.renderer.drawLines(
      snapLines(
        { color, width: target.width + widthBonus, segments: target.segments },
        dpr,
      ),
    );
    const dots = [target.node, target.targetNode].filter(
      (n): n is { x: number; y: number } => n !== undefined,
    );
    if (dots.length > 0) {
      this.renderer.drawNodes(
        snapNodes(
          {
            color,
            radius: this.theme.event.nodeRadius + radiusBonus,
            items: dots,
          },
          dpr,
        ),
      );
    }
    if (target.arrowhead !== undefined) {
      this.renderer.drawArrowheads(
        snapArrowheads(
          {
            color,
            size: target.arrowheadSize + radiusBonus,
            items: [{ ...target.arrowhead, angle: arrowheadAngle(target) }],
          },
          dpr,
        ),
      );
    }
  }
}

/** Stable key (`kind:id`) for comparing a hit across frames. */
function hitId(hit: HitResult): string {
  switch (hit.kind) {
    case 'element':
      return `element:${hit.element.id}`;
    case 'event':
      return `event:${hit.event.id}`;
    case 'cluster':
      return `cluster:${hit.events.map((e) => e.id).join(',')}`;
  }
}

/** The `kind:id` key matching {@link hitId} for a target. */
function targetKey(target: HitTarget): string {
  switch (target.kind) {
    case 'element':
      return `element:${target.element.id}`;
    case 'event':
      return `event:${target.event.id}`;
    case 'cluster':
      return `cluster:${target.events.map((e) => e.id).join(',')}`;
  }
}

const ELEMENT_KEY_PREFIX = 'element:';

/** Element ids embedded in a set of selection keys (`element:<id>`). */
function elementIdsFromKeys(keys: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  for (const key of keys) {
    if (key.startsWith(ELEMENT_KEY_PREFIX)) {
      ids.add(key.slice(ELEMENT_KEY_PREFIX.length));
    }
  }
  return ids;
}

/** Element ids an event/cluster target connects to; empty for an element target. */
function targetElementIds(target: HitTarget): string[] {
  switch (target.kind) {
    case 'element':
      return [];
    case 'event':
      return [target.event.sourceId, target.event.targetId];
    case 'cluster':
      return target.events.flatMap((e) => [e.sourceId, e.targetId]);
  }
}

function touchesElement(target: HitTarget, elementId: string): boolean {
  return targetElementIds(target).includes(elementId);
}

function touchesAnyElement(
  target: HitTarget,
  ids: ReadonlySet<string>,
): boolean {
  return ids.size > 0 && targetElementIds(target).some((id) => ids.has(id));
}

/** Recover the arrowhead direction from a target's last segment (y-down). */
function arrowheadAngle(target: {
  segments: { y1: number }[];
  arrowhead?: { y: number };
}): number {
  const last = target.segments[target.segments.length - 1];
  if (last === undefined || target.arrowhead === undefined) return Math.PI / 2;
  return target.arrowhead.y >= last.y1 ? Math.PI / 2 : -Math.PI / 2;
}
