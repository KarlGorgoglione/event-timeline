// The composition root and public engine API (DESIGN.md §2, §4, §12).
//
// A thin facade that wires the store, camera, layout, renderer, scheduler,
// emitter, and pan controller together and owns the per-frame draw assembly.
// It contains no coordinate math of its own (delegates to Camera) and no
// validation of its own (delegates to DataStore).

import { byFirstEvent } from '../layout/byFirstEvent';
import type { LayoutStrategy } from '../layout/types';
import { computeRowLayout, type RowLayout } from '../layout/positions';
import type { OnDiagnostic } from '../model/diagnostics';
import { DataStore } from '../model/store';
import type { TimelineData, Theme, Time } from '../model/types';
import { Canvas2DRenderer } from '../render/canvas2d';
import {
  hairlineOffset,
  scaleFontToDevice,
  snapDevice,
} from '../render/device';
import type { LineBatch, LineSegment } from '../render/types';
import {
  Camera,
  computeZoomBounds,
  fit,
  type RowMetrics,
  type Viewport,
} from '../scale/camera';
import { generateTicks } from '../scale/ticks';
import { PanController } from '../interaction/pan';
import { TypedEmitter, type TimelineEventMap } from './emitter';
import { FrameScheduler, type DirtyFlags } from './scheduler';
import { resolveTheme } from './theme';

export interface TimelineEngineOptions {
  theme?: Partial<Theme>;
  onDiagnostic?: OnDiagnostic;
  layout?: LayoutStrategy;
}

/** A few CSS px of line drawn before an element's first event (§1). */
const LINE_LEAD_PAD_PX = 6;
/** Minimum pixel spacing header labels need (§8). */
const MIN_LABEL_GAP_PX = 64;

export class TimelineEngine<TData = unknown> {
  private readonly theme: Theme;
  private readonly metrics: RowMetrics;
  private readonly store: DataStore<TData>;
  private readonly camera: Camera;
  private readonly renderer: Canvas2DRenderer;
  private readonly scheduler: FrameScheduler;
  private readonly emitter = new TypedEmitter<TimelineEventMap<TData>>();
  private readonly pan: PanController;
  private readonly layoutStrategy: LayoutStrategy;

  private viewport: Viewport = { cssWidth: 0, cssHeight: 0 };
  private dpr = 1;
  private rowLayout: RowLayout = computeRowLayout([], {
    headerHeight: 0,
    rowHeight: 0,
    rowGap: 0,
  });
  private hasFitted = false;
  private disposed = false;

  constructor(
    baseCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    options: TimelineEngineOptions = {},
  ) {
    this.theme = resolveTheme(options.theme);
    this.metrics = {
      headerHeight: this.theme.headerHeight,
      rowHeight: this.theme.rowHeight,
      rowGap: this.theme.rowGap,
    };
    this.layoutStrategy = options.layout ?? byFirstEvent;
    this.store = new DataStore<TData>({ onDiagnostic: options.onDiagnostic });
    this.camera = new Camera(this.metrics);
    this.renderer = new Canvas2DRenderer(
      baseCanvas,
      overlayCanvas,
      this.theme.background,
    );
    this.scheduler = new FrameScheduler((dirty) => this.drawFrame(dirty));
    // The overlay is the topmost layer, so it receives pointer events; the
    // interaction controllers attach there (base draws beneath it).
    this.pan = new PanController(overlayCanvas, {
      camera: this.camera,
      onPan: () => this.onPan(),
    });

    queueMicrotask(() => {
      if (!this.disposed) this.emitter.emit('ready', undefined);
    });
  }

  // --- Public API ---

  setData(data: TimelineData<TData>): void {
    const counts = this.store.setData(data);
    this.recomputeLayout();
    this.maybeFit();
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
    fit(this.camera, this.store.getDataExtent(), this.viewport, this.now());
    this.hasFitted = true;
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  panToTime(t: Time): void {
    this.camera.setOriginTime(t);
    this.scheduler.markDirty('base');
    this.emitViewportChange();
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.dispose();
    this.pan.dispose();
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
    );
  }

  private recomputeLayout(): void {
    const orderedIds = this.layoutStrategy.order(
      this.store.getElements(),
      this.store.getEvents(),
    );
    this.rowLayout = computeRowLayout(orderedIds, this.metrics);
    this.camera.clampScrollY(this.rowLayout.contentHeight, this.viewport);
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
    fit(this.camera, null, this.viewport, this.now());
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  private onPan(): void {
    this.scheduler.markDirty('base');
    this.emitViewportChange();
  }

  private emitViewportChange(): void {
    if (this.viewport.cssWidth <= 0 || !(this.camera.state.pxPerMs > 0)) return;
    this.emitter.emit('viewportChange', this.getViewport());
  }

  private drawFrame(dirty: DirtyFlags): void {
    if (this.disposed) return;
    if (dirty.base) this.drawBase();
    if (dirty.overlay) {
      this.renderer.beginFrame('overlay');
      this.renderer.endFrame('overlay');
    }
  }

  private drawBase(): void {
    const { cssWidth, cssHeight } = this.viewport;
    const { headerHeight } = this.metrics;
    const dpr = this.dpr;
    this.renderer.beginFrame('base');

    const tStart = this.camera.screenXToTime(0);
    const tEnd = this.camera.screenXToTime(cssWidth);
    const ticks = generateTicks(
      tStart,
      tEnd,
      this.camera.state.pxPerMs,
      MIN_LABEL_GAP_PX,
    );

    // Major gridlines run from the header bottom down through the content, plus
    // a header baseline separator — all share the gridline style.
    const gridWidth = Math.max(1, snapDevice(1, dpr));
    const gridSegments: LineSegment[] = [];
    for (const tick of ticks.major) {
      const x =
        snapDevice(this.camera.timeToScreenX(tick.time), dpr) +
        hairlineOffset(gridWidth);
      gridSegments.push({
        x1: x,
        y1: snapDevice(headerHeight, dpr),
        x2: x,
        y2: snapDevice(cssHeight, dpr),
      });
    }
    const baselineY = snapDevice(headerHeight, dpr) + hairlineOffset(gridWidth);
    gridSegments.push({
      x1: 0,
      y1: baselineY,
      x2: snapDevice(cssWidth, dpr),
      y2: baselineY,
    });
    this.renderer.drawLines({
      color: this.theme.gridlineColor,
      width: gridWidth,
      segments: gridSegments,
    });

    // Element lines, batched by resolved style.
    const batches = new Map<string, LineBatch>();
    for (const id of this.rowLayout.orderedIds) {
      const extent = this.store.getExtent(id);
      if (extent === undefined) continue; // event-less: not drawn (§1)
      const rowIndex = this.rowLayout.rowIndexById.get(id);
      if (rowIndex === undefined) continue;

      const cssY =
        this.camera.rowToScreenY(rowIndex) + this.metrics.rowHeight / 2;
      if (cssY < headerHeight || cssY > cssHeight) continue; // row off-screen

      const x1Css =
        this.camera.timeToScreenX(extent.minTime) - LINE_LEAD_PAD_PX;
      const x2Css = this.camera.timeToScreenX(extent.maxTime);
      if (x2Css < 0 || x1Css > cssWidth) continue; // line off-screen

      const element = this.store.getElementById(id);
      const color = element?.style?.lineColor ?? this.theme.element.lineColor;
      const widthCss =
        element?.style?.lineWidth ?? this.theme.element.lineWidth;
      const width = Math.max(1, snapDevice(widthCss, dpr));
      const y = snapDevice(cssY, dpr) + hairlineOffset(width);

      const key = `${color}|${width}`;
      let batch = batches.get(key);
      if (batch === undefined) {
        batch = { color, width, segments: [] };
        batches.set(key, batch);
      }
      batch.segments.push({
        x1: snapDevice(x1Css, dpr),
        y1: y,
        x2: snapDevice(x2Css, dpr),
        y2: y,
      });
    }
    for (const batch of batches.values()) this.renderer.drawLines(batch);

    // Header labels: major row above minor row (drawn last, over the grid).
    const headerFont = scaleFontToDevice(this.theme.headerFont, dpr);
    this.renderer.drawText({
      color: this.theme.headerTextColor,
      font: headerFont,
      baseline: 'middle',
      align: 'center',
      items: ticks.major.map((tick) => ({
        x: snapDevice(this.camera.timeToScreenX(tick.time), dpr),
        y: snapDevice(headerHeight * 0.32, dpr),
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
        y: snapDevice(headerHeight * 0.72, dpr),
        text: tick.label,
      })),
    });

    this.renderer.endFrame('base');
  }
}
