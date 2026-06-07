import { describe, expect, it } from 'vitest';
import type { Theme } from '../model/types';
import { defaultTheme, resolveTheme } from './theme';

// A host normally passes full nested style objects (the `Theme` type keeps
// `element`/`event`/`rowSeparator` whole). These tests intentionally pass partial
// nested objects to exercise `resolveTheme`'s forgiving one-level deep merge, so
// they cast through a deep-partial view rather than the strict `Partial<Theme>`.
type DeepPartialTheme = {
  [K in keyof Theme]?: Theme[K] extends object ? Partial<Theme[K]> : Theme[K];
};
const partialTheme = (p: DeepPartialTheme): Partial<Theme> =>
  p as Partial<Theme>;

describe('resolveTheme (§11 theme merge)', () => {
  it('returns the defaults verbatim when no partial is given', () => {
    expect(resolveTheme()).toBe(defaultTheme);
  });

  it('overrides a top-level key while keeping the rest default', () => {
    const theme = resolveTheme({ gridlineWidth: 3 });
    expect(theme.gridlineWidth).toBe(3);
    expect(theme.background).toBe(defaultTheme.background);
  });

  it('deep-merges the rowSeparator object so a partial keeps the other defaults', () => {
    const theme = resolveTheme(
      partialTheme({ rowSeparator: { enabled: true } }),
    );
    expect(theme.rowSeparator.enabled).toBe(true);
    expect(theme.rowSeparator.color).toBe(defaultTheme.rowSeparator.color);
    expect(theme.rowSeparator.width).toBe(defaultTheme.rowSeparator.width);
    expect(theme.rowSeparator.dash).toEqual(defaultTheme.rowSeparator.dash);
  });

  it('deep-merges element/event styles (including new dash fields)', () => {
    const theme = resolveTheme(partialTheme({ element: { lineDash: [4, 2] } }));
    expect(theme.element.lineDash).toEqual([4, 2]);
    expect(theme.element.lineColor).toBe(defaultTheme.element.lineColor);
    expect(theme.element.lineWidth).toBe(defaultTheme.element.lineWidth);
  });

  it('ships backward-compatible defaults (solid lines, separators off)', () => {
    expect(defaultTheme.element.lineDash).toEqual([]);
    expect(defaultTheme.event.arrowDash).toEqual([]);
    expect(defaultTheme.gridlineDash).toEqual([]);
    expect(defaultTheme.gridlineWidth).toBe(1);
    expect(defaultTheme.rowSeparator.enabled).toBe(false);
    // Header tick ratios preserve the previous hardcoded layout.
    expect(defaultTheme.headerMajorTickRatio).toBe(0.32);
    expect(defaultTheme.headerMinorTickRatio).toBe(0.72);
  });
});
