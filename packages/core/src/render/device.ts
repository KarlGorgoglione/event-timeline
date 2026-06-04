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

/**
 * Scale the `px` size in a CSS font shorthand by `dpr`. The context is not
 * pre-scaled (§3), so text drawn in device pixels needs its size multiplied to
 * match. e.g. scaleFontToDevice('12px system-ui', 2) → '24px system-ui'.
 */
export function scaleFontToDevice(font: string, dpr: number): string {
  return font.replace(
    /(\d*\.?\d+)px/,
    (_, size: string) => `${Number(size) * dpr}px`,
  );
}
