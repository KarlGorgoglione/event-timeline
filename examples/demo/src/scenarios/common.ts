// Formatting and colour helpers shared by the scenarios. Dates are UTC, like
// the engine's own header (DESIGN.md §8), so every machine shows the same.

import type { ThemePreset } from '../themes/presets';
import type {
  DemoData,
  DemoElement,
  DemoEvent,
  DescribeContext,
  Description,
} from './types';

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** `14 Mar 2026` */
export const formatDate = (t: number) => dateFmt.format(t);
/** `14:12:30 UTC` */
export const formatClock = (t: number) => `${clockFmt.format(t)} UTC`;
/** `14 Mar 2026, 14:12:30 UTC` */
export const formatDateTime = (t: number) =>
  `${formatDate(t)}, ${formatClock(t)}`;

/** `$12,345` (locale-independent). */
export const usd = (n: number) =>
  `$${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** Palette colour for a category: 0 is neutral, 1–5 the series slots. */
export function slotColor(preset: ThemePreset, category = 0): string {
  if (category <= 0) return preset.palette.neutral;
  const { series } = preset.palette;
  return series[(category - 1) % series.length] as string;
}

/** The time extent of the events, or `null` when there are none. */
export function extentOf(data: DemoData): [number, number] | null {
  if (data.events.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of data.events) {
    if (e.time < lo) lo = e.time;
    if (e.time > hi) hi = e.time;
  }
  return [lo, hi];
}

/** `[start, end]` widened by `fraction` of its span on each side. */
export function padRange(
  start: number,
  end: number,
  fraction = 0.05,
): [number, number] {
  const pad = Math.max(1, (end - start) * fraction);
  return [start - pad, end + pad];
}

export function describeElementDefault(
  element: DemoElement,
  _ctx: DescribeContext,
): Description {
  return {
    title: element.label ?? element.id,
    subtitle: 'Element',
    rows: [['id', element.id]],
  };
}

export function describeEventDefault(
  event: DemoEvent,
  ctx: DescribeContext,
  formatTime: (t: number) => string,
): Description {
  return {
    title:
      event.label ??
      `${ctx.labelOf(event.sourceId)} → ${ctx.labelOf(event.targetId)}`,
    subtitle: 'Event',
    rows: [
      ['From', ctx.labelOf(event.sourceId)],
      ['To', ctx.labelOf(event.targetId)],
      ['When', formatTime(event.time)],
    ],
  };
}
