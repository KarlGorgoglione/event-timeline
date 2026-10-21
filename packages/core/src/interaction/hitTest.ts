// Resolve a screen point to a drawn primitive (DESIGN.md §5, §9).
//
// Queries the hit grid for the few targets near the cursor, then measures
// precise distances in CSS px: an arrow is hit near its riser, arrowhead or
// landing dot; a cluster near its riser or marker; an element near its line.
// Arrows and markers draw over element lines, so they win at the same point.

import { distSqToSegment, inSquare } from './geometry';
import { TargetKind, type HitGrid, type TargetPool } from '../scene/targets';

/** Base pointer tolerance in CSS px, widened by each primitive's own width. */
export const HIT_TOLERANCE_PX = 5;

/** Index of the target under (x, y), or −1. */
export function hitTest(
  targets: TargetPool,
  grid: HitGrid,
  x: number,
  y: number,
  tolerance: number = HIT_TOLERANCE_PX,
): number {
  let bestTop = -1;
  let bestTopDist = Infinity;
  let bestElement = -1;
  let bestElementDist = Infinity;
  const seg = targets.segments;

  for (const index of grid.query(x, y)) {
    const t = targets.at(index);
    let distSq = Infinity;
    for (let s = t.segStart; s < t.segStart + t.segCount; s++) {
      distSq = Math.min(
        distSq,
        distSqToSegment(
          x,
          y,
          seg[s * 4] as number,
          seg[s * 4 + 1] as number,
          seg[s * 4 + 2] as number,
          seg[s * 4 + 3] as number,
        ),
      );
    }
    const tol = tolerance + t.width / 2;
    if (t.kind === TargetKind.Element) {
      if (distSq <= tol * tol && distSq < bestElementDist) {
        bestElement = index;
        bestElementDist = distSq;
      }
      continue;
    }
    if (t.kind === TargetKind.Event) {
      // The arrowhead and the landing dot count as solid boxes.
      if (t.hasHead && inSquare(x, y, t.hx, t.hy, t.headSize)) distSq = 0;
      if (t.hasTargetNode && inSquare(x, y, t.tx, t.ty, t.headSize)) {
        distSq = 0;
      }
    } else if (t.hasNode && inSquare(x, y, t.x, t.y, t.radius)) {
      distSq = 0; // the cluster's count marker
    }
    if (distSq <= tol * tol && distSq < bestTopDist) {
      bestTop = index;
      bestTopDist = distSq;
    }
  }
  return bestTop >= 0 ? bestTop : bestElement;
}
