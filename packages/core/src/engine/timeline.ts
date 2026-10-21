// The public engine API (DESIGN.md §2, §12).
//
// A facade over the data store, layout, view, painters and input. It owns the
// frame loop and the DOM surface (when mounted) and turns option and data
// changes into targeted invalidation; the drawing, camera and hit-testing logic
// live in the modules it composes.

import {
  SelectionModel,
  type Selection,
  type SelectionInput,
} from '../interaction/selection';
import {
  createDefaultDiagnosticSink,
  type Diagnostic,
} from '../model/diagnostics';
import { DataStore, isNoChange, type DataChangeCounts } from '../model/store';
import type {
  ThemeInput,
  Time,
  TimelineData,
  TimelineElement,
  TimelineEvent,
} from '../model/types';
import {
  createBaseRenderer,
  createCanvas2DRenderer,
} from '../render/createRenderer';
import { snapDevice } from '../render/device';
import { guardRenderer } from '../render/guarded';
import { NullRenderer } from '../render/nullRenderer';
import type { RendererLayers } from '../render/types';
import { BasePainter } from './basePainter';
import { TypedEmitter, type TimelineEventMap } from './emitter';
import { InputController } from './input';
import { LayoutModel } from './layoutModel';
import {
  resolveConfig,
  type EngineConfig,
  type Formatters,
  type StyleResolvers,
  type TimelineEngineOptions,
  type TimelineOptions,
} from './options';
import { OverlayPainter } from './overlayPainter';
import { FrameScheduler, type DirtyFlags } from './scheduler';
import { Surface } from './surface';
import { RANGE_PADDING, ViewModel, type ViewportState } from './view';

/** How long a lost WebGL context may take to come back before falling back. */
const CONTEXT_RESTORE_TIMEOUT_MS = 3000;

export interface MountOptions {
  /** Follow the container's size and device pixel ratio. Default true. */
  autoResize?: boolean;
}

export class TimelineEngine<TData = unknown> {
  private options: TimelineOptions<TData>;
  private config: EngineConfig<TData>;
  private readonly now: () => Time;
  private readonly store: DataStore<TData>;
  private readonly layout: LayoutModel<TData>;
  private readonly view: ViewModel<TData>;
  private readonly selection = new SelectionModel();
  private readonly emitter = new TypedEmitter<TimelineEventMap<TData>>();
  private readonly scheduler: FrameScheduler;
  private readonly base: BasePainter<TData>;
  private readonly overlay: OverlayPainter<TData>;
  private readonly input: InputController<TData>;
  private renderers: RendererLayers;
  private surface: Surface | null = null;
  private viewportDirty = false;
  private drewFirstFrame = false;
  private disposed = false;
  /** Set when a lost WebGL context never came back: stay on Canvas2D. */
  private webglFailed = false;
  private lossTimer: ReturnType<typeof setTimeout> | null = null;
  /** Clusters expanded in place, by first member id, at one zoom level (§6). */
  private readonly spread = new Set<string>();
  private spreadPxPerMs = 0;

  constructor(options: TimelineEngineOptions<TData> = {}) {
    const { scheduler, now, ...settable } = options;
    this.options = settable;
    this.now = now ?? Date.now;
    this.config = resolveConfig(settable, this.report);
    this.store = new DataStore<TData>({ onDiagnostic: this.report });
    this.layout = new LayoutModel({
      store: this.store,
      strategy: () => this.config.layout,
      showEmpty: () => this.config.emptyElements === 'show',
      metrics: () => this.config.metrics,
      onDiagnostic: this.report,
      onChange: () => this.onCameraChange(true),
    });
    this.view = new ViewModel({
      store: this.store,
      rows: () => this.layout.rows,
      config: () => this.config,
      now: () => this.now(),
      markers: () => this.base.markers(),
    });
    this.renderers = this.initialRenderers();
    this.scheduler = new FrameScheduler(
      (dirty) => this.drawFrame(dirty),
      scheduler,
    );
    this.base = new BasePainter({
      renderer: () => this.renderers.base,
      config: () => this.config,
      view: this.view,
      rows: () => this.layout.rows,
      store: this.store,
      onIconLoad: () => this.scheduler.markDirty('base'),
      onDiagnostic: this.report,
      isSpread: (index) => this.isSpread(index),
    });
    this.input = new InputController({
      view: this.view,
      base: this.base,
      selection: this.selection,
      config: () => this.config,
      onCameraChange: () => this.onCameraChange(),
      onOverlayChange: () => this.scheduler.markDirty('overlay'),
      onHover: (hit) => this.emitter.emit('hover', hit),
      onClick: (hit, modifiers) =>
        this.emitter.emit('click', { hit, modifiers }),
      onSelectionChange: () => this.selectionChanged(),
      expandCluster: (hit) => this.expandCluster(hit.events),
      fit: () => this.fit(),
      clearSelection: () => this.clearSelection(),
    });
    this.overlay = new OverlayPainter({
      renderer: () => this.renderers.overlay,
      config: () => this.config,
      view: this.view,
      base: this.base,
      store: this.store,
      selection: this.selection,
      hoveredTarget: () => this.input.hoveredTarget,
    });
    queueMicrotask(() => {
      if (!this.disposed) this.emitter.emit('ready', undefined);
    });
  }

  // --- Surface ---

  /** Create the canvases inside `container` and start drawing and listening. */
  mount(container: HTMLElement, options: MountOptions = {}): void {
    this.unmount();
    const surface = new Surface(
      container,
      {
        label: this.config.accessibility.label,
        description: this.config.accessibility.description,
      },
      { onResize: (w, h, dpr) => this.resize(w, h, dpr) },
    );
    this.surface = surface;
    this.installRenderers();
    this.input.attach(surface.root);
    if (options.autoResize ?? true) surface.observe();
  }

  /** Remove the canvases and listeners; the engine and its data stay usable. */
  unmount(): void {
    if (this.surface === null) return;
    this.input.detach();
    this.renderers.base.dispose?.();
    this.renderers.overlay.dispose?.();
    this.surface.dispose();
    this.surface = null;
    this.renderers = this.initialRenderers();
  }

  /** Size the layers in CSS px at `dpr`, and draw at once (no blank frame). */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.view.setSize(cssWidth, cssHeight, dpr);
    const w = snapDevice(cssWidth, dpr);
    const h = snapDevice(cssHeight, dpr);
    this.renderers.base.resize(w, h);
    this.renderers.overlay.resize(w, h);
    this.input.invalidateRect();
    this.onCameraChange();
    this.scheduler.flush();
  }

  /** Draw any pending changes now instead of on the next animation frame. */
  renderNow(): void {
    this.scheduler.flush();
  }

  // --- Options ---

  /** Change any options at runtime; only what they affect is recomputed. */
  setOptions(patch: TimelineOptions<TData>): void {
    const previous = this.options;
    this.options = { ...previous, ...patch };
    const changed = (key: keyof TimelineOptions<TData>): boolean =>
      key in patch && patch[key] !== previous[key];
    this.config = resolveConfig(this.options, this.report);
    if (changed('theme')) this.layout.refreshMetrics();
    this.view.refreshConfig();
    if (changed('theme') || changed('styleResolvers')) this.base.resetStyles();
    if (
      changed('theme') ||
      changed('styleResolvers') ||
      changed('formatters')
    ) {
      this.base.clearMeasureCache();
    }
    if (changed('layout') || changed('emptyElements')) {
      this.layout.recompute('full');
    }
    if (changed('layoutDebounceMs') || changed('streamingLayout')) {
      this.layout.resetDebounce();
    }
    if (changed('renderer')) {
      // A new preference retries WebGL even after an earlier context loss.
      this.webglFailed = false;
      if (this.surface !== null) this.installRenderers();
    }
    if (changed('accessibility')) {
      this.surface?.setLabels(
        this.config.accessibility.label,
        this.config.accessibility.description,
      );
    }
    this.onCameraChange(true);
  }

  setTheme(theme: ThemeInput): void {
    this.setOptions({ theme });
  }

  setStyleResolvers(styleResolvers: StyleResolvers<TData>): void {
    this.setOptions({ styleResolvers });
  }

  setFormatters(formatters: Formatters<TData>): void {
    this.setOptions({ formatters });
  }

  // --- Data ---

  setData(data: TimelineData<TData>): void {
    this.base.clearMeasureCache();
    this.spread.clear();
    const counts = this.store.setData(data);
    this.layout.recompute('full');
    this.view.invalidateInset();
    this.view.onDataReplaced();
    this.dataChanged(counts);
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

  /** Remove elements by id, with every event that touches them (§10). */
  removeElements(ids: readonly string[]): void {
    this.applyMutation(this.store.removeElements(ids));
  }

  /**
   * Patch an event (`id` is immutable). A new `time` re-indexes it; an
   * invalid patch is reported and ignored (§10).
   */
  updateEvent(id: string, patch: Partial<TimelineEvent<TData>>): void {
    this.applyMutation(this.store.updateEvent(id, patch));
  }

  /** A snapshot of the current dataset, events in time order. */
  getData(): TimelineData<TData> {
    return this.store.getData();
  }

  // --- Camera ---

  fit(): void {
    this.view.fit();
    this.onCameraChange();
  }

  panToTime(t: Time): void {
    this.view.panToTime(t);
    this.onCameraChange();
  }

  /**
   * Frame a time range across the viewport width (DESIGN.md §12); a range
   * narrower than the zoom limit allows is centred.
   */
  zoomToRange(start: Time, end: Time): void {
    if (this.view.zoomToRange(start, end)) this.onCameraChange();
  }

  /** Zoom in about the viewport centre by `factor` (default 2). */
  zoomIn(factor = 2): void {
    this.view.zoomBy(factor);
    this.onCameraChange();
  }

  /** Zoom out about the viewport centre by `factor` (default 2). */
  zoomOut(factor = 2): void {
    this.view.zoomBy(1 / factor);
    this.onCameraChange();
  }

  /** Set the vertical scroll offset in CSS px, clamped to the content. */
  setScrollY(scrollY: number): void {
    this.view.setScrollY(scrollY);
    this.onCameraChange();
  }

  /** Scroll vertically so an element's row is centred (when it can be). */
  scrollToElement(id: string): void {
    const row = this.layout.rows.rowIndexById.get(id);
    if (row === undefined) return;
    this.view.centreRows(row, row);
    this.onCameraChange();
  }

  /**
   * Bring an event into view: centre its time horizontally (keeping the
   * zoom) and its rows vertically. Unknown or hidden events are ignored.
   */
  revealEvent(id: string): void {
    const event = this.store.getEventById(id);
    const time = this.store.timeOf(id);
    if (event === undefined || time === undefined) return;
    const { rowIndexById } = this.layout.rows;
    const source = rowIndexById.get(event.sourceId);
    const target = rowIndexById.get(event.targetId);
    this.view.centreTime(time);
    if (source !== undefined && target !== undefined) {
      this.view.centreRows(Math.min(source, target), Math.max(source, target));
    }
    this.onCameraChange();
  }

  getViewport(): ViewportState {
    return this.view.snapshot();
  }

  // --- Selection ---

  /** Replace the selection (DESIGN.md §9); a no-op replacement emits nothing. */
  select(selection: SelectionInput): void {
    if (this.selection.replace(selection)) this.selectionChanged();
  }

  getSelection(): Selection {
    return this.selection.snapshot();
  }

  clearSelection(): void {
    this.select({});
  }

  // --- Events & lifecycle ---

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

  /** The base layer's backend, or null while nothing draws (not mounted). */
  getRendererBackend(): string | null {
    const { backend } = this.renderers.base;
    return backend === 'none' ? null : backend;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLossTimer();
    this.layout.dispose();
    // Scheduler first so no draw can touch released GPU resources.
    this.scheduler.dispose();
    this.unmount();
    this.renderers.base.dispose?.();
    this.renderers.overlay.dispose?.();
    this.emitter.clear();
  }

  // --- Internals ---

  private readonly defaultSink = createDefaultDiagnosticSink();

  private readonly report = (d: Diagnostic): void => {
    (this.options.onDiagnostic ?? this.defaultSink)(d);
  };

  /** Host renderers when supplied, else no-ops until mount creates canvases. */
  private initialRenderers(): RendererLayers {
    const custom = this.options.renderer;
    if (typeof custom === 'object') {
      return {
        base: guardRenderer(custom.base, this.report),
        overlay: guardRenderer(custom.overlay, this.report),
      };
    }
    return { base: new NullRenderer(), overlay: new NullRenderer() };
  }

  /** (Re)create the renderers for the mounted surface and redraw. */
  private installRenderers(): void {
    const surface = this.surface;
    if (surface === null) return;
    const custom = this.options.renderer;
    this.renderers.base.dispose?.();
    this.renderers.overlay.dispose?.();
    if (typeof custom === 'object') {
      this.renderers = this.initialRenderers();
    } else {
      const base = createBaseRenderer({
        preference: this.webglFailed ? 'canvas2d' : (custom ?? 'auto'),
        freshCanvas: () => surface.freshBaseCanvas(),
        onContextLost: () => this.onContextLost(),
        onContextRestored: () => {
          this.cancelLossTimer();
          this.base.clearMeasureCache();
          this.scheduler.markDirty('base');
        },
        onDiagnostic: this.report,
      });
      this.renderers = {
        base: guardRenderer(base, this.report),
        overlay: guardRenderer(
          createCanvas2DRenderer(surface.overlayCanvas, this.report),
          this.report,
        ),
      };
    }
    this.base.clearMeasureCache();
    const { cssWidth, cssHeight } = this.view.viewport;
    if (cssWidth > 0) this.resize(cssWidth, cssHeight, this.view.dpr);
  }

  /**
   * A lost WebGL context normally comes back within a moment (the canvas is
   * blank meanwhile); if it doesn't within this delay, switch to Canvas2D on
   * a fresh canvas for good.
   */
  private onContextLost(): void {
    this.cancelLossTimer();
    this.lossTimer = setTimeout(() => {
      this.lossTimer = null;
      if (this.disposed || this.surface === null) return;
      this.webglFailed = true;
      this.report({
        code: 'renderer-fallback',
        kind: 'renderer',
        reason: 'the WebGL context was lost and not restored; using Canvas2D',
      });
      this.installRenderers();
    }, CONTEXT_RESTORE_TIMEOUT_MS);
  }

  private cancelLossTimer(): void {
    if (this.lossTimer !== null) clearTimeout(this.lossTimer);
    this.lossTimer = null;
  }

  /** Shared tail of the incremental mutations (§10); never refits the camera. */
  private applyMutation(counts: DataChangeCounts): void {
    if (isNoChange(counts)) return;
    const { streamingLayout, layoutDebounceMs } = this.config;
    this.layout.afterMutation(streamingLayout, layoutDebounceMs);
    this.dataChanged(counts);
  }

  private dataChanged(counts: DataChangeCounts): void {
    this.base.markStale();
    this.view.invalidateInset();
    this.emitter.emit('dataChange', counts);
    // Removed items leave the selection, and the host hears about it.
    const pruned = this.selection.prune(
      (id) => this.store.getElementById(id) !== undefined,
      (id) => this.store.hasEvent(id),
    );
    if (pruned) this.selectionChanged();
    this.onCameraChange(true);
  }

  private selectionChanged(): void {
    this.emitter.emit('selectionChange', this.selection.snapshot());
    this.scheduler.markDirty('overlay');
  }

  /** Redraw the base and report the viewport on the next frame (once). */
  private onCameraChange(clampScroll = false): void {
    if (clampScroll) this.view.clampScroll();
    this.viewportDirty = true;
    this.scheduler.markDirty('base');
  }

  /**
   * Expand a clicked cluster (§6): zoom to its members' time span, or — when
   * they share one instant, which no zoom can separate — spread them out in
   * place at the current zoom.
   */
  private expandCluster(events: readonly TimelineEvent<TData>[]): void {
    let min = Infinity;
    let max = -Infinity;
    for (const event of events) {
      const time = this.store.timeOf(event.id) ?? event.time;
      if (time < min) min = time;
      if (time > max) max = time;
    }
    if (!Number.isFinite(min)) return;
    if (max > min && this.view.zoomToRange(min, max, RANGE_PADDING)) {
      this.onCameraChange();
      return;
    }
    const first = events[0];
    if (first === undefined) return;
    if (this.spreadPxPerMs !== this.view.camera.state.pxPerMs) {
      this.spread.clear();
      this.spreadPxPerMs = this.view.camera.state.pxPerMs;
    }
    this.spread.add(first.id);
    this.scheduler.markDirty('base');
  }

  /** Whether the run starting at this event is spread out (same zoom only). */
  private isSpread(index: number): boolean {
    if (this.spread.size === 0) return false;
    if (this.spreadPxPerMs !== this.view.camera.state.pxPerMs) {
      this.spread.clear();
      return false;
    }
    return this.spread.has(this.store.eventAt(index).id);
  }

  private drawFrame(dirty: DirtyFlags): void {
    if (this.disposed) return;
    if (dirty.base) {
      this.timed('base', () => this.base.draw());
      if (!this.drewFirstFrame && this.view.isSized) {
        this.drewFirstFrame = true;
        this.emitter.emit('firstFrame', undefined);
      }
    }
    // The overlay highlights this frame's targets, which the base draw just
    // rebuilt; it must follow every base redraw or a highlight stays pinned
    // while the content pans beneath it.
    if (dirty.base || dirty.overlay) {
      this.timed('overlay', () => {
        this.input.resolveHover();
        this.overlay.draw();
      });
    }
    if (this.viewportDirty && this.view.isSized) {
      this.viewportDirty = false;
      this.emitter.emit('viewportChange', this.view.snapshot());
    }
  }

  /** Run one layer's draw, timing it only when an `onFrameStats` sink is set. */
  private timed(layer: 'base' | 'overlay', draw: () => void): void {
    const sink = this.config.onFrameStats;
    if (sink === undefined) {
      draw();
      return;
    }
    const start = performance.now();
    draw();
    sink({ layer, durationMs: performance.now() - start });
  }
}
