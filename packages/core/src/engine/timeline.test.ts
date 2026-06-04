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

// A canvas whose 2D context records every draw-verb call by name (and its
// arguments), so a test can assert that arrows/nodes/labels were emitted for a
// frame and inspect call ordering (e.g. the header mask).
function makeRecordingCanvas(
  record: (name: string, args: unknown[]) => void,
): HTMLCanvasElement {
  const ctx = new Proxy(
    {
      measureText: (t: string) => {
        record('measureText', [t]);
        return { width: t.length * 6 };
      },
    },
    {
      get: (target, key) =>
        key in target
          ? Reflect.get(target, key)
          : (...args: unknown[]) => record(String(key), args),
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

describe('TimelineEngine Phase 2 content (§1, §4)', () => {
  it('emits arrows, nodes, and labels when a frame draws', () => {
    const calls: Record<string, number> = {};
    const record = (name: string) => {
      calls[name] = (calls[name] ?? 0) + 1;
    };
    // Controllable rAF so we can force exactly one base frame to draw.
    let queued: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      queued.push(cb);
      return queued.length;
    });
    const flush = () => {
      const run = queued;
      queued = [];
      for (const cb of run) cb();
    };

    const engine = new TimelineEngine(
      makeRecordingCanvas(record),
      makeRecordingCanvas(record),
    );
    engine.resize(800, 400, 1);
    engine.setData({
      elements: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
        { id: 'e2', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 2, 1) },
      ],
    });
    flush();

    expect(calls.arc ?? 0).toBeGreaterThan(0); // source node dots
    expect(calls.fill ?? 0).toBeGreaterThan(0); // nodes / arrowhead triangles
    expect(calls.fillText ?? 0).toBeGreaterThan(0); // element labels
    engine.dispose();
  });

  it('masks the header band after content and before the header ticks (§4)', () => {
    const log: { name: string; args: unknown[] }[] = [];
    let queued: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      queued.push(cb);
      return queued.length;
    });
    const flush = () => {
      const run = queued;
      queued = [];
      for (const cb of run) cb();
    };

    const record = (name: string, args: unknown[]) => {
      log.push({ name, args });
    };
    const engine = new TimelineEngine(
      makeRecordingCanvas(record),
      makeRecordingCanvas(record),
    );
    engine.resize(800, 400, 1);
    engine.setData({
      elements: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
        { id: 'e2', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 2, 1) },
      ],
    });
    flush();

    // The header mask is the fillRect at the origin that covers only a band
    // (height < the full canvas height, which is the beginFrame background clear).
    const maskIndex = log.findIndex(({ name, args }) => {
      if (name !== 'fillRect') return false;
      const [x, y, w, h] = args as number[];
      return x === 0 && y === 0 && w === 800 && h! > 0 && h! < 400;
    });
    expect(maskIndex).toBeGreaterThanOrEqual(0);

    // Content (source-node arcs) is drawn before the mask paints over the band...
    const firstArc = log.findIndex((c) => c.name === 'arc');
    expect(firstArc).toBeGreaterThanOrEqual(0);
    expect(firstArc).toBeLessThan(maskIndex);

    // ...and the header tick labels are drawn after the mask, so they survive it.
    const lastFillText = log.map((c) => c.name).lastIndexOf('fillText');
    expect(lastFillText).toBeGreaterThan(maskIndex);
    engine.dispose();
  });
});
