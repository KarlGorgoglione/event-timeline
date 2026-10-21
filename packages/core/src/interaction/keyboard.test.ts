import { describe, expect, it } from 'vitest';
import { interpretKey, type KeyLike } from './keyboard';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('interpretKey (§9, R-09)', () => {
  it('pans through time with the horizontal arrows, further with Shift', () => {
    expect(interpretKey(key('ArrowRight'))).toEqual({
      kind: 'pan',
      fraction: 0.1,
    });
    expect(interpretKey(key('ArrowLeft', { shiftKey: true }))).toEqual({
      kind: 'pan',
      fraction: -0.5,
    });
  });

  it('scrolls rows with the vertical arrows and pages with Page keys', () => {
    expect(interpretKey(key('ArrowDown'))).toEqual({
      kind: 'scroll',
      rows: 1,
      page: false,
    });
    expect(interpretKey(key('ArrowUp', { shiftKey: true }))).toEqual({
      kind: 'scroll',
      rows: -1,
      page: true,
    });
    expect(interpretKey(key('PageDown'))).toMatchObject({ page: true });
  });

  it('zooms with + and −, fits with 0, clears the selection with Escape', () => {
    expect(interpretKey(key('+'))).toEqual({ kind: 'zoom', factor: 1.5 });
    expect(interpretKey(key('='))).toEqual({ kind: 'zoom', factor: 1.5 });
    expect(interpretKey(key('-'))).toEqual({ kind: 'zoom', factor: 1 / 1.5 });
    expect(interpretKey(key('0'))).toEqual({ kind: 'fit' });
    expect(interpretKey(key('Escape'))).toEqual({ kind: 'clearSelection' });
  });

  it('leaves modified keys and unknown keys to the browser', () => {
    expect(interpretKey(key('-', { ctrlKey: true }))).toBeNull();
    expect(interpretKey(key('0', { metaKey: true }))).toBeNull();
    expect(interpretKey(key('ArrowLeft', { altKey: true }))).toBeNull();
    expect(interpretKey(key('a'))).toBeNull();
  });
});
