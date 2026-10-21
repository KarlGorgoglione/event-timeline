---
'@event-timeline/core': minor
---

Audit remediation: a rebuilt frame pipeline that holds 60 fps at 50,000 events on an instanced WebGL2 renderer, runtime configuration, and a cleaned-up API.

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
