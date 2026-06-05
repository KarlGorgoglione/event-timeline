import type { TimelineData } from '@event-timeline/react';
import type { DemoDatum } from './synthetic';

// A small hand-built dataset exercising every Phase 2 feature: direction-aware
// arrows with labels, element labels + icons (a data-URI image and an emoji), a
// self-event (cash → cash), and a long-range crossing event (alice → carol) that
// spans every row so vertical row-interval culling can be observed when scrolled.
//
// Each item carries a `DemoDatum` category (§11) so the demo's data-driven style
// resolvers paint it from the payload — exactly as they do for the synthetic set.
// Events inherit their source element's category so colour flows along the arrow.
const day = (month: number, d: number) => Date.UTC(2026, month, d);

// A tiny inline SVG so the icon always loads (no network) in the demo and tests.
const blueSquare =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' " +
  "width='16' height='16'%3E%3Crect width='16' height='16' rx='3' " +
  "fill='%235aa0ff'/%3E%3C/svg%3E";

// One category bucket per element; events below inherit their source's bucket.
const category = { alice: 0, bob: 1, cash: 2, carol: 3 } as const;

export const demoData: TimelineData<DemoDatum> = {
  elements: [
    {
      id: 'alice',
      label: 'Alice',
      icon: blueSquare,
      data: { category: category.alice },
    },
    { id: 'bob', label: 'Bob', data: { category: category.bob } },
    {
      id: 'cash',
      label: 'Cash',
      icon: '🏦',
      data: { category: category.cash },
    },
    { id: 'carol', label: 'Carol', data: { category: category.carol } },
  ],
  events: [
    {
      id: 't1',
      sourceId: 'alice',
      targetId: 'cash',
      time: day(0, 5),
      label: '$5,000',
      data: { category: category.alice },
    },
    {
      id: 't2',
      sourceId: 'cash',
      targetId: 'bob',
      time: day(0, 18),
      label: '$1,200',
      data: { category: category.cash },
    },
    {
      id: 't3',
      sourceId: 'bob',
      targetId: 'carol',
      time: day(1, 3),
      label: '$800',
      data: { category: category.bob },
    },
    {
      id: 't4',
      sourceId: 'alice',
      targetId: 'bob',
      time: day(2, 12),
      label: '$3,400',
      data: { category: category.alice },
    },
    {
      id: 't5',
      sourceId: 'carol',
      targetId: 'cash',
      time: day(3, 1),
      label: '$2,000',
      data: { category: category.carol },
    },
    {
      id: 't6',
      sourceId: 'cash',
      targetId: 'cash',
      time: day(3, 20),
      label: 'fee',
      data: { category: category.cash },
    },
    {
      id: 't7',
      sourceId: 'bob',
      targetId: 'alice',
      time: day(4, 9),
      label: '$600',
      data: { category: category.bob },
    },
    {
      id: 't8',
      sourceId: 'carol',
      targetId: 'bob',
      time: day(5, 2),
      label: '$900',
      data: { category: category.carol },
    },
    {
      id: 't9',
      sourceId: 'alice',
      targetId: 'carol',
      time: day(4, 20),
      label: '$7,500',
      data: { category: category.alice },
    },
  ],
};
