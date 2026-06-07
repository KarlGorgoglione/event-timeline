# @event-timeline/react

## 0.2.0

### Minor Changes

- 752fe44: Add a curated, fully backward-compatible set of look-and-feel theme knobs (§11):
  - **Border styles** — element line and event arrow **dash patterns**
    (`ElementStyle.lineDash` / `EventStyle.arrowDash`), plus dashed gridlines
    (`Theme.gridlineDash`), plumbed through the backend-free `Renderer` seam
    (`LineBatch.dash`).
  - **Row/lane separators** — optional lines between rows
    (`Theme.rowSeparator`: `enabled`/`color`/`width`/`dash`), off by default.
  - **Promoted hardcoded constants** into the theme: `gridlineWidth`,
    `lineLeadPadding`, `markerGap`, `eventLabelGap`, `clusterTextColor`,
    `clusterMarkerBonus`, `hoverWidthBonus`, `selectionWidthBonus`,
    `emphasisRadiusBonus`, `headerMajorTickRatio`, `headerMinorTickRatio`.

  New types `LineDash` and `RowSeparatorStyle` are exported, and `defaultTheme` is
  now re-exported from `@event-timeline/react`. Every new field defaults to the
  previous literal value, so existing themes render identically. The React `theme`
  prop accepts all new fields with no API change.

### Patch Changes

- Updated dependencies [752fe44]
  - @event-timeline/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [195c489]
- Updated dependencies [195c489]
  - @event-timeline/core@0.1.2

## 0.1.1

### Patch Changes

- 6e66ed7: Validate the npm Trusted Publishing (OIDC) release pipeline end to end. No
  functional or API changes — this is a maintenance release that exercises the
  tokenless publish path.
- Updated dependencies [6e66ed7]
  - @event-timeline/core@0.1.1

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

### Patch Changes

- Updated dependencies [9420bc7]
- Updated dependencies [6d6e755]
  - @event-timeline/core@0.1.0
