# @event-timeline/core

Framework-agnostic Canvas timeline engine — pure TypeScript, **zero React**, no
DOM-framework assumptions. It renders **elements** (horizontal lanes) and
**events** (directed arrows between lanes at a point in time) on a `<canvas>` and
stays smooth while panning/zooming large datasets.

This is the engine behind [`@event-timeline/react`](https://www.npmjs.com/package/@event-timeline/react).
Use it directly to embed the timeline in any framework (or none). See
[`docs/DESIGN.md`](https://github.com/kgorgoglione/event-timeline/blob/main/docs/DESIGN.md)
for the architecture.

## Install

```bash
pnpm add @event-timeline/core
```

The only runtime dependency is [`date-fns`](https://date-fns.org/) (imported
per-function to stay tree-shakeable). Calendar math runs in **UTC** so ticks are
machine-stable.

## Quick start

The engine is handed two stacked canvases — a **base** layer (lines, arrows,
header) and an **overlay** layer (hover/selection) — and is driven imperatively.
It attaches **no** `ResizeObserver`; the host calls `resize()` on size changes.

```ts
import { TimelineEngine } from '@event-timeline/core';

const engine = new TimelineEngine(baseCanvas, overlayCanvas, {
  multiSelect: true,
  // onDiagnostic, layout, clustering, lod, styleResolvers, formatters, onFrameStats…
});

engine.resize(container.clientWidth, container.clientHeight, devicePixelRatio);
engine.setData({ elements, events });
engine.fit();

const off = engine.on('hover', (hit) => {
  /* hit is a typed discriminated union: element | event | cluster | null */
});

// later
off();
engine.dispose();
```

The engine consumes the overlay canvas's pointer/wheel events itself (pan, zoom
about the cursor, hover, click/selection). Pan is anchored in the **time
domain**, and all time↔screen math lives in a single Camera/scale module
(the §3 "single source of coordinate truth").

## Highlights

- **Virtualised & culled** rendering over a sorted temporal index (binary-search
  range queries) plus per-element buckets — built for ~50k events.
- **Clustering & LOD** (§6): dense events collapse into themeable "×N" markers
  that expand on zoom; per-event labels gate on a zoom threshold.
- **Pluggable layout** (§7): `byFirstEvent` (default), `barycenter`
  crossing-reduction, and `explicit` ordering — pure `order()` strategies.
- **Theming & resolution chain** (§11): per-item `style` → resolver → theme
  default, plus label/tick formatters.
- **Live/streaming** (§10): `addEvents` / `removeEvents` / `addElements` /
  `updateElement` update indexes incrementally (stable-append layout).
- **Swappable renderer seam** (§4): `Renderer` exposes only backend-free draw
  verbs in device pixels (a WebGL backend can replace Canvas2D unchanged).
- **Lenient validation** (§1): invalid items are dropped and reported through an
  injectable `onDiagnostic` sink — never thrown.
- **Observable frames** (§13): an optional `onFrameStats` sink reports per-layer
  draw time for benchmarking, with zero overhead when omitted.

## License

[MIT](https://github.com/kgorgoglione/event-timeline/blob/main/LICENSE) ©
Karl Gorgoglione
