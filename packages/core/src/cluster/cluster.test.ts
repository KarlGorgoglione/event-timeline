import { describe, expect, it } from 'vitest';
import { clusterEvents } from './cluster';
import { byElementPair, bySourceTargetColumn } from './strategies';
import type { ClusterContext } from './types';
import type { TimelineEvent } from '../model/types';

// timeToScreenX(t) = t * pxPerMs; vary pxPerMs to simulate zoom.
const ctxAt = (pxPerMs: number, minSeparationPx = 10): ClusterContext => ({
  minSeparationPx,
  timeToScreenX: (t) => t * pxPerMs,
});

const ev = (
  id: string,
  sourceId: string,
  targetId: string,
  time: number,
): TimelineEvent => ({ id, sourceId, targetId, time });

describe('clusterEvents (§6)', () => {
  it('merges same-key events that render within minSeparationPx', () => {
    const events = [
      ev('e1', 'a', 'b', 0),
      ev('e2', 'a', 'b', 3),
      ev('e3', 'a', 'b', 6),
    ];
    const clusters = clusterEvents(events, bySourceTargetColumn, ctxAt(1));
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('keeps a lone event as a singleton cluster (the un-clustered path)', () => {
    const clusters = clusterEvents(
      [ev('e1', 'a', 'b', 0)],
      bySourceTargetColumn,
      ctxAt(1),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.events).toHaveLength(1);
  });

  it('does not merge across different keys (different pairs)', () => {
    const events = [ev('e1', 'a', 'b', 0), ev('e2', 'c', 'd', 1)];
    const clusters = clusterEvents(events, bySourceTargetColumn, ctxAt(1));
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.events.length === 1)).toBe(true);
  });

  it('splits a same-key group when a gap exceeds minSeparationPx', () => {
    // byElementPair ignores the column, so the proximity sweep does the splitting.
    const events = [
      ev('e1', 'a', 'b', 0),
      ev('e2', 'a', 'b', 5),
      ev('e3', 'a', 'b', 100), // 95px gap > 10 → starts a new run
      ev('e4', 'a', 'b', 103),
    ];
    const clusters = clusterEvents(events, byElementPair, ctxAt(1));
    expect(clusters.map((c) => c.events.map((e) => e.id))).toEqual([
      ['e1', 'e2'],
      ['e3', 'e4'],
    ]);
  });

  it('expands to singletons when zoomed in past the threshold', () => {
    const events = [
      ev('e1', 'a', 'b', 0),
      ev('e2', 'a', 'b', 3),
      ev('e3', 'a', 'b', 6),
    ];
    // Zoomed out: 3ms * 1px = 3px apart → one cluster.
    expect(clusterEvents(events, byElementPair, ctxAt(1))).toHaveLength(1);
    // Zoomed in 10×: 30px apart > 10px → three singletons.
    const zoomed = clusterEvents(events, byElementPair, ctxAt(10));
    expect(zoomed).toHaveLength(3);
    expect(zoomed.every((c) => c.events.length === 1)).toBe(true);
  });

  it('returns nothing for an empty slice', () => {
    expect(clusterEvents([], bySourceTargetColumn, ctxAt(1))).toEqual([]);
  });
});
