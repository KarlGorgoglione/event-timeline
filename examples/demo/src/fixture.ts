import type { TimelineData } from '@timeline/react';

// A small hand-built dataset (Phase 1): a few elements connected by events
// across the first half of 2026, enough to show lines starting at the correct
// times and to demonstrate horizontal pan. The seeded 50k generator used for
// perf/golden tests arrives in a later phase.
const day = (month: number, d: number) => Date.UTC(2026, month, d);

export const demoData: TimelineData = {
  elements: [
    { id: 'alice', label: 'Alice' },
    { id: 'bob', label: 'Bob' },
    { id: 'cash', label: 'Cash' },
    { id: 'carol', label: 'Carol' },
  ],
  events: [
    { id: 't1', sourceId: 'alice', targetId: 'cash', time: day(0, 5) },
    { id: 't2', sourceId: 'cash', targetId: 'bob', time: day(0, 18) },
    { id: 't3', sourceId: 'bob', targetId: 'carol', time: day(1, 3) },
    { id: 't4', sourceId: 'alice', targetId: 'bob', time: day(2, 12) },
    { id: 't5', sourceId: 'carol', targetId: 'cash', time: day(3, 1) },
    { id: 't6', sourceId: 'cash', targetId: 'cash', time: day(3, 20) },
    { id: 't7', sourceId: 'bob', targetId: 'alice', time: day(4, 9) },
    { id: 't8', sourceId: 'carol', targetId: 'bob', time: day(5, 2) },
  ],
};
