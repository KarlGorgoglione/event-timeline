// Pure 2-D geometry helpers for hit-testing (DESIGN.md §5).
//
// Hit-testing reduces to "how far is the cursor from this primitive": distance
// to an arrow's orthogonal segment, distance to an element's horizontal line, or
// containment in an arrowhead/marker box. These helpers work in CSS pixels and
// have no dependency on the camera or the renderer, so they unit-test directly.

/** Squared distance from point (px,py) to the segment (x1,y1)-(x2,y2). */
export function distSqToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  // Degenerate segment (a point): distance to that point.
  const t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + clamped * dx;
  const cy = y1 + clamped * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

/** Whether (px,py) lies within `half` CSS px of the centre (cx,cy) on each axis. */
export function inSquare(
  px: number,
  py: number,
  cx: number,
  cy: number,
  half: number,
): boolean {
  return Math.abs(px - cx) <= half && Math.abs(py - cy) <= half;
}
