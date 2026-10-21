import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOW_MS } from '../scale/camera';
import type { TimelineData } from '../model/types';
import { createTestEngine } from '../testing/engine';
import { TimelineEngine } from './timeline';

const DAY = 86_400_000;

const pair: TimelineData = {
  elements: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  events: [
    { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
    { id: 'e2', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 2, 1) },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('TimelineEngine empty-state framing (§3.1)', () => {
  it('frames the default 30-day window on "now" when no data is present', () => {
    const now = Date.UTC(2026, 5, 15);
    const { engine } = createTestEngine({ now: () => now });
    const [start, end] = engine.getViewport().timeRange;
    expect(end - start).toBeCloseTo(DEFAULT_WINDOW_MS, -3);
    expect((start + end) / 2).toBeCloseTo(now, -3);
    engine.dispose();
  });

  it('still auto-fits to data that arrives after an empty resize', () => {
    const { engine } = createTestEngine();
    engine.setData(pair);
    // The data start lands just inside the left edge (a gutter is reserved
    // for the start markers, §1); the data end sits at the right edge.
    const [start, end] = engine.getViewport().timeRange;
    expect(start).toBeLessThan(Date.UTC(2026, 0, 1));
    expect(end).toBeCloseTo(Date.UTC(2026, 2, 1), -3);
    engine.dispose();
  });
});

describe('TimelineEngine camera (§3, §12)', () => {
  it('setScrollY scrolls, clamps to the content, and reports once per frame', () => {
    const { engine, frames } = createTestEngine();
    const elements = Array.from({ length: 40 }, (_, i) => ({
      id: `e${i}`,
      label: `E${i}`,
    }));
    const events = elements.map((el, i) => ({
      id: `ev${i}`,
      sourceId: el.id,
      targetId: `e${(i + 1) % 40}`,
      time: Date.UTC(2026, 0, 1 + i),
    }));
    engine.setData({ elements, events });
    frames.run();

    const emitted: number[] = [];
    engine.on('viewportChange', (v) => emitted.push(v.scrollY));

    engine.setScrollY(200);
    engine.setScrollY(220);
    expect(engine.getViewport().scrollY).toBe(220);
    expect(emitted).toEqual([]); // reported on the frame, not synchronously
    frames.run();
    expect(emitted).toEqual([220]); // once for both changes

    engine.setScrollY(1_000_000);
    const clamped = engine.getViewport().scrollY;
    expect(clamped).toBeGreaterThan(0);
    expect(clamped).toBeLessThan(1_000_000);
    engine.setScrollY(-50);
    expect(engine.getViewport().scrollY).toBe(0);
    engine.dispose();
  });

  it('zoomToRange frames the requested span across the viewport', () => {
    const { engine } = createTestEngine();
    engine.setData({
      elements: pair.elements,
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

describe('TimelineEngine selection (§9)', () => {
  it('select() replaces the selection and emits structured ids', () => {
    const { engine } = createTestEngine();
    engine.setData(pair);
    const emitted: unknown[] = [];
    engine.on('selectionChange', (s) => emitted.push(s));

    engine.select({ elements: ['a'], events: ['e1'] });
    engine.select({ events: ['e2'] });

    expect(emitted).toEqual([
      { elements: ['a'], events: ['e1'] },
      { elements: [], events: ['e2'] },
    ]);
    expect(engine.getSelection()).toEqual({ elements: [], events: ['e2'] });
    engine.dispose();
  });

  it('ignores a no-op replacement', () => {
    const { engine } = createTestEngine();
    const emitted: unknown[] = [];
    engine.on('selectionChange', (s) => emitted.push(s));
    engine.select({ events: ['e1'] });
    engine.select({ events: ['e1'] });
    engine.clearSelection();
    engine.clearSelection();
    expect(emitted).toHaveLength(2);
    engine.dispose();
  });

  it('selecting an element never lights an unconnected event sharing its raw id', () => {
    // Element 'x' and event 'x' share the raw id but are not connected: event
    // 'x' runs p→q. Selecting element x lights only x's own event ('seed').
    // Each event highlight draws two node dots.
    const { engine, overlay, frames } = createTestEngine();
    engine.setData({
      elements: [
        { id: 'x', label: 'X' },
        { id: 'p', label: 'P' },
        { id: 'q', label: 'Q' },
      ],
      events: [
        {
          id: 'seed',
          sourceId: 'x',
          targetId: 'q',
          time: Date.UTC(2026, 0, 1),
        },
        { id: 'x', sourceId: 'p', targetId: 'q', time: Date.UTC(2026, 0, 3) },
      ],
    });
    frames.run();
    overlay.reset();
    engine.select({ elements: ['x'] });
    frames.run();
    expect(overlay.nodeCount()).toBe(2);
    engine.dispose();
  });

  it("selecting an element also highlights that element's connected events", () => {
    const { engine, overlay, frames } = createTestEngine();
    engine.setData({
      elements: pair.elements,
      events: [pair.events[0]!],
    });
    frames.run();
    expect(overlay.nodeCount()).toBe(0);
    engine.select({ elements: ['a'] });
    frames.run();
    expect(overlay.nodeCount()).toBeGreaterThan(0);
    engine.dispose();
  });

  it('highlights the aggregated cluster holding a selection (§6)', () => {
    const { engine, overlay, frames } = createTestEngine({
      clustering: { maxMarkers: 100 },
    });
    const at = Date.UTC(2026, 6, 1);
    const stack = (prefix: string, sourceId: string, targetId: string) =>
      Array.from({ length: 400 }, (_, i) => ({
        id: `${prefix}${i}`,
        sourceId,
        targetId,
        time: prefix === 'x' ? at : at + 30 * DAY,
      }));
    engine.setData({
      elements: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      events: [...stack('x', 'a', 'b'), ...stack('y', 'b', 'c')],
    });
    frames.run();
    // A member event: its cluster's marker is redrawn, and only that one.
    overlay.reset();
    engine.select({ events: ['x7'] });
    frames.run();
    expect(overlay.nodeCount()).toBe(1);
    // An element: the cluster connected to it.
    overlay.reset();
    engine.select({ elements: ['c'] });
    frames.run();
    expect(overlay.nodeCount()).toBe(1);
    engine.dispose();
  });

  it('re-renders the selection highlight when the base redraws (pan/zoom)', () => {
    const { engine, overlay, frames } = createTestEngine();
    engine.setData(pair);
    engine.select({ elements: ['a'] });
    frames.run();
    expect(overlay.segmentCount()).toBeGreaterThan(0);

    overlay.reset();
    engine.panToTime(engine.getViewport().timeRange[0] + DAY);
    frames.run();
    expect(overlay.segmentCount()).toBeGreaterThan(0);
    engine.dispose();
  });

  it('prunes removed events from the selection and emits the change', () => {
    const { engine } = createTestEngine();
    engine.setData(pair);
    engine.select({ events: ['e1', 'e2'] });
    const emitted: unknown[] = [];
    engine.on('selectionChange', (s) => emitted.push(s));

    engine.removeEvents(['e1']);

    expect(emitted).toEqual([{ elements: [], events: ['e2'] }]);
    engine.dispose();
  });

  it('prunes the selection when setData replaces the dataset', () => {
    const { engine } = createTestEngine();
    engine.setData(pair);
    engine.select({ elements: ['a'], events: ['e2'] });
    const emitted: unknown[] = [];
    engine.on('selectionChange', (s) => emitted.push(s));

    engine.setData({ elements: [{ id: 'a', label: 'A' }], events: [] });

    expect(emitted).toEqual([{ elements: ['a'], events: [] }]);
    engine.dispose();
  });
});

describe('TimelineEngine clustering & LOD (§6)', () => {
  const burstData = (count: number): TimelineData => {
    const burst = Date.UTC(2026, 6, 1);
    return {
      elements: pair.elements,
      events: [
        { id: 'lo', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
        {
          id: 'hi',
          sourceId: 'a',
          targetId: 'b',
          time: Date.UTC(2026, 11, 31),
        },
        ...Array.from({ length: count }, (_, i) => ({
          id: `burst-${i}`,
          sourceId: 'a',
          targetId: 'b',
          time: burst + i * DAY,
        })),
      ],
    };
  };

  function nodeCount(clustering?: { enabled: boolean }): number {
    const { engine, base, frames } = createTestEngine({ clustering });
    engine.setData(burstData(20));
    frames.run();
    engine.dispose();
    return base.nodeCount();
  }

  it('collapses dense events at zoom-out, drawing far fewer node markers', () => {
    expect(nodeCount()).toBeLessThan(nodeCount({ enabled: false }));
  });
});

describe('TimelineEngine theming & formatters (§11)', () => {
  const labelled: TimelineData = {
    elements: [
      { id: 'a', label: 'Acme' },
      { id: 'b', label: 'Beta' },
    ],
    events: [{ ...pair.events[0]!, label: 'raw' }, pair.events[1]!],
  };

  function drawTexts(
    options: Parameters<typeof createTestEngine>[0] = {},
  ): string[] {
    // Label LOD off so event labels draw at the fit zoom (§6).
    const { engine, base, frames } = createTestEngine({
      lod: { eventLabelMinPxPerMs: 0 },
      ...options,
    });
    engine.setData(labelled);
    frames.run();
    engine.dispose();
    return base.texts();
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
    expect(texts).not.toContain('Acme');
    expect(texts).not.toContain('raw');
  });

  it('routes header tick labels through the tick formatter', () => {
    expect(drawTexts({ formatters: { tickLabel: () => 'TICK' } })).toContain(
      'TICK',
    );
  });

  it('falls back to the raw labels when no formatters are given', () => {
    const texts = drawTexts();
    expect(texts).toContain('Acme');
    expect(texts).toContain('raw');
  });
});

describe('TimelineEngine runtime options (§12)', () => {
  it('setTheme redraws with the new theme and keeps data, camera and selection', () => {
    const { engine, base, frames } = createTestEngine();
    engine.setData(pair);
    engine.select({ events: ['e1'] });
    engine.zoomToRange(Date.UTC(2026, 0, 10), Date.UTC(2026, 1, 10));
    frames.run();
    const before = engine.getViewport();
    const selections: unknown[] = [];
    engine.on('selectionChange', (s) => selections.push(s));

    base.reset();
    engine.setTheme({ background: '#123456' });
    frames.run();

    expect(base.of('beginFrame')).toEqual([
      { verb: 'beginFrame', clearColor: '#123456' },
    ]);
    expect(engine.getViewport().timeRange).toEqual(before.timeRange);
    expect(engine.getSelection().events).toEqual(['e1']);
    expect(selections).toEqual([]);
    engine.dispose();
  });

  it('a theme with taller rows re-lays out the rows', () => {
    const { engine } = createTestEngine({}, { width: 800, height: 10_000 });
    engine.setData(pair);
    engine.setTheme({ layout: { rowHeight: 4000 } });
    expect(engine.getViewport().visibleRowRange[1]).toBe(2);
    engine.setTheme({
      layout: { rowHeight: 28 },
      header: { height: 9_990 },
    });
    expect(engine.getViewport().visibleRowRange[1]).toBe(1);
    engine.dispose();
  });

  it('setOptions({ layout }) re-orders rows with the new strategy', () => {
    const { engine, base, frames } = createTestEngine();
    engine.setData(pair);
    frames.run();
    const firstLabel = () => base.texts().find((t) => t === 'A' || t === 'B');
    expect(firstLabel()).toBe('A');
    base.reset();
    engine.setOptions({ layout: { order: () => ['b', 'a'] } });
    frames.run();
    expect(firstLabel()).toBe('B');
    engine.dispose();
  });

  it('setFormatters re-labels without a new dataset', () => {
    const { engine, base, frames } = createTestEngine();
    engine.setData(pair);
    frames.run();
    base.reset();
    engine.setFormatters({ elementLabel: (e) => `#${e.id}` });
    frames.run();
    expect(base.texts()).toContain('#a');
    engine.dispose();
  });
});

describe('TimelineEngine frame content (§1, §4)', () => {
  it('emits arrows, nodes and labels when a frame draws', () => {
    const { engine, base, frames } = createTestEngine();
    engine.setData(pair);
    frames.run();
    expect(base.nodeCount()).toBeGreaterThan(0);
    expect(base.calls.some((c) => c.verb === 'drawArrowheads')).toBe(true);
    expect(base.texts()).toContain('A');
    engine.dispose();
  });

  it('masks the header band after content and before the header ticks (§4)', () => {
    const { engine, base, frames } = createTestEngine();
    engine.setData(pair);
    base.reset(); // drop the empty frame resize() drew
    frames.run();
    const verbs = base.calls;
    const mask = verbs.findIndex(
      (c) =>
        c.verb === 'fillRect' &&
        c.x === 0 &&
        c.y === 0 &&
        c.width === 800 &&
        c.height > 0 &&
        c.height < 400,
    );
    expect(mask).toBeGreaterThanOrEqual(0);
    expect(verbs.findIndex((c) => c.verb === 'drawNodes')).toBeLessThan(mask);
    expect(verbs.map((c) => c.verb).lastIndexOf('drawText')).toBeGreaterThan(
      mask,
    );
    engine.dispose();
  });

  it('emits firstFrame once, after the first sized base draw', () => {
    const { engine, frames } = createTestEngine({}, { width: 0, height: 0 });
    let count = 0;
    engine.on('firstFrame', () => count++);
    engine.setData(pair);
    frames.run();
    expect(count).toBe(0); // not sized yet
    engine.resize(800, 400, 1); // draws synchronously
    expect(count).toBe(1);
    engine.fit();
    frames.run();
    expect(count).toBe(1);
    engine.dispose();
  });

  it('resize() draws synchronously so no blank frame shows', () => {
    const { engine, base, frames } = createTestEngine();
    engine.setData(pair);
    frames.run();
    base.reset();
    engine.resize(640, 400, 2);
    expect(base.calls[0]).toEqual({ verb: 'resize', width: 1280, height: 800 });
    expect(base.frames()).toBe(1);
    expect(frames.pending).toBe(0);
    engine.dispose();
  });

  it('reports draw errors as diagnostics and finishes the frame', () => {
    const diagnostics: string[] = [];
    const { engine, base, frames } = createTestEngine({
      onDiagnostic: (d) => diagnostics.push(d.code),
    });
    base.drawNodes = () => {
      throw new Error('boom');
    };
    engine.setData(pair);
    expect(() => frames.run()).not.toThrow();
    expect(diagnostics).toEqual(['render-error']);
    expect(base.calls.at(-1)).toEqual({ verb: 'endFrame' });
    engine.dispose();
  });

  it('getRendererBackend reports host renderers, and null before mount', () => {
    const { engine } = createTestEngine();
    expect(engine.getRendererBackend()).toBe('recording');
    engine.dispose();
    const unmounted = new TimelineEngine();
    expect(unmounted.getRendererBackend()).toBeNull();
    unmounted.dispose();
  });
});

describe('TimelineEngine streaming mutations (§7, §10)', () => {
  const seed: TimelineData = {
    elements: pair.elements,
    events: [{ id: 'e1', sourceId: 'a', targetId: 'b', time: 100 }],
  };
  const rowCount = (engine: TimelineEngine): number => {
    engine.resize(800, 100_000, 1);
    return engine.getViewport().visibleRowRange[1];
  };

  it('addEvents emits dataChange with the insert count', () => {
    const { engine } = createTestEngine();
    engine.setData(seed);
    const changes: unknown[] = [];
    engine.on('dataChange', (d) => changes.push(d));
    engine.addEvents([{ id: 'e2', sourceId: 'b', targetId: 'a', time: 200 }]);
    expect(changes).toEqual([
      {
        elements: { added: 0, removed: 0, updated: 0 },
        events: { added: 1, removed: 0, updated: 0 },
      },
    ]);
    engine.dispose();
  });

  it('a no-op mutation emits nothing (lenient unknown removal)', () => {
    const { engine } = createTestEngine();
    engine.setData(seed);
    const changes: unknown[] = [];
    engine.on('dataChange', (d) => changes.push(d));
    engine.removeEvents(['does-not-exist']);
    expect(changes).toHaveLength(0);
    engine.dispose();
  });

  it('addElements appends a row synchronously under stable-append (default)', () => {
    const { engine } = createTestEngine({ emptyElements: 'show' });
    engine.setData(seed);
    expect(rowCount(engine)).toBe(2);
    engine.addElements([{ id: 'c', label: 'C' }]);
    expect(rowCount(engine)).toBe(3);
    engine.dispose();
  });

  it("gives an element a row only once it has events under emptyElements 'hide' (B-06)", () => {
    const { engine } = createTestEngine();
    engine.setData(seed);
    engine.addElements([{ id: 'c', label: 'C' }]);
    expect(rowCount(engine)).toBe(2);
    engine.addEvents([{ id: 'e9', sourceId: 'a', targetId: 'c', time: 200 }]);
    expect(rowCount(engine)).toBe(3);
    engine.removeEvents(['e9']);
    expect(rowCount(engine)).toBe(2); // no blank lane left behind
    engine.dispose();
  });

  it('updateElement re-renders the row with the patched label', () => {
    const { engine, base, frames } = createTestEngine();
    engine.setData(seed);
    frames.run();
    expect(base.texts()).toContain('A');
    base.reset();
    engine.updateElement('a', { label: 'A2' });
    frames.run();
    expect(base.texts()).toContain('A2');
    expect(base.texts()).not.toContain('A');
    engine.dispose();
  });

  it('streamingLayout:"full" defers re-layout to the debounced tick', () => {
    vi.useFakeTimers();
    const { engine } = createTestEngine({
      streamingLayout: 'full',
      layoutDebounceMs: 120,
      emptyElements: 'show',
    });
    engine.setData(seed);
    expect(rowCount(engine)).toBe(2);
    engine.addElements([{ id: 'c', label: 'C' }]);
    expect(rowCount(engine)).toBe(2);
    vi.advanceTimersByTime(120);
    expect(rowCount(engine)).toBe(3);
    engine.dispose();
  });

  it('repairs a layout strategy that drops and repeats ids, and reports it', () => {
    const diagnostics: string[] = [];
    const { engine } = createTestEngine({
      layout: { order: () => ['b', 'b', 'ghost'] },
      onDiagnostic: (d) => diagnostics.push(d.code),
    });
    engine.setData(pair);
    expect(rowCount(engine)).toBe(2);
    expect(diagnostics).toEqual(['invalid-layout']);
    engine.dispose();
  });
});

describe('TimelineEngine frame-timing seam (§13)', () => {
  it('reports base then overlay timing for a base-dirty frame', () => {
    const stats: { layer: string; durationMs: number }[] = [];
    const { engine, frames } = createTestEngine({
      onFrameStats: (s) => stats.push(s),
    });
    stats.length = 0;
    engine.setData(pair);
    frames.run();
    expect(stats.map((s) => s.layer)).toEqual(['base', 'overlay']);
    for (const s of stats) expect(s.durationMs).toBeGreaterThanOrEqual(0);
    engine.dispose();
  });

  it('reports overlay-only timing for an overlay-dirty frame (select)', () => {
    const stats: { layer: string }[] = [];
    const { engine, frames } = createTestEngine({
      onFrameStats: (s) => stats.push(s),
    });
    engine.setData(pair);
    frames.run();
    stats.length = 0;
    engine.select({ elements: ['a'] });
    frames.run();
    expect(stats.map((s) => s.layer)).toEqual(['overlay']);
    engine.dispose();
  });
});

describe('TimelineEngine measureText cache (§4)', () => {
  const LABEL = 'streamed-label';
  const data: TimelineData = {
    elements: pair.elements,
    events: [{ ...pair.events[0]!, label: LABEL }],
  };

  // A visible label box is what makes the builder measure the label.
  function measuring() {
    const t = createTestEngine({
      styleResolvers: { event: () => ({ labelBoxBackground: '#222' }) },
      lod: { eventLabelMinPxPerMs: 0 },
    });
    const count = () =>
      t.base.calls.filter((c) => c.verb === 'measureText' && c.text === LABEL)
        .length;
    return { ...t, count };
  }

  it('reuses the cached width across redraws within a dataset', () => {
    const { engine, base, frames, count } = measuring();
    engine.setData(data);
    frames.run();
    expect(count()).toBeGreaterThan(0);
    base.reset();
    engine.panToTime(engine.getViewport().timeRange[0] + 1);
    frames.run();
    expect(count()).toBe(0);
    engine.dispose();
  });

  it('re-measures after setData swaps the dataset', () => {
    const { engine, base, frames, count } = measuring();
    engine.setData(data);
    frames.run();
    base.reset();
    engine.setData(data);
    frames.run();
    expect(count()).toBeGreaterThan(0);
    engine.dispose();
  });
});

describe('TimelineEngine time model (§3, §8)', () => {
  const y2020: TimelineData = {
    elements: pair.elements,
    events: [
      { id: 'a1', sourceId: 'a', targetId: 'b', time: Date.UTC(2020, 0, 1) },
      { id: 'a2', sourceId: 'b', targetId: 'a', time: Date.UTC(2020, 5, 1) },
    ],
  };
  const y2026: TimelineData = {
    elements: pair.elements,
    events: [
      { id: 'b1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
      { id: 'b2', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 5, 1) },
    ],
  };
  const shows = (engine: TimelineEngine, t: number) => {
    const [t0, t1] = engine.getViewport().timeRange;
    return t >= t0 && t <= t1;
  };

  it("refits by default when new data lies outside the view ('auto')", () => {
    const { engine } = createTestEngine();
    engine.setData(y2020);
    engine.setData(y2026);
    expect(shows(engine, Date.UTC(2026, 2, 1))).toBe(true);
    engine.dispose();
  });

  it("keeps the camera under 'auto' when new data overlaps the view", () => {
    const { engine } = createTestEngine();
    engine.setData(y2026);
    engine.zoomToRange(Date.UTC(2026, 1, 1), Date.UTC(2026, 2, 1));
    const before = engine.getViewport().timeRange;
    engine.setData({ ...y2026, events: [...y2026.events] });
    expect(engine.getViewport().timeRange).toEqual(before);
    engine.dispose();
  });

  it("'first' never refits after the first dataset; 'always' always does", () => {
    const first = createTestEngine({ fitOnDataChange: 'first' }).engine;
    first.setData(y2020);
    first.setData(y2026);
    expect(shows(first, Date.UTC(2026, 2, 1))).toBe(false);
    first.dispose();

    const always = createTestEngine({ fitOnDataChange: 'always' }).engine;
    always.setData(y2026);
    always.zoomToRange(Date.UTC(2026, 1, 1), Date.UTC(2026, 1, 2));
    always.setData(y2026);
    expect(shows(always, Date.UTC(2026, 4, 1))).toBe(true);
    always.dispose();
  });

  it('fits data that arrived before the first resize', () => {
    const { engine } = createTestEngine({}, { width: 0, height: 0 });
    engine.setData(y2026);
    engine.resize(800, 400, 1);
    expect(shows(engine, Date.UTC(2026, 2, 1))).toBe(true);
    engine.dispose();
  });

  it('honours zoom limits and zooms in/out about the centre', () => {
    const max = 1 / DAY; // 1 px per day... deliberately shallow
    const { engine } = createTestEngine({ zoom: { max } });
    engine.setData(y2026);
    engine.zoomIn(1000);
    expect(engine.getViewport().pxPerMs).toBeCloseTo(max);
    const centre = (r: [number, number]) => (r[0] + r[1]) / 2;
    const c = centre(engine.getViewport().timeRange);
    engine.zoomOut(2);
    expect(engine.getViewport().pxPerMs).toBeCloseTo(max / 2);
    expect(centre(engine.getViewport().timeRange)).toBeCloseTo(c, -3);
    engine.dispose();
  });

  it('allows zooming out past the data with a numeric zoom.min', () => {
    const { engine } = createTestEngine({ zoom: { min: 1e-12 } });
    engine.setData(y2026);
    const fitted = engine.getViewport().pxPerMs;
    engine.zoomOut(10);
    expect(engine.getViewport().pxPerMs).toBeCloseTo(fitted / 10);
    engine.dispose();
  });

  it("keeps the window on the data with pan.bounds: 'data'", () => {
    const { engine } = createTestEngine({ pan: { bounds: 'data' } });
    engine.setData(y2026);
    engine.zoomToRange(Date.UTC(2026, 1, 1), Date.UTC(2026, 2, 1));
    engine.panToTime(Date.UTC(2030, 0, 1));
    const [, t1] = engine.getViewport().timeRange;
    expect(t1).toBeLessThanOrEqual(Date.UTC(2026, 5, 1) + 1);
    engine.panToTime(Date.UTC(2010, 0, 1));
    const [t0] = engine.getViewport().timeRange;
    expect(t0).toBeGreaterThan(Date.UTC(2025, 11, 1));
    engine.dispose();
  });

  it('centres a range the zoom limit cannot fill', () => {
    const { engine } = createTestEngine();
    engine.setData(y2026);
    const t = Date.UTC(2026, 2, 1);
    engine.zoomToRange(t, t + 1000); // one second: far past the max zoom
    const [t0, t1] = engine.getViewport().timeRange;
    expect((t0 + t1) / 2).toBeCloseTo(t + 500, -2);
    engine.dispose();
  });

  it('labels hours at deep zoom and pins the current period at the left edge', () => {
    const { engine, base, frames } = createTestEngine();
    engine.setData(y2026);
    // 36 h over 800 px: 3-hour minor ticks under a day header.
    engine.zoomToRange(Date.UTC(2026, 2, 4, 6), Date.UTC(2026, 2, 5, 18));
    base.reset();
    frames.run();
    const texts = base.texts();
    expect(texts).toContain('12:00 PM');
    expect(texts).toContain('Mar 4, 2026'); // the sticky day label
    engine.dispose();
  });

  it('formats header labels in the configured locale', () => {
    const { engine, base, frames } = createTestEngine({ locale: 'de-DE' });
    engine.setData(y2026);
    base.reset();
    frames.run();
    expect(base.texts()).toContain('März 2026');
    engine.dispose();
  });
});

describe('TimelineEngine API completion (§10, §12)', () => {
  const tall: TimelineData = {
    elements: Array.from({ length: 40 }, (_, i) => ({
      id: `r${i}`,
      label: `R${i}`,
    })),
    events: Array.from({ length: 40 }, (_, i) => ({
      id: `x${i}`,
      sourceId: `r${i}`,
      targetId: `r${(i + 1) % 40}`,
      time: Date.UTC(2026, 0, 1 + i),
    })),
  };

  it('removeElements drops rows and their events, and prunes the selection', () => {
    const { engine } = createTestEngine({}, { width: 800, height: 10_000 });
    engine.setData(pair);
    engine.select({ elements: ['b'], events: ['e1'] });
    const changes: unknown[] = [];
    engine.on('dataChange', (d) => changes.push(d));
    engine.removeElements(['b']);
    expect(engine.getData().elements.map((e) => e.id)).toEqual(['a']);
    expect(engine.getData().events).toEqual([]);
    expect(engine.getSelection()).toEqual({ elements: [], events: [] });
    expect(changes).toEqual([
      {
        elements: { added: 0, removed: 1, updated: 0 },
        events: { added: 0, removed: 2, updated: 0 },
      },
    ]);
    // 'a' lost its only events, so it has no row either (B-06).
    expect(engine.getViewport().visibleRowRange[1]).toBe(0);
    engine.dispose();
  });

  it('updateEvent moves an event in time', () => {
    const { engine } = createTestEngine();
    engine.setData(pair);
    engine.updateEvent('e1', { time: Date.UTC(2026, 5, 1) });
    expect(engine.getData().events.map((e) => e.id)).toEqual(['e2', 'e1']);
    engine.dispose();
  });

  it('scrollToElement centres the row vertically', () => {
    const { engine } = createTestEngine();
    engine.setData(tall);
    const row = engine.getViewport().visibleRowRange;
    expect(row[0]).toBe(0);
    engine.scrollToElement('r30');
    const [top, bottom] = engine.getViewport().visibleRowRange;
    expect(top).toBeLessThanOrEqual(30);
    expect(bottom).toBeGreaterThan(30);
    expect(engine.getViewport().scrollY).toBeGreaterThan(0);
    engine.dispose();
  });

  it('revealEvent centres the event time and its rows', () => {
    const { engine } = createTestEngine();
    engine.setData(tall);
    engine.zoomToRange(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 5));
    engine.revealEvent('x30');
    const { timeRange, visibleRowRange } = engine.getViewport();
    expect((timeRange[0] + timeRange[1]) / 2).toBeCloseTo(
      Date.UTC(2026, 0, 31),
      -3,
    );
    expect(visibleRowRange[0]).toBeLessThanOrEqual(30);
    expect(visibleRowRange[1]).toBeGreaterThan(31);
    engine.dispose();
  });
});
