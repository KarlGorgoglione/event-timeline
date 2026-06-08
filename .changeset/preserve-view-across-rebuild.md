---
'@event-timeline/core': minor
'@event-timeline/react': minor
---

Preserve the camera (pan/zoom) across engine rebuilds.

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
