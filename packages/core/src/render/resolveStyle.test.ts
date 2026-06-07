import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../engine/theme';
import type { ElementStyle } from '../model/types';
import { overlayStyle } from './resolveStyle';

describe('overlayStyle (§11 resolution order)', () => {
  const base = defaultTheme.element;

  it('returns the base unchanged when no partials apply', () => {
    expect(overlayStyle(base)).toEqual(base);
    expect(overlayStyle(base, undefined, undefined)).toEqual(base);
  });

  it('lets a resolver override the theme default', () => {
    const resolved = overlayStyle(base, { lineColor: '#f00' });
    expect(resolved.lineColor).toBe('#f00');
    // Untouched properties still come from the base (per-property independence).
    expect(resolved.lineWidth).toBe(base.lineWidth);
  });

  it('lets per-item style win over the resolver (most specific wins)', () => {
    const resolver: Partial<ElementStyle> = { lineColor: '#f00', lineWidth: 9 };
    const perItem: Partial<ElementStyle> = { lineColor: '#0f0' };
    const resolved = overlayStyle(base, resolver, perItem);
    expect(resolved.lineColor).toBe('#0f0'); // per-item overrides resolver
    expect(resolved.lineWidth).toBe(9); // resolver still overrides theme
  });

  it('treats an undefined property as falling through, not an override', () => {
    const resolved = overlayStyle(
      base,
      { lineColor: '#f00' },
      { lineColor: undefined },
    );
    expect(resolved.lineColor).toBe('#f00');
  });

  it('does not mutate the base object', () => {
    const snapshot = { ...base };
    overlayStyle(base, { lineColor: '#abc' });
    expect(base).toEqual(snapshot);
  });

  it('carries a dash pattern through the resolution chain', () => {
    const resolved = overlayStyle(base, { lineDash: [4, 2] });
    expect(resolved.lineDash).toEqual([4, 2]);
  });

  it('treats an explicit empty dash as "solid", overriding a resolver dash', () => {
    // `[]` is a value, not `undefined`, so the most-specific layer wins: an item
    // can force a solid line even when the resolver dashed it.
    const resolved = overlayStyle(base, { lineDash: [6, 3] }, { lineDash: [] });
    expect(resolved.lineDash).toEqual([]);
  });
});
