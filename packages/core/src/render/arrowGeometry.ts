// Arrowhead triangle geometry shared by every Renderer backend (§4).
//
// One definition of the arrowhead shape keeps backends pixel-identical: the
// triangle points +x in local space (tip at +size), with base corners at local
// (-0.4·size, ±0.6·size), rotated by `angle` and translated to (x, y). Both
// Canvas2DRenderer and WebGLRenderer consume these vertices verbatim.

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
  const bx = -0.4 * size;
  const wy = 0.6 * size;
  return {
    tipX: x + size * cos,
    tipY: y + size * sin,
    baseAX: x + bx * cos - wy * sin,
    baseAY: y + bx * sin + wy * cos,
    baseBX: x + bx * cos + wy * sin,
    baseBY: y + bx * sin - wy * cos,
  };
}
