import type { TimelineData } from '@timeline/react';

// A small hand-built dataset exercising every Phase 2 feature: direction-aware
// arrows with labels, element labels + icons (a data-URI image and an emoji), a
// self-event (cash → cash), and a long-range crossing event (alice → carol) that
// spans every row so vertical row-interval culling can be observed when scrolled.
const day = (month: number, d: number) => Date.UTC(2026, month, d);

// A tiny inline SVG so the icon always loads (no network) in the demo and tests.
const blueSquare =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' " +
  "width='16' height='16'%3E%3Crect width='16' height='16' rx='3' " +
  "fill='%235aa0ff'/%3E%3C/svg%3E";

export const demoData: TimelineData = {
  elements: [
    { id: 'alice', label: 'Alice', icon: blueSquare },
    { id: 'bob', label: 'Bob' },
    { id: 'cash', label: 'Cash', icon: '🏦' },
    { id: 'carol', label: 'Carol' },
  ],
  events: [
    {
      id: 't1',
      sourceId: 'alice',
      targetId: 'cash',
      time: day(0, 5),
      label: '$5,000',
    },
    {
      id: 't2',
      sourceId: 'cash',
      targetId: 'bob',
      time: day(0, 18),
      label: '$1,200',
    },
    {
      id: 't3',
      sourceId: 'bob',
      targetId: 'carol',
      time: day(1, 3),
      label: '$800',
    },
    {
      id: 't4',
      sourceId: 'alice',
      targetId: 'bob',
      time: day(2, 12),
      label: '$3,400',
    },
    {
      id: 't5',
      sourceId: 'carol',
      targetId: 'cash',
      time: day(3, 1),
      label: '$2,000',
    },
    {
      id: 't6',
      sourceId: 'cash',
      targetId: 'cash',
      time: day(3, 20),
      label: 'fee',
    },
    {
      id: 't7',
      sourceId: 'bob',
      targetId: 'alice',
      time: day(4, 9),
      label: '$600',
    },
    {
      id: 't8',
      sourceId: 'carol',
      targetId: 'bob',
      time: day(5, 2),
      label: '$900',
    },
    {
      id: 't9',
      sourceId: 'alice',
      targetId: 'carol',
      time: day(4, 20),
      label: '$7,500',
    },
  ],
};
