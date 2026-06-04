// The single extent computation, reused by layout, rendering, and fit
// (DESIGN.md §1, §5 "Extent computation likewise lives in one place").

import type { Time } from './types';

/** The time span [minTime, maxTime] covered by an element (or the whole data). */
export interface Extent {
  minTime: Time;
  maxTime: Time;
}

/**
 * Widen an extent to include `t`. An absent extent starts as the single
 * instant `[t, t]`. Pure — returns a new value, never mutates `current`.
 */
export function widenExtent(current: Extent | undefined, t: Time): Extent {
  if (current === undefined) {
    return { minTime: t, maxTime: t };
  }
  return {
    minTime: t < current.minTime ? t : current.minTime,
    maxTime: t > current.maxTime ? t : current.maxTime,
  };
}

/**
 * The overall extent across every element, or `null` when there is no data.
 * Drives the degenerate-extent handling of §3.1 and `fit`.
 */
export function dataExtent(
  extents: ReadonlyMap<string, Extent>,
): Extent | null {
  let result: Extent | null = null;
  for (const extent of extents.values()) {
    result =
      result === null
        ? { minTime: extent.minTime, maxTime: extent.maxTime }
        : {
            minTime: Math.min(result.minTime, extent.minTime),
            maxTime: Math.max(result.maxTime, extent.maxTime),
          };
  }
  return result;
}
