// Event collapsing / clustering contract (DESIGN.md §6).
//
// At low zoom many events fall within a few pixels and become unreadable. A
// `ClusterStrategy` assigns each event a key for the current zoom; events that
// share a key AND fall within `minSeparationPx` of the first event of their
// run collapse into one count marker. Hosts can supply their own keying.

import type { Time, TimelineEvent } from '../model/types';

/** Per-frame context handed to a strategy; carries the current zoom (§6). */
export interface ClusterContext {
  /** Pixel separation under which same-key events merge (also the column width). */
  minSeparationPx: number;
  /** Camera time→screen-x (the single coordinate source, §3). */
  timeToScreenX(t: Time): number;
}

export interface ClusterStrategy<TData = unknown> {
  /**
   * Grouping key for an event at the current zoom. Events sharing a key and
   * within `minSeparationPx` collapse into one marker. Pure, no side effects;
   * numbers are cheaper than strings.
   */
  key(event: TimelineEvent<TData>, ctx: ClusterContext): string | number;
}
