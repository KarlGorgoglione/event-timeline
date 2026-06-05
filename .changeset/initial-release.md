---
'@event-timeline/core': minor
'@event-timeline/react': minor
---

Initial public release (v1).

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
