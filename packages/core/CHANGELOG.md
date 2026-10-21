# @event-timeline/core

## 0.5.1

### Patch Changes

- 41dfe49: Element start markers with an icon are now placed by the wider of the icon and
  its label, so a label wider than its icon is no longer cut off at the left edge
  when the marker sticks, nor drawn over the start of its line.

## 0.5.0

### Minor Changes

- 6de89af: Audit remediation: a rebuilt frame pipeline that holds 60 fps at 50,000 events on an instanced WebGL2 renderer, runtime configuration, and a cleaned-up API.

  **Breaking changes**
  - The engine owns its canvases: `new TimelineEngine(options)` then `engine.mount(container, { autoResize? })` (follows size and device pixel ratio by default); `unmount()` removes them. The constructor no longer takes canvases.
  - The theme is grouped: `grid`, `header`, `layout`, `emphasis` and `cluster` replace the flat fields (`gridlineColor` → `grid.color`, `headerHeight` → `header.height`, `rowHeight` → `layout.rowHeight`, `labelPadding` → `layout.edgePadding`, `lineLeadPadding` → `layout.lineLead`, `hoverColor` → `emphasis.hoverColor`, `emphasisRadiusBonus` → `emphasis.radiusBonus`, `clusterColor` → `cluster.color`, …). Overrides use the new `ThemeInput` type, merged group by group.
  - Selection is structured: `select({ elements, events })`, `getSelection()`, and `selectionChange` carries `{ elements: string[]; events: string[] }` instead of prefixed id strings.
  - `dataChange` reports `{ elements: { added, removed, updated }, events: { … } }`.
  - Custom renderers: the `Renderer` interface takes typed batches (`LineBatch`, `NodeBatch`, …) and is passed as `renderer: { base, overlay }`.
  - `date-fns` is no longer a dependency: the package has none.
  - `TimelineElement.label` is optional (the id is shown); `TimelineData` arrays are `readonly`.
  - `ClusterStrategy` and `LayoutStrategy` are generic over `TData`; internal helpers (`overlayStyle`, cluster internals) are no longer exported.

  **Added**
  - Instanced WebGL2 backend (one GL context, paged text/icon atlases, joins, context-loss fallback); `renderer: 'auto'` picks it on hardware. Draw errors become `render-error` diagnostics.
  - Zoomed-out aggregation for pair-keyed clustering (`clustering.maxMarkers`, default 4000), a row-interval index, label collision culling (`labels`), arrow options (`arrows`: hops, target dot, sub-lanes), `emptyElements`.
  - Runtime `setOptions`, `setTheme`, `setStyleResolvers`, `setFormatters`; injectable `renderer`, `scheduler` and `now`.
  - `removeElements`, `updateEvent`, `getData`, `scrollToElement`, `revealEvent`, `zoomIn`, `zoomOut`, `clearSelection`, `getRendererBackend`, `renderNow`, the `firstFrame` event; `VERSION` reports the real version.
  - Sub-day header ticks with a sticky period label, `locale`, `zoom` and `pan` limits, `fitOnDataChange`, reserved `endTime`.
  - Pinch zoom, keyboard navigation (`keyboard`), primary-button-only clicks (`pointer.buttons`), wheel delta modes and macOS shift+wheel; an accessible name and description.

  **Fixed**
  - Same-instant clusters can be expanded (spread in place); clusters no longer chain across the view; cluster zoom is padded and centred.
  - Cross-origin icons no longer break WebGL; a failing WebGL backend falls back to Canvas2D; preloaded icons draw once decoded.
  - Selections are pruned when items are removed; the default diagnostics sink is silent in production and batched; ids, labels, order and fonts are validated; layout output is normalised.

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

## 0.3.0

### Minor Changes

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
