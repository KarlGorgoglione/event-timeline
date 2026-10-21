# event-timeline — Design Specification

This is the living specification of the library: what it does and the rules
the code keeps. It describes the current behaviour only. Why a decision was
taken lives in the decision records ([`docs/adr/`](adr/README.md)); how the
library got here lives in [`docs/HISTORY.md`](HISTORY.md) and the package
changelogs. Code comments cite this document by section (`§5`), so section
numbers are stable: a section that no longer applies keeps its number and says
so.

## Context

A Canvas-based, domain-agnostic timeline for the web, with a React binding. It
knows two things:

- **Elements**: entities drawn as horizontal _lines_ (lanes), stacked
  vertically.
- **Events**: directed connectors drawn as _arrows_ between two elements at a
  point in time, optionally labelled.

Time runs horizontally; elements stack vertically. The host fetches and filters
the data and hands the engine `{ elements, events }`. The motivating example (a
bank following money between clients, counterparties and cash) is only an
example: the library never interprets the data.

| Aspect           | Choice                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| Rendering        | Instanced **WebGL2** on capable hardware, **Canvas2D** otherwise, behind one seam (§4) |
| Scale target     | 50,000 events over thousands of lines at 60 fps (§13, Gate 2)                          |
| Packaging        | Framework-free TypeScript engine + thin React binding                                 |
| Time granularity | Milliseconds; header ticks from years down to minutes (§8)                            |
| Arrow routing    | Orthogonal: a vertical riser at the event's time                                      |
| Out of scope     | Drag-to-reorder rows, duration bars, an accessibility tree mirroring the canvas       |

---

## 1. Domain Model

```ts
type Time = number; // ms since the Unix epoch, interpreted in UTC (§8)

interface TimelineElement<TData = unknown> {
  id: string;
  label?: string; // the id is shown when omitted
  icon?: string | CanvasImageSource; // URL, emoji/glyph, or an image source
  style?: Partial<ElementStyle>; // per-item override (§11)
  order?: number; // honoured by the `explicit` layout only (§7)
  data?: TData; // opaque, echoed back in callbacks
}

interface TimelineEvent<TData = unknown> {
  id: string;
  sourceId: string; // the arrow leaves this element (source dot)
  targetId: string; // and enters this one (arrowhead)
  time: Time;
  endTime?: Time; // reserved for durations: validated, not drawn yet
  label?: string;
  style?: Partial<EventStyle>;
  data?: TData;
}

interface TimelineData<TData = unknown> {
  elements: readonly TimelineElement<TData>[];
  events: readonly TimelineEvent<TData>[];
}
```

- An element's **line** runs from a short lead before its first event to its
  last event. An element without events has no line: by default it gets no row
  (`emptyElements: 'hide'`); with `'show'` it keeps a row with its label only.
- The element's **start marker** (icon above label) sits just left of the line
  start and pans with the content. When the line start scrolls off the left
  edge, the marker sticks to the edge.
- An event's arrowhead is drawn at `targetId`; a dot marks `sourceId` (and,
  with `arrows.targetDot`, the landing point). A **self-event**
  (`sourceId === targetId`) is drawn as a small loop on its own line.
- Where a riser crosses another element's line, a small semicircular **hop**
  bridges it. `arrows.hops: 'auto'` (default) draws hops while a frame would
  draw at most `arrows.hopBudget` crossings (400) and drops them in denser
  views; `true`/`false` force them. Risers sharing a pixel column are nudged
  apart by `arrows.subLaneStep` px, up to `arrows.subLaneMax` steps.
- `TData` is threaded through the whole API so callbacks return a typed `data`.

### Data validation

Validation runs on every ingest (`setData`, `addEvents`, `addElements`,
`updateEvent`, `updateElement`) and is **lenient**: an invalid item is dropped,
never thrown, so one bad row cannot reject a batch or break a stream. Each drop
is reported to the `onDiagnostic` sink with a code, the subject and a reason.
Without a sink, a default one batches the reports of one ingest into a single
console summary in development and stays silent in production.

Dropped or reported: a missing or non-string `id`; a duplicate `id` (the later
one); a non-string `label`; a non-finite `order`; a non-finite `time`; an
`endTime` that is not a finite time ≥ `time`; an event whose `sourceId` or
`targetId` names no element; a theme font not sized in `px` (§3); a layout
strategy result that misses or repeats ids (§7). The store copies what it
indexes (time, endpoints, style slot), so mutating an event object after
ingest cannot corrupt the index.

---

## 2. Packages and Boundaries

```
packages/core   @event-timeline/core   engine: framework-free TypeScript
packages/react  @event-timeline/react  <Timeline/>, useTimeline, Tooltip
examples/demo   Vite playground, perf harness (bench.html), e2e fixture (e2e.html)
```

`@event-timeline/core` has **no runtime dependencies** and never imports React
(enforced by lint). Its modules:

| Module         | Owns                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| `model/`       | Types, the typed-array `DataStore`, validation and diagnostics, time units         |
| `scale/`       | `Camera` (the only time↔screen math, §3), fit and zoom bounds, tick generation    |
| `layout/`      | Ordering strategies, normalisation, stable append, row positions (§7)              |
| `cluster/`     | Cluster strategies and run building (§6)                                           |
| `scene/`       | The frame builder: typed batches and hit targets per frame, aggregates (§4–§6)    |
| `render/`      | The `Renderer` seam, Canvas2D and WebGL2 backends, backend selection (§4)          |
| `interaction/` | Pointer, wheel and keyboard translation, hit-testing, selection (§9)               |
| `engine/`      | `TimelineEngine` facade, options, view model, painters, scheduler, surface         |

The engine owns its DOM surface: `engine.mount(container)` creates a wrapper
with two canvases inside the host element, and `unmount()` removes it. With
`mount(container, { autoResize: true })` (the default) it follows the wrapper's
size and the device pixel ratio itself; with `autoResize: false` the host calls
`engine.resize(cssWidth, cssHeight, dpr)`. Renderer, frame scheduler and clock
are injectable (`renderer`, `scheduler`, `now`), which is how the tests run the
engine headless.

`@event-timeline/react` depends on core and re-exports what React apps need
(types, strategies, `defaultTheme`), so apps install only the binding; React
(`>=18`) is a peer dependency.
Both packages build with tsup (ESM + CJS + `.d.ts`), are `sideEffects: false`,
and type-check independently (no TS project references; see ADR 0007).
Bundle budgets (minified and brotli-compressed, checked in CI by size-limit):
core ≤ 36 KB, react ≤ 5 KB on top of core. Core measures about 32 KB, of which
the WebGL2 backend is about 5 KB.

---

## 3. Coordinate System and Camera

Horizontal is time: `pxPerMs` _is_ the zoom. Vertical is rows: row `r` is at
`header.height + r × (rowHeight + rowGap)` minus the scroll offset. There is no
vertical zoom.

The `Camera` holds `{ originTime, pxPerMs, scrollY }`. Pan is anchored in the
**time domain** (`originTime` is the time at screen x = 0), never as a pixel
offset, so pan and zoom compose without drift. Zoom is about the cursor: the
time under the pointer is captured before `pxPerMs` changes and `originTime` is
recomputed so the same time stays under the pointer.

**Single source of coordinate truth.** All time↔screen arithmetic lives in
`scale/` and is reached through `Camera` helpers: `timeToScreenX`,
`screenXToTime`, `durationToPx`, `pxToDuration`, `placeTimeAt`,
`rowToScreenY`, `screenYToRow`. Lint rejects `*` or `/` on `pxPerMs` anywhere
else.

**Zoom and pan limits.** `zoom.min` defaults to `'fit'` (the whole dataset);
`zoom.max` defaults to 20 px per minute. `pan.bounds: 'data'` keeps the view
over the data; the default `'none'` pans freely. `fitOnDataChange` decides when
`setData` reframes: `'auto'` (the first dataset, and any later one outside the
view), `'always'`, `'first'` or `'never'`. Fitting reserves a left inset
measured from the actual start markers, so labels are not clipped.

### 3.1 Degenerate extents

With no events, the view shows a 30-day window centred on `now()`; with a
single instant, a 30-day window centred on it. No division by a zero span ever
reaches the scale math.

**Device pixels.** Backing stores are `cssSize × dpr`; the context is not
pre-scaled. Builders multiply by `dpr` and snap to integer device pixels, with
a half-pixel offset for odd stroke widths, so hairlines stay crisp at
fractional DPRs. Fonts must be sized in `px` (they are scaled the same way);
others are replaced by the default font and reported.

---

## 4. Rendering

### Layers

Two stacked canvases plus the React binding's HTML tooltip:

1. **Base**: header, gridlines, separators, element lines and markers, arrows,
   clusters and labels. Redrawn when the camera, data, theme or options change.
2. **Overlay**: hover and selection highlights, redrawn alone on hover and
   after every base redraw (so a highlight follows the content). Always
   Canvas2D: it draws a handful of primitives.

Hover never touches the base layer. Pan and zoom redraw the base on every
frame of the gesture; §5–§6 keep that bounded.

### Frame pipeline

One base frame is built by `scene/FrameBuilder` into reusable typed buffers,
then played back to the renderer bottom to top:

1. Visible time window (with a margin) and row band (padded by one row).
2. Event candidates: by binary search over the sorted times, then the
   row-interval test (§5); or, zoomed far out, aggregated cells (§6).
3. Clustering into runs (§6), the hop decision, then emission: arrows,
   markers and label candidates, with their hit targets.
4. The label pass places candidates by priority against an occupancy grid,
   skipping collisions, up to `labels.maxPerFrame` per frame.

Styles are resolved and interned once per item and theme (`StyleTable`), so a
frame allocates nothing per event. All coordinates are snapped to device
pixels once, in the builders.

### The `Renderer` seam

Backends implement primitive verbs over typed batches in device pixels; no
backend type leaks through:

```ts
interface Renderer {
  readonly backend: string; // 'canvas2d', 'webgl', or a custom name
  resize(deviceWidth: number, deviceHeight: number): void;
  beginFrame(clearColor: string | null): void;
  fillRect(x, y, w, h, color): void;
  drawRects(batch: RectBatch): void;
  drawLines(batch: LineBatch): void; // segments, with join flags for polylines
  drawArrowheads(batch: ArrowheadBatch): void;
  drawNodes(batch: NodeBatch): void;
  drawText(batch: TextBatch): void;
  drawImages(batch: ImageBatch): void;
  measureText(text: string, font: string): TextMetricsLite;
  endFrame(): void;
  dispose?(): void;
}
```

A host can pass its own `{ base, overlay }` renderers through the `renderer`
option (tests do; so could an offscreen exporter).

Every backend is wrapped by a guard that turns a throwing verb into a
`render-error` diagnostic, so one failing primitive never aborts the frame.
Joined polylines (hops, loops, label boxes) are drawn with joins on both
backends; image errors skip that image and are reported once.

### Backends

`renderer: 'auto' | 'canvas2d' | 'webgl'` (default `'auto'`). `'auto'` picks
WebGL2 only when it is hardware-accelerated (the probe sets
`failIfMajorPerformanceCaveat`), otherwise Canvas2D. Each attempt runs on a
fresh canvas, because a canvas is bound to its first context type: WebGL2 →
Canvas2D → a null renderer that draws nothing. A timeline holds at most one GL
context.

The WebGL2 backend (ADR 0006) draws each batch as one instanced call from five
programs (line segment, node, arrowhead, rect, textured rect), uploads each
frame's instance data once, and rasterizes text and icons with Canvas2D into
paged atlases with least-recently-used page eviction. Look parity with Canvas2D
comes from shared arrowhead geometry, the same dash phase rules and joins, and
the same text engine; the golden suite holds WebGL to the Canvas2D baseline at
1% of pixels. When the GL context is lost, the base layer stays blank until it
is restored; if it is not restored within 3 s, the engine switches to Canvas2D
on a fresh canvas and reports `renderer-fallback`.

---

## 5. Indexing and Culling

`DataStore` is the single owner of the data. Events live in parallel typed
columns (time, source slot, target slot, style slot) sorted by
`(time, insertion order)`, plus the host objects. There is **one index-build
path**: `setData` clears, then merges its whole batch through the same
sort-and-merge that `addEvents` uses (§10). Element extents (`min`/`max` time
per element) are kept incrementally; the data extent is O(1).

**Horizontal culling** is a binary search for the visible window: O(log n + k).
**Vertical culling** keeps an event when the row _interval_ it spans,
`[min(sourceRow, targetRow), max(…)]`, meets the visible band: an arrow whose
endpoints are both off-screen can still cross the screen.

Zoomed out over many rows, the window holds most events but few meet the band.
A **row-interval index** (built lazily per data version and row order) groups
events by top row and finds the ones crossing the band without scanning the
rest; it is used when its estimate is under half the window.

**Hit-testing** reads the frame's hit targets, recorded from the same geometry
the builders draw. A 64 px grid over the viewport, built lazily on the first
pointer query after a base frame, maps cells to targets; boxes are clamped to
the viewport so tall risers cost a column of cells, not thousands.

---

## 6. Level of Detail, Clustering and Aggregation

- **Label LOD**: below `lod.eventLabelMinPxPerMs` (default 40 px per day),
  event labels are not drawn; markers still are.
- **Clustering**: visible events that share a key and fall within
  `clustering.minSeparationPx` (default 12) of the **first** event of their run
  merge into a "×N" marker. Runs never chain across the viewport. Keys come
  from a pluggable `ClusterStrategy<TData>`; the built-ins are `byPixelColumn`,
  `byElementPair`, `byDay` and the default `bySourceTargetColumn`. Built-in
  keys are computed numerically from the typed columns.
- **Expansion**: clicking a marker zooms to its members' time span (with
  padding). Members at one instant, which no zoom can separate, are spread out
  in place instead; at the deepest zoom nothing clusters.
- **Aggregation** (ADR 0005): for the pair-keyed strategies, once a frame would
  touch more than `clustering.maxMarkers` (default 4,000) events, candidates
  come from precomputed per-pair time bins (levels of 2^L ms, built lazily per
  data version) instead of the events. The level starts at bins no wider than
  the merge distance and coarsens while the window holds more cells than the
  budget and coarsening still cuts them by a quarter. It is used only when the
  cells are at most half the events, and hysteresis keeps the path and level
  stable near the thresholds. An aggregated cluster's members are the events of
  its pair in its time span, resolved only when needed (tooltip, click,
  selection highlight). Bins are aligned in time, so markers stay put while
  panning. `maxMarkers: Infinity` turns aggregation off; other strategies always
  cluster event by event.

---

## 7. Layout

A `LayoutStrategy<TData>` orders rows: `order(elements, events) => string[]`,
a pure function with no pixels or camera. Built-ins: `byFirstEvent` (default),
`barycenter` (crossing reduction by barycenter sweeps, keeping the best order
seen) and `explicit` (honours `element.order`, the rest by first event). The
result is normalised: missing ids are appended, unknown and duplicate ids
dropped, with an `invalid-layout` diagnostic.

Streaming keeps rows stable: with `streamingLayout: 'stable-append'` (default)
new elements slot in without reshuffling; `'full'` re-runs the strategy,
debounced by `layoutDebounceMs`.

---

## 8. Time Header

A two-row header: major periods above, minor ticks below. An adaptive
generator picks the finest step whose labels keep a minimum gap, from years
through months, weeks and days down to hours and minutes. All calendar math is
in **UTC** with native `Date.UTC`, so boundaries and goldens are identical on
every machine. Labels use `Intl.DateTimeFormat` in UTC with `locale` (default
`'en-US'`), or the host's `formatters.tickLabel(time, level)`. Major labels are
left-aligned at their period start; the period under the left edge keeps a
sticky label until the next one pushes it out. Major ticks extend gridlines
down through the content.

---

## 9. Interaction

The engine listens on its wrapper and turns raw input into intents; it does no
coordinate math of its own (§3).

- **Drag** with an allowed button (`pointer.buttons`, default primary only)
  pans time and scrolls rows; a press that moves less than 4 px is a click.
- **Wheel**: scroll rows; `shift` + wheel (or a horizontal delta) pans time;
  `ctrl`/`⌘` + wheel (and trackpad pinch) zooms about the cursor. Line and page
  delta modes are converted to pixels.
- **Touch**: one finger pans; two fingers pinch, panning by their midpoint and
  zooming by their spread. `touch-action: none` keeps the page from claiming the
  gesture.
- **Keyboard** (when focused, `keyboard: true` by default): arrows pan by a
  tenth of the view (Shift: half) and scroll by a row (Shift: a page), `+`/`−`
  zoom about the centre, `0` fits, Escape clears the selection.
- **Hover** is coalesced to one hit-test per frame and re-resolved after every
  base redraw, so it follows content moving under a still pointer. Its key is
  read from the hit target, and the hit (with a cluster's members) is built only
  when the hover changes.
- **Click and selection**: a click selects the hit (with `multiSelect`,
  `ctrl`/`⌘` toggles). A click on a cluster expands it (§6); with the
  multi-select modifier it toggles all its members. Selection is structured,
  `{ elements: string[]; events: string[] }`, and is pruned when items are
  removed.

```ts
type HitResult<TData = unknown> =
  | { kind: 'element'; element: TimelineElement<TData> }
  | { kind: 'event'; event: TimelineEvent<TData> }
  | { kind: 'cluster'; events: TimelineEvent<TData>[]; count: number };

interface TimelineEventMap<TData> {
  viewportChange: ViewportState; // at most once per frame
  hover: HitResult<TData> | null;
  click: { hit: HitResult<TData>; modifiers: { ctrlOrMeta: boolean; shift: boolean } };
  selectionChange: Selection;
  dataChange: { elements: ChangeCounts; events: ChangeCounts }; // added/removed/updated
  ready: void; // the engine is constructed
  firstFrame: void; // the first frame with a size was drawn
}
```

The surface has `role="application"`, an accessible name
(`accessibility.label`) and an optional description; a DOM mirror of the
content is out of scope.

---

## 10. Live Updates

```ts
engine.setData(data); // replace everything
engine.addEvents(events); // sort the batch, merge once
engine.removeEvents(ids);
engine.updateEvent(id, patch); // re-indexed; a new time moves it
engine.addElements(elements);
engine.updateElement(id, patch); // in place; id is immutable
engine.removeElements(ids); // with every event touching them
```

`addEvents` sorts the incoming batch (O(m log m)) and merges it into the
columns once (O(n + m)); events at an equal time land after existing ones.
Removals compact the columns and recompute only the touched extents. A mutation
never refits the camera, so streaming doesn't jerk the view. Hosts streaming at
high frequency should batch, e.g. one `addEvents` per animation frame.

---

## 11. Styling and Theming

- **Theme** (`Theme`, overridden with a `ThemeInput`): `background` plus the
  groups `grid`, `header`, `layout`, `emphasis`, `cluster`, `rowSeparator`,
  `element` and `event`. An override is merged group by group, so
  `{ header: { height: 56 } }` changes only that; dash arrays are replaced
  whole. Sizes are CSS px; colours any CSS colour.
- **Resolution order**, per property, most specific first: the item's `style`
  → the host resolver (`styleResolvers.element/event`) → the theme's
  `element`/`event` defaults. Undefined falls through.
- **Formatters**: `elementLabel`, `eventLabel`, `tickLabel`.
- **Icons**: a URL (loaded once, CORS-enabled first, reported if it fails), an
  emoji or glyph (drawn as text in the label colour), or any
  `CanvasImageSource`. An image that finishes loading triggers a redraw.
- Cluster markers use the theme's `cluster` colours and the default event
  stroke: a marker merges events whose styles may differ.
- Everything is changeable at runtime: `setTheme`, `setStyleResolvers`,
  `setFormatters`, `setOptions`; each invalidates only what depends on it.

Only `defaultTheme` ships in core; theming is the host's.

---

## 12. React Binding

```tsx
<Timeline<TData>
  ref={ref} // TimelineHandle<TData>
  data={data}
  theme={themeInput}
  options={{ multiSelect: true, clustering: { maxMarkers: 2000 } }}
  styleResolvers={{ element, event }}
  formatters={{ eventLabel }}
  tooltip // or renderTooltip={(hit) => …}
  onHover={…} onClick={…} onSelectionChange={…} onViewportChange={…}
  onDataChange={…} onReady={…} onFirstFrame={…}
/>
```

- One engine per component, mounted into the component's container. `theme`,
  `options`, `styleResolvers` and `formatters` are compared **field by field**
  (plain objects and arrays by content, functions by reference), so inline
  objects are fine; only real changes reach the engine. A new `data` reference
  calls `setData`.
- `TimelineOptions` is derived from the engine's options, so every engine
  option is available as a prop.
- The tooltip is positioned from the pointer without re-rendering React on
  every move, flips at the viewport edges, uses the theme's colours, and lists
  a cluster's members. `tooltip={false}` or a `renderTooltip` returning `null`
  hides it.
- The handle exposes the camera (`fit`, `panToTime`, `zoomToRange`, `zoomIn`,
  `zoomOut`, `setScrollY`, `scrollToElement`, `revealEvent`), selection
  (`select`, `getSelection`, `clearSelection`), data (`setData`, `getData`,
  `addEvents`, `removeEvents`, `updateEvent`, `addElements`, `removeElements`,
  `updateElement`), `getViewport`, `getRendererBackend`, `version` and the
  underlying `engine`. Methods called before the engine exists are no-ops;
  getters return `null`.
- StrictMode-safe and SSR-safe: nothing touches `window` at import time.

---

## 13. Performance Budgets

- **Budgets** under the reference profile (Chromium, CPU ×4, DPR 1, production
  build): base frame ≤ 16 ms and overlay frame ≤ 4 ms (medians). They are
  per-layer: in steady state only one layer redraws per frame.
- **Gate 2** (the 1.0 requirement): 50k events at 60 fps in every regime
  (interactive window, full zoom-out sparse, full zoom-out dense) on the
  backend users get on capable hardware, WebGL2: base and overlay within budget
  and the frame interval at 16.7 ms. The `perf-gpu` Playwright project asserts
  it; it skips itself where Chromium has no hardware WebGL2.
- **Canvas2D** is the fallback: budgets are hard-gated up to 10k events; above
  that the numbers are watchdogs. Its zoomed-out frames at 50k are dominated by
  rasterization, which the base timing doesn't include, so the perf spec
  reports the frame interval (p95) next to every median.
- **Tracking**: perf runs nightly on main (`perf.yml`), not on pull requests,
  and a scenario more than 20% and 1 ms slower than the last successful run
  fails it. `PERF_RUNNER` selects a dedicated runner. 100k is a watchdog only.
- **Harness**: `examples/demo/bench.html` drives the core engine directly
  (`?renderer=`, `?maxMarkers=`), with frame times from `onFrameStats`.

---

## 14. Testing

- **Unit (Vitest)**: the bulk. Core runs headless through injected recording
  renderers and manual frames (`src/testing/`); WebGL code runs against a
  recording fake GL. Coverage is measured with thresholds that only ratchet up.
- **Interaction (Playwright)**: Chromium, Firefox and WebKit against the e2e
  fixture page `examples/demo/e2e.html`, configured through its URL and
  `window.__e2e`, never through the demo's panel.
- **Golden (Playwright)**: fixed seeded scenes on the fixture page, compared to
  Linux baselines at 1% of pixels, Canvas2D and WebGL against the same
  baseline. Baselines are regenerated by the `update-goldens` workflow.
- **Perf**: §13.
- Seeded synthetic data generators are shared by the demo, tests and harness.

---

## 15. Delivery History

Moved to [`docs/HISTORY.md`](HISTORY.md).

---

## 16. Open Questions and Future Work

- **Durations**: `endTime` is reserved and validated but not drawn.
- **Arrow congestion**: risers sharing a pixel column get small sub-lane
  offsets; there is no full routing pass.
- **Cluster preview on hover**: hovering a marker shows its members in the
  tooltip; there is no in-canvas fan-out preview.
- **Not planned for 1.0**: drag-to-reorder (the `explicit` layout is the
  hook), minimap, PNG export, inertial panning, a numeric (non-time) axis, a
  DOM accessibility mirror, rendering in a worker, a WebGPU backend.

---

## 17. Verification

- `pnpm install && pnpm build`: both packages emit ESM, CJS and types.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage`: green.
- `pnpm test:e2e`: interaction (three browsers) and golden specs green on
  Linux; `pnpm exec playwright test --project perf --project perf-gpu
  --workers=1` for the budgets.
- `pnpm dev`: the demo shows lines with start markers, direction-aware arrows,
  the adaptive header, smooth pan and zoom about the cursor, hover tooltips,
  selection, clusters expanding on zoom, and streaming.
