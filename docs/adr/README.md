# Architecture decision records

Short records of decisions that still bind the code: the context, the
decision, and what it costs. A superseded record stays, marked as such, with a
link to its successor. The specification is [`../DESIGN.md`](../DESIGN.md).

| ADR                                       | Decision                                                         | Status   |
| ----------------------------------------- | ---------------------------------------------------------------- | -------- |
| [0001](0001-canvas-behind-a-seam.md)      | Draw on canvas, behind a backend-free renderer seam               | Accepted |
| [0002](0002-time-anchored-camera.md)      | A time-anchored camera is the only time↔screen math               | Accepted |
| [0003](0003-engine-owned-surface.md)      | The engine owns its canvases and injected services               | Accepted |
| [0004](0004-typed-frame-pipeline.md)      | Typed columns and typed per-frame batches                        | Accepted |
| [0005](0005-zoomed-out-aggregates.md)     | Per-pair time bins for the zoomed-out regime                     | Accepted |
| [0006](0006-instanced-webgl2.md)          | Instanced WebGL2 on hardware, Canvas2D as the fallback           | Accepted |
| [0007](0007-no-project-references.md)     | tsup builds, independent type-checks, no TS project references   | Accepted |
| [0008](0008-release-pipeline.md)          | Tokenless publishing after CI, in least-privilege jobs           | Accepted |
| [0009](0009-perf-gating.md)               | Perf tracked nightly; Gate 2 asserted on hardware WebGL          | Accepted |
