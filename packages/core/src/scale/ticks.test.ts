import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../model/time';
import { defaultTickFormatter, generateTicks } from './ticks';

const GAP = 60;
/** Build a pxPerMs that renders one day at `dayWidthPx`. */
const pxForDayWidth = (dayWidthPx: number) => dayWidthPx / DAY_MS;

describe('generateTicks step selection', () => {
  it('picks day-level ticks when a day is wide', () => {
    const tStart = Date.UTC(2026, 0, 1);
    const tEnd = Date.UTC(2026, 0, 10);
    const { minor, major } = generateTicks(
      tStart,
      tEnd,
      pxForDayWidth(100),
      GAP,
    );
    expect(minor[0]?.level).toBe('day');
    expect(minor.map((t) => t.time)).toEqual([
      ...Array.from({ length: 10 }, (_, i) => Date.UTC(2026, 0, i + 1)),
    ]);
    // major is one level coarser: month
    expect(major[0]?.level).toBe('month');
  });

  it('chooses the smallest nice day-step that clears the label gap', () => {
    const tStart = Date.UTC(2026, 0, 1);
    const tEnd = Date.UTC(2026, 1, 28);
    // day=15px → day5 = 75px ≥ 60, day2 = 30px < 60 ⇒ step of 5 days
    const five = generateTicks(tStart, tEnd, pxForDayWidth(15), GAP);
    expect((five.minor[1]?.time ?? 0) - (five.minor[0]?.time ?? 0)).toBe(
      5 * DAY_MS,
    );
    // day=10px → day5 = 50px < 60, day10 = 100px ≥ 60 ⇒ step of 10 days
    const ten = generateTicks(tStart, tEnd, pxForDayWidth(10), GAP);
    expect((ten.minor[1]?.time ?? 0) - (ten.minor[0]?.time ?? 0)).toBe(
      10 * DAY_MS,
    );
  });

  it('falls back to month ticks (major year) at low zoom', () => {
    const tStart = Date.UTC(2026, 0, 1);
    const tEnd = Date.UTC(2026, 5, 1);
    const { minor, major } = generateTicks(tStart, tEnd, pxForDayWidth(2), GAP);
    expect(minor[0]?.level).toBe('month');
    expect(major[0]?.level).toBe('year');
  });

  it('falls back to year ticks at very low zoom', () => {
    const tStart = Date.UTC(2020, 0, 1);
    const tEnd = Date.UTC(2026, 0, 1);
    const { minor } = generateTicks(tStart, tEnd, pxForDayWidth(0.5), GAP);
    expect(minor[0]?.level).toBe('year');
  });
});

describe('generateTicks UTC stability', () => {
  it('emits exact UTC boundary times and labels', () => {
    const tStart = Date.UTC(2026, 0, 1);
    const tEnd = Date.UTC(2026, 2, 1);
    // dayWidth 3 keeps even short February clear of the label gap.
    const { minor, major } = generateTicks(tStart, tEnd, pxForDayWidth(3), GAP);
    expect(minor).toEqual([
      { time: Date.UTC(2026, 0, 1), level: 'month', label: 'Jan 2026' },
      { time: Date.UTC(2026, 1, 1), level: 'month', label: 'Feb 2026' },
      { time: Date.UTC(2026, 2, 1), level: 'month', label: 'Mar 2026' },
    ]);
    expect(major).toEqual([
      { time: Date.UTC(2026, 0, 1), level: 'year', label: '2026' },
    ]);
  });
});

describe('generateTicks guards', () => {
  it('returns empty for a non-positive range or zoom', () => {
    const empty = { major: [], minor: [], current: null };
    expect(generateTicks(100, 100, 1, GAP)).toEqual(empty);
    expect(generateTicks(0, 1000, 0, GAP)).toEqual(empty);
  });

  it('honours a custom label formatter', () => {
    const tStart = Date.UTC(2026, 0, 1);
    const tEnd = Date.UTC(2026, 0, 5);
    const { minor } = generateTicks(
      tStart,
      tEnd,
      pxForDayWidth(100),
      GAP,
      (date) => `d${date.getUTCDate()}`,
    );
    expect(minor[0]?.label).toBe('d1');
  });
});

const HOUR = 3_600_000;

describe('generateTicks sub-day steps (§8)', () => {
  it('uses hour ticks under a day header when a day is very wide', () => {
    const tStart = Date.UTC(2026, 0, 1, 0);
    const tEnd = Date.UTC(2026, 0, 1, 12);
    // 1h = 100px at 2400px/day → hourly ticks clear a 60px gap.
    const { minor, major } = generateTicks(
      tStart,
      tEnd,
      pxForDayWidth(2400),
      GAP,
    );
    expect(minor[0]?.level).toBe('hour');
    expect(minor.map((t) => t.time)).toEqual(
      Array.from({ length: 13 }, (_, i) => tStart + i * HOUR),
    );
    expect(minor[1]?.label).toBe('01:00 AM');
    expect(major[0]).toMatchObject({ level: 'day', label: 'Jan 1, 2026' });
  });

  it('steps by 3/6/12 hours aligned to UTC midnight', () => {
    const tStart = Date.UTC(2026, 0, 1, 1);
    const tEnd = Date.UTC(2026, 0, 2, 1);
    // 3h = 75px at 600px/day; 1h = 25px is too tight.
    const { minor } = generateTicks(tStart, tEnd, pxForDayWidth(600), GAP);
    expect(minor.map((t) => new Date(t.time).getUTCHours())).toEqual([
      3, 6, 9, 12, 15, 18, 21, 0,
    ]);
  });

  it('uses minute ticks under an hour header at deep zoom', () => {
    const tStart = Date.UTC(2026, 0, 1, 10, 0);
    const tEnd = Date.UTC(2026, 0, 1, 10, 30);
    const pxPerMs = 100 / (5 * 60_000); // 5 minutes = 100px
    const { minor, major } = generateTicks(tStart, tEnd, pxPerMs, GAP);
    expect(minor[0]?.level).toBe('minute');
    expect(minor[1]!.time - minor[0]!.time).toBe(5 * 60_000);
    expect(major[0]?.level).toBe('hour');
  });

  it('never runs out of ticks at the deepest zoom', () => {
    const tStart = Date.UTC(2026, 0, 1, 10, 0, 30);
    const tEnd = tStart + 10 * 60_000;
    const { minor } = generateTicks(tStart, tEnd, 1, GAP);
    expect(minor.length).toBeGreaterThan(0);
  });
});

describe('generateTicks current period (§8 sticky label)', () => {
  it('reports the major period containing the left edge', () => {
    const tStart = Date.UTC(2026, 2, 17);
    const tEnd = Date.UTC(2026, 3, 20);
    const { current, major } = generateTicks(
      tStart,
      tEnd,
      pxForDayWidth(100),
      GAP,
    );
    expect(current).toEqual({
      time: Date.UTC(2026, 2, 1),
      level: 'month',
      label: 'Mar 2026',
    });
    expect(major.map((t) => t.label)).toEqual(['Apr 2026']);
  });
});

describe('defaultTickFormatter locale (§8)', () => {
  it('formats in the given locale, always in UTC', () => {
    const date = new Date(Date.UTC(2026, 2, 4, 15, 30));
    expect(defaultTickFormatter('de-DE')(date, 'month', 'major')).toBe(
      'März 2026',
    );
    expect(defaultTickFormatter('en-GB')(date, 'hour', 'minor')).toBe('15:30');
    expect(defaultTickFormatter()(date, 'day', 'minor')).toBe('4');
  });

  it('passes the locale through generateTicks options', () => {
    const { minor } = generateTicks(
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 2, 1),
      pxForDayWidth(3),
      GAP,
      { locale: 'fr-FR' },
    );
    expect(minor[0]?.label).toBe('janv. 2026');
  });

  it('tells a custom formatter which header row a label is for', () => {
    const rows: string[] = [];
    generateTicks(
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 0, 3),
      pxForDayWidth(100),
      GAP,
      {
        formatter: (_d, level, row) => {
          rows.push(`${level}/${row}`);
          return '';
        },
      },
    );
    expect(new Set(rows)).toEqual(new Set(['day/minor', 'month/major']));
  });
});
