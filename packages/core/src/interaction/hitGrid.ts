// Screen-space hit-test grid (DESIGN.md §5).
//
// A uniform grid of fixed CSS-px cells mapping cell → the visible primitives
// whose bounding box overlaps it. Built once per base redraw from the frame's
// `HitTarget`s (camera/data change), then reused unchanged during pure hover so
// a `pointermove` only tests the few candidates in the cursor's cell. The grid
// stores no coordinate math of its own — targets arrive already in CSS px from
// the builders.

import type { HitTarget } from '../render/specs';

/** Cell size in CSS px (§5). */
const CELL_PX = 64;
/**
 * Bounding-box padding so a target is registered in every cell its hit
 * tolerance can reach, even when its geometry only grazes a cell edge.
 */
const BBOX_PAD_PX = 6;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(target: HitTarget): Bounds {
  if (target.kind === 'element') {
    const pad = BBOX_PAD_PX + target.width;
    return {
      minX: Math.min(target.x1, target.x2) - pad,
      maxX: Math.max(target.x1, target.x2) + pad,
      minY: target.y - pad,
      maxY: target.y + pad,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consume = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const s of target.segments) {
    consume(s.x1, s.y1);
    consume(s.x2, s.y2);
  }
  if (target.kind === 'cluster') {
    consume(target.marker.x, target.marker.y);
    const pad = BBOX_PAD_PX + Math.max(target.width, target.markerSize);
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }
  if (target.arrowhead) consume(target.arrowhead.x, target.arrowhead.y);
  if (target.node) consume(target.node.x, target.node.y);
  const pad = BBOX_PAD_PX + Math.max(target.width, target.arrowheadSize);
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

export class HitGrid<TData = unknown> {
  private readonly cells = new Map<string, HitTarget<TData>[]>();

  constructor(private readonly cellSize: number = CELL_PX) {}

  private static key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  /** Register a target in every cell its padded bounding box overlaps. */
  insert(target: HitTarget<TData>): void {
    const b = boundsOf(target);
    const cx0 = Math.floor(b.minX / this.cellSize);
    const cx1 = Math.floor(b.maxX / this.cellSize);
    const cy0 = Math.floor(b.minY / this.cellSize);
    const cy1 = Math.floor(b.maxY / this.cellSize);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = HitGrid.key(cx, cy);
        let bucket = this.cells.get(key);
        if (bucket === undefined) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(target);
      }
    }
  }

  /** Candidates whose cell contains the screen point (x,y), in insertion order. */
  query(x: number, y: number): readonly HitTarget<TData>[] {
    const key = HitGrid.key(
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
    );
    return this.cells.get(key) ?? [];
  }
}

/** Build a grid from a frame's targets (the one place targets are indexed). */
export function buildHitGrid<TData>(
  targets: readonly HitTarget<TData>[],
): HitGrid<TData> {
  const grid = new HitGrid<TData>();
  for (const t of targets) grid.insert(t);
  return grid;
}
