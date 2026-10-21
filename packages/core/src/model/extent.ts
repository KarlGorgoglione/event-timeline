// The time span covered by an element or by the whole dataset (DESIGN.md §1).
// The store maintains extents incrementally as events are merged and removed.

import type { Time } from './types';

/** The time span [minTime, maxTime] covered by an element (or the whole data). */
export interface Extent {
  minTime: Time;
  maxTime: Time;
}
