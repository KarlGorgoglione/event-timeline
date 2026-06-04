// The per-frame clustering pass (DESIGN.md §6).
//
// Pure: groups a *visible* event slice (already time-sorted by the temporal
// index, §5) by strategy key, then sweeps each group merging consecutive events
// that render within `minSeparationPx`. No precomputation and no persisted state,
// so live updates stay cheap and "expand on zoom-in" is automatic — zooming in
// pushes neighbours apart until every group is singletons again. Cost is linear
// in the visible slice, the accepted O(n) stress case at full zoom-out.

import type { Cluster, ClusterContext, ClusterStrategy } from './types';
import type { TimelineEvent } from '../model/types';

/**
 * Collapse `events` into clusters. Input must be ascending by `time` (the
 * renderer passes the temporal-index slice), which — since `timeToScreenX` is
 * monotonic in time — keeps each group ascending in screen-x for the sweep.
 * Single-event clusters are returned as-is for the renderer's ordinary path.
 */
export function clusterEvents<TData>(
  events: readonly TimelineEvent<TData>[],
  strategy: ClusterStrategy,
  ctx: ClusterContext,
): Cluster<TData>[] {
  // Group by key, preserving the incoming (time) order within each group.
  const groups = new Map<string, TimelineEvent<TData>[]>();
  for (const event of events) {
    const key = strategy.key(event, ctx);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [event]);
    else group.push(event);
  }

  const clusters: Cluster<TData>[] = [];
  for (const group of groups.values()) {
    // Proximity sweep: extend the current run while consecutive events render
    // within minSeparationPx, otherwise flush and start a new run.
    let run: TimelineEvent<TData>[] = [];
    let prevX = 0;
    for (const event of group) {
      const x = ctx.timeToScreenX(event.time);
      if (run.length === 0 || x - prevX <= ctx.minSeparationPx) {
        run.push(event);
      } else {
        clusters.push({ events: run });
        run = [event];
      }
      prevX = x;
    }
    if (run.length > 0) clusters.push({ events: run });
  }
  return clusters;
}
