// Crossing-reduction layout: iterative barycenter sweeps (DESIGN.md §7).
//
// This is *not* layered (Sugiyama) graph drawing — there are no layers; arrows
// run between arbitrary rows at arbitrary times. It is the single-axis
// ordering/linear-arrangement problem (NP-hard), for which iterative barycenter
// sweeps are a standard heuristic: starting from an order, repeatedly reposition
// each row at the (weighted) average row-index of its neighbours to pull
// strongly-connected elements together and reduce arrow vertical span/crossings.

import { byFirstEvent } from './byFirstEvent';
import type { LayoutStrategy } from './types';

/** Sweeps to run; each is O(elements + edges). 8 converges on typical graphs. */
const MAX_SWEEPS = 8;

/** Shared empty neighbour map (every seed id is in `adjacency`, so unreachable). */
const NO_NEIGHBOURS: ReadonlyMap<string, number> = new Map();

/**
 * Undirected neighbour weights keyed by element id. An event contributes a unit
 * of attraction between its endpoints; repeated edges between the same pair add
 * up, so heavily-connected elements pull together more strongly. Self-events
 * (`sourceId === targetId`) add no ordering constraint and are skipped.
 */
type Adjacency = Map<string, Map<string, number>>;

function buildAdjacency(
  ids: readonly string[],
  events: readonly { sourceId: string; targetId: string }[],
): Adjacency {
  const adjacency: Adjacency = new Map();
  for (const id of ids) adjacency.set(id, new Map());
  const link = (a: string, b: string) => {
    const neighbours = adjacency.get(a);
    if (neighbours === undefined) return; // edge endpoint not in the element set
    neighbours.set(b, (neighbours.get(b) ?? 0) + 1);
  };
  for (const { sourceId, targetId } of events) {
    if (sourceId === targetId) continue;
    link(sourceId, targetId);
    link(targetId, sourceId);
  }
  return adjacency;
}

/**
 * Weighted mean of a node's neighbours' current row indices, or `null` when it
 * has no neighbours (such nodes keep their position via the stable tiebreak).
 */
function barycenterOf(
  neighbours: ReadonlyMap<string, number>,
  rowIndexById: Map<string, number>,
): number | null {
  let weightedSum = 0;
  let weight = 0;
  for (const [neighbourId, w] of neighbours) {
    const row = rowIndexById.get(neighbourId);
    if (row === undefined) continue;
    weightedSum += row * w;
    weight += w;
  }
  return weight === 0 ? null : weightedSum / weight;
}

/**
 * Total vertical span of all edges under an ordering: Σ weight·|row(a) − row(b)|.
 * This is the linear-arrangement objective the sweeps drive down, and it is
 * O(edges) — cheap enough to evaluate every sweep so we can return the *best*
 * order seen rather than whichever the final sweep happened to land on (sweeps
 * can oscillate; see `order`). Each undirected edge is counted from both of its
 * endpoints, so the sum double-counts — harmless, since it is only ever compared
 * against other spans computed the same way.
 */
function totalEdgeSpan(order: readonly string[], adjacency: Adjacency): number {
  const rowIndexById = new Map(order.map((id, index) => [id, index]));
  let span = 0;
  for (const [id, neighbours] of adjacency) {
    const row = rowIndexById.get(id);
    if (row === undefined) continue;
    for (const [neighbourId, weight] of neighbours) {
      const neighbourRow = rowIndexById.get(neighbourId);
      if (neighbourRow === undefined) continue;
      span += Math.abs(row - neighbourRow) * weight;
    }
  }
  return span;
}

export const barycenter: LayoutStrategy = {
  order(elements, events): string[] {
    // Seed from the default chronological order: a stable, sensible start that
    // already groups by introduction time (DRY — reuse byFirstEvent).
    const seed = byFirstEvent.order(elements, events);
    if (seed.length < 3) return seed; // nothing to reduce

    const adjacency = buildAdjacency(seed, events);

    // Each sweep recomputes every node's barycenter from the *same* snapshot of
    // the previous order, then re-sorts globally — a Jacobi-style update, not
    // the node-by-node Gauss-Seidel "alternating direction" variant. It is
    // simpler and order-independent, at the cost of period-2 oscillation between
    // two orderings. We tame that by (a) stopping as soon as an order repeats
    // either of the last two, and (b) returning the lowest-span order *seen*
    // across all sweeps, never merely the final one — so the result is robust to
    // the oscillation and can never be worse than the seed.
    let order = seed;
    let best = seed;
    let bestSpan = totalEdgeSpan(seed, adjacency);
    let twoBackKey = '';
    let previousKey = seed.join(' ');

    for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
      const rowIndexById = new Map(order.map((id, index) => [id, index]));
      // Decorate with the barycenter; nodes without neighbours keep their row so
      // they don't drift. A stable sort on the row keeps equal barycenters in
      // their current relative order (deterministic).
      const ranked = order.map((id, index) => {
        const key = barycenterOf(
          adjacency.get(id) ?? NO_NEIGHBOURS,
          rowIndexById,
        );
        return { id, index, key: key ?? index };
      });
      ranked.sort((a, b) =>
        a.key !== b.key ? a.key - b.key : a.index - b.index,
      );
      order = ranked.map((entry) => entry.id);

      const span = totalEdgeSpan(order, adjacency);
      if (span < bestSpan) {
        best = order;
        bestSpan = span;
      }

      // Converged (period 1) or oscillating (period 2): further sweeps only
      // revisit these same orders, so stop and keep the best already found.
      const key = order.join(' ');
      if (key === previousKey || key === twoBackKey) break;
      twoBackKey = previousKey;
      previousKey = key;
    }

    return best;
  },
};
