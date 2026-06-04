import { describe, expect, it } from 'vitest';
import { interpretWheel, type WheelEventLike } from './wheel';

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
});
