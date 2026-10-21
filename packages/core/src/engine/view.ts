// Camera, viewport and framing for the engine (DESIGN.md §3, §12).
//
// Every camera mutation goes through here so zoom limits, pan bounds, scroll
// clamping and the data-change fit policy are applied in one place. The Camera
// itself stays the single source of coordinate truth; this class only decides
// *which* camera state to set.

import type { RowLayout } from '../layout/positions';
import type { DataStore } from '../model/store';
import type { Time } from '../model/types';
import {
  Camera,
  clampOriginToExtent,
  computeZoomBounds,
  DEFAULT_MAX_PX_PER_MS,
  effectiveExtent,
  fit,
  fitInsetLeft,
  type FitInset,
  type Viewport,
  type ZoomBounds,
} from '../scale/camera';
import type { EngineConfig } from './options';

/** The visible window, as reported by `getViewport` and `viewportChange`. */
export interface ViewportState {
  /** Times at the left and right edges of the viewport. */
  timeRange: [number, number];
  /** Vertical scroll offset in CSS px. */
  scrollY: number;
  /** Horizontal zoom: CSS px per millisecond. */
  pxPerMs: number;
  /** First visible row and one past the last visible row. */
  visibleRowRange: [number, number];
}

export interface ViewModelDeps<TData> {
  store: DataStore<TData>;
  rows: () => RowLayout;
  config: () => EngineConfig<TData>;
  now: () => Time;
  /**
   * Each element's start-marker width (icon and/or label, CSS px) and how far
   * its line starts after the data start, for the fit inset.
   */
  markers: () => Iterable<{ offsetMs: number; contentWidth: number }>;
}

/** Fraction of the viewport left empty on each side when zooming to a range. */
export const RANGE_PADDING = 0.1;

export class ViewModel<TData> {
  readonly camera: Camera;
  viewport: Viewport = { cssWidth: 0, cssHeight: 0 };
  dpr = 1;
  /** Data has been framed at least once (the `'first'`/`'auto'` latch). */
  private hasFitted = false;
  /** Data is waiting for a sized viewport to be framed. */
  private pendingFit = false;
  /** Cached left fit inset; null when stale. */
  private inset: FitInset | null = null;

  constructor(private readonly deps: ViewModelDeps<TData>) {
    this.camera = new Camera(deps.config().metrics);
  }

  get isSized(): boolean {
    return this.viewport.cssWidth > 0 && this.viewport.cssHeight > 0;
  }

  setSize(cssWidth: number, cssHeight: number, dpr: number): void {
    const firstSize = this.viewport.cssWidth <= 0;
    if (cssWidth !== this.viewport.cssWidth) this.inset = null;
    this.viewport = { cssWidth, cssHeight };
    this.dpr = dpr;
    if (cssWidth <= 0) return;
    if (this.pendingFit || (firstSize && !this.hasFitted)) {
      this.frameData();
    } else {
      this.camera.setPxPerMs(this.camera.state.pxPerMs, this.zoomBounds());
      this.constrain();
    }
  }

  /** The data or the labels changed: re-measure the fit inset when next needed. */
  invalidateInset(): void {
    this.inset = null;
  }

  /** The deepest zoom-in allowed. */
  get maxPxPerMs(): number {
    return this.deps.config().zoom.max ?? DEFAULT_MAX_PX_PER_MS;
  }

  /** Re-read the row metrics and limits after an option change. */
  refreshConfig(): void {
    this.inset = null;
    this.camera.setMetrics(this.deps.config().metrics);
    if (this.isSized) {
      this.camera.setPxPerMs(this.camera.state.pxPerMs, this.zoomBounds());
    }
    this.constrain();
  }

  /** Apply the fit policy after `setData` replaced the dataset (§3). */
  onDataReplaced(): void {
    const policy = this.deps.config().fitOnDataChange;
    const hasData = this.deps.store.getDataExtent() !== null;
    const shouldFit =
      policy === 'always' ||
      ((policy === 'first' || policy === 'auto') && !this.hasFitted) ||
      (policy === 'auto' && hasData && !this.showsData());
    if (!shouldFit) {
      this.constrain();
      return;
    }
    if (this.viewport.cssWidth > 0) this.frameData();
    else this.pendingFit = true;
  }

  zoomBounds(): ZoomBounds {
    const config = this.deps.config();
    return computeZoomBounds(
      this.deps.store.getDataExtent(),
      this.viewport,
      this.deps.now(),
      this.fitInset(),
      config.zoom,
    );
  }

  fit(): void {
    fit(
      this.camera,
      this.deps.store.getDataExtent(),
      this.viewport,
      this.deps.now(),
      this.fitInset(),
      this.deps.config().zoom,
    );
    if (this.deps.store.getDataExtent() !== null) this.hasFitted = true;
    this.pendingFit = false;
    this.constrain();
  }

  panToTime(t: Time): void {
    this.camera.setOriginTime(t);
    this.constrain();
  }

  /**
   * Frame `[start, end]` across the viewport, leaving `padding` (a fraction of
   * the width) empty on each side. When the zoom limit stops short, the range
   * is centred instead. Returns false (no change) for an empty span.
   */
  zoomToRange(start: Time, end: Time, padding = 0): boolean {
    const span = end - start;
    const { cssWidth } = this.viewport;
    if (!(span > 0) || cssWidth <= 0) return false;
    const usable = cssWidth * Math.max(0, 1 - 2 * padding);
    this.camera.setPxPerMs(usable / span, this.zoomBounds());
    this.camera.placeTimeAt((start + end) / 2, cssWidth / 2);
    this.constrain();
    return true;
  }

  /** Zoom by `factor` about the viewport centre (or `cursorX`). */
  zoomBy(factor: number, cursorX = this.viewport.cssWidth / 2): void {
    this.camera.zoomAboutCursor(factor, cursorX, this.zoomBounds());
    this.constrain();
  }

  setScrollY(scrollY: number): void {
    this.camera.setScrollY(scrollY);
    this.clampScroll();
  }

  /** Put time `t` at the horizontal centre, keeping the zoom. */
  centreTime(t: Time): void {
    this.camera.placeTimeAt(t, this.viewport.cssWidth / 2);
    this.constrain();
  }

  /** Scroll so rows `first..last` are vertically centred in the body. */
  centreRows(first: number, last: number): void {
    const { headerHeight, rowHeight, rowGap } = this.deps.config().metrics;
    const pitch = rowHeight + rowGap;
    const middle = ((first + last + 1) * pitch - rowGap) / 2;
    const body = this.viewport.cssHeight - headerHeight;
    this.camera.setScrollY(middle - body / 2);
    this.clampScroll();
  }

  panBy(dx: number, dy: number): void {
    this.camera.panByPixels(dx, dy);
    this.constrain();
  }

  clampScroll(): void {
    this.camera.clampScrollY(this.deps.rows().contentHeight, this.viewport);
  }

  snapshot(): ViewportState {
    const { camera, viewport } = this;
    const { scrollY, pxPerMs } = camera.state;
    const rows = this.deps.rows();
    const top = Math.max(
      0,
      Math.floor(camera.screenYToRow(this.deps.config().metrics.headerHeight)),
    );
    const bottom = Math.min(
      rows.rowCount,
      Math.ceil(camera.screenYToRow(viewport.cssHeight)),
    );
    return {
      timeRange: [
        camera.screenXToTime(0),
        camera.screenXToTime(viewport.cssWidth),
      ],
      scrollY,
      pxPerMs,
      visibleRowRange: [top, Math.max(top, bottom)],
    };
  }

  /** Frame the data, or the default window on `now` when there is none (§3.1). */
  private frameData(): void {
    if (this.deps.store.getDataExtent() !== null) {
      this.fit();
      return;
    }
    fit(
      this.camera,
      null,
      this.viewport,
      this.deps.now(),
      this.fitInset(),
      this.deps.config().zoom,
    );
    this.pendingFit = false;
    this.constrain();
  }

  /** Whether the visible window overlaps the data extent. */
  private showsData(): boolean {
    const extent = this.deps.store.getDataExtent();
    if (extent === null || !this.isSized) return false;
    const [t0, t1] = this.snapshot().timeRange;
    return extent.maxTime >= t0 && extent.minTime <= t1;
  }

  /** Apply the pan bounds and the vertical scroll clamp. */
  private constrain(): void {
    if (this.isSized && this.deps.config().panBounds === 'data') {
      clampOriginToExtent(
        this.camera,
        this.deps.store.getDataExtent(),
        this.viewport,
        this.deps.now(),
        this.fitInset(),
      );
    }
    this.clampScroll();
  }

  /**
   * Edge space reserved when fitting (§3): a left gutter wide enough for the
   * measured start markers (icon + label, §1) of the lines that start near
   * the data start. Cached until the data, labels or width change.
   */
  private fitInset(): FitInset {
    if (this.inset !== null) return this.inset;
    const extent = this.deps.store.getDataExtent();
    if (extent === null || this.viewport.cssWidth <= 0) return {};
    const eff = effectiveExtent(extent, this.deps.now());
    const { theme } = this.deps.config();
    this.inset = {
      left: fitInsetLeft(
        theme.layout.edgePadding +
          theme.layout.markerGap +
          theme.layout.lineLead,
        [...this.deps.markers()],
        this.viewport.cssWidth,
        eff.maxTime - eff.minTime,
      ),
    };
    return this.inset;
  }
}
