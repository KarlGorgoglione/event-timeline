import { describe, expect, it } from 'vitest';
import { type Extent, dataExtent, widenExtent } from './extent';

describe('widenExtent', () => {
  it('seeds a single instant from an absent extent', () => {
    expect(widenExtent(undefined, 100)).toEqual({ minTime: 100, maxTime: 100 });
  });

  it('expands in both directions', () => {
    const base: Extent = { minTime: 10, maxTime: 20 };
    expect(widenExtent(base, 5)).toEqual({ minTime: 5, maxTime: 20 });
    expect(widenExtent(base, 30)).toEqual({ minTime: 10, maxTime: 30 });
  });

  it('does not mutate the input', () => {
    const base: Extent = { minTime: 10, maxTime: 20 };
    widenExtent(base, 0);
    expect(base).toEqual({ minTime: 10, maxTime: 20 });
  });
});

describe('dataExtent', () => {
  it('returns null for an empty map', () => {
    expect(dataExtent(new Map())).toBeNull();
  });

  it('spans the min and max across all element extents', () => {
    const extents = new Map<string, Extent>([
      ['a', { minTime: 10, maxTime: 20 }],
      ['b', { minTime: 5, maxTime: 15 }],
      ['c', { minTime: 25, maxTime: 30 }],
    ]);
    expect(dataExtent(extents)).toEqual({ minTime: 5, maxTime: 30 });
  });
});
