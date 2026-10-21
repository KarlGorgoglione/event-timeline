import { describe, expect, it } from 'vitest';
import {
  findRegressions,
  median,
  quantile,
  summarize,
  type PerfRecord,
} from './perfStats';

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

describe('findRegressions (§13, T-05)', () => {
  const record = (
    scenario: string,
    baseMedian: number,
    overlayMedian = 1,
  ): PerfRecord => ({
    backend: 'canvas2d',
    scenario,
    baseMedian,
    baseP95: baseMedian,
    overlayMedian,
    overlayP95: overlayMedian,
    cadenceP95: 16.7,
  });

  it('flags a scenario slower by both the ratio and the absolute floor', () => {
    const regressions = findRegressions(
      [record('a', 10), record('b', 2), record('c', 10, 2)],
      [record('a', 13), record('b', 2.9), record('c', 10, 3.5)],
    );
    // b: +45% but only 0.9 ms — jitter, not a regression.
    expect(regressions).toEqual([
      { key: 'canvas2d/a', metric: 'baseMedian', baseline: 10, current: 13 },
      { key: 'canvas2d/c', metric: 'overlayMedian', baseline: 2, current: 3.5 },
    ]);
  });

  it('ignores scenarios missing from either run, and improvements', () => {
    expect(
      findRegressions([record('a', 10)], [record('a', 5), record('new', 99)]),
    ).toEqual([]);
  });
});
