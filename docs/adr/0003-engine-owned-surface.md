# 0003 — The engine owns its canvases and injected services

**Status**: Accepted (replaces the host-created canvases of Phase 1)

## Context

The host used to create both canvases and hand them to the engine. Under WebGL
that cost two GL contexts per timeline plus a probe context, and browsers cap
live contexts per page (Chrome: 16). A canvas is bound to its first context
type for life, so a failed WebGL attempt left a canvas that could no longer
fall back to Canvas2D, and the React binding had to key canvases on the
backend. The renderer, frame scheduler and clock were created inside the
engine, so tests needed proxy canvases and stubbed animation frames.

## Decision

`engine.mount(container)` creates the wrapper and both canvases itself, and
`unmount()` removes them. Each backend attempt gets a fresh canvas; the base
layer may use WebGL2, and the overlay is always Canvas2D, so a timeline holds
at most one GL context. With `autoResize` (the default) the engine observes
its own size and device pixel ratio and redraws synchronously on resize. The
renderer, scheduler and clock are options (`renderer`, `scheduler`, `now`).

## Consequences

- Backend switches and fallbacks are local to the engine; disposing releases
  the GL context at once.
- The engine runs headless in tests and could render offscreen with a custom
  renderer.
- The host no longer controls the canvas elements; styling goes through the
  container and the theme.
