---
'@event-timeline/core': minor
'@event-timeline/react': minor
---

Refine timeline rendering and interaction:

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
