---
'@event-timeline/core': patch
---

Fix risers not hopping over element lines they cross when source and target are
far apart. The hop computation was skipped whenever an event's full source→target
row span exceeded a fixed limit, so in large datasets most arrows cut straight
through the lines they crossed instead of bridging over them. The crossing scan
is now clamped to the visible row band: tall risers hop over every on-screen line
they cross, and the work stays bounded by the viewport height.
