import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  formatColor,
  parseColor,
  readableOn,
  toHex,
  withAlpha,
} from './color';
import { formatFont, parseFont, resizeFont } from '../themes/fonts';

describe('parseColor', () => {
  it.each([
    ['#abc', { r: 170, g: 187, b: 204, a: 1 }],
    ['#abcd', { r: 170, g: 187, b: 204, a: 221 / 255 }],
    ['#0b1020', { r: 11, g: 16, b: 32, a: 1 }],
    ['#0b102080', { r: 11, g: 16, b: 32, a: 128 / 255 }],
    ['rgb(1, 2, 3)', { r: 1, g: 2, b: 3, a: 1 }],
    ['rgba(255, 255, 255, 0.08)', { r: 255, g: 255, b: 255, a: 0.08 }],
    ['rgba(0,0,0,0.10)', { r: 0, g: 0, b: 0, a: 0.1 }],
    ['rgb(10 20 30 / 50%)', { r: 10, g: 20, b: 30, a: 0.5 }],
    ['transparent', { r: 0, g: 0, b: 0, a: 0 }],
  ])('%s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it('leaves other syntaxes to the browser', () => {
    expect(parseColor('rebeccapurple')).toBeNull();
    expect(parseColor('hsl(0 0% 0%)')).toBeNull();
    expect(parseColor('rgb(1, 2)')).toBeNull();
  });
});

describe('formatColor', () => {
  it('writes opaque colours as hex and translucent ones as rgba', () => {
    expect(formatColor({ r: 11, g: 16, b: 32, a: 1 })).toBe('#0b1020');
    expect(formatColor({ r: 11, g: 16, b: 32, a: 0.456 })).toBe(
      'rgba(11, 16, 32, 0.46)',
    );
    expect(toHex({ r: 255, g: 0, b: 128, a: 0.2 })).toBe('#ff0080');
  });

  it('scales alpha', () => {
    expect(withAlpha('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withAlpha('rgba(0, 0, 0, 0.5)', 0.5)).toBe('rgba(0, 0, 0, 0.25)');
    expect(withAlpha('rebeccapurple', 0.5)).toBe('rebeccapurple');
  });
});

describe('contrast', () => {
  it('matches WCAG for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('composites translucent colours over the background first', () => {
    expect(contrastRatio('rgba(0, 0, 0, 0)', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('picks readable ink', () => {
    expect(readableOn('#0b1020')).toBe('#ffffff');
    expect(readableOn('#fbfcfe')).toBe('#000000');
  });
});

describe('fonts', () => {
  it.each([
    [
      '12px system-ui, sans-serif',
      { italic: false, weight: 400, size: 12, family: 'system-ui, sans-serif' },
    ],
    [
      "600 11px 'Inter Variable', sans-serif",
      {
        italic: false,
        weight: 600,
        size: 11,
        family: "'Inter Variable', sans-serif",
      },
    ],
    [
      'italic 12px Georgia, serif',
      { italic: true, weight: 400, size: 12, family: 'Georgia, serif' },
    ],
    [
      'bold 13.5px/1.2 Inter',
      { italic: false, weight: 700, size: 13.5, family: 'Inter' },
    ],
  ])('parses %s', (input, expected) => {
    expect(parseFont(input)).toEqual(expected);
  });

  it('rejects fonts not sized in px', () => {
    expect(parseFont('1em serif')).toBeNull();
  });

  it('round-trips and resizes', () => {
    const f = "italic 600 11px 'Inter Variable', sans-serif";
    expect(formatFont(parseFont(f)!)).toBe(f);
    expect(resizeFont(f, 2)).toBe(
      "italic 600 13px 'Inter Variable', sans-serif",
    );
    expect(resizeFont('1em serif', 2)).toBe('1em serif');
  });
});
