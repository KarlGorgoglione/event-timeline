import { describe, expect, it, vi } from 'vitest';
import { DataStore } from './store';
import type { Diagnostic } from './diagnostics';
import type { TimelineData } from './types';

function makeStore() {
  const diagnostics: Diagnostic[] = [];
  const store = new DataStore({ onDiagnostic: (d) => diagnostics.push(d) });
  return { store, diagnostics };
}

const elements = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
];

describe('DataStore validation', () => {
  it('drops duplicate element ids and reports a diagnostic', () => {
    const { store, diagnostics } = makeStore();
    const added = store.setData({
      elements: [
        { id: 'a', label: 'A' },
        { id: 'a', label: 'A again' },
      ],
      events: [],
    });
    expect(added.added).toBe(1);
    expect(store.getElements()).toHaveLength(1);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'duplicate-id',
        kind: 'element',
        id: 'a',
      }),
    );
  });

  it('drops events with a non-finite time', () => {
    const { store, diagnostics } = makeStore();
    store.setData({
      elements,
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: NaN },
        { id: 'e2', sourceId: 'a', targetId: 'b', time: Infinity },
        { id: 'e3', sourceId: 'a', targetId: 'b', time: 5 },
      ],
    });
    expect(store.getEvents().map((e) => e.id)).toEqual(['e3']);
    expect(diagnostics.filter((d) => d.code === 'invalid-time')).toHaveLength(
      2,
    );
  });

  it('drops dangling edges', () => {
    const { store, diagnostics } = makeStore();
    store.setData({
      elements,
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'missing', time: 1 },
        { id: 'e2', sourceId: 'gone', targetId: 'b', time: 2 },
      ],
    });
    expect(store.getEvents()).toHaveLength(0);
    expect(diagnostics.filter((d) => d.code === 'dangling-edge')).toHaveLength(
      2,
    );
  });

  it('accepts self-directed events', () => {
    const { store } = makeStore();
    store.setData({
      elements,
      events: [{ id: 'e1', sourceId: 'a', targetId: 'a', time: 7 }],
    });
    expect(store.getEvents()).toHaveLength(1);
    expect(store.getExtent('a')).toEqual({ minTime: 7, maxTime: 7 });
  });

  it('drops duplicate event ids', () => {
    const { store, diagnostics } = makeStore();
    store.setData({
      elements,
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: 1 },
        { id: 'e1', sourceId: 'a', targetId: 'b', time: 2 },
      ],
    });
    expect(store.getEvents()).toHaveLength(1);
    expect(store.getEvents()[0]?.time).toBe(1);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'duplicate-id',
        kind: 'event',
        id: 'e1',
      }),
    );
  });

  it('keeps the rest of a batch when one row is invalid (lenient, never throws)', () => {
    const { store } = makeStore();
    expect(() =>
      store.setData({
        elements,
        events: [
          { id: 'good', sourceId: 'a', targetId: 'b', time: 1 },
          { id: 'bad', sourceId: 'a', targetId: 'b', time: NaN },
        ],
      }),
    ).not.toThrow();
    expect(store.getEvents().map((e) => e.id)).toEqual(['good']);
  });
});

describe('DataStore setData rebuild', () => {
  const first: TimelineData = {
    elements,
    events: [{ id: 'e1', sourceId: 'a', targetId: 'b', time: 100 }],
  };

  it('widens both endpoint extents from an event', () => {
    const { store } = makeStore();
    store.setData({
      elements,
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: 100 },
        { id: 'e2', sourceId: 'a', targetId: 'b', time: 200 },
      ],
    });
    expect(store.getExtent('a')).toEqual({ minTime: 100, maxTime: 200 });
    expect(store.getExtent('b')).toEqual({ minTime: 100, maxTime: 200 });
    expect(store.getDataExtent()).toEqual({ minTime: 100, maxTime: 200 });
  });

  it('clears prior data on the next setData (no leakage)', () => {
    const { store } = makeStore();
    store.setData(first);
    store.setData({ elements: [{ id: 'c', label: 'C' }], events: [] });
    expect(store.getElements().map((e) => e.id)).toEqual(['c']);
    expect(store.getEvents()).toHaveLength(0);
    expect(store.getExtents().size).toBe(0);
    expect(store.getDataExtent()).toBeNull();
  });

  it('defaults the diagnostic sink without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new DataStore();
    expect(() => store.setData({ elements: [], events: [] })).not.toThrow();
    warn.mockRestore();
  });
});

describe('DataStore temporal index (§5)', () => {
  const elementsAbc = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];

  it('returns events sorted by time regardless of input order', () => {
    const { store } = makeStore();
    store.setData({
      elements: elementsAbc,
      events: [
        { id: 'e3', sourceId: 'a', targetId: 'b', time: 300 },
        { id: 'e1', sourceId: 'a', targetId: 'b', time: 100 },
        { id: 'e2', sourceId: 'b', targetId: 'c', time: 200 },
      ],
    });
    expect(store.getEvents().map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('keeps equal-time events in stable insertion order', () => {
    const { store } = makeStore();
    store.setData({
      elements: elementsAbc,
      events: [
        { id: 'first', sourceId: 'a', targetId: 'b', time: 50 },
        { id: 'second', sourceId: 'b', targetId: 'c', time: 50 },
      ],
    });
    expect(store.getEvents().map((e) => e.id)).toEqual(['first', 'second']);
  });

  it('getEventsInRange selects the inclusive [tStart, tEnd] slice', () => {
    const { store } = makeStore();
    store.setData({
      elements: elementsAbc,
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: 100 },
        { id: 'e2', sourceId: 'b', targetId: 'c', time: 200 },
        { id: 'e3', sourceId: 'a', targetId: 'c', time: 300 },
      ],
    });
    expect(store.getEventsInRange(150, 250).map((e) => e.id)).toEqual(['e2']);
    expect(store.getEventsInRange(100, 300).map((e) => e.id)).toEqual([
      'e1',
      'e2',
      'e3',
    ]);
    expect(store.getEventsInRange(400, 500)).toHaveLength(0);
    expect(store.getEventsInRange(250, 150)).toHaveLength(0);
  });

  it('buckets events under both endpoints in time order (self-event once)', () => {
    const { store } = makeStore();
    store.setData({
      elements: elementsAbc,
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: 100 },
        { id: 'e2', sourceId: 'a', targetId: 'a', time: 200 },
        { id: 'e3', sourceId: 'a', targetId: 'c', time: 300 },
      ],
    });
    // a touched by all three; b by e1 only; indices follow the sorted order.
    expect(store.getEventIndicesForElement('a')).toEqual([0, 1, 2]);
    expect(store.getEventIndicesForElement('b')).toEqual([0]);
    expect(store.getEventIndicesForElement('c')).toEqual([2]);
    expect(store.getEventIndicesForElement('missing')).toEqual([]);
  });
});

describe('DataStore incremental mutations (§10)', () => {
  const abc = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];

  it('addEvents merges into the sorted index and widens extents', () => {
    const { store } = makeStore();
    store.setData({
      elements: abc,
      events: [{ id: 'e2', sourceId: 'a', targetId: 'b', time: 200 }],
    });
    const counts = store.addEvents([
      { id: 'e3', sourceId: 'b', targetId: 'c', time: 300 },
      { id: 'e1', sourceId: 'a', targetId: 'b', time: 100 },
    ]);
    expect(counts).toEqual({ added: 2, removed: 0, updated: 0 });
    expect(store.getEvents().map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(store.getExtent('a')).toEqual({ minTime: 100, maxTime: 200 });
    expect(store.getExtent('c')).toEqual({ minTime: 300, maxTime: 300 });
    expect(store.getEventIndicesForElement('b')).toEqual([0, 1, 2]);
  });

  it('addEvents drops invalid rows leniently and counts only the kept ones', () => {
    const { store, diagnostics } = makeStore();
    store.setData({ elements: abc, events: [] });
    const counts = store.addEvents([
      { id: 'ok', sourceId: 'a', targetId: 'b', time: 10 },
      { id: 'nan', sourceId: 'a', targetId: 'b', time: NaN },
      { id: 'dangling', sourceId: 'a', targetId: 'zzz', time: 20 },
    ]);
    expect(counts.added).toBe(1);
    expect(store.getEvents().map((e) => e.id)).toEqual(['ok']);
    expect(diagnostics.map((d) => d.code).sort()).toEqual([
      'dangling-edge',
      'invalid-time',
    ]);
  });

  it('keeps equal-time ordering stable across separate addEvents batches', () => {
    const { store } = makeStore();
    store.setData({ elements: abc, events: [] });
    store.addEvents([{ id: 'first', sourceId: 'a', targetId: 'b', time: 50 }]);
    store.addEvents([{ id: 'second', sourceId: 'b', targetId: 'c', time: 50 }]);
    expect(store.getEvents().map((e) => e.id)).toEqual(['first', 'second']);
  });

  it('removeEvents updates counts, buckets, and shrinks/clears extents', () => {
    const { store } = makeStore();
    store.setData({
      elements: abc,
      events: [
        { id: 'e1', sourceId: 'a', targetId: 'b', time: 100 },
        { id: 'e2', sourceId: 'a', targetId: 'b', time: 200 },
        { id: 'e3', sourceId: 'a', targetId: 'c', time: 300 },
      ],
    });
    const counts = store.removeEvents(['e2', 'unknown']);
    expect(counts).toEqual({ added: 0, removed: 1, updated: 0 });
    expect(store.getEvents().map((e) => e.id)).toEqual(['e1', 'e3']);
    // a's extent shrinks from [100,300] (e2 gone, but e1/e3 remain).
    expect(store.getExtent('a')).toEqual({ minTime: 100, maxTime: 300 });
    expect(store.getEventIndicesForElement('a')).toEqual([0, 1]);

    // Removing b's last event clears its extent entirely (§1: no extent).
    store.removeEvents(['e1']);
    expect(store.getExtent('b')).toBeUndefined();
    expect(store.getExtent('a')).toEqual({ minTime: 300, maxTime: 300 });
  });

  it('keeps seq monotonic so a remove-then-add preserves equal-time order', () => {
    const { store } = makeStore();
    store.setData({
      elements: abc,
      events: [
        { id: 'x', sourceId: 'a', targetId: 'b', time: 50 },
        { id: 'y', sourceId: 'a', targetId: 'b', time: 50 },
      ],
    });
    store.removeEvents(['x']);
    // A fresh insert must sort *after* the survivor at the same time, not
    // collide with a recycled seq (regression for the events.length tiebreak).
    store.addEvents([{ id: 'z', sourceId: 'a', targetId: 'b', time: 50 }]);
    expect(store.getEvents().map((e) => e.id)).toEqual(['y', 'z']);
  });

  it('addElements appends in input order and drops duplicates leniently', () => {
    const { store, diagnostics } = makeStore();
    store.setData({ elements: [{ id: 'a', label: 'A' }], events: [] });
    const counts = store.addElements([
      { id: 'b', label: 'B' },
      { id: 'a', label: 'dupe' },
      { id: 'c', label: 'C' },
    ]);
    expect(counts).toEqual({ added: 2, removed: 0, updated: 0 });
    expect(store.getElements().map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'duplicate-id', kind: 'element' }),
    );
  });

  it('updateElement merges a patch in place and keeps the id immutable', () => {
    const { store } = makeStore();
    store.setData({
      elements: [{ id: 'a', label: 'A', order: 1 }],
      events: [],
    });
    const counts = store.updateElement('a', {
      label: 'A!',
      id: 'hacker',
    } as never);
    expect(counts).toEqual({ added: 0, removed: 0, updated: 1 });
    const a = store.getElementById('a');
    expect(a).toMatchObject({ id: 'a', label: 'A!', order: 1 });
    expect(store.getElements()).toHaveLength(1);
  });

  it('updateElement on an unknown id is a no-op', () => {
    const { store } = makeStore();
    store.setData({ elements: [{ id: 'a', label: 'A' }], events: [] });
    expect(store.updateElement('missing', { label: 'X' })).toEqual({
      added: 0,
      removed: 0,
      updated: 0,
    });
  });
});
