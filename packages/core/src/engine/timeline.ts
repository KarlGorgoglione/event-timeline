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
import { buildArrows } from '../render/arrows';
import { Canvas2DRenderer } from '../render/canvas2d';
import {
  hairlineOffset,
  scaleFontToDevice,
  snapDevice,
} from '../render/device';
import { buildElementLines } from '../render/elementLines';
import { IconCache, isIconUrl } from '../render/iconCache';
import { visibleRowBand } from '../render/rowBand';
import {
  snapArrowheads,
  snapIcons,
  snapLabels,
  snapLines,
  snapNodes,
} from '../render/snap';
import type { BuildContext, ResolveIcon } from '../render/specs';
import type { LineSegment } from '../render/types';
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

    const ticks = generateTicks(
      this.camera.screenXToTime(0),
      this.camera.screenXToTime(cssWidth),
      this.camera.state.pxPerMs,
      MIN_LABEL_GAP_PX,
    );

    // Major gridlines run from the header bottom down through the content; drawn
    // before content so element lines and arrows sit over them.
    const gridWidth = Math.max(1, snapDevice(1, dpr));
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
    };
    const elements = buildElementLines(ctx);
    const arrows = buildArrows(ctx);

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
