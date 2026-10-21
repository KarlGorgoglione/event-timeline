// Adaptive tick generation for the time header (DESIGN.md §8).
//
// The generator chooses tick steps from `pxPerMs` so labels never overlap,
// picking "nice" steps from minutes up to centuries. All calendar boundaries
// are computed in UTC (native `Date.UTC` and UTC getters), so ticks and labels
// are identical on every machine and stable for golden tests.

import type { Time } from '../model/types';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../model/time';

export type TickLevel = 'year' | 'month' | 'day' | 'hour' | 'minute';

/** Which header row a label is for: the coarse `major` or the fine `minor`. */
export type TickRow = 'major' | 'minor';

export interface Tick {
  time: Time;
  level: TickLevel;
  label: string;
}

/** Two header rows: `major` (coarser, drives gridlines) over `minor`. */
export interface TickScale {
  major: Tick[];
  minor: Tick[];
  /**
   * The major period containing `tStart` (its boundary is at or before the
   * left edge), for a label pinned to the left edge; null when unknown.
   */
  current: Tick | null;
}

export type TickFormatter = (
  date: Date,
  level: TickLevel,
  row: TickRow,
) => string;

export interface TickOptions {
  /** Replaces the built-in labels. */
  formatter?: TickFormatter;
  /** Locale(s) for the built-in labels (`Intl.DateTimeFormat`). Default `'en-US'`. */
  locale?: string | readonly string[];
}

/** Average month and year lengths, used only to rank steps. */
const MONTH_MS = 30.44 * DAY_MS;
const YEAR_MS = 365.25 * DAY_MS;

interface Step {
  level: TickLevel;
  n: number;
  /** Approximate width in ms, used only for step selection. */
  approxMs: number;
}

const step = (level: TickLevel, n: number, unitMs: number): Step => ({
  level,
  n,
  approxMs: n * unitMs,
});

// Ascending by approximate width; the first whose pixel width clears the label
// gap is chosen, so labels never overlap (§8). Minute and hour steps divide a
// day evenly, so they align to UTC midnight.
const STEPS: Step[] = [
  step('minute', 1, MINUTE_MS),
  step('minute', 5, MINUTE_MS),
  step('minute', 15, MINUTE_MS),
  step('minute', 30, MINUTE_MS),
  step('hour', 1, HOUR_MS),
  step('hour', 3, HOUR_MS),
  step('hour', 6, HOUR_MS),
  step('hour', 12, HOUR_MS),
  step('day', 1, DAY_MS),
  step('day', 2, DAY_MS),
  step('day', 5, DAY_MS),
  step('day', 10, DAY_MS),
  step('month', 1, MONTH_MS),
  step('month', 3, MONTH_MS),
  step('year', 1, YEAR_MS),
  step('year', 2, YEAR_MS),
  step('year', 5, YEAR_MS),
  step('year', 10, YEAR_MS),
  step('year', 20, YEAR_MS),
  step('year', 50, YEAR_MS),
  step('year', 100, YEAR_MS),
];

function pickStep(pxPerMs: number, minLabelGapPx: number): Step {
  for (const s of STEPS) {
    if (s.approxMs * pxPerMs >= minLabelGapPx) return s;
  }
  return STEPS[STEPS.length - 1] as Step;
}

/** The next coarser step, drawn as the major row above `minor`. */
function coarserStep(minor: Step): Step {
  switch (minor.level) {
    case 'minute':
      return step('hour', 1, HOUR_MS);
    case 'hour':
      return step('day', 1, DAY_MS);
    case 'day':
      return step('month', 1, MONTH_MS);
    case 'month':
      return step('year', 1, YEAR_MS);
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

function formatOptions(
  level: TickLevel,
  row: TickRow,
): Intl.DateTimeFormatOptions {
  switch (level) {
    case 'year':
      return { year: 'numeric' };
    case 'month':
      return { month: 'short', year: 'numeric' };
    case 'day':
      return row === 'minor'
        ? { day: 'numeric' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
    case 'hour':
    case 'minute':
      return row === 'minor'
        ? { hour: '2-digit', minute: '2-digit' }
        : {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          };
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** The built-in UTC labels for `locale`. */
export function defaultTickFormatter(
  locale: string | readonly string[] = 'en-US',
): TickFormatter {
  const localeKey = typeof locale === 'string' ? locale : locale.join(',');
  return (date, level, row) => {
    const key = `${localeKey}|${level}|${row}`;
    let fmt = formatterCache.get(key);
    if (fmt === undefined) {
      fmt = new Intl.DateTimeFormat(locale as string | string[], {
        timeZone: 'UTC',
        ...formatOptions(level, row),
      });
      formatterCache.set(key, fmt);
    }
    return fmt.format(date);
  };
}

/** Tick times of `s` within `[tStart, tEnd]`, ascending. */
function enumerate(tStart: Time, tEnd: Time, s: Step): Time[] {
  const times: Time[] = [];
  if (s.level === 'minute' || s.level === 'hour') {
    const stepMs = s.approxMs;
    for (let t = Math.ceil(tStart / stepMs) * stepMs; t <= tEnd; t += stepMs) {
      times.push(t);
    }
    return times;
  }
  if (s.level === 'day') {
    // Day ticks restart on the 1st of each month so a tick always lands on
    // the month boundary; within a month they step by `n` days.
    let monthStart = Date.UTC(utcYear(tStart), utcMonth(tStart), 1);
    while (monthStart <= tEnd) {
      const year = utcYear(monthStart);
      const month = utcMonth(monthStart);
      const dim = daysInUtcMonth(year, month);
      for (let day = 1; day <= dim; day += s.n) {
        const t = Date.UTC(year, month, day);
        if (t >= tStart && t <= tEnd) times.push(t);
      }
      monthStart = Date.UTC(year, month + 1, 1);
    }
    return times;
  }
  if (s.level === 'month') {
    let year = utcYear(tStart);
    let month = Math.floor(utcMonth(tStart) / s.n) * s.n;
    let t = Date.UTC(year, month, 1);
    while (t <= tEnd) {
      if (t >= tStart) times.push(t);
      month += s.n;
      t = Date.UTC(year, month, 1);
      year = utcYear(t);
      month = utcMonth(t);
    }
    return times;
  }
  let year = Math.floor(utcYear(tStart) / s.n) * s.n;
  let t = Date.UTC(year, 0, 1);
  while (t <= tEnd) {
    if (t >= tStart) times.push(t);
    year += s.n;
    t = Date.UTC(year, 0, 1);
  }
  return times;
}

/** The last tick of `s` at or before `t`. */
function tickAtOrBefore(t: Time, s: Step): Time | null {
  // Two approximate steps back always contain a boundary (day ticks restart
  // monthly, so a fixed offset can't be used).
  const times = enumerate(t - 2 * s.approxMs, t, s);
  return times.length > 0 ? (times[times.length - 1] as Time) : null;
}

/**
 * Drop ticks closer than `minGapPx` to the previously kept one. Day ticks
 * restart on the 1st of each month, so a month boundary can place the prior
 * month's last day one day from the next month's 1st; thinning keeps those
 * labels from overlapping.
 */
function thinByPixels(
  times: Time[],
  pxPerMs: number,
  minGapPx: number,
): Time[] {
  const kept: Time[] = [];
  let lastX = -Infinity;
  for (const time of times) {
    const x = time * pxPerMs;
    if (x - lastX >= minGapPx) {
      kept.push(time);
      lastX = x;
    }
  }
  return kept;
}

/**
 * Generate the major/minor ticks visible in `[tStart, tEnd]` at the given zoom.
 * `minLabelGapPx` is the minimum pixel spacing labels need; the smallest
 * "nice" step clearing it is chosen, and overlapping boundary ticks are
 * thinned out.
 */
export function generateTicks(
  tStart: Time,
  tEnd: Time,
  pxPerMs: number,
  minLabelGapPx: number,
  options: TickFormatter | TickOptions = {},
): TickScale {
  if (tEnd <= tStart || !Number.isFinite(pxPerMs) || pxPerMs <= 0) {
    return { major: [], minor: [], current: null };
  }
  const { formatter, locale } =
    typeof options === 'function'
      ? { formatter: options, locale: undefined }
      : options;
  const format = formatter ?? defaultTickFormatter(locale);
  const minor = pickStep(pxPerMs, minLabelGapPx);
  const major = coarserStep(minor);
  const ticks = (times: Time[], s: Step, row: TickRow): Tick[] =>
    times.map((time) => ({
      time,
      level: s.level,
      label: format(new Date(time), s.level, row),
    }));
  const currentTime = tickAtOrBefore(tStart, major);
  return {
    major: ticks(
      thinByPixels(enumerate(tStart, tEnd, major), pxPerMs, minLabelGapPx),
      major,
      'major',
    ),
    minor: ticks(
      thinByPixels(enumerate(tStart, tEnd, minor), pxPerMs, minLabelGapPx),
      minor,
      'minor',
    ),
    current:
      currentTime === null
        ? null
        : (ticks([currentTime], major, 'major')[0] ?? null),
  };
}
