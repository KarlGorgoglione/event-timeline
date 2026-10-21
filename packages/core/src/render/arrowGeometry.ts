// Arrowhead triangle geometry shared by every Renderer backend (§4).
//
// One definition of the arrowhead shape keeps backends pixel-identical: the
// triangle points +x in local space (tip at +size), with base corners at local
// (-0.4·size, ±0.6·size), rotated by `angle` and translated to (x, y). Both
// Canvas2DRenderer computes these vertices directly; the WebGL shader
// interpolates the same constants into its source.

/** Tip distance ahead of the anchor, as a multiple of the arrowhead size. */
export const ARROW_TIP = 1;
/** Base corners' distance behind the anchor, as a multiple of the size. */
export const ARROW_BASE_BACK = -0.4;
/** Base corners' half-width, as a multiple of the size. */
export const ARROW_BASE_HALF_WIDTH = 0.6;

export interface ArrowheadVertices {
  tipX: number;
  tipY: number;
  baseAX: number;
  baseAY: number;
  baseBX: number;
  baseBY: number;
}

/** Compute the three device-px vertices of one arrowhead triangle. */
export function arrowheadTriangle(
  x: number,
  y: number,
  angle: number,
  size: number,
): ArrowheadVertices {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bx = ARROW_BASE_BACK * size;
  const wy = ARROW_BASE_HALF_WIDTH * size;
  return {
    tipX: x + ARROW_TIP * size * cos,
    tipY: y + ARROW_TIP * size * sin,
    baseAX: x + bx * cos - wy * sin,
    baseAY: y + bx * sin + wy * cos,
    baseBX: x + bx * cos + wy * sin,
    baseBY: y + bx * sin - wy * cos,
  };
}
