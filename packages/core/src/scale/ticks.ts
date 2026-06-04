// Adaptive tick generation for the time header (DESIGN.md §8).
//
// An adaptive generator chooses tick steps from `pxPerMs` so labels never
// overlap, picking "nice" steps (1/2/5/10 days, months, quarters, years). All
// calendar boundaries are computed in **UTC** (via native `Date.UTC` + UTC
// getters) so day/month/year boundaries and labels are identical on every
// machine and stable for golden tests. (date-fns — the engine's calendar dep —
// is reserved for the richer interval/duration math of later phases; Phase 1's
// boundary stepping is pure UTC integer arithmetic, which date-fns cannot do
// without a UTC wrapper and which guarantees machine-stability here.)

import type { Time } from '../model/types';
import { DAY_MS } from './camera';

export type TickLevel = 'year' | 'month' | 'day';

export interface Tick {
  time: Time;
  level: TickLevel;
  label: string;
}

/** Two header rows: `major` (coarser, drives gridlines) over `minor`. */
export interface TickScale {
  major: Tick[];
  minor: Tick[];
}

export type TickFormatter = (date: Date, level: TickLevel) => string;

interface Step {
  level: TickLevel;
  n: number;
  /** Approximate width in ms, used only for step selection. */
  approxMs: number;
}

// Ascending by approximate width; the first whose pixel width clears the label
// gap is chosen (so labels never overlap, §8).
const STEPS: Step[] = [
  { level: 'day', n: 1, approxMs: DAY_MS },
  { level: 'day', n: 2, approxMs: 2 * DAY_MS },
  { level: 'day', n: 5, approxMs: 5 * DAY_MS },
  { level: 'day', n: 10, approxMs: 10 * DAY_MS },
  { level: 'month', n: 1, approxMs: 30 * DAY_MS },
  { level: 'month', n: 3, approxMs: 91 * DAY_MS },
  { level: 'year', n: 1, approxMs: 365 * DAY_MS },
  { level: 'year', n: 2, approxMs: 730 * DAY_MS },
  { level: 'year', n: 5, approxMs: 1826 * DAY_MS },
  { level: 'year', n: 10, approxMs: 3652 * DAY_MS },
];

function pickStep(pxPerMs: number, minLabelGapPx: number): Step {
  for (const step of STEPS) {
    if (step.approxMs * pxPerMs >= minLabelGapPx) return step;
  }
  return STEPS[STEPS.length - 1] as Step;
}

/** The next coarser step row drawn above `minor`. */
function coarserStep(minor: Step): Step {
  switch (minor.level) {
    case 'day':
      return { level: 'month', n: 1, approxMs: 30 * DAY_MS };
    case 'month':
      return { level: 'year', n: 1, approxMs: 365 * DAY_MS };
    case 'year':
      return { level: 'year', n: minor.n * 10, approxMs: minor.approxMs * 10 };
  }
}

function utcYear(t: Time): number {
  return new Date(t).getUTCFullYear();
}
function utcMonth(t: Time): number {
  return new Date(t).getUTCMonth();
}
function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

const formatterCache = new Map<TickLevel, Intl.DateTimeFormat>();
function defaultFormat(date: Date, level: TickLevel): string {
  let fmt = formatterCache.get(level);
  if (fmt === undefined) {
    const options: Intl.DateTimeFormatOptions =
      level === 'year'
        ? { timeZone: 'UTC', year: 'numeric' }
        : level === 'month'
          ? { timeZone: 'UTC', month: 'short', year: 'numeric' }
          : { timeZone: 'UTC', day: 'numeric' };
    fmt = new Intl.DateTimeFormat('en-US', options);
    formatterCache.set(level, fmt);
  }
  return fmt.format(date);
}

function makeTick(time: Time, level: TickLevel, format: TickFormatter): Tick {
  return { time, level, label: format(new Date(time), level) };
}

function enumerate(
  tStart: Time,
  tEnd: Time,
  step: Step,
  format: TickFormatter,
): Tick[] {
  const ticks: Tick[] = [];
  if (step.level === 'day') {
    // Day ticks restart on the 1st of each month so a tick always lands on the
    // month boundary; within a month they step by `n` days.
    let monthStart = Date.UTC(utcYear(tStart), utcMonth(tStart), 1);
    while (monthStart <= tEnd) {
      const year = utcYear(monthStart);
      const month = utcMonth(monthStart);
      const dim = daysInUtcMonth(year, month);
      for (let day = 1; day <= dim; day += step.n) {
        const t = Date.UTC(year, month, day);
        if (t >= tStart && t <= tEnd) ticks.push(makeTick(t, 'day', format));
      }
      monthStart = Date.UTC(year, month + 1, 1);
    }
    return ticks;
  }
  if (step.level === 'month') {
    const startMonth = Math.floor(utcMonth(tStart) / step.n) * step.n;
    let year = utcYear(tStart);
    let month = startMonth;
    let t = Date.UTC(year, month, 1);
    while (t <= tEnd) {
      if (t >= tStart) ticks.push(makeTick(t, 'month', format));
      month += step.n;
      t = Date.UTC(year, month, 1);
      year = utcYear(t);
      month = utcMonth(t);
    }
    return ticks;
  }
  // year
  let year = Math.floor(utcYear(tStart) / step.n) * step.n;
  let t = Date.UTC(year, 0, 1);
  while (t <= tEnd) {
    if (t >= tStart) ticks.push(makeTick(t, 'year', format));
    year += step.n;
    t = Date.UTC(year, 0, 1);
  }
  return ticks;
}

/**
 * Drop ticks closer than `minGapPx` to the previously kept one. Day ticks
 * restart on the 1st of each month, so a month boundary can place the prior
 * month's last day a single day from the next month's 1st; thinning keeps those
 * labels from overlapping (the "31 1" collision).
 */
function thinByPixels(
  ticks: Tick[],
  pxPerMs: number,
  minGapPx: number,
): Tick[] {
  const kept: Tick[] = [];
  let lastX = -Infinity;
  for (const tick of ticks) {
    const x = tick.time * pxPerMs;
    if (x - lastX >= minGapPx) {
      kept.push(tick);
      lastX = x;
    }
  }
  return kept;
}

/**
 * Generate the major/minor ticks visible in `[tStart, tEnd]` at the given zoom.
 * `minLabelGapPx` is the minimum pixel spacing labels need; the smallest "nice"
 * step clearing it is chosen, and overlapping boundary ticks are thinned out.
 */
export function generateTicks(
  tStart: Time,
  tEnd: Time,
  pxPerMs: number,
  minLabelGapPx: number,
  formatTick: TickFormatter = defaultFormat,
): TickScale {
  if (tEnd <= tStart || !Number.isFinite(pxPerMs) || pxPerMs <= 0) {
    return { major: [], minor: [] };
  }
  const minor = pickStep(pxPerMs, minLabelGapPx);
  const major = coarserStep(minor);
  return {
    major: thinByPixels(
      enumerate(tStart, tEnd, major, formatTick),
      pxPerMs,
      minLabelGapPx,
    ),
    minor: thinByPixels(
      enumerate(tStart, tEnd, minor, formatTick),
      pxPerMs,
      minLabelGapPx,
    ),
  };
}
