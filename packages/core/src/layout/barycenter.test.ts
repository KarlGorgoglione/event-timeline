import { describe, expect, it } from 'vitest';
import { barycenter } from './barycenter';
import { byFirstEvent } from './byFirstEvent';
import type { TimelineElement, TimelineEvent } from '../model/types';

const el = (id: string, order?: number): TimelineElement => ({
  id,
  label: id,
  ...(order !== undefined ? { order } : {}),
});
const ev = (
  id: string,
  sourceId: string,
  targetId: string,
  time: number,
): TimelineEvent => ({ id, sourceId, targetId, time });

/**
 * Count edge pairs whose row-intervals interleave under a given ordering: edges
 * (p,q) and (r,s) — endpoints as row indices, low<high — cross iff exactly one
 * of {r,s} lies strictly inside (p,q). This is the standard linear-arrangement
 * crossing metric (DESIGN.md §7), independent of time.
 */
function countCrossings(
  order: readonly string[],
  events: readonly TimelineEvent[],
): number {
  const row = new Map(order.map((id, index) => [id, index]));
  const edges = events
    .filter((e) => e.sourceId !== e.targetId)
    .map((e) => {
      const a = row.get(e.sourceId)!;
      const b = row.get(e.targetId)!;
      return a < b ? ([a, b] as const) : ([b, a] as const);
    });
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [p, q] = edges[i]!;
      const [r, s] = edges[j]!;
      if ((p < r && r < q && q < s) || (r < p && p < s && s < q)) crossings++;
    }
  }
  return crossings;
}

/** Total vertical span of all edges: Σ |row(source) − row(target)| (§7). */
function totalSpan(
  order: readonly string[],
  events: readonly TimelineEvent[],
): number {
  const row = new Map(order.map((id, index) => [id, index]));
  return events
    .filter((e) => e.sourceId !== e.targetId)
    .reduce(
      (sum, e) => sum + Math.abs(row.get(e.sourceId)! - row.get(e.targetId)!),
      0,
    );
}

describe('barycenter', () => {
  it('returns a permutation of all input ids', () => {
    const elements = [el('a'), el('b'), el('c'), el('d')];
    const events = [ev('e1', 'a', 'c', 10), ev('e2', 'b', 'd', 20)];
    const order = barycenter.order(elements, events);
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('passes through trivial inputs (0, 1, 2 elements) unchanged', () => {
    expect(barycenter.order([], [])).toEqual([]);
    expect(barycenter.order([el('a')], [])).toEqual(['a']);
    // Two elements: nothing to reorder, seed (byFirstEvent) order is returned.
    const two = [el('x'), el('y')];
    const evs = [ev('e', 'y', 'x', 5)];
    expect(barycenter.order(two, evs)).toEqual(byFirstEvent.order(two, evs));
  });

  it('ignores self-events (they add no ordering constraint)', () => {
    const elements = [el('a'), el('b'), el('c')];
    // Only self-events: no attraction, so the byFirstEvent seed is preserved.
    const events = [
      ev('s1', 'a', 'a', 1),
      ev('s2', 'b', 'b', 2),
      ev('s3', 'c', 'c', 3),
    ];
    expect(barycenter.order(elements, events)).toEqual(['a', 'b', 'c']);
  });

  // Measurable crossing reduction (§7). The two fixtures below cover
  // the two regimes that matter — separable clusters with no edges between them,
  // and a single connected component whose constraints actually compete.

  describe('crossing reduction — disconnected clusters (§7)', () => {
    // Two *disconnected* triangles {a,c,e} and {b,d,f} (no edge spans them).
    // Self-events at t=1..6 fix the chronological seed order [a,b,c,d,e,f],
    // interleaving the clusters; the connecting edges (t≥10) don't change
    // first-event times. byFirstEvent therefore interleaves the clusters;
    // barycenter pulls each together. This is the easy, separable regime.
    const elements = [el('a'), el('b'), el('c'), el('d'), el('e'), el('f')];
    const events = [
      ev('a0', 'a', 'a', 1),
      ev('b0', 'b', 'b', 2),
      ev('c0', 'c', 'c', 3),
      ev('d0', 'd', 'd', 4),
      ev('e0', 'e', 'e', 5),
      ev('f0', 'f', 'f', 6),
      ev('ac', 'a', 'c', 10),
      ev('ce', 'c', 'e', 11),
      ev('ae', 'a', 'e', 12),
      ev('bd', 'b', 'd', 13),
      ev('df', 'd', 'f', 14),
      ev('bf', 'b', 'f', 15),
    ];

    it('seeds from the interleaved byFirstEvent order', () => {
      expect(byFirstEvent.order(elements, events)).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
      ]);
    });

    it('strictly reduces crossings and does not increase span', () => {
      const seed = byFirstEvent.order(elements, events);
      const reduced = barycenter.order(elements, events);
      expect(countCrossings(reduced, events)).toBeLessThan(
        countCrossings(seed, events),
      );
      expect(totalSpan(reduced, events)).toBeLessThanOrEqual(
        totalSpan(seed, events),
      );
    });

    it('is deterministic across runs', () => {
      expect(barycenter.order(elements, events)).toEqual(
        barycenter.order(elements, events),
      );
    });
  });

  describe('crossing reduction — connected component (§7)', () => {
    // The same two triangles, now joined by a bridge edge e↔b into a *single
    // connected component*. The bridge couples the clusters, so the seed order
    // has competing constraints (it is no longer separable) — the regime the
    // case (a connected fixture) actually targets. The bridge does
    // not change any first-event time, so the seed order is still [a..f].
    const elements = [el('a'), el('b'), el('c'), el('d'), el('e'), el('f')];
    const events = [
      ev('a0', 'a', 'a', 1),
      ev('b0', 'b', 'b', 2),
      ev('c0', 'c', 'c', 3),
      ev('d0', 'd', 'd', 4),
      ev('e0', 'e', 'e', 5),
      ev('f0', 'f', 'f', 6),
      ev('ac', 'a', 'c', 10),
      ev('ce', 'c', 'e', 11),
      ev('ae', 'a', 'e', 12),
      ev('bd', 'b', 'd', 13),
      ev('df', 'd', 'f', 14),
      ev('bf', 'b', 'f', 15),
      ev('eb', 'e', 'b', 16), // bridge: makes the graph one connected component
    ];

    it('seeds from the interleaved byFirstEvent order', () => {
      expect(byFirstEvent.order(elements, events)).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
      ]);
    });

    it('strictly reduces crossings and does not increase span', () => {
      const seed = byFirstEvent.order(elements, events);
      const reduced = barycenter.order(elements, events);
      expect(countCrossings(reduced, events)).toBeLessThan(
        countCrossings(seed, events),
      );
      expect(totalSpan(reduced, events)).toBeLessThanOrEqual(
        totalSpan(seed, events),
      );
    });

    it('is deterministic across runs', () => {
      expect(barycenter.order(elements, events)).toEqual(
        barycenter.order(elements, events),
      );
    });
  });
});
