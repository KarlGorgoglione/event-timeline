# @event-timeline/core

## 0.1.2

### Patch Changes

- 195c489: Fix framerate degrading as you zoom _in_ (worst when fully zoomed in, recovering
  as you zoom out). Each element line was drawn — and rasterized into the 64px
  hit-test grid cell-by-cell — across its full extent in screen-x, which grows with
  zoom: at maximum zoom a line spans ~1.5M px, so a single line registered in
  ~23,000 hit-grid cells (~700k cell insertions per frame across the visible rows),
  plus the cost of stroking million-pixel lines. The off-screen portion is
  invisible and un-hittable, so element lines are now clamped to the viewport (plus
  a small margin) before drawing and hit-indexing. The line is horizontal, so the
  visible result is pixel-identical; the per-frame cost becomes bounded by the
  viewport instead of the zoom level.
- 195c489: Fix risers not hopping over element lines they cross when source and target are
  far apart. The hop computation was skipped whenever an event's full source→target
  row span exceeded a fixed limit, so in large datasets most arrows cut straight
  through the lines they crossed instead of bridging over them. The crossing scan
  is now clamped to the visible row band: tall risers hop over every on-screen line
  they cross, and the work stays bounded by the viewport height.

## 0.1.1

### Patch Changes

- 6e66ed7: Validate the npm Trusted Publishing (OIDC) release pipeline end to end. No
  functional or API changes — this is a maintenance release that exercises the
  tokenless publish path.

## 0.1.0

### Minor Changes

- 9420bc7: Initial public release (v1).

  A Canvas-2D, domain-agnostic timeline that renders element lanes and directed
  event arrows, built for smooth pan/zoom at large scale:
  - Virtualised, culled rendering over a sorted temporal index (~50k events).
  - Zoom-about-cursor, vertical scroll, hover tooltips, click & multi-select.
  - Event clustering ("×N" markers) with expand-on-zoom, and label LOD.
  - Pluggable layout strategies: `byFirstEvent`, `barycenter`, `explicit`.
  - Theming, data-driven style resolvers, and label/tick formatters.
  - Live/streaming updates: `addEvents` / `removeEvents` / `addElements` /
    `updateElement` with stable-append layout.
  - `@event-timeline/core` (framework-agnostic engine) and `@event-timeline/react`
    (`<Timeline />` binding with a typed imperative handle).

- 6d6e755: Refine timeline rendering and interaction:
  - **Element line start**: the icon now stacks over a centered label as a marker
    block to the left of the line, and the line begins to its right with a clear
    lead gap before the first event. With no icon the label is right-aligned just
    left of the line start, so it never overflows onto the line.
  - **Fit reserve**: the initial fit now reserves a left gutter so the leftmost
    line's start marker (icon + label) stays on-screen instead of being clipped at
    the edge.
  - **Arrow landing**: arrowheads stop at the near edge of the target line's
    thickness (no overshoot), and a dot now marks the landing point on the target
    line (mirroring the source dot). The target dot is hit-testable.
  - **Connected-event highlight**: hovering or selecting an element now also
    highlights the events connected to it.
  - **Crossing arcs**: event risers draw a small "hop" arc where they cross an
    intermediary element line, reading clearly as passing above it.
  - **React**: new optional `renderTooltip` prop on `<Timeline>` for custom tooltip
    content (the default tooltip is unchanged); the demo uses it to show event
    dates.
