import { describe, expect, it } from 'vitest';
import { median, quantile, summarize } from './perfStats';

describe('perfStats', () => {
  it('median of an odd-length sample is the middle value (input unsorted)', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('median of an even-length sample averages the two middle values', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('median of an empty sample is NaN', () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it('quantile uses nearest-rank', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(xs, 0.95)).toBe(10);
    expect(quantile(xs, 0.5)).toBe(5);
    expect(quantile(xs, 0)).toBe(1);
  });

  it('does not mutate its input', () => {
    const xs = [3, 1, 2];
    median(xs);
    quantile(xs, 0.5);
    expect(xs).toEqual([3, 1, 2]);
  });

  it('summarize discards warm-up samples before computing stats', () => {
    // The first three are warm-up spikes; steady state is a flat 2ms.
    const s = summarize([100, 90, 80, 2, 2, 2, 2], 3);
    expect(s.count).toBe(4);
    expect(s.median).toBe(2);
    expect(s.min).toBe(2);
  });
});
