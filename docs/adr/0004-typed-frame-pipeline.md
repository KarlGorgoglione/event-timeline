# 0004 — Typed columns and typed per-frame batches

**Status**: Accepted (replaces the per-frame spec objects of Phases 2–7)

## Context

Each frame used to build CSS-pixel spec objects for every primitive, resolve
two style objects per visible event, build string keys for clusters and
batches, and then copy everything into device-pixel batches. At 50k events
that was hundreds of thousands of allocations per frame, and the base frame
took 187 ms at full zoom-out under CPU ×4.

## Decision

- The store keeps events in typed columns sorted by `(time, insertion)`, with
  one sort-and-merge path for full loads and streaming.
- Styles are resolved once per item and theme and interned into numeric ids.
- The frame builder writes device-pixel coordinates straight into reusable
  typed buffers grouped by style id, records hit targets from the same
  geometry, and allocates nothing per event in steady state.
- Cluster keys for the built-in strategies are computed numerically.

## Consequences

- Frame cost is dominated by the visible work, not by allocation; zoomed-out
  50k frames dropped from 187 ms to about 14 ms (Canvas2D, CPU ×4).
- The builders are harder to read than plain objects; tests decode the
  buffers through helpers in `src/testing/`.
- Custom cluster strategies still work, at the cost of calling `key()` per
  candidate.
