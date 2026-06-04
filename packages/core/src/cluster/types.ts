// Event collapsing / clustering contract (DESIGN.md §6).
//
// At low zoom many events fall within a few pixels and become unreadable. A
// `ClusterStrategy` assigns each event a stable key for the current zoom; events
// that share a key AND render within `minSeparationPx` of each other collapse
// into one count marker. Keeping this a pluggable interface (like `LayoutStrategy`,
// §7) lets hosts supply their own keying without forking the engine (OCP).

import type { Time, TimelineEvent } from '../model/types';

/** Per-frame context handed to a strategy; carries the current zoom (§6). */
export interface ClusterContext {
  /** Pixel separation under which same-key events merge (also the column width). */
  minSeparationPx: number;
  /** Camera time→screen-x (the single coordinate source, §3). */
  timeToScreenX(t: Time): number;
}

export interface ClusterStrategy {
  /**
   * Stable grouping key for an event at the current zoom. Events sharing a key
   * and within `minSeparationPx` collapse into one marker; pure, no side effects.
   */
  key(event: TimelineEvent, ctx: ClusterContext): string;
}

/**
 * A run of one or more events that render as a unit. A single-event cluster is
 * "un-clustered" — the renderer draws it as an ordinary arrow; a multi-event
 * cluster draws a count marker (§6).
 */
export interface Cluster<TData = unknown> {
  events: TimelineEvent<TData>[];
}
