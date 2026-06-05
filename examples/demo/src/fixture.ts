import type { TimelineData } from '@event-timeline/react';
import type { DemoDatum } from './synthetic';

// A hand-built dataset (10 elements, ~24 events) exercising every Phase 2
// feature: direction-aware arrows with labels, element labels + icons (data-URI
// SVGs — a person glyph and a banknote), a self-event (cash → cash), and
// long-range crossing events
// that span many rows so vertical row-interval culling can be observed when
// scrolled. It models a small money-flow network over ~six months.
//
// Each item carries a `DemoDatum` category (§11) so the demo's data-driven style
// resolvers paint it from the payload — exactly as they do for the synthetic set.
// Events inherit their source element's category so colour flows along the arrow.
const day = (month: number, d: number) => Date.UTC(2026, month, d);

// Inline SVG data-URIs so the icons always load (no network) in the demo and
// tests. A person glyph for the people accounts and a banknote for the bank.
const personIcon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' " +
  "width='16' height='16' viewBox='0 0 16 16'%3E" +
  "%3Ccircle cx='8' cy='5' r='3' fill='%235aa0ff'/%3E" +
  "%3Cpath d='M2.5 14a5.5 5.5 0 0 1 11 0z' fill='%235aa0ff'/%3E" +
  '%3C/svg%3E';

const banknoteIcon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' " +
  "width='16' height='16' viewBox='0 0 16 16'%3E" +
  "%3Crect x='1' y='4' width='14' height='8' rx='1.5' fill='%2398c379'/%3E" +
  "%3Ccircle cx='8' cy='8' r='2.2' fill='none' stroke='%232b4d31' " +
  "stroke-width='1'/%3E" +
  "%3Ccircle cx='3.4' cy='8' r='0.7' fill='%232b4d31'/%3E" +
  "%3Ccircle cx='12.6' cy='8' r='0.7' fill='%232b4d31'/%3E" +
  '%3C/svg%3E';

// One category bucket per element (0–4 map to the demo palette); events below
// inherit their source's bucket. Spread across the palette so colours vary and
// at least one element lands on bucket 1 (green), which the theming e2e asserts.
const category = {
  alice: 0,
  bob: 1,
  cash: 2,
  carol: 3,
  dave: 4,
  erin: 0,
  frank: 1,
  grace: 2,
  heidi: 3,
  ivan: 4,
} as const;

export const demoData: TimelineData<DemoDatum> = {
  elements: [
    {
      id: 'alice',
      label: 'Alice',
      icon: personIcon,
      data: { category: category.alice },
    },
    {
      id: 'bob',
      label: 'Bob',
      icon: personIcon,
      data: { category: category.bob },
    },
    {
      id: 'cash',
      label: 'Cash',
      icon: banknoteIcon,
      data: { category: category.cash },
    },
    {
      id: 'carol',
      label: 'Carol',
      icon: personIcon,
      data: { category: category.carol },
    },
    {
      id: 'dave',
      label: 'Dave',
      icon: personIcon,
      data: { category: category.dave },
    },
    {
      id: 'erin',
      label: 'Erin',
      icon: personIcon,
      data: { category: category.erin },
    },
    {
      id: 'frank',
      label: 'Frank',
      icon: personIcon,
      data: { category: category.frank },
    },
    {
      id: 'grace',
      label: 'Grace',
      icon: personIcon,
      data: { category: category.grace },
    },
    {
      id: 'heidi',
      label: 'Heidi',
      icon: personIcon,
      data: { category: category.heidi },
    },
    {
      id: 'ivan',
      label: 'Ivan',
      icon: personIcon,
      data: { category: category.ivan },
    },
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
      time: day(1, 12),
      label: '$3,400',
      data: { category: category.alice },
    },
    {
      id: 't5',
      sourceId: 'carol',
      targetId: 'cash',
      time: day(1, 24),
      label: '$2,000',
      data: { category: category.carol },
    },
    {
      id: 't6',
      sourceId: 'cash',
      targetId: 'cash',
      time: day(2, 2),
      label: 'fee',
      data: { category: category.cash },
    },
    {
      id: 't7',
      sourceId: 'dave',
      targetId: 'erin',
      time: day(2, 9),
      label: '$1,500',
      data: { category: category.dave },
    },
    {
      id: 't8',
      sourceId: 'erin',
      targetId: 'frank',
      time: day(2, 16),
      label: '$1,450',
      data: { category: category.erin },
    },
    {
      id: 't9',
      sourceId: 'alice',
      targetId: 'carol',
      time: day(2, 20),
      label: '$7,500',
      data: { category: category.alice },
    },
    {
      id: 't10',
      sourceId: 'bob',
      targetId: 'alice',
      time: day(2, 28),
      label: '$600',
      data: { category: category.bob },
    },
    {
      id: 't11',
      sourceId: 'frank',
      targetId: 'grace',
      time: day(3, 4),
      label: '$2,200',
      data: { category: category.frank },
    },
    {
      id: 't12',
      sourceId: 'grace',
      targetId: 'cash',
      time: day(3, 11),
      label: '$900',
      data: { category: category.grace },
    },
    {
      id: 't13',
      sourceId: 'carol',
      targetId: 'bob',
      time: day(3, 15),
      label: '$1,100',
      data: { category: category.carol },
    },
    {
      id: 't14',
      sourceId: 'heidi',
      targetId: 'ivan',
      time: day(3, 22),
      label: '$3,000',
      data: { category: category.heidi },
    },
    {
      id: 't15',
      // Long-range crossing: spans almost every row to exercise culling.
      sourceId: 'alice',
      targetId: 'ivan',
      time: day(3, 27),
      label: '$12,000',
      data: { category: category.alice },
    },
    {
      id: 't16',
      sourceId: 'ivan',
      targetId: 'grace',
      time: day(4, 3),
      label: '$2,800',
      data: { category: category.ivan },
    },
    {
      id: 't17',
      sourceId: 'dave',
      targetId: 'cash',
      time: day(4, 8),
      label: '$1,750',
      data: { category: category.dave },
    },
    {
      id: 't18',
      sourceId: 'cash',
      targetId: 'heidi',
      time: day(4, 14),
      label: '$4,200',
      data: { category: category.cash },
    },
    {
      id: 't19',
      sourceId: 'erin',
      targetId: 'alice',
      time: day(4, 21),
      label: '$500',
      data: { category: category.erin },
    },
    {
      id: 't20',
      sourceId: 'frank',
      targetId: 'dave',
      time: day(4, 26),
      label: '$1,300',
      data: { category: category.frank },
    },
    {
      id: 't21',
      // Long-range crossing in the other direction.
      sourceId: 'heidi',
      targetId: 'alice',
      time: day(5, 2),
      label: '$6,400',
      data: { category: category.heidi },
    },
    {
      id: 't22',
      sourceId: 'grace',
      targetId: 'frank',
      time: day(5, 9),
      label: '$700',
      data: { category: category.grace },
    },
    {
      id: 't23',
      sourceId: 'bob',
      targetId: 'heidi',
      time: day(5, 16),
      label: '$2,500',
      data: { category: category.bob },
    },
    {
      id: 't24',
      sourceId: 'ivan',
      targetId: 'cash',
      time: day(5, 23),
      label: '$3,900',
      data: { category: category.ivan },
    },
  ],
};
