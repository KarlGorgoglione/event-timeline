import { describe, expect, it } from 'vitest';
import { DataStore } from '../model/store';
import type { TimelineEvent } from '../model/types';
import {
  EventAggregates,
  levelForDuration,
  type AggregateLevel,
} from './aggregates';

const elements = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id }));

function store(events: [string, string, number][]): DataStore {
  const s = new DataStore();
  s.setData({
    elements,
    events: events.map(([sourceId, targetId, time], i) => ({
      id: `e${i}`,
      sourceId,
      targetId,
      time,
    })),
  });
  return s;
}

function cells(level: AggregateLevel) {
  return Array.from({ length: level.count }, (_, c) => ({
    pair: `${level.source[c]}>${level.target[c]}`,
    tMin: level.tMin[c],
    tMax: level.tMax[c],
    size: level.size[c],
    first: level.first[c],
    last: level.last[c],
  }));
}

/** A seeded pseudo-random dataset over `pairs` element pairs. */
function random(count: number, elementCount: number, seed = 7) {
  let x = seed;
  const next = () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x / 2 ** 32;
  };
  const ids = Array.from({ length: elementCount }, (_, i) => ({
    id: `n${i}`,
    label: `N${i}`,
  }));
  const events: TimelineEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      id: `e${i}`,
      sourceId: `n${Math.floor(next() * elementCount)}`,
      targetId: `n${Math.floor(next() * elementCount)}`,
      time: Math.floor(next() * 1e6),
    });
  }
  const s = new DataStore();
  s.setData({ elements: ids, events });
  return s;
}

describe('EventAggregates (§5, §6, A-01)', () => {
  it('bins events per element pair and time bin', () => {
    const s = store([
      ['a', 'b', 0],
      ['a', 'b', 3],
      ['b', 'a', 5],
      ['a', 'b', 9], // next 8 ms bin
      ['a', 'b', 15],
    ]);
    const level = new EventAggregates().level(s, 3); // 8 ms bins
    expect(cells(level)).toEqual([
      { pair: '0>1', tMin: 0, tMax: 3, size: 2, first: 0, last: 1 },
      { pair: '1>0', tMin: 5, tMax: 5, size: 1, first: 2, last: 2 },
      { pair: '0>1', tMin: 9, tMax: 15, size: 2, first: 3, last: 4 },
    ]);
  });

  it('derives a coarser level from a finer one exactly as from the events', () => {
    const s = random(5000, 12);
    const fromLevels = new EventAggregates();
    fromLevels.level(s, 8);
    const derived = fromLevels.level(s, 13);
    const direct = new EventAggregates().level(s, 13);
    expect(cells(derived)).toEqual(cells(direct));
  });

  it('conserves every event at every level', () => {
    const s = random(3000, 6);
    const aggregates = new EventAggregates();
    for (const l of [0, 4, 10, 16, 30]) {
      const level = aggregates.level(s, l);
      let total = 0;
      for (let c = 0; c < level.count; c++) total += level.size[c]!;
      expect(total).toBe(3000);
    }
  });

  it('finds the cells whose bins meet a window', () => {
    const s = store([
      ['a', 'b', 0],
      ['a', 'b', 7],
      ['a', 'b', 8],
      ['a', 'b', 20],
      ['a', 'b', 30],
    ]);
    const aggregates = new EventAggregates();
    const level = aggregates.level(s, 3);
    // [10, 21] meets bins [8, 16) and [16, 24).
    const [lo, hi] = aggregates.window(level, 10, 21);
    expect(
      cells(level)
        .slice(lo, hi)
        .map((c) => c.tMin),
    ).toEqual([8, 20]);
    expect(aggregates.window(level, 5, 1)).toEqual([0, 0]);
  });

  it('rebuilds after the events change', () => {
    const s = store([['a', 'b', 0]]);
    const aggregates = new EventAggregates();
    expect(aggregates.level(s, 4).count).toBe(1);
    s.addEvents([{ id: 'x', sourceId: 'c', targetId: 'd', time: 1 }]);
    expect(aggregates.level(s, 4).count).toBe(2);
  });

  it('learns from a build whether the data can compress', () => {
    const dense = random(4000, 5);
    const sparse = random(4000, 2000);
    for (const [s, expected] of [
      [dense, true],
      [sparse, false],
    ] as const) {
      const aggregates = new EventAggregates();
      expect(aggregates.mayCompress(s)).toBe(true); // unknown yet
      aggregates.level(s, 10);
      expect(aggregates.mayCompress(s)).toBe(expected);
    }
  });

  it('picks the coarsest level whose bins fit in a duration', () => {
    // 12,000 ms → 2^13 = 8192 ms bins.
    expect(levelForDuration(12_000)).toBe(13);
    expect(levelForDuration(1e-8)).toBe(0);
  });
});
