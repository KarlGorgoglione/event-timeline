import { MS_PER_HOUR } from '../app/options';
import { describeEventDefault, formatDateTime } from './common';
import type { DemoData, Scenario } from './types';

const day = (d: number, h = 9) => Date.UTC(2026, 2, d, h);

/** A small release pipeline, styled per item (`style` on elements and events). */
const SAMPLE: DemoData = {
  elements: [
    { id: 'product', label: 'Product', icon: '🧭' },
    { id: 'design', label: 'Design', icon: '🎨' },
    { id: 'frontend', label: 'Frontend', icon: '🖥️' },
    { id: 'backend', label: 'Backend', icon: '🛠️' },
    { id: 'qa', label: 'QA', icon: '🧪' },
    { id: 'release', label: 'Release', icon: '🚀' },
    {
      id: 'customers',
      label: 'Customers',
      icon: '👥',
      style: { lineDash: [4, 4] },
    },
  ],
  events: [
    {
      id: 'brief',
      sourceId: 'product',
      targetId: 'design',
      time: day(2),
      label: 'brief',
    },
    {
      id: 'mocks',
      sourceId: 'design',
      targetId: 'frontend',
      time: day(4),
      label: 'mock-ups',
    },
    {
      id: 'spec',
      sourceId: 'product',
      targetId: 'backend',
      time: day(3),
      label: 'API spec',
    },
    {
      id: 'api',
      sourceId: 'backend',
      targetId: 'frontend',
      time: day(6),
      label: 'API v1',
    },
    {
      id: 'build-1',
      sourceId: 'frontend',
      targetId: 'qa',
      time: day(9),
      label: 'build 1',
    },
    {
      id: 'bug',
      sourceId: 'qa',
      targetId: 'backend',
      time: day(10),
      label: 'bug #42',
      style: { arrowColor: '#e5484d', arrowWidth: 2 },
    },
    {
      id: 'fix',
      sourceId: 'backend',
      targetId: 'qa',
      time: day(11),
      label: 'fix',
    },
    {
      id: 'refactor',
      sourceId: 'frontend',
      targetId: 'frontend',
      time: day(11, 15),
      label: 'refactor',
    },
    {
      id: 'build-2',
      sourceId: 'frontend',
      targetId: 'qa',
      time: day(12),
      label: 'build 2',
    },
    {
      id: 'go',
      sourceId: 'qa',
      targetId: 'release',
      time: day(13),
      label: 'sign-off',
    },
    {
      id: 'ship',
      sourceId: 'release',
      targetId: 'customers',
      time: day(16),
      label: 'v1.0 🎉',
      style: { arrowWidth: 3, arrowheadSize: 9 },
    },
    {
      id: 'feedback',
      sourceId: 'customers',
      targetId: 'product',
      time: day(20),
      label: 'feedback',
      style: { arrowDash: [6, 4] },
    },
  ],
};

/** Every diagnostic code the data path reports (§1), one item each. */
const BROKEN = {
  elements: [
    { id: 'api', label: 'API', icon: '🛠️' },
    { id: 'web', label: 'Web', icon: './icons/missing.png' },
    { id: 'api', label: 'Duplicate of api' },
    { id: '', label: 'No id' },
    { id: 'db', label: 42 },
  ],
  events: [
    {
      id: 'e1',
      sourceId: 'web',
      targetId: 'api',
      time: day(14, 9),
      label: 'GET /orders',
    },
    {
      id: 'e2',
      sourceId: 'api',
      targetId: 'ghost',
      time: day(14, 10),
      label: 'to nowhere',
    },
    { id: 'e3', sourceId: 'api', targetId: 'db', time: 'yesterday' },
    { id: 'e1', sourceId: 'api', targetId: 'web', time: day(14, 11) },
    {
      id: 'e4',
      sourceId: 'db',
      targetId: 'api',
      time: day(14, 12),
      label: 'rows',
      style: { labelFont: '1em serif' },
    },
    {
      id: 'e5',
      sourceId: 'api',
      targetId: 'web',
      time: day(14, 13),
      label: '200 OK',
    },
  ],
};

export const SAMPLE_JSON = JSON.stringify(SAMPLE, null, 2);
export const BROKEN_JSON = JSON.stringify(BROKEN, null, 2);

export const playground: Scenario = {
  id: 'playground',
  short: 'Playground',
  title: 'Playground',
  tagline: 'Bring your own data',
  summary:
    'Edit the JSON and apply it. Validation is lenient: invalid items are ' +
    'dropped or repaired and reported through onDiagnostic, never thrown. ' +
    'Load the broken sample to see every diagnostic code. Times are ' +
    'milliseconds since the epoch, UTC.',
  tryThis: [
    'Load the broken sample: each bad item shows up in the diagnostics list.',
    'Add a "style" to any item to override the theme for it alone.',
    'Use Export to copy whatever the timeline holds now, edits included.',
  ],
  load: () => SAMPLE,
  hooks: { colours: false },
  options: { multiSelect: true },
  focus: () => null,
  nudgeMs: 6 * MS_PER_HOUR,
  formatTime: formatDateTime,
  describeEvent: (event, ctx) =>
    describeEventDefault(event, ctx, formatDateTime),
  accessibility: {
    label: 'Playground timeline',
    description: 'A timeline of user-supplied data.',
  },
};
