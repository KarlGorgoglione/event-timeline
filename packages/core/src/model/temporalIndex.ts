// Temporal index helpers for the sorted-by-time event array (DESIGN.md §5).
//
// Horizontal culling is "binary search for [tStart, tEnd] → O(log n + k)". These
// pure helpers own that search and the per-element bucket build so the store and
// its tests share one implementation (DRY); the store composes them in `reindex`.

import type { Time, TimelineEvent } from './types';

/** Anything with a `time`, so callers can search a slice without copying. */
interface Timed {
  time: Time;
}

/**
 * First index `i` in `[0, events.length]` whose `events[i].time >= t`
 * (the half-open lower bound). `events` must be sorted ascending by `time`.
 */
export function lowerBound(events: readonly Timed[], t: Time): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid] as Timed).time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * First index `i` in `[0, events.length]` whose `events[i].time > t`
 * (the half-open upper bound). `events` must be sorted ascending by `time`.
 */
export function upperBound(events: readonly Timed[], t: Time): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid] as Timed).time <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Map each element id to the indices (into the sorted array) of the events that
 * touch it, in time order (§5). An inter-row event is bucketed under both
 * endpoints; a self-event (`sourceId === targetId`) is bucketed once.
 */
export function buildBuckets(
  sorted: readonly TimelineEvent[],
): Map<string, number[]> {
  const buckets = new Map<string, number[]>();
  const add = (id: string, index: number) => {
    const bucket = buckets.get(id);
    if (bucket === undefined) buckets.set(id, [index]);
    else bucket.push(index);
  };
  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i] as TimelineEvent;
    add(event.sourceId, i);
    if (event.targetId !== event.sourceId) add(event.targetId, i);
  }
  return buckets;
}
