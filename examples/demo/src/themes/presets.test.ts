import { describe, expect, it } from 'vitest';
import { defaultTheme } from '@event-timeline/react';
import { leafPaths, getPath } from '../app/paths';
import { contrastRatio, parseColor } from '../ui/color';
import { parseFont } from './fonts';
import { PRESETS } from './presets';
import { applyDensity, DENSITIES } from './density';

const THEME_PATHS = leafPaths(defaultTheme);
const FONT_PATHS = ['header.font', 'element.labelFont', 'event.labelFont'];

describe.each(PRESETS)('preset $name', (preset) => {
  const bg = preset.theme.background;
  const at = (path: string) => getPath(preset.theme, path) as string;

  it('is a complete Theme', () => {
    expect(leafPaths(preset.theme).sort()).toEqual([...THEME_PATHS].sort());
  });

  it('sizes every font in px (§11)', () => {
    for (const path of FONT_PATHS) expect(parseFont(at(path))).not.toBeNull();
  });

  it('uses colours the WebGL parser reads directly', () => {
    for (const path of THEME_PATHS) {
      const value = getPath(preset.theme, path);
      if (
        typeof value === 'string' &&
        !path.endsWith('font') &&
        !path.endsWith('Font')
      ) {
        expect(parseColor(value), path).not.toBeNull();
      }
    }
  });

  it('keeps text readable (WCAG AA, 4.5:1)', () => {
    for (const path of [
      'header.textColor',
      'element.labelColor',
      'event.labelColor',
    ]) {
      expect(contrastRatio(at(path), bg), path).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps marks visible (3:1)', () => {
    for (const path of [
      'element.lineColor',
      'event.arrowColor',
      'emphasis.hoverColor',
      'emphasis.selectionColor',
      'cluster.color',
    ]) {
      expect(contrastRatio(at(path), bg), path).toBeGreaterThanOrEqual(3);
    }
    for (const colour of preset.palette.series) {
      expect(contrastRatio(colour, bg), colour).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(preset.palette.neutral, bg)).toBeGreaterThanOrEqual(2);
  });

  it('has five distinct series colours', () => {
    expect(new Set(preset.palette.series).size).toBe(5);
  });

  it('keeps chrome text readable on its surfaces', () => {
    const { chrome } = preset;
    expect(contrastRatio(chrome.text, chrome.surface)).toBeGreaterThanOrEqual(
      7,
    );
    expect(contrastRatio(chrome.muted, chrome.surface)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it.each(DENSITIES)(
    'stays a complete, px-sized theme at $label density',
    ({ value }) => {
      const theme = applyDensity(preset.theme, value);
      expect(leafPaths(theme).sort()).toEqual([...THEME_PATHS].sort());
      for (const path of FONT_PATHS) {
        expect(parseFont(getPath(theme, path) as string)).not.toBeNull();
      }
    },
  );
});

describe('presets', () => {
  it('have unique ids', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it('include Classic as exactly the core default theme', () => {
    expect(PRESETS.find((p) => p.id === 'classic')?.theme).toBe(defaultTheme);
  });
});
