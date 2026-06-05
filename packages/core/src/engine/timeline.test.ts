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

    // Auto-fit frames the data extent, but reserves a left gutter for the start
    // markers (§1): the data start lands just inside the left edge (so earlier
    // time is visible before it), while the data end still sits at the right edge.
    const { timeRange } = engine.getViewport();
    expect(timeRange[0]).toBeLessThan(minTime); // reserved marker space on the left
    expect(timeRange[1]).toBeCloseTo(maxTime, -3); // right edge unchanged
    engine.dispose();
  });
});

describe('TimelineEngine interactions (§9, §12)', () => {
  it('select() replaces the selection and emits selectionChange', () => {
    const engine = makeEngine();
    engine.resize(800, 400, 1);
    const emitted: string[][] = [];
    engine.on('selectionChange', (s) => emitted.push(s.ids));

    engine.select(['a', 'b']);
    engine.select(['c']);

    expect(emitted).toEqual([['a', 'b'], ['c']]);
    engine.dispose();
  });

  it('select() ignores a no-op replacement (no event, no overlay redraw)', () => {
    const engine = makeEngine();
    engine.resize(800, 400, 1);
    const emitted: string[][] = [];
    engine.on('selectionChange', (s) => emitted.push(s.ids));

    engine.select(['event:e1']);
    engine.select(['event:e1']); // same membership → no-op
    engine.select(['event:e1', 'element:a']); // genuine change

    expect(emitted).toEqual([['event:e1'], ['event:e1', 'element:a']]);
    engine.dispose();
  });

  it('keys selection by kind:id: selecting an element never lights an unconnected event sharing its raw id', () => {
    // Element 'x' and event 'x' deliberately share the raw id but are NOT
    // connected: event 'x' runs p→q. Selecting element:x must light only x's own
    // connected event ('seed'), never event:x via an id collision (DESIGN.md §9).
    // Each event highlight draws its two node dots (two `arc` calls), so the arc
    // count is an exact discriminator.
    const overlay: Record<string, number> = {};
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
      makeRecordingCanvas(() => {}), // base layer: ignored
      makeRecordingCanvas((name) => {
        overlay[name] = (overlay[name] ?? 0) + 1;
      }),
    );
    engine.resize(800, 400, 1);
    engine.setData({
      elements: [
        { id: 'x', label: 'X' },
        { id: 'p', label: 'P' },
        { id: 'q', label: 'Q' },
      ],
      events: [
        // x's own connected event; gives x an extent so its line is drawn.
        {
          id: 'seed',
          sourceId: 'x',
          targetId: 'q',
          time: Date.UTC(2026, 0, 1),
        },
        // Shares the raw id 'x' but connects p→q, not x.
        { id: 'x', sourceId: 'p', targetId: 'q', time: Date.UTC(2026, 0, 3) },
      ],
    });
    flush(); // base frame builds this frame's hit targets

    const overlayArcs = () => {
      for (const k of Object.keys(overlay)) delete overlay[k];
      flush();
      return overlay.arc ?? 0;
    };

    // Only 'seed' (touching x) lights up: its two node dots = exactly two arcs.
    // event:x (p→q) is unconnected to x, so it is never cross-lit.
    engine.select(['element:x']);
    expect(overlayArcs()).toBe(2);

    engine.dispose();
  });

  it("selecting an element also highlights that element's connected events (§9)", () => {
    const overlay: Record<string, number> = {};
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
      makeRecordingCanvas(() => {}),
      makeRecordingCanvas((name) => {
        overlay[name] = (overlay[name] ?? 0) + 1;
      }),
    );
    engine.resize(800, 400, 1);
    engine.setData({
      elements: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
      ],
    });
    flush();

    const overlayArcs = () => {
      for (const k of Object.keys(overlay)) delete overlay[k];
      flush();
      return overlay.arc ?? 0;
    };

    // No selection → nothing highlighted.
    expect(overlayArcs()).toBe(0);
    // Selecting element 'a' lights its connected event e1 (its node dots draw).
    engine.select(['element:a']);
    expect(overlayArcs()).toBeGreaterThan(0);

    engine.dispose();
  });

  it('re-renders the selection highlight when the base redraws (pan/zoom)', () => {
    // Regression: the overlay highlight is built from this frame's targets, which
    // the base pass rebuilds at the new camera position. A base redraw must drag
    // the overlay with it, or the highlight stays pinned on screen while the line
    // pans away beneath it.
    const overlay: Record<string, number> = {};
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
      makeRecordingCanvas(() => {}), // base: ignored
      makeRecordingCanvas((name) => {
        overlay[name] = (overlay[name] ?? 0) + 1;
      }),
    );
    engine.resize(800, 400, 1);
    engine.setData({
      elements: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      // An event gives element 'a' an extent, so its line (and hit target) is
      // drawn — event-less elements are not rendered (§1).
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
      ],
    });
    engine.select(['element:a']);
    flush();
    expect(overlay.stroke ?? 0).toBeGreaterThan(0); // highlight drawn once

    // A base-only redraw (here a resize; a pan/zoom is the same path) must
    // re-stroke the highlight on the overlay against the rebuilt targets.
    for (const k of Object.keys(overlay)) delete overlay[k];
    engine.resize(900, 400, 1);
    flush();
    expect(overlay.stroke ?? 0).toBeGreaterThan(0);

    engine.dispose();
  });

  it('zoomToRange frames the requested span across the viewport', () => {
    const engine = makeEngine();
    engine.resize(800, 400, 1);
    // Wide data extent so the sub-range is within the zoom bounds (not clamped).
    engine.setData({
      elements: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
        {
          id: 'e2',
          sourceId: 'b',
          targetId: 'a',
          time: Date.UTC(2026, 11, 31),
        },
      ],
    });

    const start = Date.UTC(2026, 3, 1);
    const end = Date.UTC(2026, 4, 1);
    engine.zoomToRange(start, end);

    const { timeRange } = engine.getViewport();
    expect(timeRange[0]).toBeCloseTo(start, -3);
    expect(timeRange[1]).toBeCloseTo(end, -3);
    engine.dispose();
  });
});

describe('TimelineEngine clustering & LOD (§6)', () => {
  // A dense burst of same-pair events plus two extent anchors, framed full-width.
  const burstData = (count: number): TimelineData => {
    const start = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2026, 11, 31);
    const burst = Date.UTC(2026, 6, 1);
    const day = 86_400_000;
    return {
      elements: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      events: [
        { id: 'lo', sourceId: 'a', targetId: 'b', time: start },
        { id: 'hi', sourceId: 'a', targetId: 'b', time: end },
        ...Array.from({ length: count }, (_, i) => ({
          id: `burst-${i}`,
          sourceId: 'a',
          targetId: 'b',
          time: burst + i * day,
        })),
      ],
    };
  };

  function drawAndCountArcs(options?: {
    clustering?: { enabled?: boolean };
  }): number {
    let arcs = 0;
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
      makeRecordingCanvas((name) => {
        if (name === 'arc') arcs++;
      }),
      makeRecordingCanvas(() => {}),
      options,
    );
    engine.resize(800, 400, 1);
    engine.setData(burstData(20));
    flush();
    engine.dispose();
    return arcs;
  }

  it('collapses dense events at zoom-out, drawing far fewer node markers', () => {
    const clustered = drawAndCountArcs();
    const unclustered = drawAndCountArcs({ clustering: { enabled: false } });
    // 20 burst events → one marker when clustered, ~20 dots when not.
    expect(clustered).toBeLessThan(unclustered);
  });

  it('clicking a cluster expands it by zooming to its member span', () => {
    // Capture the overlay's pointer listeners so a press+release drives a click.
    const listeners = new Map<string, (e: unknown) => void>();
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
    const overlay = {
      width: 0,
      height: 0,
      getContext: () =>
        new Proxy(
          { measureText: (t: string) => ({ width: t.length * 6 }) },
          { get: (tgt, k) => (k in tgt ? Reflect.get(tgt, k) : () => {}) },
        ),
      addEventListener: (type: string, fn: (e: unknown) => void) =>
        listeners.set(type, fn),
      removeEventListener: () => {},
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      hasPointerCapture: () => false,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLCanvasElement;

    const engine = new TimelineEngine(makeCanvas(), overlay);
    engine.resize(800, 400, 1);
    engine.setData(burstData(5));
    flush(); // builds the hit grid with the cluster marker

    const before = engine.getViewport();
    const beforeSpan = before.timeRange[1] - before.timeRange[0];

    // The cluster marker sits at the mean screen-x of the burst, mid-rows a/b.
    const burst = Date.UTC(2026, 6, 1);
    const day = 86_400_000;
    const meanTime = burst + 2 * day; // mean of 5 days centred on +2
    const x = (meanTime - before.timeRange[0]) * before.pxPerMs;
    const rowCenter = (row: number) => 44 + row * (28 + 6) + 28 / 2; // header + rows from defaultTheme
    const y = (rowCenter(0) + rowCenter(1)) / 2;

    let viewportChanges = 0;
    engine.on('viewportChange', () => viewportChanges++);

    const press = listeners.get('pointerdown');
    const release = listeners.get('pointerup');
    const evt = {
      pointerId: 1,
      clientX: x,
      clientY: y,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    };
    press?.(evt);
    release?.(evt);

    const after = engine.getViewport();
    const afterSpan = after.timeRange[1] - after.timeRange[0];
    expect(viewportChanges).toBeGreaterThan(0);
    expect(afterSpan).toBeLessThan(beforeSpan); // zoomed in to expand
    engine.dispose();
  });
});

describe('TimelineEngine theming & formatters (§11)', () => {
  // A frame with one labelled event between two elements, framed full-width.
  const data: TimelineData = {
    elements: [
      { id: 'a', label: 'Acme' },
      { id: 'b', label: 'Beta' },
    ],
    events: [
      {
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        time: Date.UTC(2026, 0, 1),
        label: 'raw',
      },
      { id: 'e2', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 2, 1) },
    ],
  };

  function drawTexts(
    options?: ConstructorParameters<typeof TimelineEngine>[2],
  ) {
    const texts: string[] = [];
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
      makeRecordingCanvas((name, args) => {
        if (name === 'fillText') texts.push(String(args[0]));
      }),
      makeRecordingCanvas(() => {}),
      // Disable label LOD so event labels are not suppressed at the fit zoom (§6).
      { lod: { eventLabelMinPxPerMs: 0 }, ...options },
    );
    engine.resize(800, 400, 1);
    engine.setData(data);
    flush();
    engine.dispose();
    return texts;
  }

  it('routes element/event labels through the supplied formatters', () => {
    const texts = drawTexts({
      formatters: {
        elementLabel: (e) => `EL:${e.id}`,
        eventLabel: (e) => `EV:${e.id}`,
      },
    });
    expect(texts).toContain('EL:a');
    expect(texts).toContain('EV:e1');
    // The raw label is replaced, not appended.
    expect(texts).not.toContain('Acme');
    expect(texts).not.toContain('raw');
  });

  it('routes header tick labels through the tick formatter', () => {
    const texts = drawTexts({ formatters: { tickLabel: () => 'TICK' } });
    expect(texts).toContain('TICK');
  });

  it('falls back to the raw labels when no formatters are given', () => {
    const texts = drawTexts();
    expect(texts).toContain('Acme');
    expect(texts).toContain('raw');
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

describe('TimelineEngine streaming mutations (§7, §10)', () => {
  const elements = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ];
  const seed: TimelineData = {
    elements,
    events: [{ id: 'e1', sourceId: 'a', targetId: 'b', time: 100 }],
  };

  // All rows fit in a tall viewport, so visibleRowRange[1] reports the row count.
  const rowCount = (engine: TimelineEngine): number => {
    engine.resize(800, 100_000, 1);
    return engine.getViewport().visibleRowRange[1];
  };

  it('addEvents emits dataChange with the insert count', () => {
    const engine = makeEngine();
    engine.resize(800, 400, 1);
    engine.setData(seed);
    const changes: { added: number; removed: number; updated: number }[] = [];
    engine.on('dataChange', (d) => changes.push(d));

    engine.addEvents([{ id: 'e2', sourceId: 'b', targetId: 'a', time: 200 }]);

    expect(changes).toEqual([{ added: 1, removed: 0, updated: 0 }]);
    engine.dispose();
  });

  it('a no-op mutation emits nothing (lenient unknown removal)', () => {
    const engine = makeEngine();
    engine.resize(800, 400, 1);
    engine.setData(seed);
    const changes: unknown[] = [];
    engine.on('dataChange', (d) => changes.push(d));

    engine.removeEvents(['does-not-exist']);

    expect(changes).toHaveLength(0);
    engine.dispose();
  });

  it('addElements appends a row synchronously under stable-append (default)', () => {
    const engine = makeEngine();
    engine.setData(seed);
    expect(rowCount(engine)).toBe(2);

    engine.addElements([{ id: 'c', label: 'C' }]);
    // No timer needed: stable-append applies inline so the row appears at once.
    expect(rowCount(engine)).toBe(3);
    engine.dispose();
  });

  it('updateElement re-renders the row with the patched label', () => {
    // Controllable rAF so we can force exactly one base frame per state.
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
    const labels: string[] = [];
    const record = (name: string, args: unknown[]) => {
      if (name === 'fillText') labels.push(String(args[0]));
    };
    const engine = new TimelineEngine(
      makeRecordingCanvas(record),
      makeRecordingCanvas(record),
    );
    engine.resize(800, 400, 1);
    engine.setData(seed);
    flush();
    expect(labels).toContain('A');

    labels.length = 0;
    engine.updateElement('a', { label: 'A2' });
    flush();
    // The patch marked the base layer dirty, so the redraw paints the new label.
    expect(labels).toContain('A2');
    expect(labels).not.toContain('A');
    engine.dispose();
  });

  it('streamingLayout:"full" defers re-layout to the debounced tick', () => {
    vi.useFakeTimers();
    try {
      const engine = new TimelineEngine(makeCanvas(), makeCanvas(), {
        streamingLayout: 'full',
        layoutDebounceMs: 120,
      });
      engine.setData(seed);
      expect(rowCount(engine)).toBe(2);

      engine.addElements([{ id: 'c', label: 'C' }]);
      // Debounced: the new row is not laid out until the trailing edge fires.
      expect(rowCount(engine)).toBe(2);

      vi.advanceTimersByTime(120);
      expect(rowCount(engine)).toBe(3);
      engine.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('TimelineEngine frame-timing seam (§13)', () => {
  const data: TimelineData = {
    elements: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    events: [
      { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
    ],
  };

  // Controllable rAF so each flush() drives exactly one engine frame.
  function controllableRaf() {
    let queued: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      queued.push(cb);
      return queued.length;
    });
    return () => {
      const run = queued;
      queued = [];
      for (const cb of run) cb();
    };
  }

  it('reports base then overlay timing for a base-dirty frame', () => {
    const flush = controllableRaf();
    const stats: { layer: string; durationMs: number }[] = [];
    const engine = new TimelineEngine(makeCanvas(), makeCanvas(), {
      onFrameStats: (s) => stats.push(s),
    });
    engine.resize(800, 400, 1);
    engine.setData(data); // marks base dirty
    flush();

    // A base redraw drags the overlay with it (§4), so both layers are timed.
    expect(stats.map((s) => s.layer)).toEqual(['base', 'overlay']);
    for (const s of stats) {
      expect(Number.isFinite(s.durationMs)).toBe(true);
      expect(s.durationMs).toBeGreaterThanOrEqual(0);
    }
    engine.dispose();
  });

  it('reports overlay-only timing for an overlay-dirty frame (select)', () => {
    const flush = controllableRaf();
    const stats: { layer: string }[] = [];
    const engine = new TimelineEngine(makeCanvas(), makeCanvas(), {
      onFrameStats: (s) => stats.push(s),
    });
    engine.resize(800, 400, 1);
    engine.setData(data);
    flush();
    stats.length = 0;

    engine.select(['element:a']); // marks overlay dirty only
    flush();

    expect(stats.map((s) => s.layer)).toEqual(['overlay']);
    engine.dispose();
  });

  it('does not invoke the sink when none is supplied (zero-overhead path)', () => {
    // No throw / no measurement when the option is omitted: the recording canvas
    // confirms the frame still drew its content.
    const flush = controllableRaf();
    const calls: Record<string, number> = {};
    const engine = new TimelineEngine(
      makeRecordingCanvas((name) => {
        calls[name] = (calls[name] ?? 0) + 1;
      }),
      makeRecordingCanvas(() => {}),
    );
    engine.resize(800, 400, 1);
    engine.setData(data);
    expect(() => flush()).not.toThrow();
    expect(calls.fillText ?? 0).toBeGreaterThan(0);
    engine.dispose();
  });
});
