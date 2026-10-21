import { describe, expect, it } from 'vitest';
import { byDay } from '../cluster/strategies';
import type { ClusterStrategy } from '../cluster/types';
import type { TimelineData, TimelineEvent } from '../model/types';
import { testFrame } from '../testing/frame';
import type { SceneOutput } from './output';
import { clusterMembers, TargetKind } from './targets';

// Zoomed-out aggregation (§6, A-01): past `maxMarkers`, pair-keyed clustering
// reads per-pair time bins instead of the events, and still accounts for
// every event exactly once.

/** `count` events with seeded random pairs over `elements` elements. */
function randomData(
  count: number,
  elements: number,
  { span = 1e6, seed = 3 } = {},
): TimelineData {
  let x = seed;
  const next = () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x / 2 ** 32;
  };
  const events: TimelineEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      id: `e${i}`,
      sourceId: `n${Math.floor(next() * elements)}`,
      targetId: `n${Math.floor(next() * elements)}`,
      time: Math.floor(next() * span),
    });
  }
  return {
    elements: Array.from({ length: elements }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
    })),
    events,
  };
}

/** One pair a→b with `perTime` events at each multiple of `step` ms. */
function stackedData(times: number, perTime: number, step = 1000) {
  const events: TimelineEvent[] = [];
  for (let k = 0; k < times; k++) {
    for (let j = 0; j < perTime; j++) {
      events.push({
        id: `e${k}-${j}`,
        sourceId: 'a',
        targetId: 'b',
        time: k * step,
      });
    }
  }
  return {
    elements: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    events,
  };
}

/** Events accounted for by the frame's event and cluster targets. */
function summary(out: SceneOutput) {
  let events = 0;
  let markers = 0;
  let lazy = 0;
  for (let i = 0; i < out.targets.count; i++) {
    const t = out.targets.at(i);
    if (t.kind === TargetKind.Event) {
      events++;
      markers++;
    } else if (t.kind === TargetKind.Cluster) {
      events += t.count;
      markers++;
      if (t.lazy) lazy++;
    }
  }
  return { events, markers, lazy };
}

/** A camera framing [0, span] across an 800px viewport. */
const fitted = (span = 1e6) => ({ originTime: 0, pxPerMs: 800 / span });

/** Tall enough that every row of `elements` rows is in the band. */
const tall = (elements: number) => 44 + elements * 34 + 20;

describe('zoomed-out aggregation (§6, A-01)', () => {
  it('aggregates dense pairs past the budget, conserving every event', () => {
    const data = randomData(6000, 4);
    const { out } = testFrame(data, {
      clustering: { maxMarkers: 100 },
      camera: fitted(),
      height: tall(4),
    });
    const s = summary(out);
    expect(s.lazy).toBeGreaterThan(0);
    expect(s.events).toBe(6000);
    expect(s.markers).toBeLessThanOrEqual(100);
  });

  it('draws the same events as the event path', () => {
    const data = randomData(6000, 4, { seed: 11 });
    const options = { camera: fitted(), height: tall(4) };
    const aggregated = testFrame(data, {
      ...options,
      clustering: { maxMarkers: 100 },
    });
    const eventPath = testFrame(data, {
      ...options,
      clustering: { maxMarkers: Infinity },
    });
    expect(summary(eventPath.out).lazy).toBe(0);
    expect(summary(aggregated.out).events).toBe(summary(eventPath.out).events);
  });

  it('only counts events whose rows meet the band', () => {
    const data = randomData(6000, 30);
    const { out } = testFrame(data, {
      clustering: { maxMarkers: 50 },
      camera: fitted(),
      height: 44 + 5 * 34, // ~5 rows of 30
    });
    const eventPath = testFrame(data, {
      clustering: { maxMarkers: Infinity },
      camera: fitted(),
      height: 44 + 5 * 34,
    });
    expect(summary(out).events).toBe(summary(eventPath.out).events);
    expect(summary(out).events).toBeLessThan(6000);
  });

  it('resolves a lazy cluster to exactly its events', () => {
    const data = randomData(6000, 4, { seed: 5 });
    const { out, store } = testFrame(data, {
      clustering: { maxMarkers: 100 },
      camera: fitted(),
      height: tall(4),
    });
    let checked = 0;
    for (let i = 0; i < out.targets.count; i++) {
      const t = out.targets.at(i);
      if (t.kind !== TargetKind.Cluster || !t.lazy) continue;
      const members = clusterMembers(t, out.targets, store);
      expect(members).toHaveLength(t.count);
      expect(members[0]).toBe(t.firstEvent);
      expect(members[members.length - 1]).toBe(t.lastEvent);
      for (const m of members) {
        expect(store.eventSources[m]).toBe(t.pairSource);
        expect(store.eventTargets[m]).toBe(t.pairTarget);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps sparse data, whose pairs are as many as its events, on the event path', () => {
    const data = randomData(3000, 300);
    const { out } = testFrame(data, {
      clustering: { maxMarkers: 100 },
      camera: fitted(),
      height: tall(300),
    });
    expect(summary(out).lazy).toBe(0);
    expect(summary(out).events).toBe(3000);
  });

  it('leaves other strategies on the event path', () => {
    const data = randomData(6000, 4);
    const custom: ClusterStrategy = { key: (e) => e.sourceId };
    for (const strategy of [byDay, custom]) {
      const { out } = testFrame(data, {
        clustering: { maxMarkers: 100, strategy },
        camera: fitted(),
        height: tall(4),
      });
      expect(summary(out).lazy).toBe(0);
      expect(summary(out).events).toBe(6000);
    }
  });

  it('stays on the event path while the window holds few events', () => {
    const data = randomData(6000, 4);
    const { out } = testFrame(data, {
      clustering: { maxMarkers: 100 },
      // ~50 events in an 8,000 ms window.
      camera: { originTime: 500_000, pxPerMs: 0.1 },
      height: tall(4),
    });
    expect(summary(out).lazy).toBe(0);
  });

  it('keeps aggregating until the window falls well under the budget', () => {
    // 10 events per second between a and b; maxMarkers 100.
    const data = stackedData(1000, 10);
    const options = {
      clustering: { maxMarkers: 100 },
      camera: { originTime: 400_000, pxPerMs: 896 / 20_000 }, // ~200 events
    };
    const { out, redraw } = testFrame(data, options);
    expect(summary(out).lazy).toBeGreaterThan(0);
    // ~90 events: under the budget, but not by a quarter.
    const ninety = { originTime: 400_000, pxPerMs: 896 / 9_000 };
    expect(summary(redraw(ninety)).lazy).toBeGreaterThan(0);
    const fresh = testFrame(data, { ...options, camera: ninety });
    expect(summary(fresh.out).lazy).toBe(0);
    expect(summary(fresh.out).events).toBe(summary(redraw(ninety)).events);
  });

  it('keeps its level until a finer one fits well under the budget', () => {
    // One event every 500 ms on one pair; maxMarkers 100.
    const data = stackedData(2000, 1, 500);
    const options = {
      clustering: { maxMarkers: 100 },
      camera: { originTime: 100_000, pxPerMs: 896 / 300_000 },
    };
    const { out, redraw } = testFrame(data, options);
    const coarse = summary(out).markers;
    // Zoomed in: the finer level holds ~88 cells (≤ 100, but > 75), so a
    // fresh frame uses it while the running one keeps the coarser level.
    const closer = { originTime: 100_000, pxPerMs: 896 / 180_000 };
    const kept = summary(redraw(closer)).markers;
    const fresh = summary(testFrame(data, { ...options, camera: closer }).out);
    expect(coarse).toBeLessThanOrEqual(100);
    expect(fresh.lazy).toBeGreaterThan(0);
    expect(fresh.markers).toBeLessThanOrEqual(100);
    expect(kept).toBeLessThan(fresh.markers);
  });

  it('spreads an expanded aggregated cluster into its events', () => {
    const data = stackedData(1000, 10);
    const camera = { originTime: 400_000, pxPerMs: 896 / 20_000 };
    const before = testFrame(data, { clustering: { maxMarkers: 100 }, camera });
    // Expand the first cluster, as a click on a same-instant cluster would.
    let first = -1;
    let count = 0;
    for (let i = 0; i < before.out.targets.count; i++) {
      const t = before.out.targets.at(i);
      if (t.kind === TargetKind.Cluster && t.lazy) {
        first = t.firstEvent;
        count = t.count;
        break;
      }
    }
    expect(first).toBeGreaterThanOrEqual(0);
    const after = testFrame(data, {
      clustering: { maxMarkers: 100 },
      camera,
      spread: (index) => index === first,
    });
    let spread = 0;
    for (let i = 0; i < after.out.targets.count; i++) {
      const t = after.out.targets.at(i);
      if (t.kind === TargetKind.Event) spread++;
    }
    expect(spread).toBe(count);
    expect(summary(after.out).events).toBe(summary(before.out).events);
  });
});
