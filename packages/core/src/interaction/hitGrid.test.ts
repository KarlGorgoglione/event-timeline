import { describe, expect, it } from 'vitest';
import type { HitTarget } from '../render/specs';
import { HitGrid, buildHitGrid } from './hitGrid';

const elementTarget = (y: number): HitTarget => ({
  kind: 'element',
  element: { id: 'e', label: 'E' },
  y,
  x1: 0,
  x2: 100,
  width: 2,
});

describe('HitGrid', () => {
  it('returns a target from a cell its bounding box overlaps', () => {
    const grid = new HitGrid(64);
    grid.insert(elementTarget(30));
    // The line spans x∈[0,100] at y=30, so (50,30) lands on it.
    expect(grid.query(50, 30)).toHaveLength(1);
  });

  it('returns nothing for a far-away cell', () => {
    const grid = new HitGrid(64);
    grid.insert(elementTarget(30));
    expect(grid.query(500, 500)).toHaveLength(0);
  });

  it('registers a wide target across every overlapped cell', () => {
    const grid = new HitGrid(64);
    grid.insert(elementTarget(30));
    // Same target found at both ends of its 100px span (different cells).
    expect(grid.query(5, 30)).toHaveLength(1);
    expect(grid.query(95, 30)).toHaveLength(1);
  });

  it('buildHitGrid indexes every target', () => {
    const grid = buildHitGrid([elementTarget(10), elementTarget(200)]);
    expect(grid.query(50, 10)).toHaveLength(1);
    expect(grid.query(50, 200)).toHaveLength(1);
  });
});
