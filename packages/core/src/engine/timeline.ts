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
import { PointerController, type PointerHost } from '../interaction/pointer';
import { buildHitGrid, type HitGrid } from '../interaction/hitGrid';
import { hitTest } from '../interaction/hitTest';
import type { HitResult } from '../interaction/hit';
import { nextSelection, sameSet } from '../interaction/selection';
import type { HitTarget } from '../render/specs';
import { TypedEmitter, type TimelineEventMap } from './emitter';
import { FrameScheduler, type DirtyFlags } from './scheduler';
import { resolveTheme } from './theme';

export interface TimelineEngineOptions {
  theme?: Partial<Theme>;
  onDiagnostic?: OnDiagnostic;
  layout?: LayoutStrategy;
  /** Allow `ctrl`/`⌘`+click to extend the selection (DESIGN.md §9). */
  multiSelect?: boolean;
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
  private readonly pointer: PointerController;
  private readonly multiSelect: boolean;
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
    options: TimelineEngineOptions = {},
  ) {
    this.theme = resolveTheme(options.theme);
    this.metrics = {
      headerHeight: this.theme.headerHeight,
      rowHeight: this.theme.rowHeight,
      rowGap: this.theme.rowGap,
    };
    this.layoutStrategy = options.layout ?? byFirstEvent;
    this.multiSelect = options.multiSelect ?? false;
    this.store = new DataStore<TData>({ onDiagnostic: options.onDiagnostic });
    this.camera = new Camera(this.metrics);
    this.renderer = new Canvas2DRenderer(
      baseCanvas,
      overlayCanvas,
      this.theme.background,
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.dispose();
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

  private emitViewportChange(): void {
    if (this.viewport.cssWidth <= 0 || !(this.camera.state.pxPerMs > 0)) return;
    this.emitter.emit('viewportChange', this.getViewport());
  }

  private drawFrame(dirty: DirtyFlags): void {
    if (this.disposed) return;
    if (dirty.base) this.drawBase();
    // The overlay highlights this frame's `frameTargets`, which `drawBase`
    // rebuilds at the current camera position. So it must re-render whenever the
    // base moved — not only on overlay-only (hover/selection) changes —
    // otherwise a pan/zoom slides the content while a stale highlight stays
    // pinned to its old screen position. (§4's independence is the *other*
    // direction: an overlay-only change never forces a base redraw.)
    if (dirty.base || dirty.overlay) this.drawOverlay();
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

    // Rebuild the hit-test index from this frame's visible primitives (§5). It
    // is reused unchanged for pure hover until the next base redraw.
    this.frameTargets = [...elements.targets, ...arrows.targets];
    this.hitGrid = buildHitGrid(this.frameTargets);

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

    for (const target of this.frameTargets) {
      const key = targetKey(target);
      const selected = this.selectedIds.has(key);
      const hovered = key === hoveredKey;
      if (!selected && !hovered) continue;
      // Hover wins the colour when an item is both hovered and selected.
      const color = hovered ? this.theme.hoverColor : this.theme.selectionColor;
      this.drawHighlight(target, color, dpr);
    }

    this.renderer.endFrame('overlay');
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

  /** Redraw one target's geometry in `color`, slightly thickened, on the overlay. */
  private drawHighlight(
    target: HitTarget<TData>,
    color: string,
    dpr: number,
  ): void {
    if (target.kind === 'element') {
      this.renderer.drawLines(
        snapLines(
          {
            color,
            width: target.width + 2,
            segments: [
              { x1: target.x1, y1: target.y, x2: target.x2, y2: target.y },
            ],
          },
          dpr,
        ),
      );
      return;
    }
    this.renderer.drawLines(
      snapLines(
        { color, width: target.width + 2, segments: target.segments },
        dpr,
      ),
    );
    if (target.node !== undefined) {
      this.renderer.drawNodes(
        snapNodes(
          {
            color,
            radius: this.theme.event.nodeRadius + 1,
            items: [target.node],
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
            size: target.arrowheadSize + 1,
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
  const id = target.kind === 'element' ? target.element.id : target.event.id;
  return `${target.kind}:${id}`;
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
