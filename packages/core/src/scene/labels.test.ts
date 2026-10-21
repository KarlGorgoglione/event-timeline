import { describe, expect, it } from 'vitest';
import { LabelPlacer } from './labels';

describe('LabelPlacer (§4, P-08)', () => {
  it('rejects a box overlapping one already placed', () => {
    const p = new LabelPlacer();
    p.reset(800, 400, 100);
    expect(p.tryPlace(10, 10, 50, 12)).toBe(true);
    expect(p.tryPlace(40, 15, 50, 12)).toBe(false);
    expect(p.tryPlace(200, 10, 50, 12)).toBe(true);
    expect(p.count).toBe(2);
  });

  it('respects reserved space without counting it', () => {
    const p = new LabelPlacer();
    p.reset(800, 400, 100);
    p.reserve(10, 10, 50, 12);
    expect(p.tryPlace(20, 12, 10, 10)).toBe(false);
    expect(p.count).toBe(0);
  });

  it('stops at the cap', () => {
    const p = new LabelPlacer();
    p.reset(800, 400, 2);
    expect(p.tryPlace(0, 0, 10, 10)).toBe(true);
    expect(p.placeAnyway(0, 0, 10, 10)).toBe(true);
    expect(p.tryPlace(300, 300, 10, 10)).toBe(false);
  });

  it('never places a box entirely off-screen', () => {
    const p = new LabelPlacer();
    p.reset(800, 400, 10);
    expect(p.tryPlace(-100, 10, 50, 10)).toBe(false);
    expect(p.tryPlace(900, 10, 50, 10)).toBe(false);
  });

  it('clears the grid on reset', () => {
    const p = new LabelPlacer();
    p.reset(800, 400, 10);
    p.tryPlace(10, 10, 50, 12);
    p.reset(800, 400, 10);
    expect(p.tryPlace(10, 10, 50, 12)).toBe(true);
  });
});
