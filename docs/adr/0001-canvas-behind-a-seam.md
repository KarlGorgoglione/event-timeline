# 0001 — Draw on canvas, behind a backend-free renderer seam

**Status**: Accepted

## Context

The target is 50,000 events over thousands of lines with smooth pan and zoom.
DOM or SVG nodes per primitive cannot redraw that many elements per frame.
Different machines favour different backends: a GPU path is fastest where it
is hardware-accelerated, and Canvas2D is the safe everywhere-path.

## Decision

Render on `<canvas>`. The engine never draws directly: a frame is built into
typed batches in device pixels and handed to a `Renderer` that exposes only
primitive verbs (`drawLines`, `drawNodes`, `drawArrowheads`, `drawRects`,
`drawText`, `drawImages`, `fillRect`, `measureText`). No backend type crosses
the seam; images travel as opaque handles.

## Consequences

- Backends are substitutable without engine changes (Canvas2D, WebGL2, a
  recording renderer in tests, a null renderer when nothing is available).
- Text in the canvas is opaque to the DOM: the React tooltip is HTML, and an
  accessibility mirror of the content is out of scope.
- Every backend must reproduce the same look; parity is held by shared geometry
  and golden tests (ADR 0006).
