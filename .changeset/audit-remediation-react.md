---
'@event-timeline/react': minor
---

Audit remediation: one engine per component, field-level prop diffing, and a richer handle and tooltip.

**Breaking changes**

- `theme` takes the grouped `ThemeInput` of core (see its changelog).
- `onSelectionChange` receives `{ elements: string[]; events: string[] }`, and `select` takes the same shape.
- The engine is no longer rebuilt when `theme`, `options`, `styleResolvers` or `formatters` change: they are compared field by field (inline objects are fine) and applied in place, keeping the view and the selection.

**Added**

- `options` accepts every engine option (derived from core's type).
- Re-exports `TimelineEventMap`; React apps install only `@event-timeline/react`.
- Handle: `zoomIn`, `zoomOut`, `setScrollY`, `scrollToElement`, `revealEvent`, `getSelection`, `clearSelection`, `getData`, `updateEvent`, `removeElements`, `getRendererBackend`, `engine`; getters return `null` before the engine exists.
- `tooltip={false}`, or a `renderTooltip` returning `null`, hides the tooltip; the default tooltip uses the theme's colours, flips at the viewport edges and lists a cluster's members. `onFirstFrame`.

**Fixed**

- No flicker on resize, device-pixel-ratio changes are followed, padding no longer stretches the drawing, and pointer moves no longer re-render the component.
