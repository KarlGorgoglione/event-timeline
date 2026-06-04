import { describe, expect, it } from 'vitest';
import { buildBuckets, lowerBound, upperBound } from './temporalIndex';
import type { TimelineEvent } from './types';

const timed = (...times: number[]) => times.map((time) => ({ time }));

describe('lowerBound / upperBound (§5)', () => {
  const events = timed(10, 20, 20, 30);

  it('lowerBound returns the first index >= t', () => {
    expect(lowerBound(events, 5)).toBe(0);
    expect(lowerBound(events, 10)).toBe(0);
    expect(lowerBound(events, 20)).toBe(1); // first of the two 20s
    expect(lowerBound(events, 25)).toBe(3);
    expect(lowerBound(events, 30)).toBe(3);
    expect(lowerBound(events, 99)).toBe(4); // past the end
  });

  it('upperBound returns the first index > t', () => {
    expect(upperBound(events, 5)).toBe(0);
    expect(upperBound(events, 10)).toBe(1);
    expect(upperBound(events, 20)).toBe(3); // past both 20s
    expect(upperBound(events, 30)).toBe(4);
    expect(upperBound(events, 99)).toBe(4);
  });

  it('brackets a value: [lowerBound, upperBound) is the run of equal times', () => {
    expect(upperBound(events, 20) - lowerBound(events, 20)).toBe(2);
  });

  it('handles an empty array', () => {
    expect(lowerBound([], 1)).toBe(0);
    expect(upperBound([], 1)).toBe(0);
  });
});

describe('buildBuckets (§5)', () => {
  const ev = (
    id: string,
    sourceId: string,
    targetId: string,
    time: number,
  ): TimelineEvent => ({ id, sourceId, targetId, time });

  it('buckets an event under both endpoints in time order', () => {
    const sorted = [ev('e1', 'a', 'b', 1), ev('e2', 'b', 'c', 2)];
    const buckets = buildBuckets(sorted);
    expect(buckets.get('a')).toEqual([0]);
    expect(buckets.get('b')).toEqual([0, 1]); // touched by both events
    expect(buckets.get('c')).toEqual([1]);
  });

  it('buckets a self-event once', () => {
    const buckets = buildBuckets([ev('e1', 'a', 'a', 1)]);
    expect(buckets.get('a')).toEqual([0]);
  });

  it('keeps bucket indices ascending (time order)', () => {
    const sorted = [
      ev('e1', 'a', 'b', 1),
      ev('e2', 'c', 'd', 2),
      ev('e3', 'a', 'd', 3),
    ];
    const buckets = buildBuckets(sorted);
    expect(buckets.get('a')).toEqual([0, 2]);
    expect(buckets.get('d')).toEqual([1, 2]);
  });
});
