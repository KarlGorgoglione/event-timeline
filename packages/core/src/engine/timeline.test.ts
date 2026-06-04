import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOW_MS } from '../scale/camera';
import type { TimelineData } from '../model/types';
import { TimelineEngine } from './timeline';

// The engine touches a 2D context and rAF, neither of which exists in the node
// test env. Stub a minimal canvas (the renderer only sets properties / calls
// no-op draw verbs) and a no-op rAF — these tests assert camera/viewport state,
// which `resize`/`setData` update synchronously, so no frame needs to run.

function makeCanvas(): HTMLCanvasElement {
  const ctx = new Proxy(
    { measureText: (t: string) => ({ width: t.length * 6 }) },
    {
      get: (target, key) =>
        key in target ? Reflect.get(target, key) : () => {},
    },
  );
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => false,
  } as unknown as HTMLCanvasElement;
}

function makeEngine() {
  return new TimelineEngine(makeCanvas(), makeCanvas());
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TimelineEngine empty-state framing (§3.1)', () => {
  it('frames the default 30-day window on today when no data is present', () => {
    const before = Date.now();
    const engine = makeEngine();
    engine.resize(800, 400, 1);
    const after = Date.now();

    const { timeRange } = engine.getViewport();
    const [start, end] = timeRange;
    // Spans the default window, centered on "now" (within the call's clock skew).
    expect(end - start).toBeCloseTo(DEFAULT_WINDOW_MS, -3);
    const center = (start + end) / 2;
    expect(center).toBeGreaterThanOrEqual(before - 1);
    expect(center).toBeLessThanOrEqual(after + 1);
    engine.dispose();
  });

  it('still auto-fits to data that arrives after an empty resize', () => {
    const engine = makeEngine();
    engine.resize(800, 400, 1); // empty: frames "today" but stays un-latched
    const minTime = Date.UTC(2026, 0, 1);
    const maxTime = Date.UTC(2026, 2, 1);
    const data: TimelineData = {
      elements: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: minTime },
        { id: 'e2', sourceId: 'b', targetId: 'a', time: maxTime },
      ],
    };
    engine.setData(data);

    // Auto-fit frames the data extent exactly: left edge = min, right edge = max.
    const { timeRange } = engine.getViewport();
    expect(timeRange[0]).toBeCloseTo(minTime, -3);
    expect(timeRange[1]).toBeCloseTo(maxTime, -3);
    expect(timeRange[1] - timeRange[0]).toBeCloseTo(maxTime - minTime, -3);
    engine.dispose();
  });
});
