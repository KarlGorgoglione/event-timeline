import { describe, expect, it } from 'vitest';
import { DAY_MS } from './camera';
import { generateTicks } from './ticks';

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
    expect(generateTicks(100, 100, 1, GAP)).toEqual({ major: [], minor: [] });
    expect(generateTicks(0, 1000, 0, GAP)).toEqual({ major: [], minor: [] });
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
