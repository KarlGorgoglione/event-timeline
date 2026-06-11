# @event-timeline/react

## 0.4.1

### Patch Changes

- 998607f: Fix the published manifest so the package installs under any package manager
  (npm, yarn, bun, …): the release workflow now packs with `pnpm pack`, which
  rewrites the `@event-timeline/core` dependency from the pnpm-only
  `workspace:` protocol to a real semver range (`^x.y.z`). Previously published
  versions shipped `"@event-timeline/core": "workspace:*"` verbatim, which only
  pnpm can resolve.

## 0.4.0

### Minor Changes

- 839adc3: WebGL2 rendering backend with automatic selection. A new `renderer` option
  (`'auto' | 'canvas2d' | 'webgl'`, default `'auto'`) on `TimelineEngineOptions`
  and the React `TimelineOptions` picks WebGL2 whenever it is available and
  hardware-accelerated, falling back to Canvas2D otherwise (no API change to
  either backend's output — the two are visually identical by construction).
  `TimelineEngine.getRendererBackend()` / `TimelineHandle.getRendererBackend()`
  report the selected backend, and the React binding remounts its canvas
  elements when the preference changes (a canvas is permanently bound to its
  first context type). WebGL contexts survive loss/restore and release GPU
  resources on dispose.

### Patch Changes

- Updated dependencies [839adc3]
  - @event-timeline/core@0.4.0

## 0.3.0

### Minor Changes

- 15f381e: Re-export the built-in cluster strategies (`byPixelColumn`, `byElementPair`,
  `byDay`, `bySourceTargetColumn`) and the `ClusterStrategy` type from
  `@event-timeline/react`, mirroring the existing layout-strategy re-exports. Hosts
  can now name a clustering strategy in `options.clustering.strategy` without taking
  a direct dependency on `@event-timeline/core`.
- 01256a9: Add a configurable event-label **placement** (§11). `options.eventLabel.placement`
  selects where each event's label sits relative to its arrow: `'sourceNode'`
  centres it in a box above/below the source node dot (direction-aware), while
  `'midpoint'` (the default) keeps it beside the riser at its vertical midpoint.

  Placement only moves the label — its **style is identical in every placement**.
  The themeable, per-event-resolvable label box (`EventStyle.labelBoxBackground`,
  `labelBoxBorderColor`, `labelBoxBorderWidth`, `labelBoxBorderDash`,
  `labelBoxPadding`) is drawn the same way wherever the label sits, so a box you
  configure shows at the midpoint and at the source node alike. Defaults stay
  transparent, so labels render as plain text until a fill or border is opted in.

  Exposed on the React `options.eventLabel` prop; the `EventLabelPlacement` type is
  exported from both packages.

- 15f381e: Preserve the camera (pan/zoom) across engine rebuilds.

  `@event-timeline/core` gains a public `setScrollY(scrollY)` on the engine (and the
  `@event-timeline/react` imperative handle), clamped to the content height —
  the vertical counterpart to the existing `zoomToRange`/`getViewport`.

  The React binding recreates the engine whenever `theme`/`options`/`styleResolvers`/
  `formatters` change by reference (DESIGN.md §12). A fresh engine auto-fits, which
  previously discarded the user's pan/zoom on every such edit. `useTimeline` now
  snapshots the viewport before disposing the old engine and restores it
  (`zoomToRange` + `setScrollY`) after the new one loads its data, so live-editing a
  colour, font, or any other parameter keeps the current view instead of snapping
  back to fit. The first mount still fits to data as before.

### Patch Changes

- Updated dependencies [01256a9]
- Updated dependencies [15f381e]
  - @event-timeline/core@0.3.0

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
