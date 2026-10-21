# 0006 — Instanced WebGL2 on hardware, Canvas2D as the fallback

**Status**: Accepted (replaces the per-batch WebGL backend of Phase 8)

## Context

At 50k events zoomed out, Canvas2D spends most of the frame rasterizing paths:
the base timing is near budget but the frame interval is about 50 ms. The first
WebGL backend built quads on the CPU and re-uploaded a vertex buffer per batch,
used two contexts per timeline, and reset a single text atlas when it filled.
Software GL is usually slower than Canvas2D.

## Decision

- `renderer: 'auto'` uses WebGL2 only when hardware-accelerated
  (`failIfMajorPerformanceCaveat`), else Canvas2D; `'webgl'` forces WebGL2.
- One GL context, for the base layer only.
- Five instanced programs (segment with joins, node, arrowhead, rect,
  textured rect); a frame's instance data is uploaded once; adjacent
  compatible draws merge.
- Text and icons are rasterized by Canvas2D into paged atlases with
  least-recently-used page eviction; draws recorded so far are flushed before a
  page used this frame is reused.
- Parity with Canvas2D by construction: shared arrowhead constants, the same
  dash phase and joins, the same text engine, premultiplied source-over.
- A lost context blanks the base layer until restored; after 3 s the engine
  falls back to Canvas2D on a fresh canvas.

## Consequences

- With a laptop GPU, 50k events hold 60 fps in every regime (Gate 2), and so
  does 100k zoom-out.
- WebGL output differs from Canvas2D only by anti-aliasing (about 0.1% of
  pixels on the golden fixture), held to 1% by the golden suite.
- Headless CI has no GPU: WebGL is exercised there on a software rasterizer
  for correctness, and its budgets are asserted only on hardware.
