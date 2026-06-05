---
'@event-timeline/core': patch
---

Fix framerate degrading as you zoom *in* (worst when fully zoomed in, recovering
as you zoom out). Each element line was drawn — and rasterized into the 64px
hit-test grid cell-by-cell — across its full extent in screen-x, which grows with
zoom: at maximum zoom a line spans ~1.5M px, so a single line registered in
~23,000 hit-grid cells (~700k cell insertions per frame across the visible rows),
plus the cost of stroking million-pixel lines. The off-screen portion is
invisible and un-hittable, so element lines are now clamped to the viewport (plus
a small margin) before drawing and hit-indexing. The line is horizontal, so the
visible result is pixel-identical; the per-frame cost becomes bounded by the
viewport instead of the zoom level.
