import { describe, expect, it } from 'vitest';
import { hitTest } from '../interaction/hitTest';
import { HitGrid, TargetKind, TargetPool } from './targets';

const viewport = { cssWidth: 800, cssHeight: 400 };

function pool() {
  const targets = new TargetPool();
  targets.reset(100, 10);
  return { targets, grid: new HitGrid(targets, () => viewport) };
}

function element(targets: TargetPool, slot: number, y: number) {
  const t = targets.open(TargetKind.Element, slot);
  targets.segment(t, 0, y, 800, y);
  t.width = 2;
  targets.close(t);
}

function arrow(
  targets: TargetPool,
  index: number,
  x: number,
  y1: number,
  y2: number,
) {
  const t = targets.open(TargetKind.Event, index);
  targets.segment(t, x, y1, x, y2);
  t.width = 1;
  t.headSize = 6;
  t.radius = 3;
  t.x = x;
  t.y = y1;
  t.hasNode = true;
  t.hx = x;
  t.hy = y2;
  t.angle = Math.PI / 2;
  t.hasHead = true;
  t.tx = x;
  t.ty = y2 + 7;
  t.hasTargetNode = true;
  targets.close(t);
}

describe('TargetPool (§5)', () => {
  it('indexes targets by event and element for the current frame', () => {
    const { targets } = pool();
    element(targets, 3, 58);
    arrow(targets, 42, 100, 58, 120);
    expect(targets.ofElement(3)).toBe(0);
    expect(targets.ofEvent(42)).toBe(1);
    expect(targets.ofEvent(7)).toBe(-1);
    targets.reset(100, 10);
    expect(targets.ofEvent(42)).toBe(-1); // stale after a new frame
  });

  it('indexes cluster members through their cluster', () => {
    const { targets } = pool();
    const t = targets.open(TargetKind.Cluster, -1);
    targets.segment(t, 50, 58, 50, 126);
    targets.member(t, 5);
    targets.member(t, 6);
    t.radius = 5;
    targets.close(t);
    expect(targets.ofEvent(5)).toBe(0);
    expect(targets.ofEvent(6)).toBe(0);
  });

  it('reuses its records across frames', () => {
    const { targets } = pool();
    arrow(targets, 1, 10, 0, 50);
    const first = targets.at(0);
    targets.reset(100, 10);
    arrow(targets, 2, 20, 0, 50);
    expect(targets.at(0)).toBe(first);
    expect(first.ref).toBe(2);
  });
});

describe('HitGrid (§5, P-01)', () => {
  it('registers a target only in on-screen cells, however tall it is', () => {
    const { targets, grid } = pool();
    arrow(targets, 1, 100, -100_000, 100_000);
    expect(Array.from(grid.query(100, 200))).toEqual([0]);
    expect(Array.from(grid.query(100, 90_000))).toEqual([]);
    expect(Array.from(grid.query(100, -50))).toEqual([]);
  });

  it('returns nothing for a far-away cell and rebuilds after invalidation', () => {
    const { targets, grid } = pool();
    arrow(targets, 1, 100, 50, 150);
    expect(Array.from(grid.query(700, 300))).toEqual([]);
    targets.reset(100, 10);
    arrow(targets, 1, 700, 250, 350);
    grid.invalidate();
    expect(Array.from(grid.query(700, 300))).toEqual([0]);
  });
});

describe('hitTest (§5, §9)', () => {
  it('hits an arrow on its riser, arrowhead and landing dot', () => {
    const { targets, grid } = pool();
    arrow(targets, 1, 100, 58, 150);
    expect(hitTest(targets, grid, 102, 100)).toBe(0);
    expect(hitTest(targets, grid, 104, 150)).toBe(0);
    expect(hitTest(targets, grid, 104, 157)).toBe(0);
  });

  it('hits an element line away from any arrow', () => {
    const { targets, grid } = pool();
    element(targets, 0, 58);
    expect(hitTest(targets, grid, 300, 60)).toBe(0);
  });

  it('prefers an arrow over the element line at the same point', () => {
    const { targets, grid } = pool();
    element(targets, 0, 58);
    arrow(targets, 1, 300, 58, 150);
    expect(hitTest(targets, grid, 300, 59)).toBe(1);
  });

  it('returns −1 far from everything', () => {
    const { targets, grid } = pool();
    arrow(targets, 1, 100, 58, 150);
    expect(hitTest(targets, grid, 500, 300)).toBe(-1);
  });

  it('hits a cluster marker', () => {
    const { targets, grid } = pool();
    const t = targets.open(TargetKind.Cluster, -1);
    t.x = 400;
    t.y = 200;
    t.hasNode = true;
    t.radius = 5;
    targets.member(t, 9);
    targets.close(t);
    expect(hitTest(targets, grid, 403, 203)).toBe(0);
  });
});
