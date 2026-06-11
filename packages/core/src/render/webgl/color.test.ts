import { describe, expect, it, vi } from 'vitest';
import { ColorCache, parseColorFast, TRANSPARENT } from './color';

describe('parseColorFast (§4 colour parity)', () => {
  it('parses 6-digit hex as opaque', () => {
    expect(parseColorFast('#161b22')).toEqual([
      0x16 / 255,
      0x1b / 255,
      0x22 / 255,
      1,
    ]);
  });

  it('parses 3-digit hex by digit doubling', () => {
    expect(parseColorFast('#fff')).toEqual([1, 1, 1, 1]);
    expect(parseColorFast('#f00')).toEqual([1, 0, 0, 1]);
  });

  it('parses 8-digit hex premultiplied', () => {
    const [r, g, b, a] = parseColorFast('#ff000080')!;
    expect(a).toBeCloseTo(128 / 255);
    expect(r).toBeCloseTo(128 / 255); // 1.0 * alpha
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('parses rgb() as opaque', () => {
    expect(parseColorFast('rgb(255, 128, 0)')).toEqual([1, 128 / 255, 0, 1]);
  });

  it('parses rgba() premultiplied', () => {
    const [r, g, b, a] = parseColorFast('rgba(255,255,255,0.35)')!;
    expect(a).toBeCloseTo(0.35);
    expect(r).toBeCloseTo(0.35);
    expect(g).toBeCloseTo(0.35);
    expect(b).toBeCloseTo(0.35);
  });

  it('parses transparent', () => {
    expect(parseColorFast('transparent')).toEqual(TRANSPARENT);
    expect(parseColorFast(' TRANSPARENT ')).toEqual(TRANSPARENT);
  });

  it('returns null for forms needing the context fallback', () => {
    expect(parseColorFast('red')).toBeNull();
    expect(parseColorFast('hsl(120, 50%, 50%)')).toBeNull();
    expect(parseColorFast('#12345')).toBeNull();
    expect(parseColorFast('rgb(300, 0, 0)')).toBeNull();
  });
});

describe('ColorCache', () => {
  it('caches: the fallback context is consulted once per string', () => {
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([255, 0, 0, 255]),
    }));
    const ctx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    const cache = new ColorCache(() => ctx);

    expect(cache.get('red')).toEqual([1, 0, 0, 1]);
    expect(cache.get('red')).toEqual([1, 0, 0, 1]);
    expect(getImageData).toHaveBeenCalledTimes(1);
  });

  it('resolves unparseable colours to transparent without a context (§1 lenient)', () => {
    const cache = new ColorCache();
    expect(cache.get('definitely-not-a-color')).toEqual(TRANSPARENT);
  });

  it('uses the fast path without touching the context', () => {
    const fallback = vi.fn(() => null);
    const cache = new ColorCache(fallback);
    expect(cache.get('#000')).toEqual([0, 0, 0, 1]);
    expect(fallback).not.toHaveBeenCalled();
  });
});
