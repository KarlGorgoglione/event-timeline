# 0005 — Per-pair time bins for the zoomed-out regime

**Status**: Accepted

## Context

Zoomed out, the visible window holds nearly every event. Clustering them one
by one is O(n) per frame, and when the data is dense (many events between few
elements) the frame still draws tens of thousands of overlapping markers. At
50k events over 20 elements the frame took 37 ms on WebGL, most of it
clustering and emitting 22,000 markers that no one can read.

## Decision

For the pair-keyed strategies (`bySourceTargetColumn`, `byElementPair`),
precompute per-level aggregates: at level L, each (source, target, 2^L-ms bin)
with events becomes a cell with its count, time span and first/last event.
Levels are built lazily per data version (from the events, or by merging a
finer cached level) and cached least-recently-used. When the event path would
touch more than `clustering.maxMarkers` events, the frame takes cells instead
of events as weighted candidates for the same clustering code, starting from
bins no wider than the merge distance and coarsening until the window fits the
budget. Hysteresis keeps the path and level stable near the thresholds. Data
with about as many element pairs as events stays on the event path.

## Consequences

- Dense zoomed-out frames (50k events over 20 elements, WebGL, CPU ×4) dropped
  from 37 ms to 6 ms in a development-build comparison; the production perf
  suite measures about 8 ms. At most `maxMarkers` markers are drawn.
- An aggregated cluster cannot list its members cheaply: they are resolved from
  the store when needed, and the hover key is read from the target.
- Bins are aligned in time, so markers stay put while panning but regroup when
  the level changes.
- Other strategies (`byDay`, `byPixelColumn`, custom) always cluster event by
  event.
