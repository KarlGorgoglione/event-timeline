// Keyboard navigation (DESIGN.md §9; audit R-09).
//
// The engine's wrapper is focusable; while it has focus, keys map to the
// same intents as the pointer: ←/→ pan through time (a tenth of the view,
// Shift for half), ↑/↓ scroll the rows (one row, Shift for a page), +/−
// zoom about the centre, 0 frames the data and Escape clears the selection.
// Keys pressed with Ctrl, Cmd or Alt are left to the browser (page zoom,
// shortcuts). Pure: the engine applies the intent.

export type KeyIntent =
  /** Pan through time by a fraction of the view width (+ = later). */
  | { kind: 'pan'; fraction: number }
  /** Scroll by rows (+ = down); `page` scrolls by the view height. */
  | { kind: 'scroll'; rows: number; page: boolean }
  /** Zoom about the view centre by a factor (> 1 = in). */
  | { kind: 'zoom'; factor: number }
  | { kind: 'fit' }
  | { kind: 'clearSelection' };

/** Zoom factor of one +/− press. */
const ZOOM_STEP = 1.5;

export interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export function interpretKey(e: KeyLike): KeyIntent | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const big = e.shiftKey;
  switch (e.key) {
    case 'ArrowLeft':
      return { kind: 'pan', fraction: big ? -0.5 : -0.1 };
    case 'ArrowRight':
      return { kind: 'pan', fraction: big ? 0.5 : 0.1 };
    case 'ArrowUp':
      return { kind: 'scroll', rows: -1, page: big };
    case 'ArrowDown':
      return { kind: 'scroll', rows: 1, page: big };
    case 'PageUp':
      return { kind: 'scroll', rows: -1, page: true };
    case 'PageDown':
      return { kind: 'scroll', rows: 1, page: true };
    case '+':
    case '=':
      return { kind: 'zoom', factor: ZOOM_STEP };
    case '-':
    case '_':
      return { kind: 'zoom', factor: 1 / ZOOM_STEP };
    case '0':
      return { kind: 'fit' };
    case 'Escape':
      return { kind: 'clearSelection' };
    default:
      return null;
  }
}
