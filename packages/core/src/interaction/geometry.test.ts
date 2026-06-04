import { describe, expect, it } from 'vitest';
import { distSqToSegment, inSquare } from './geometry';

describe('distSqToSegment', () => {
  it('is zero on the segment', () => {
    expect(distSqToSegment(5, 0, 0, 0, 10, 0)).toBe(0);
  });

  it('measures perpendicular distance for an interior projection', () => {
    // Point (5,3) projects onto the horizontal segment at (5,0): distance 3.
    expect(distSqToSegment(5, 3, 0, 0, 10, 0)).toBe(9);
  });

  it('clamps to the nearest endpoint beyond the segment', () => {
    // Point left of the start: nearest point is (0,0), distance 5.
    expect(distSqToSegment(-3, 4, 0, 0, 10, 0)).toBe(9 + 16);
  });

  it('handles a degenerate (zero-length) segment as a point', () => {
    expect(distSqToSegment(3, 4, 0, 0, 0, 0)).toBe(25);
  });
});

describe('inSquare', () => {
  it('includes points within the half-extent on both axes', () => {
    expect(inSquare(4, 4, 0, 0, 5)).toBe(true);
    expect(inSquare(5, -5, 0, 0, 5)).toBe(true);
  });

  it('excludes points outside on either axis', () => {
    expect(inSquare(6, 0, 0, 0, 5)).toBe(false);
    expect(inSquare(0, 6, 0, 0, 5)).toBe(false);
  });
});
