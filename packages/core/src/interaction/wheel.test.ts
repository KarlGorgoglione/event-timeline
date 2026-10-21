import { describe, expect, it } from 'vitest';
import { interpretWheel, WHEEL_LINE_PX, type WheelEventLike } from './wheel';

const base: WheelEventLike = {
  deltaX: 0,
  deltaY: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

describe('interpretWheel (§9)', () => {
  it('ctrl/⌘+wheel zooms about the cursor', () => {
    const intent = interpretWheel(
      { ...base, deltaY: -200, ctrlKey: true },
      300,
    );
    expect(intent.kind).toBe('zoom');
    if (intent.kind === 'zoom') {
      expect(intent.cursorX).toBe(300);
      // Scrolling up zooms in: factor > 1 (here exactly 2 at one full doubling).
      expect(intent.factor).toBeCloseTo(2);
    }
  });

  it('treats a pinch (reported as ctrl+wheel) as zoom even with metaKey', () => {
    const intent = interpretWheel({ ...base, deltaY: 200, metaKey: true }, 0);
    expect(intent.kind).toBe('zoom');
    if (intent.kind === 'zoom') expect(intent.factor).toBeCloseTo(0.5);
  });

  it('shift+wheel pans horizontally', () => {
    const intent = interpretWheel({ ...base, deltaY: 50, shiftKey: true }, 0);
    expect(intent).toEqual({ kind: 'pan', dxCss: -50 });
  });

  it('a horizontal trackpad swipe pans horizontally', () => {
    const intent = interpretWheel({ ...base, deltaX: 30, deltaY: 2 }, 0);
    expect(intent).toEqual({ kind: 'pan', dxCss: -30 });
  });

  it('a plain vertical wheel scrolls', () => {
    const intent = interpretWheel({ ...base, deltaY: 40 }, 0);
    expect(intent).toEqual({ kind: 'scroll', dyCss: 40 });
  });

  it('shift+wheel pans with the deltaX macOS reports instead of deltaY', () => {
    const intent = interpretWheel({ ...base, deltaX: 30, shiftKey: true }, 0);
    expect(intent).toEqual({ kind: 'pan', dxCss: -30 });
  });

  it('normalises line-mode deltas to CSS px', () => {
    const intent = interpretWheel({ ...base, deltaY: 3, deltaMode: 1 }, 0);
    expect(intent).toEqual({ kind: 'scroll', dyCss: 3 * WHEEL_LINE_PX });
  });

  it('normalises page-mode deltas by the page height', () => {
    const intent = interpretWheel({ ...base, deltaY: 1, deltaMode: 2 }, 0, 500);
    expect(intent).toEqual({ kind: 'scroll', dyCss: 500 });
  });

  it('applies the line unit to zoom too', () => {
    const intent = interpretWheel(
      { ...base, deltaY: -1, deltaMode: 1, ctrlKey: true },
      10,
    );
    expect(intent.kind).toBe('zoom');
    if (intent.kind === 'zoom') {
      expect(intent.factor).toBeCloseTo(Math.pow(2, WHEEL_LINE_PX / 200));
    }
  });
});
