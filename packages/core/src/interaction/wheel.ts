// Pure wheel-gesture interpretation (DESIGN.md §9).
//
// The wheel maps to three intents by modifier: `ctrl`/`⌘` (or a trackpad pinch,
// which the browser reports as ctrl+wheel) → horizontal zoom about the cursor;
// `shift`+wheel or a horizontal trackpad swipe (`deltaX`) → horizontal pan;
// otherwise → vertical scroll. Kept pure over a minimal event shape so it
// unit-tests in the node env without a DOM; the engine/Camera own the zoom and
// time arithmetic.

/** The subset of `WheelEvent` this interpreter reads. */
export interface WheelEventLike {
  deltaX: number;
  deltaY: number;
  /** `WheelEvent.deltaMode`: 0 = pixels, 1 = lines, 2 = pages. Default 0. */
  deltaMode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export type WheelIntent =
  | { kind: 'zoom'; factor: number; cursorX: number }
  | { kind: 'pan'; dxCss: number }
  | { kind: 'scroll'; dyCss: number };

/** Pixels of wheel delta that halve/double the zoom; tuned for a smooth feel. */
const ZOOM_DELTA_PER_DOUBLING = 200;

/** CSS px per wheel "line" (`deltaMode === 1`, e.g. Firefox mouse wheels). */
export const WHEEL_LINE_PX = 16;

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/**
 * Interpret a wheel event at canvas-local `cursorX` (CSS px). Deltas are first
 * normalised to CSS px (line and page modes scale by `WHEEL_LINE_PX` and
 * `pageHeightPx`). Zoom factor grows exponentially in `deltaY` so repeated ticks
 * compose multiplicatively and the gesture is symmetric in/out: scrolling up
 * (`deltaY < 0`) zooms in (factor > 1).
 */
export function interpretWheel(
  e: WheelEventLike,
  cursorX: number,
  pageHeightPx = 800,
): WheelIntent {
  const unit =
    e.deltaMode === DOM_DELTA_LINE
      ? WHEEL_LINE_PX
      : e.deltaMode === DOM_DELTA_PAGE
        ? pageHeightPx
        : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;

  if (e.ctrlKey || e.metaKey) {
    const factor = Math.pow(2, -dy / ZOOM_DELTA_PER_DOUBLING);
    return { kind: 'zoom', factor, cursorX };
  }
  if (e.shiftKey) {
    // macOS moves a shift+wheel delta into deltaX (deltaY is then 0); other
    // platforms leave it in deltaY.
    return { kind: 'pan', dxCss: -(dx !== 0 ? dx : dy) };
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    // Trackpad horizontal swipe: pan so that swiping left reveals later time.
    return { kind: 'pan', dxCss: -dx };
  }
  return { kind: 'scroll', dyCss: dy };
}
