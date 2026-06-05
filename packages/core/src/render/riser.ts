// Vertical arrow risers with "hop" arcs over crossed lines (DESIGN.md §4, §16).
//
// An event riser is a vertical line between the source and target rows. Where it
// crosses an *intermediary* element line (a row strictly between source and
// target whose line is present at the event's x), it should visibly jump over it
// — the wire-crossing "bridge" notation — to read as passing above the line.
//
// The Renderer seam exposes only straight-line batches (§4), so each hop is a
// small semicircle approximated by a short polyline. This keeps the backend-free
// seam unchanged: the result is just more `SpecSegment`s drawn via `drawLines`.
//
// Pure geometry in CSS pixels; reused for the line batch, the hit-test target,
// and the overlay highlight from the same coordinates (DRY).

import type { SpecSegment } from './specs';

/** Polyline segments approximating one hop semicircle. */
const HOP_ARC_STEPS = 6;

/**
 * A vertical riser at `x` from `yFrom` to `yTo`, bulging +x by a semicircular hop
 * of radius `hopRadius` at each y in `crossings`. With no crossings it is a single
 * straight segment. Crossings are expected strictly between the endpoints (the
 * caller derives them from intermediary rows), so hops never touch the ends.
 */
export function buildRiserSegments(
  x: number,
  yFrom: number,
  yTo: number,
  crossings: readonly number[],
  hopRadius: number,
): SpecSegment[] {
  if (crossings.length === 0 || hopRadius <= 0) {
    return [{ x1: x, y1: yFrom, x2: x, y2: yTo }];
  }

  const dir = yTo >= yFrom ? 1 : -1;
  // Walk the crossings in travel order so the polyline is monotonic along y.
  const ordered = [...crossings].sort((a, b) => dir * (a - b));

  const points: { x: number; y: number }[] = [{ x, y: yFrom }];
  for (const cy of ordered) {
    const entryY = cy - dir * hopRadius;
    const exitY = cy + dir * hopRadius;
    points.push({ x, y: entryY });
    // Semicircle centred at (x, cy), bulging +x: theta 0→π maps entry→exit.
    for (let s = 1; s < HOP_ARC_STEPS; s++) {
      const theta = (Math.PI * s) / HOP_ARC_STEPS;
      points.push({
        x: x + hopRadius * Math.sin(theta),
        y: cy - dir * hopRadius * Math.cos(theta),
      });
    }
    points.push({ x, y: exitY });
  }
  points.push({ x, y: yTo });

  const segments: SpecSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return segments;
}
