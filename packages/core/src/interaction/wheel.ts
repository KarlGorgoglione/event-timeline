// Pure wheel-gesture interpretation (DESIGN.md §9).
//
// The wheel maps to three intents by modifier: `ctrl`/`⌘` (or a trackpad pinch,
// which the browser reports as ctrl+wheel) → horizontal zoom about the cursor;
// `shift`+wheel or a horizontal trackpad swipe (`deltaX`) → horizontal pan;
// otherwise → vertical scroll. Kept pure over a minimal event shape so it
// unit-tests in the node env without a DOM, and so the controller does no
// pxPerMs/zoom-factor arithmetic of its own (the engine/Camera own that).

/** The subset of `WheelEvent` this interpreter reads. */
export interface WheelEventLike {
  deltaX: number;
  deltaY: number;
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

/**
 * Interpret a wheel event at canvas-local `cursorX` (CSS px). Zoom factor grows
 * exponentially in `deltaY` so repeated ticks compose multiplicatively and the
 * gesture is symmetric in/out: scrolling up (`deltaY < 0`) zooms in (factor > 1).
 */
export function interpretWheel(
  e: WheelEventLike,
  cursorX: number,
): WheelIntent {
  if (e.ctrlKey || e.metaKey) {
    const factor = Math.pow(2, -e.deltaY / ZOOM_DELTA_PER_DOUBLING);
    return { kind: 'zoom', factor, cursorX };
  }
  if (e.shiftKey) {
    return { kind: 'pan', dxCss: -e.deltaY };
  }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    // Trackpad horizontal swipe: pan so that swiping left reveals later time.
    return { kind: 'pan', dxCss: -e.deltaX };
  }
  return { kind: 'scroll', dyCss: e.deltaY };
}
