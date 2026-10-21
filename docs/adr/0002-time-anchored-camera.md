# 0002 — A time-anchored camera is the only time↔screen math

**Status**: Accepted

## Context

Zoom about the cursor, culling, hit-testing and drawing all convert between
time and screen x. When each re-derives `(t - origin) * pxPerMs`, they drift
apart: a hit-test that rounds differently from the drawing misses what the
user sees. Storing the pan as a pixel offset breaks on zoom, because the world
width changes with `pxPerMs`.

## Decision

The `Camera` holds `{ originTime, pxPerMs, scrollY }`, with the pan anchored in
time. Every conversion goes through its helpers (`timeToScreenX`,
`screenXToTime`, `durationToPx`, `pxToDuration`, `placeTimeAt`,
`rowToScreenY`, `screenYToRow`) or other code in `scale/`. ESLint rejects `*`
and `/` on `pxPerMs` outside `scale/`.

## Consequences

- Zoom about the cursor, culling and hit-testing agree by construction.
- A new conversion needs a helper in `scale/` rather than inline arithmetic.
