// CSS-px → device-px helpers for the DPR convention (DESIGN.md §3).
//
// The backing store is cssSize * dpr and the context is NOT pre-scaled, so the
// engine converts coordinates to device pixels and snaps them to integers here;
// a 0.5px offset keeps odd-width strokes crisp (hairline rule).

/** Convert a CSS-pixel coordinate to an integer device pixel. */
export function snapDevice(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr);
}

/** The 0.5px offset that keeps an odd device-width stroke on a pixel centre. */
export function hairlineOffset(deviceWidthPx: number): number {
  return deviceWidthPx % 2 === 1 ? 0.5 : 0;
}

/** Matches the leading `px` size token of a CSS font shorthand, e.g. `12px`. */
const FONT_PX = /(\d*\.?\d+)px/;

/** Fallback font size (CSS px) when a shorthand has no `px` token (e.g. `1em`). */
const DEFAULT_FONT_PX = 11;

/**
 * The `px` size of a CSS font shorthand, in CSS pixels. Used to derive a label
 * box height from the font (so the box has no separate size knob). Falls back to
 * {@link DEFAULT_FONT_PX} for shorthands without a `px` token.
 */
export function parseFontPx(font: string): number {
  const match = FONT_PX.exec(font);
  return match?.[1] !== undefined ? Number(match[1]) : DEFAULT_FONT_PX;
}

/**
 * Scale the `px` size in a CSS font shorthand by `dpr`. The context is not
 * pre-scaled (§3), so text drawn in device pixels needs its size multiplied to
 * match. e.g. scaleFontToDevice('12px system-ui', 2) → '24px system-ui'.
 */
export function scaleFontToDevice(font: string, dpr: number): string {
  return font.replace(FONT_PX, (_, size: string) => `${Number(size) * dpr}px`);
}
