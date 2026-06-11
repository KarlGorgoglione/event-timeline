---
'@event-timeline/core': minor
'@event-timeline/react': minor
---

WebGL2 rendering backend with automatic selection. A new `renderer` option
(`'auto' | 'canvas2d' | 'webgl'`, default `'auto'`) on `TimelineEngineOptions`
and the React `TimelineOptions` picks WebGL2 whenever it is available and
hardware-accelerated, falling back to Canvas2D otherwise (no API change to
either backend's output — the two are visually identical by construction).
`TimelineEngine.getRendererBackend()` / `TimelineHandle.getRendererBackend()`
report the selected backend, and the React binding remounts its canvas
elements when the preference changes (a canvas is permanently bound to its
first context type). WebGL contexts survive loss/restore and release GPU
resources on dispose.
