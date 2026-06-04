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
