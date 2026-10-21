# @event-timeline/core

A framework-free timeline engine in TypeScript, with **no runtime
dependencies**. It renders **elements** (horizontal lanes) and **events**
(directed arrows between lanes at a point in time) and holds 60 fps at 50,000
events: on an instanced WebGL2 renderer where the GPU is available, on Canvas2D
otherwise.

This is the engine behind
[`@event-timeline/react`](https://www.npmjs.com/package/@event-timeline/react);
use it directly from any framework, or none. Architecture:
[`docs/DESIGN.md`](https://github.com/KarlGorgoglione/event-timeline/blob/main/docs/DESIGN.md).
API reference: <https://karlgorgoglione.github.io/event-timeline/api/>.

## Install

```bash
pnpm add @event-timeline/core
```

## Quick start

```ts
import { TimelineEngine } from '@event-timeline/core';

const engine = new TimelineEngine<MyData>({
  multiSelect: true,
  onDiagnostic: (d) => console.warn(d.code, d.reason),
});

// The engine creates its canvases inside `container` and follows its size and
// device pixel ratio (pass { autoResize: false } to call resize() yourself).
engine.mount(container);
engine.setData({ elements, events }); // framed automatically the first time

const off = engine.on('hover', (hit) => {
  // hit: { kind: 'element' | 'event' | 'cluster', … } | null
});

// later
off();
engine.dispose();
```

Calendar math is done in **UTC** with native `Date`, so ticks are identical on
every machine; header labels are formatted with `Intl` in the `locale` option.

## Highlights

- **Renderers**: `renderer: 'auto'` (default) uses instanced WebGL2 when it is
  hardware-accelerated and Canvas2D otherwise; a failure at any step falls back
  to Canvas2D on a fresh canvas, and a lost GL context that doesn't come back
  falls back too. Draw errors become `render-error` diagnostics.
- **Scale**: events in sorted typed columns, binary-search culling, a
  row-interval index for tall views, allocation-free frames, and precomputed
  per-pair time bins when zoomed far out (`clustering.maxMarkers`).
- **Clustering and LOD**: dense events collapse into "×N" markers that expand
  on zoom or click; labels are placed without collisions and capped per frame.
- **Layout**: `byFirstEvent` (default), `barycenter` and `explicit`, or your
  own `LayoutStrategy`.
- **Theming**: a grouped `Theme` (override any part with a `ThemeInput`),
  per-item styles and resolvers, label and tick formatters, all changeable at
  runtime (`setTheme`, `setOptions`, `setStyleResolvers`, `setFormatters`).
- **Live data**: `addEvents`, `removeEvents`, `updateEvent`, `addElements`,
  `updateElement`, `removeElements`, with stable rows while streaming.
- **Input**: drag, wheel, pinch and keyboard navigation; hover, click and
  structured selection (`{ elements, events }`).
- **Lenient validation**: invalid items are dropped and reported to
  `onDiagnostic`, never thrown.
- **Testable**: the renderer, frame scheduler and clock are injectable.

## License

[MIT](https://github.com/KarlGorgoglione/event-timeline/blob/main/LICENSE) ©
Karl Gorgoglione
