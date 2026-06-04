// Resolve a screen point to a primitive (DESIGN.md §5, §9).
//
// Queries the per-frame hit grid for the few candidates near the cursor, then
// does precise distance tests in CSS px: an arrow hit is proximity to its riser
// segments or its arrowhead box; an element hit is proximity to its horizontal
// line. Arrows draw on top of element lines, so an event hit wins over an
// element hit at the same point. Returns the nearest match within tolerance, or
// null. All geometry is pure (`geometry.ts`); the camera is not consulted here —
// the grid already holds screen-space CSS px.

import { distSqToSegment, inSquare } from './geometry';
import type { HitGrid } from './hitGrid';
import type { HitResult } from './hit';
import type { HitTarget } from '../render/specs';

/** Base pointer tolerance in CSS px, widened by each primitive's own width. */
export const HIT_TOLERANCE_PX = 5;

interface Candidate<TData> {
  target: HitTarget<TData>;
  distSq: number;
}

export function hitTest<TData>(
  grid: HitGrid<TData>,
  x: number,
  y: number,
  tolerance: number = HIT_TOLERANCE_PX,
): HitResult<TData> | null {
  // Arrows and cluster markers share the top draw layer; element lines sit
  // beneath. So `bestTop` (event or cluster) wins over `bestElement` at a point.
  let bestTop: Candidate<TData> | null = null;
  let bestElement: Candidate<TData> | null = null;

  for (const target of grid.query(x, y)) {
    if (target.kind === 'element') {
      const distSq = distSqToSegment(
        x,
        y,
        target.x1,
        target.y,
        target.x2,
        target.y,
      );
      const tol = tolerance + target.width / 2;
      if (
        distSq <= tol * tol &&
        (bestElement === null || distSq < bestElement.distSq)
      ) {
        bestElement = { target, distSq };
      }
      continue;
    }

    let distSq = Infinity;
    for (const s of target.segments) {
      distSq = Math.min(distSq, distSqToSegment(x, y, s.x1, s.y1, s.x2, s.y2));
    }
    if (target.kind === 'event') {
      // The arrowhead is a filled triangle; treat its bounding box as solid.
      if (
        target.arrowhead !== undefined &&
        inSquare(
          x,
          y,
          target.arrowhead.x,
          target.arrowhead.y,
          target.arrowheadSize,
        )
      ) {
        distSq = 0;
      }
    } else if (
      inSquare(x, y, target.marker.x, target.marker.y, target.markerSize)
    ) {
      // Cluster: its count marker is a solid box around the riser midpoint.
      distSq = 0;
    }
    const tol = tolerance + target.width / 2;
    if (distSq <= tol * tol && (bestTop === null || distSq < bestTop.distSq)) {
      bestTop = { target, distSq };
    }
  }

  if (bestTop !== null) {
    const target = bestTop.target;
    if (target.kind === 'event') return { kind: 'event', event: target.event };
    if (target.kind === 'cluster') {
      return {
        kind: 'cluster',
        events: target.events,
        count: target.events.length,
      };
    }
  }
  if (bestElement !== null && bestElement.target.kind === 'element') {
    return { kind: 'element', element: bestElement.target.element };
  }
  return null;
}
