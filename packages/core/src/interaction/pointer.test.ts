// @vitest-environment jsdom
//
// jsdom has no PointerEvent or pointer capture: pointer events are
// MouseEvents carrying pointerId/pointerType, and capture is stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PointerController, type PointerHost } from './pointer';

function pointer(
  type: string,
  x: number,
  y: number,
  id = 1,
  pointerType = 'mouse',
): MouseEvent {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
  });
  Object.defineProperty(event, 'pointerId', { value: id });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

function setup() {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const rect = vi
    .spyOn(element, 'getBoundingClientRect')
    .mockReturnValue({ left: 100, top: 50 } as DOMRect);
  const calls: [string, ...number[]][] = [];
  const host: PointerHost = {
    panBy: (dx, dy) => calls.push(['pan', dx, dy]),
    zoomBy: (factor, x) => calls.push(['zoom', factor, x]),
    scrollBy: (dy) => calls.push(['scroll', dy]),
    hoverAt: (x, y) => calls.push(['hover', x, y]),
    clickAt: (x, y) => calls.push(['click', x, y]),
    leave: () => calls.push(['leave']),
  };
  const controller = new PointerController(element, host);
  return { element, rect, calls, controller };
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => true;
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('PointerController', () => {
  it('measures the element once for a run of hover moves (P-09)', () => {
    const { element, rect, calls } = setup();
    for (let i = 0; i < 5; i++) {
      element.dispatchEvent(pointer('pointermove', 110 + i, 60));
    }
    expect(rect).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual(['hover', 14, 10]);
  });

  it('re-measures after a scroll, on entry, on a press and on request', () => {
    const { element, rect, controller } = setup();
    const move = () => element.dispatchEvent(pointer('pointermove', 110, 60));
    move();
    document.dispatchEvent(new Event('scroll'));
    move();
    element.dispatchEvent(new MouseEvent('pointerenter'));
    move();
    controller.invalidateRect();
    move();
    expect(rect).toHaveBeenCalledTimes(4);
    element.dispatchEvent(pointer('pointerdown', 110, 60));
    element.dispatchEvent(pointer('pointerup', 110, 60));
    expect(rect).toHaveBeenCalledTimes(5);
  });

  it('pinches with two touches: pans by the midpoint, zooms by the spread (R-04)', () => {
    const { element, calls } = setup();
    element.dispatchEvent(pointer('pointerdown', 200, 100, 1, 'touch'));
    element.dispatchEvent(pointer('pointerdown', 300, 100, 2, 'touch'));
    calls.length = 0;
    // Spread 100 → 200 about a fixed midpoint (250, 100): zoom ×2 there.
    element.dispatchEvent(pointer('pointermove', 150, 100, 1, 'touch'));
    element.dispatchEvent(pointer('pointermove', 350, 100, 2, 'touch'));
    // Fingers report one at a time, so the midpoint wanders in between; the
    // pans cancel out and the zooms compound to the spread ratio.
    const zooms = calls.filter((c) => c[0] === 'zoom');
    const total = zooms.reduce((f, c) => f * (c[1] as number), 1);
    expect(total).toBeCloseTo(2);
    expect(zooms.at(-1)![2]).toBe(150); // midpoint 250 − left 100
    const net = calls
      .filter((c) => c[0] === 'pan')
      .reduce((sum, c) => sum + (c[1] as number), 0);
    expect(net).toBe(0);
    // Both fingers move right by 40: a pan of the midpoint, no zoom.
    calls.length = 0;
    element.dispatchEvent(pointer('pointermove', 190, 100, 1, 'touch'));
    element.dispatchEvent(pointer('pointermove', 390, 100, 2, 'touch'));
    const panned = calls
      .filter((c) => c[0] === 'pan')
      .reduce((sum, c) => sum + (c[1] as number), 0);
    expect(panned).toBe(40);
  });

  it('keeps panning with the remaining finger and never clicks after a pinch', () => {
    const { element, calls } = setup();
    element.dispatchEvent(pointer('pointerdown', 200, 100, 1, 'touch'));
    element.dispatchEvent(pointer('pointerdown', 300, 100, 2, 'touch'));
    element.dispatchEvent(pointer('pointerup', 300, 100, 2, 'touch'));
    calls.length = 0;
    element.dispatchEvent(pointer('pointermove', 230, 110, 1, 'touch'));
    expect(calls).toEqual([['pan', 30, 10]]);
    element.dispatchEvent(pointer('pointerup', 230, 110, 1, 'touch'));
    expect(calls.some((c) => c[0] === 'click')).toBe(false);
  });

  it('ignores a second mouse pointer (no pinch with a mouse)', () => {
    const { element, calls } = setup();
    element.dispatchEvent(pointer('pointerdown', 200, 100, 1));
    element.dispatchEvent(pointer('pointerdown', 300, 100, 2));
    element.dispatchEvent(pointer('pointerup', 200, 100, 1));
    expect(calls).toEqual([['click', 100, 50]]);
  });
});
