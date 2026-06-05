// The single source of coordinate truth (DESIGN.md §3, §3.1).
//
// Every time↔screen and row↔screen transform lives here; no other module
// re-derives `(t - originTime) * pxPerMs`. Horizontal pan is anchored in the
// time domain (`originTime`), never as a pixel offset, so pan and zoom compose
// cleanly. All math is in CSS pixels; the renderer applies DPR (§3).

import type { Time } from '../model/types';
import type { Extent } from '../model/extent';

/** One day in milliseconds; the unit for day-width-derived zoom limits. */
export const DAY_MS = 86_400_000;

/** Default window spanned when the data extent is empty or degenerate (§3.1). */
export const DEFAULT_WINDOW_MS = 30 * DAY_MS;

/** Max useful day width (CSS px); drives `maxPxPerMs`. */
export const MAX_DAY_WIDTH_PX = 4000;

export interface CameraState {
  /** Time mapped to the left edge of the viewport (screen x = 0). */
  originTime: Time;
  /** Vertical scroll offset in CSS px. */
  scrollY: number;
  /** Horizontal zoom level: CSS px per millisecond. */
  pxPerMs: number;
}

/** Viewport size in CSS pixels (DPR is the renderer's concern, §3). */
export interface Viewport {
  cssWidth: number;
  cssHeight: number;
}

/** Fixed vertical metrics for row placement. */
export interface RowMetrics {
  headerHeight: number;
  rowHeight: number;
  rowGap: number;
}

export interface ZoomBounds {
  minPxPerMs: number;
  maxPxPerMs: number;
}

/**
 * CSS px reserved at the viewport edges when fitting, so content drawn *outside*
 * the data extent stays on-screen — chiefly the element start markers that sit
 * left of each line's first event (§1). The engine derives these from the theme;
 * the Camera just treats them as a usable-width reduction (it stays the single
 * source of coordinate truth, §3).
 */
export interface FitInset {
  left?: number;
  right?: number;
}

/** Usable horizontal span for fitting, after reserving the edge insets. */
function usableFitWidth(viewport: Viewport, inset: FitInset): number {
  const left = inset.left ?? 0;
  const right = inset.right ?? 0;
  return Math.max(1, viewport.cssWidth - left - right);
}

const DEFAULT_STATE: CameraState = {
  originTime: 0,
  scrollY: 0,
  pxPerMs: 1,
};

export class Camera {
  private _state: CameraState;

  constructor(
    private readonly metrics: RowMetrics,
    initial: Partial<CameraState> = {},
  ) {
    this._state = { ...DEFAULT_STATE, ...initial };
  }

  get state(): Readonly<CameraState> {
    return this._state;
  }

  // --- Transforms (the only place this arithmetic exists) ---

  timeToScreenX(t: Time): number {
    return (t - this._state.originTime) * this._state.pxPerMs;
  }

  screenXToTime(x: number): Time {
    return this._state.originTime + x / this._state.pxPerMs;
  }

  rowToScreenY(row: number): number {
    const { headerHeight, rowHeight, rowGap } = this.metrics;
    return headerHeight + row * (rowHeight + rowGap) - this._state.scrollY;
  }

  screenYToRow(y: number): number {
    const { headerHeight, rowHeight, rowGap } = this.metrics;
    return (y + this._state.scrollY - headerHeight) / (rowHeight + rowGap);
  }

  // --- Mutations ---

  setOriginTime(t: Time): void {
    this._state.originTime = t;
  }

  setScrollY(y: number): void {
    this._state.scrollY = y;
  }

  setPxPerMs(pxPerMs: number, bounds: ZoomBounds): void {
    this._state.pxPerMs = Math.min(
      bounds.maxPxPerMs,
      Math.max(bounds.minPxPerMs, pxPerMs),
    );
  }

  /**
   * Zoom about the cursor (DESIGN.md §3): scale `pxPerMs` by `factor`, keeping
   * the time under `cursorScreenX` fixed on screen. The cursor time is captured
   * *before* the zoom change, then `originTime` is recomputed afterwards so the
   * same instant lands under the same screen x. Reuses the existing transforms
   * and clamping — no new `pxPerMs` arithmetic leaks out of the Camera.
   */
  zoomAboutCursor(
    factor: number,
    cursorScreenX: number,
    bounds: ZoomBounds,
  ): void {
    const tCursor = this.screenXToTime(cursorScreenX);
    this.setPxPerMs(this._state.pxPerMs * factor, bounds);
    this._state.originTime = tCursor - cursorScreenX / this._state.pxPerMs;
  }

  /**
   * Pan by a pixel delta. Dragging right (`dxCss > 0`) reveals earlier time at
   * the left edge, so `originTime` decreases. This is the only place a pixel
   * delta is converted to a time delta (`dxCss / pxPerMs`).
   */
  panByPixels(dxCss: number, dyCss: number): void {
    this._state.originTime -= dxCss / this._state.pxPerMs;
    this._state.scrollY -= dyCss;
  }

  /** Clamp `scrollY` so vertical scroll cannot overscroll the content. */
  clampScrollY(contentHeight: number, viewport: Viewport): void {
    const visibleBody = viewport.cssHeight - this.metrics.headerHeight;
    const max = Math.max(0, contentHeight - visibleBody);
    this._state.scrollY = Math.min(max, Math.max(0, this._state.scrollY));
  }
}

/**
 * Resolve a degenerate data extent to a usable window (DESIGN.md §3.1). This is
 * the only place empty / single-instant extents are widened, so no division by
 * zero ever reaches the scale math.
 */
export function effectiveExtent(extent: Extent | null, now: Time): Extent {
  if (extent === null) {
    return {
      minTime: now - DEFAULT_WINDOW_MS / 2,
      maxTime: now + DEFAULT_WINDOW_MS / 2,
    };
  }
  if (extent.maxTime - extent.minTime <= 0) {
    const center = extent.minTime;
    return {
      minTime: center - DEFAULT_WINDOW_MS / 2,
      maxTime: center + DEFAULT_WINDOW_MS / 2,
    };
  }
  return extent;
}

/**
 * Zoom limits for the current data + viewport. `minPxPerMs` fits the (degenerate
 * -safe) extent to the viewport width; `maxPxPerMs` comes from a max useful day
 * width. `now` resolves empty/single-instant extents (§3.1).
 */
export function computeZoomBounds(
  extent: Extent | null,
  viewport: Viewport,
  now: Time,
  inset: FitInset = {},
): ZoomBounds {
  const eff = effectiveExtent(extent, now);
  const span = eff.maxTime - eff.minTime;
  const maxPxPerMs = MAX_DAY_WIDTH_PX / DAY_MS;
  // The zoom-out limit must permit the inset-aware fit level (below), so it is
  // derived from the usable width, not the full viewport — otherwise a later
  // setPxPerMs would clamp the fitted zoom back up and undo the inset.
  const minPxPerMs = usableFitWidth(viewport, inset) / span;
  return { minPxPerMs, maxPxPerMs };
}

/**
 * Frame the data extent to the viewport: `pxPerMs` spans the (degenerate-safe)
 * extent across the *usable* width (the viewport minus any `inset`), the extent
 * start sits at the left inset, and `scrollY` resets. Reserving a left inset
 * keeps each line's start marker (icon + label, §1) on-screen instead of clipped
 * at the edge. `now` resolves empty/single-instant extents (§3.1).
 */
export function fit(
  camera: Camera,
  extent: Extent | null,
  viewport: Viewport,
  now: Time,
  inset: FitInset = {},
): void {
  const eff = effectiveExtent(extent, now);
  const span = eff.maxTime - eff.minTime;
  camera.setPxPerMs(
    usableFitWidth(viewport, inset) / span,
    computeZoomBounds(extent, viewport, now, inset),
  );
  // Place the extent start at the left inset using the *clamped* pxPerMs:
  // originTime is the time at screen x=0, so back off the inset's worth of time.
  const left = inset.left ?? 0;
  camera.setOriginTime(eff.minTime - left / camera.state.pxPerMs);
  camera.setScrollY(0);
}
