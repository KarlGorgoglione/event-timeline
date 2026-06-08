import { describe, expect, it } from 'vitest';
import {
  hairlineOffset,
  parseFontPx,
  scaleFontToDevice,
  snapDevice,
} from './device';

describe('snapDevice', () => {
  it('scales CSS px by dpr and rounds to an integer device px', () => {
    expect(snapDevice(10, 2)).toBe(20);
    expect(snapDevice(10.4, 1)).toBe(10);
    expect(snapDevice(10, 1.5)).toBe(15);
    expect(snapDevice(10.3, 1.5)).toBe(15); // 15.45 → 15
  });
});

describe('hairlineOffset', () => {
  it('returns 0.5 for odd device widths and 0 for even', () => {
    expect(hairlineOffset(1)).toBe(0.5);
    expect(hairlineOffset(3)).toBe(0.5);
    expect(hairlineOffset(2)).toBe(0);
    expect(hairlineOffset(4)).toBe(0);
  });
});

describe('scaleFontToDevice', () => {
  it('multiplies the px size by dpr, leaving the family untouched', () => {
    expect(scaleFontToDevice('12px system-ui, sans-serif', 2)).toBe(
      '24px system-ui, sans-serif',
    );
    expect(scaleFontToDevice('11.5px Inter', 1)).toBe('11.5px Inter');
    expect(scaleFontToDevice('600 14px system-ui', 1.5)).toBe(
      '600 21px system-ui',
    );
  });
});

describe('parseFontPx', () => {
  it('reads the px size from a CSS font shorthand', () => {
    expect(parseFontPx('11px system-ui, sans-serif')).toBe(11);
    expect(parseFontPx('600 14px system-ui')).toBe(14);
    expect(parseFontPx('11.5px Inter')).toBe(11.5);
  });

  it('falls back to a default when there is no px token', () => {
    expect(parseFontPx('bold 1em system-ui')).toBe(11);
  });
});
