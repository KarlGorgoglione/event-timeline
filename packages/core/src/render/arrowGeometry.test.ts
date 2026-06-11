import { describe, expect, it } from 'vitest';
import { arrowheadTriangle } from './arrowGeometry';

describe('arrowheadTriangle (§4 shared backend geometry)', () => {
  it('points +x at angle 0: tip at +size, base corners at (-0.4·size, ±0.6·size)', () => {
    const v = arrowheadTriangle(10, 20, 0, 10);
    expect(v.tipX).toBeCloseTo(20);
    expect(v.tipY).toBeCloseTo(20);
    expect(v.baseAX).toBeCloseTo(6);
    expect(v.baseAY).toBeCloseTo(26);
    expect(v.baseBX).toBeCloseTo(6);
    expect(v.baseBY).toBeCloseTo(14);
  });

  it('rotates with angle (π/2 points down in screen space)', () => {
    const v = arrowheadTriangle(0, 0, Math.PI / 2, 10);
    expect(v.tipX).toBeCloseTo(0);
    expect(v.tipY).toBeCloseTo(10);
    expect(v.baseAX).toBeCloseTo(-6);
    expect(v.baseAY).toBeCloseTo(-4);
    expect(v.baseBX).toBeCloseTo(6);
    expect(v.baseBY).toBeCloseTo(-4);
  });

  it('scales linearly with size', () => {
    const small = arrowheadTriangle(0, 0, 0.7, 5);
    const big = arrowheadTriangle(0, 0, 0.7, 10);
    expect(big.tipX).toBeCloseTo(small.tipX * 2);
    expect(big.tipY).toBeCloseTo(small.tipY * 2);
    expect(big.baseAX).toBeCloseTo(small.baseAX * 2);
    expect(big.baseAY).toBeCloseTo(small.baseAY * 2);
  });
});
