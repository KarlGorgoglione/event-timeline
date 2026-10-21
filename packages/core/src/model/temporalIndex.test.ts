import { describe, expect, it } from 'vitest';
import { lowerBound, upperBound } from './temporalIndex';

describe('lowerBound / upperBound (§5)', () => {
  const times = Float64Array.from([10, 20, 20, 30, 999]);
  const count = 4; // the trailing entry is spare capacity

  it('lowerBound returns the first index >= t', () => {
    expect(lowerBound(times, count, 5)).toBe(0);
    expect(lowerBound(times, count, 10)).toBe(0);
    expect(lowerBound(times, count, 20)).toBe(1);
    expect(lowerBound(times, count, 25)).toBe(3);
    expect(lowerBound(times, count, 30)).toBe(3);
    expect(lowerBound(times, count, 99)).toBe(4);
  });

  it('upperBound returns the first index > t', () => {
    expect(upperBound(times, count, 5)).toBe(0);
    expect(upperBound(times, count, 10)).toBe(1);
    expect(upperBound(times, count, 20)).toBe(3);
    expect(upperBound(times, count, 30)).toBe(4);
    expect(upperBound(times, count, 99)).toBe(4);
  });

  it('brackets the run of equal times', () => {
    expect(upperBound(times, count, 20) - lowerBound(times, count, 20)).toBe(2);
  });

  it('handles an empty range', () => {
    expect(lowerBound(times, 0, 10)).toBe(0);
    expect(upperBound(times, 0, 10)).toBe(0);
  });
});
