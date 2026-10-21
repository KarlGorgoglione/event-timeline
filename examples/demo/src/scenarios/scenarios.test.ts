import { describe, expect, it } from 'vitest';
import { PRESETS } from '../themes/presets';
import { parseFont } from '../themes/fonts';
import { SCENARIOS } from '.';
import { makeIncident, INCIDENT_START, INCIDENT_END } from './data/incident';
import { makeLogistics, UNOPENED_PORT } from './data/logistics';
import { makeLiveHistory, makePaymentSource } from './data/live';
import { incidentTick } from './incident';
import { PATTERNS, patternSlice } from './aml';
import { BROKEN_JSON, SAMPLE_JSON } from './playground';
import type { DemoData } from './types';

function expectValid(data: DemoData) {
  const elementIds = new Set(data.elements.map((e) => e.id));
  expect(elementIds.size).toBe(data.elements.length);
  expect(new Set(data.events.map((e) => e.id)).size).toBe(data.events.length);
  for (const e of data.events) {
    expect(elementIds.has(e.sourceId), e.id).toBe(true);
    expect(elementIds.has(e.targetId), e.id).toBe(true);
    expect(Number.isFinite(e.time), e.id).toBe(true);
    if (e.style?.labelFont !== undefined) {
      expect(parseFont(e.style.labelFont)).not.toBeNull();
    }
  }
}

describe('scenario registry', () => {
  it('has unique ids and tab labels', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(new Set(SCENARIOS.map((s) => s.short)).size).toBe(SCENARIOS.length);
  });

  it.each(SCENARIOS.filter((s) => s.id !== 'scale'))(
    '$id loads valid data and describes it',
    (scenario) => {
      const data = scenario.load(undefined);
      expectValid(data);
      const preset = PRESETS[0]!;
      const ctx = { preset, labelOf: (id: string) => id };
      for (const e of data.events.slice(0, 20)) {
        const d = scenario.describeEvent?.(e, ctx);
        if (d) expect(d.title.length).toBeGreaterThan(0);
      }
      for (const el of data.elements) {
        const d = scenario.describeElement?.(el, ctx);
        if (d) expect(d.title.length).toBeGreaterThan(0);
      }
      const focus = scenario.focus?.(data);
      if (focus) expect(focus[1]).toBeGreaterThan(focus[0]);
      for (const p of PRESETS) {
        const resolvers = scenario.resolvers?.(p);
        for (const e of data.events.slice(0, 50)) resolvers?.event?.(e);
        for (const el of data.elements) resolvers?.element?.(el);
        expect(scenario.legend?.(p).length ?? 1).toBeGreaterThan(0);
      }
    },
  );

  it('declares variants with ids the loader understands', () => {
    const scale = SCENARIOS.find((s) => s.id === 'scale')!;
    expect(scale.variants?.map((v) => v.id)).toEqual(['10k', '50k']);
    expect(scale.load('10k').events).toHaveLength(10_000);
  });
});

describe('incident data', () => {
  it('is deterministic and stays in its window', () => {
    const a = makeIncident();
    expect(makeIncident()).toEqual(a);
    expectValid(a);
    for (const e of a.events) {
      expect(e.time).toBeGreaterThanOrEqual(INCIDENT_START);
      expect(e.time).toBeLessThanOrEqual(INCIDENT_END);
    }
    const kinds = new Set(a.events.map((e) => e.data?.kind));
    for (const k of [
      'call',
      'async',
      'error',
      'retry',
      'alert',
      'deploy',
      'rollback',
    ]) {
      expect(kinds.has(k), k).toBe(true);
    }
    expect(a.events.some((e) => e.sourceId === e.targetId)).toBe(true);
    expect(
      a.events.find((e) => e.data?.kind === 'rollback')?.style,
    ).toBeDefined();
  });

  it('labels minor ticks relative to the deploy', () => {
    const deploy = Date.UTC(2026, 2, 14, 14, 12);
    expect(
      incidentTick(new Date(deploy + 15 * 60_000), 'minute', 'minor'),
    ).toBe('T+0:15');
    expect(
      incidentTick(new Date(deploy - 90 * 60_000), 'minute', 'minor'),
    ).toBe('T−1:30');
    expect(incidentTick(new Date(deploy), 'hour', 'major')).toBe('14:12 UTC');
  });
});

describe('logistics data', () => {
  it('is deterministic, ordered by region and keeps one port empty', () => {
    const a = makeLogistics();
    expect(makeLogistics()).toEqual(a);
    expectValid(a);
    const orders = a.elements.map((e) => e.order ?? NaN);
    expect(orders).toEqual([...orders].sort((x, y) => x - y));
    expect(
      a.events.some(
        (e) => e.sourceId === UNOPENED_PORT || e.targetId === UNOPENED_PORT,
      ),
    ).toBe(false);
    expect(new Set(a.events.map((e) => e.data?.mode))).toEqual(
      new Set(['sea', 'air', 'rail']),
    );
  });
});

describe('live data', () => {
  it('builds a history ending at now, with continuing ids', () => {
    const now = Date.UTC(2026, 5, 1, 12);
    const source = makePaymentSource(5, 'h');
    const history = makeLiveHistory(now, source);
    expectValid(history);
    expect(history.events.at(-1)!.time).toBeLessThanOrEqual(now);
    expect(history.events[0]!.time).toBeGreaterThanOrEqual(now - 6 * 60_000);
    const next = source.batch(3, now, now + 1000);
    expect(next.map((e) => e.id)).toEqual([
      `h-${history.events.length}`,
      `h-${history.events.length + 1}`,
      `h-${history.events.length + 2}`,
    ]);
    expect(makeLiveHistory(now, makePaymentSource(5, 'h'))).toEqual(history);
  });
});

describe('AML patterns', () => {
  it('slices every pattern out of the scenario', () => {
    const data = SCENARIOS.find((s) => s.id === 'aml')!.load(undefined);
    for (const p of PATTERNS) {
      const slice = patternSlice(data, p);
      expect(slice.events.length, p.id).toBeGreaterThan(0);
      expect(slice.range[1]).toBeGreaterThanOrEqual(slice.range[0]);
      for (const id of slice.events) {
        expect(data.events.find((e) => e.id === id)?.data?.pattern).toBe(p.id);
      }
    }
  });
});

describe('playground samples', () => {
  it('ships a valid sample and a broken one', () => {
    expectValid(JSON.parse(SAMPLE_JSON) as DemoData);
    const broken = JSON.parse(BROKEN_JSON) as DemoData;
    expect(broken.events.length).toBeGreaterThan(0);
  });
});
