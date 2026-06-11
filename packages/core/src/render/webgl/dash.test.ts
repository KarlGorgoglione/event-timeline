import { describe, expect, it } from 'vitest';
import { expandDashes } from './dash';
import type { LineSegment } from '../types';

const seg = (x1: number, y1: number, x2: number, y2: number): LineSegment => ({
  x1,
  y1,
  x2,
  y2,
});

describe('expandDashes (§4 Canvas2D dash parity)', () => {
  it('splits a horizontal segment into on-runs, phase starting at the segment', () => {
    const out = expandDashes([seg(0, 0, 10, 0)], [4, 4]);
    expect(out).toEqual([seg(0, 0, 4, 0), seg(8, 0, 10, 0)]);
  });

  it('restarts the phase on every segment (independent subpaths)', () => {
    const out = expandDashes([seg(0, 0, 6, 0), seg(0, 10, 6, 10)], [4, 4]);
    expect(out).toEqual([seg(0, 0, 4, 0), seg(0, 10, 4, 10)]);
  });

  it('doubles odd-length patterns per the canvas spec', () => {
    // [3] behaves as [3, 3]: on 0..3, off 3..6, on 6..9.
    const out = expandDashes([seg(0, 0, 9, 0)], [3]);
    expect(out).toEqual([seg(0, 0, 3, 0), seg(6, 0, 9, 0)]);
  });

  it('follows the segment direction for diagonal lines', () => {
    const out = expandDashes([seg(0, 0, 6, 8)], [5, 5]);
    expect(out).toHaveLength(1);
    const first = out[0]!;
    expect(first.x2).toBeCloseTo(3); // 5px along a 10px-long (3,4)-direction line
    expect(first.y2).toBeCloseTo(4);
  });

  it('clips the final on-run at the segment end', () => {
    const out = expandDashes([seg(0, 0, 10, 0)], [8, 4]);
    expect(out).toEqual([seg(0, 0, 8, 0)]);
  });

  it.each([
    ['empty', [] as number[]],
    ['all-zero', [0, 0]],
    ['negative entry', [4, -1]],
    ['non-finite entry', [4, Number.NaN]],
  ])('treats a %s pattern as solid', (_name, pattern) => {
    const input = [seg(0, 0, 10, 0)];
    expect(expandDashes(input, pattern)).toEqual(input);
  });

  it('emits nothing for zero-on patterns like [0, 4] (butt caps)', () => {
    expect(expandDashes([seg(0, 0, 10, 0)], [0, 4])).toEqual([]);
  });

  it('skips zero-length segments', () => {
    expect(expandDashes([seg(5, 5, 5, 5)], [4, 4])).toEqual([]);
  });
});
