import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../model/diagnostics';
import {
  defaultTheme,
  isPxFont,
  resolveTheme,
  validateThemeFonts,
} from './theme';

describe('resolveTheme (§11 theme merge)', () => {
  it('returns the defaults verbatim when no partial is given', () => {
    expect(resolveTheme()).toBe(defaultTheme);
  });

  it('overrides a key of a group while keeping the rest default', () => {
    const theme = resolveTheme({ grid: { width: 3 }, background: '#000' });
    expect(theme.grid.width).toBe(3);
    expect(theme.grid.color).toBe(defaultTheme.grid.color);
    expect(theme.header).toEqual(defaultTheme.header);
    expect(theme.background).toBe('#000');
  });

  it('deep-merges the rowSeparator object so a partial keeps the other defaults', () => {
    const theme = resolveTheme({ rowSeparator: { enabled: true } });
    expect(theme.rowSeparator.enabled).toBe(true);
    expect(theme.rowSeparator.color).toBe(defaultTheme.rowSeparator.color);
    expect(theme.rowSeparator.width).toBe(defaultTheme.rowSeparator.width);
    expect(theme.rowSeparator.dash).toEqual(defaultTheme.rowSeparator.dash);
  });

  it('deep-merges element/event styles (including new dash fields)', () => {
    const theme = resolveTheme({ element: { lineDash: [4, 2] } });
    expect(theme.element.lineDash).toEqual([4, 2]);
    expect(theme.element.lineColor).toBe(defaultTheme.element.lineColor);
    expect(theme.element.lineWidth).toBe(defaultTheme.element.lineWidth);
  });

  it('ships backward-compatible defaults (solid lines, separators off)', () => {
    expect(defaultTheme.element.lineDash).toEqual([]);
    expect(defaultTheme.event.arrowDash).toEqual([]);
    expect(defaultTheme.grid.dash).toEqual([]);
    expect(defaultTheme.grid.width).toBe(1);
    expect(defaultTheme.rowSeparator.enabled).toBe(false);
    // Header tick ratios preserve the previous hardcoded layout.
    expect(defaultTheme.header.majorTickRatio).toBe(0.32);
    expect(defaultTheme.header.minorTickRatio).toBe(0.72);
  });

  it('defaults the source-node label box to an invisible (transparent) box', () => {
    expect(defaultTheme.event.labelBoxBackground).toBe('transparent');
    expect(defaultTheme.event.labelBoxBorderColor).toBe('transparent');
    expect(defaultTheme.event.labelBoxBorderWidth).toBe(0);
    expect(defaultTheme.event.labelBoxBorderDash).toEqual([]);
  });

  it('fills missing label-box fields from defaults when a partial event omits them', () => {
    const theme = resolveTheme({ event: { labelBoxBackground: '#222' } });
    expect(theme.event.labelBoxBackground).toBe('#222');
    expect(theme.event.labelBoxBorderColor).toBe(
      defaultTheme.event.labelBoxBorderColor,
    );
    expect(theme.event.labelBoxPadding).toBe(
      defaultTheme.event.labelBoxPadding,
    );
  });
});

describe('validateThemeFonts (§3 DPR font scaling)', () => {
  it('recognises px-sized font shorthands', () => {
    expect(isPxFont('12px system-ui')).toBe(true);
    expect(isPxFont('bold 11.5px/14px Inter')).toBe(true);
    expect(isPxFont('1em serif')).toBe(false);
    expect(isPxFont('10pt Arial')).toBe(false);
    expect(isPxFont('caption')).toBe(false);
  });

  it('keeps a theme of px fonts as-is and reports nothing', () => {
    const reported: Diagnostic[] = [];
    expect(validateThemeFonts(defaultTheme, (d) => reported.push(d))).toBe(
      defaultTheme,
    );
    expect(reported).toEqual([]);
  });

  it('replaces non-px fonts with the defaults and reports each', () => {
    const reported: Diagnostic[] = [];
    const theme = validateThemeFonts(
      resolveTheme({
        header: { font: '1rem serif' },
        event: { labelFont: '9pt x' },
      }),
      (d) => reported.push(d),
    );
    expect(theme.header.font).toBe(defaultTheme.header.font);
    expect(theme.event.labelFont).toBe(defaultTheme.event.labelFont);
    expect(reported.map((d) => d.code)).toEqual([
      'invalid-font',
      'invalid-font',
    ]);
  });
});
