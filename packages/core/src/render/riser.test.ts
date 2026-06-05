import { describe, expect, it } from 'vitest';
import { buildRiserSegments } from './riser';

describe('buildRiserSegments (§16)', () => {
  it('returns a single straight segment when there are no crossings', () => {
    const segs = buildRiserSegments(10, 0, 100, [], 4);
    expect(segs).toEqual([{ x1: 10, y1: 0, x2: 10, y2: 100 }]);
  });

  it('returns a single straight segment when the hop radius is zero', () => {
    const segs = buildRiserSegments(10, 0, 100, [50], 0);
    expect(segs).toEqual([{ x1: 10, y1: 0, x2: 10, y2: 100 }]);
  });

  it('inserts a +x-bulging arc polyline at a crossing', () => {
    const x = 10;
    const segs = buildRiserSegments(x, 0, 100, [50], 4);
    // More than one segment, and the polyline is continuous start→end.
    expect(segs.length).toBeGreaterThan(1);
    expect(segs[0]!.x1).toBe(x);
    expect(segs[0]!.y1).toBe(0);
    expect(segs.at(-1)!.x2).toBe(x);
    expect(segs.at(-1)!.y2).toBe(100);
    // The arc bulges to +x around the crossing y.
    const apex = Math.max(...segs.map((s) => s.x2));
    expect(apex).toBeCloseTo(x + 4);
  });

  it('keeps the polyline contiguous (each segment starts where the prior ended)', () => {
    const segs = buildRiserSegments(10, 0, 200, [60, 140], 4);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.x1).toBeCloseTo(segs[i - 1]!.x2);
      expect(segs[i]!.y1).toBeCloseTo(segs[i - 1]!.y2);
    }
  });

  it('orders hops along the travel direction for an upward riser', () => {
    const segs = buildRiserSegments(10, 200, 0, [140, 60], 4);
    // Start at yFrom, end at yTo, monotonically decreasing through both hops.
    expect(segs[0]!.y1).toBe(200);
    expect(segs.at(-1)!.y2).toBe(0);
  });
});
