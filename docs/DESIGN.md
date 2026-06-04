# Canvas Timeline Library — Technical Design Document

## Context

This repository is an empty folder destined to become a **Canvas-based timeline
React library**, inspired by `vis-timeline`. The motivating use case (a bank
visualising the flow of money over time between clients, counterparties and cash
accounts) is only an *example*: the library itself must be **generic and
domain-agnostic**. It knows nothing about money, transactions, or banking. It
knows two things:

- **Elements** — entities drawn as horizontal *lines* (lanes) stacked
  vertically. (In the bank example: a client, a counterparty, or a "Cash" entity.)
- **Events** — directed connectors drawn as *arrows* between two elements at a
  point in time, optionally labelled. (In the bank example: a transfer of money
  from one entity to another on a given date.)

Time runs horizontally; elements stack vertically. The host application fetches
and filters the data (out of scope) and hands the engine a clean
`{ elements, events }` dataset to render. The goal of *this* document is to fully
specify the architecture so development can proceed in well-defined phases.

### Why Canvas

Datasets are large (design target: **~50,000 events across ~1,000s of element
lines**). DOM/SVG cannot sustain interactive pan/zoom at that scale. Canvas 2D
gives us full control over a virtualised, culled render loop while keeping text,
hit-testing and debugging far simpler than WebGL. The renderer sits behind an
interface so a WebGL backend can be added later without rewriting the engine.

### Decisions locked in during brainstorming

| Decision | Choice |
| --- | --- |
| Rendering | **Canvas 2D** behind a swappable `Renderer` interface (WebGL later) |
| Scale target | **~50k events / 1000s of lines**, smooth at 60fps |
| Packaging | **Agnostic TS core** + **thin React wrapper** (monorepo) |
| Time granularity | **Date-level** (day is finest); zoom decade→year→month→day |
| Arrow routing | **Orthogonal** (right-angle riser) by default |
| Cash / external flows | **No special handling** — host supplies them as ordinary elements |
| v1 interactions | Pan, zoom, **hover tooltips/highlight**, **click & selection**, **live/streaming updates**, **event collapsing/aggregation**, **auto-layout ordering** |
| Out of scope (v1) | Drag-to-reorder rows, WebGL backend, duration/range items, accessibility tree |

---

## 1. Domain Model

The core vocabulary is intentionally generic.

```ts
// A continuous timestamp in ms since the Unix epoch (UTC). "Date-level" is a
// display concern, not storage. All calendar interpretation — day boundaries,
// tick labels, day-clustering — is done in **UTC** (see §8). Storage is always ms.
type Time = number;

// The host payload type `TData` is threaded through the whole public API
// (`TimelineEvent<TData>` → `Timeline<TData>` → `onHover(p: HitResult<TData>)`),
// so callbacks hand back a typed `data` instead of `unknown`. It defaults to
// `unknown`, so consumers that don't care pay nothing and the old behaviour is
// preserved. The engine still never *interprets* `data`; the generic only
// improves type-safety at the boundary.
interface TimelineElement<TData = unknown> {
  id: string;
  label: string;
  icon?: string | HTMLImageElement; // URL, emoji, or preloaded image
  // optional per-element style overrides; merged over theme
  style?: Partial<ElementStyle>;
  // explicit ordering hint; honoured only by the `explicit` layout strategy
  // (§7), ignored by `byFirstEvent` and `barycenter`.
  order?: number;
  data?: TData; // opaque host payload, echoed back verbatim in callbacks
}

interface TimelineEvent<TData = unknown> {
  id: string;
  sourceId: string;   // element the arrow leaves
  targetId: string;   // element the arrow enters (arrowhead here)
  time: Time;         // the moment the event occurs
  label?: string;     // e.g. "$5,000 · 2026-03-04"
  style?: Partial<EventStyle>;
  data?: TData;
}

interface TimelineData<TData = unknown> {
  elements: TimelineElement<TData>[];
  events: TimelineEvent<TData>[];
}
```

Notes:
- An **element line** spans from a small padding *before its first event* to its
  *last event* (computed extent). Elements with no events have zero extent and
  are not drawn by default (configurable to draw a stub). Because the default
  layout orders by first-event time (§7), event-less elements have no natural
  ordering key: they sort **after** all elements that have events, in stable
  input order, and only appear when stub-drawing is enabled.
- The element's **label + icon** are anchored at the *start of its line* in world
  space (so they pan with the content), per the brief. Enhancement: when the
  line start scrolls off the left edge while the line is still visible, the label
  "sticks" to the left edge so it stays readable.
- Direction matters: the arrowhead is drawn at `targetId`. A small node dot marks
  `sourceId`.
- The engine never interprets `data`; it is opaque and returned verbatim in
  interaction callbacks.

### Data validation policy

At the design scale (50k machine-generated events) malformed input is expected.
Validation runs on every ingest (`setData`, `addEvents`, `addElements`) and is
**lenient by default**: invalid items are dropped, never thrown, so one bad row
never rejects a whole batch or breaks a live stream. Drops are reported through
an injectable diagnostics sink — `options.onDiagnostic?: (d: Diagnostic) => void`
— rather than a hard-coded `console`, so the core stays decoupled from any
logging implementation and the behaviour is unit-testable (DIP). When no sink is
supplied, the default sink forwards to `console.warn` in development builds
(`process.env.NODE_ENV !== 'production'`) — with the offending id(s), reason, and
a per-ingest summary count — and is a no-op in production. An item is invalid if:

- `time` is not a finite number (`NaN`/`±Infinity`/non-number);
- `sourceId` or `targetId` references an element id not present in the dataset
  (dangling edge);
- its `id` duplicates one already present (the later item is dropped; ids must be
  unique within `elements` and within `events` respectively).

Self-directed events (`sourceId === targetId`) are **valid** and rendered as a
small self-loop glyph on the element's own line (no inter-row riser).

---

## 2. Package & Repository Architecture

A pnpm monorepo with a strict separation between the framework-agnostic engine
and the React binding.

```
react-timeline/
├─ packages/
│  ├─ core/            @timeline/core   — pure TS, zero React, zero DOM-framework deps
│  │  └─ src/
│  │     ├─ model/        domain types, dataset store, indexes
│  │     ├─ scale/        time scale, camera, tick generation
│  │     ├─ layout/       vertical ordering strategies, extents
│  │     ├─ index/        spatial/temporal indexes + clustering
│  │     ├─ render/       Renderer interface, Canvas2DRenderer, layers
│  │     ├─ interaction/  pointer state machine, hit-testing
│  │     ├─ engine/       composition root, split by responsibility (SRP):
│  │     │                  Timeline      — thin facade / public API only
│  │     │                  FrameScheduler — rAF + per-layer dirty flags
│  │     │                  TypedEmitter   — typed pub/sub for engine events
│  │     │                  IndexStore     — single owner of all derived indexes
│  │     └─ index.ts
│  └─ react/           @timeline/react  — <Timeline/>, hooks, overlays
│     └─ src/
│        ├─ Timeline.tsx
│        ├─ useTimeline.ts
│        ├─ Tooltip.tsx   (HTML overlay via portal)
│        └─ index.ts
├─ examples/
│  └─ demo/            Vite + React playground with synthetic 50k dataset
├─ package.json (workspaces)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ docs/DESIGN.md      (this document)
```

`@timeline/core` is handed a `<canvas>` element and consumes its DOM
pointer/wheel events directly; it does **not** attach a `ResizeObserver` or
assume any framework — size changes arrive through an imperative
`engine.resize(cssWidth, cssHeight, dpr)` call that the host (the React layer, or
any other embedder) drives (see §12). It does **not** import React. The single
runtime dependency is **`date-fns`** for calendar arithmetic (variable-length
months/years for UTC tick generation, §8); to stay tree-shakeable it is always
imported per-function (`import { addDays } from 'date-fns'`), never
`import * as`. Everything else is dependency-free.

`@timeline/react` declares React as a **peer dependency**, `react`/`react-dom`
`">=18"` (React 18 and 19), and assumes the automatic JSX runtime.

Build: **tsup** (ESM + CJS + `.d.ts`), TS project references, `vitest` for unit
tests, `@playwright/test` for visual/golden + perf tests, ESLint + Prettier,
Changesets for versioning.

**Bundle-size budgets** (gzipped, tracked in CI alongside the perf budgets of
§13): `@timeline/core` ≤ 30 KB excluding the tree-shaken `date-fns` functions
actually used; `@timeline/react` ≤ 5 KB on top of core. A size-regression check
fails the build on overage.

> Toolchain note: Node.js is **not currently installed** in this environment.
> Phase 0 must install Node (≥20) and pnpm before anything else.

---

## 3. Coordinate System & Camera

Two independent axes:

- **Horizontal = time.** `pxPerMs` *is* the horizontal zoom level.
- **Vertical = element rows.** Row `i` occupies
  `y = headerHeight + i * rowHeight (+ gaps)`. Row height is fixed; vertical zoom
  is not supported in v1 (vertical axis is scroll-only).

The horizontal pan is stored as a **time anchor**, not as a pixel offset, so that
pan and zoom compose cleanly and panning is zoom-independent. A **Camera** holds
`{ originTime, scrollY, pxPerMs }`, where `originTime` is the time mapped to the
left edge of the viewport (screen x = 0). Screen↔world transforms:

```
screenX = (t - originTime) * pxPerMs         // time → screen x
t       = originTime + screenX / pxPerMs      // screen x → time (used by hit-test)
screenY = worldY - scrollY                    // worldY = headerHeight + row*rowHeight
```

There is deliberately no separate "world-x in pixels" stored on the camera:
because world width (`extent * pxPerMs`) rescales on zoom, a stored pixel offset
would not be zoom-invariant. Anchoring pan in the time domain avoids that class
of bug.

Zoom is performed *about the cursor*: the time under the pointer, `tCursor =
originTime + cursorScreenX / pxPerMs`, is computed **before** changing
`pxPerMs`, then `originTime` is recomputed afterwards so the same `tCursor` lands
under the same screen x (`originTime = tCursor - cursorScreenX / pxPerMs`). Zoom
is clamped to `[minPxPerMs, maxPxPerMs]`, where `maxPxPerMs` comes from a max
useful day-width and `minPxPerMs` from fitting the data extent to the viewport
(see §3.1 for degenerate extents).

### 3.1 Degenerate extents (empty / single-instant data)

`minPxPerMs` and `fit()` derive from the data extent `[minTime, maxTime]`. When
the dataset is empty or collapses to a single instant (`maxTime - minTime === 0`,
or fewer than two distinct times), there is no finite extent to fit:

- **Empty dataset**: render the header + background only (empty state), with
  `pxPerMs` defaulted so a configurable default window (default: 30 days) spans
  the viewport, centred on "today" (host-overridable via `fit`/`zoomToRange`).
- **Single instant / zero extent**: treat the extent as a default window (again
  30 days) centred on that instant, so `minPxPerMs` is finite and `fit()` is
  well-defined. No division by zero ever reaches the scale math.

**Single source of coordinate truth (DRY).** The two transforms above live *only*
on the `Camera`/scale module, exposed as `timeToScreenX`, `screenXToTime`,
`rowToScreenY`, `screenYToRow` (plus inverse helpers). The renderer, hit-test
grid, and interaction state machine all call these — none re-derives
`(t - originTime) * pxPerMs` inline. This keeps zoom-about-cursor, culling, and
hit-testing provably consistent and is enforced by lint (no raw `pxPerMs`
arithmetic outside the scale module).

**Device-pixel-ratio handling.** The backing store is `cssSize * dpr`, but the
context is **not** pre-scaled (`ctx.scale` is *not* used). Instead the renderer
works in **device pixels**: coordinates and stroke widths produced by the Camera
(CSS px) are multiplied by `dpr` and **snapped to integer device pixels** in the
draw code, with a 0.5px device offset for hairlines. This is the one chosen DPR
convention — it gives crisp 1px strokes even at fractional DPR (1.5, 2.25), which
pre-scaling the context cannot guarantee. (The earlier "pre-scale the context"
phrasing was removed: pre-scaling *and* multiplying by `dpr` would double-scale.)

---

## 4. Rendering Pipeline

### Layered canvases

Two stacked `<canvas>` elements (plus the HTML overlay layer for tooltips):

1. **Base layer** — time header, gridlines, element lines, arrows, labels.
   Redrawn only when *camera or data* changes (pan, zoom, resize, data update).
2. **Overlay layer** — hover highlight, selection outlines, crosshair, hovered
   cluster expansion. Redrawn cheaply (rAF-coalesced; see §9) without touching the
   expensive base layer.

This split is what keeps **hover** at 60fps independent of dataset size: hovering
touches only the overlay. **Pan and zoom are a different cost class** — they are
camera changes, so the base layer redraws on every animation frame of the
gesture, and that redraw is dataset-dependent and bounded by the 16ms base budget
(§13). The base/overlay split does not make pan size-independent; the culling,
LOD and clustering of §5–§6 are what keep pan within budget.

### The `Renderer` seam (interface contract)

The swappable-backend promise only holds if the seam is an explicit, backend-free
interface. `Canvas2DRenderer` is one implementation; a future `WebGLRenderer` must
be **substitutable without engine changes** (LSP), so the interface exposes only
primitive drawing verbs in device pixels and leaks no Canvas2D-specific type:

```ts
interface Renderer {
  resize(deviceWidth: number, deviceHeight: number): void;
  beginFrame(layer: Layer): void;            // clear/prepare a layer
  // Batched primitives — implementations group by style internally (§ micro-opts).
  drawLines(batch: LineBatch): void;         // element lines, gridlines, arrow risers
  drawArrowheads(batch: ArrowheadBatch): void;
  drawNodes(batch: NodeBatch): void;         // source dots, cluster markers
  drawText(batch: TextBatch): void;          // labels, tick text, "×7" counts
  drawImages(batch: ImageBatch): void;       // element icons
  measureText(text: string, font: string): TextMetricsLite; // cached by caller
  endFrame(layer: Layer): void;
}
type Layer = 'base' | 'overlay';
```

Note `measureText` is part of the contract because layout/LOD need text metrics;
a WebGL backend supplies its own (e.g. glyph-atlas) measurement. The engine never
imports `CanvasRenderingContext2D`.

### Render loop

- A single `requestAnimationFrame` scheduler (`FrameScheduler`) with a
  **dirty-flag** per layer.
  Nothing redraws unless marked dirty. No continuous repaint.
- Frame steps for the base layer:
  1. Compute visible time range `[tStart, tEnd]` and visible row range from the
     camera + viewport size.
  2. Query indexes for visible elements and events (Section 5).
  3. Apply level-of-detail / clustering for the current `pxPerMs` (Section 6).
  4. Draw in order: background → header/grid → element lines → arrows → event
     labels → element labels+icons. Element labels are anchored in world space at
     each line's start (so they pan with the content); when a line's start has
     scrolled past the left edge while the line is still visible, its label
     "sticks" to the left edge instead (the sticky-left fallback of §1). There is
     no separate fixed gutter column — the label is always part of the base
     layer, drawn last so it sits above lines and arrows.

### Canvas-2D micro-optimisations (enforced in render code)

- **Batch by style**: group strokes/fills sharing a colour/width into a single
  `beginPath()/stroke()` to minimise context state changes.
- Cache `measureText` results; cap the number of labels drawn per frame.
- Reuse scratch objects; avoid per-frame allocation in hot paths.
- Image/icon cache keyed by URL.
- Integer-align coordinates; pre-translate by 0.5px for hairlines.

---

## 5. Indexing & Virtualisation (for 50k)

All derived indexes are owned by a single `IndexStore` (§2). Crucially, the
**full-rebuild path (`setData`) and the incremental path (`addEvents`/
`removeEvents`/…) are the same code**: rebuild is defined as "clear, then apply
the whole dataset through the incremental insert routine." There is no second,
parallel index-building implementation to drift out of sync — a common bug when
incremental and batch paths are written separately (DRY). Extent computation
likewise lives in one place and is reused by layout, rendering, and mutations.
Indexes are rebuilt/updated on data change only (not on pan/zoom):

- **Elements**: array + `Map<id, element>`; layout assigns a row index and y.
- **Element extents**: `Map<id, {minTime, maxTime}>` for line start/end and the
  "few pixels before first event" padding.
- **Temporal index for events**: a single array of events **sorted by `time`**.
  Horizontal culling is a binary search for `[tStart, tEnd]` → O(log n + k),
  where k = the count whose `time` falls in the visible time range. Vertical
  culling then drops an event only when the **row interval it spans** — i.e.
  `[min(sourceRow, targetRow), max(sourceRow, targetRow)]` — does *not* intersect
  the visible row band. Culling by endpoint rows alone would be a **bug**: an
  arrow whose source is above the band and target is below it has both endpoints
  off-screen yet its vertical riser crosses the band and must be drawn.
- **Per-element event buckets** (`Map<elementId, eventIndex[]>`) to support
  per-line queries and clustering.

`k` is bounded by the **time** window, not the 2-D viewport — there is no spatial
(2-D) index in v1. When the time window is narrow (the common interactive case),
`k` is small and per-frame cost is effectively independent of dataset size. The
**worst case is full zoom-out** (`fit()` / whole domain visible): then `k ≈ n`,
and both the vertical filter and per-frame clustering (§6) are O(n). This is the
explicit stress case for the 16ms budget; v1 accepts O(n) here and verifies it
fits at 50k in the benchmarks (§13). A precomputed coarse aggregation for the
zoomed-out regime is documented as a deferred lever (§13, §16) and is the
intended fix should 50k miss budget or should 100k become a target.

### Hit-testing index

Rebuilt from the *visible* primitives whenever the base layer redraws (camera or
data change) — **not** on every `pointermove`: a uniform **screen-space grid**
(e.g. 64px cells) mapping cell→primitives. While the camera is static (pure
hover), the existing grid is reused unchanged, so hover stays cheap. `pointermove`
looks up the cursor's cell and tests the few candidates. Arrow hit-test =
distance to the orthogonal segment + arrowhead bbox; element line = distance to
its horizontal segment; cluster marker = rect containment.

---

## 6. Level-of-Detail, Collapsing & Aggregation

At lower zoom, many events fall into the same pixel column and labels become
unreadable. Two mechanisms:

- **Label LOD**: below a `pxPerMs` threshold, suppress per-event labels; show them
  again on zoom-in or on hover.
- **Collapsing / clustering** (a v1 feature): events that would render closer than
  `minSeparationPx` are merged into a **cluster marker** showing a count
  (e.g. "×7"). For OCP consistency with layout, clustering is a pluggable
  **`ClusterStrategy`**, not a closed enum, so hosts can supply their own keying
  without forking the engine:

  ```ts
  interface ClusterStrategy {
    // Stable key for an event at the current zoom; events sharing a key and
    // within minSeparationPx collapse into one marker. ctx carries pxPerMs etc.
    key(event: TimelineEvent, ctx: ClusterContext): string;
  }
  ```

  Three built-ins are shipped — `byPixelColumn`, `byElementPair`, `byDay` — and
  the default is a composed `bySourceTargetColumn` (`(sourceId, targetId,
  pixelColumn)`). Clusters expand on zoom-in past the threshold, or on click/hover
  (overlay shows the members).

A cluster is a derived primitive, computed during the frame from the visible
event slice — no precomputation needed, keeping live updates cheap. The cost is
linear in the visible slice; at full zoom-out that slice is ≈ the whole dataset
(§5), which is the accepted O(n) stress case measured against the budget. Because
the cluster key includes `pixelColumn`, clusters are recomputed each frame that
the camera changes (they depend on zoom and pan).

---

## 7. Layout Engine (auto-ordering)

The vertical order of element lines is computed by a pluggable
`LayoutStrategy` to "minimise clutter for a nice display":

```ts
interface LayoutStrategy {
  // Pure function of the data — returns element ids in top-to-bottom order.
  // No rendering, no side effects; trivially unit-testable.
  order(elements: readonly TimelineElement[], events: readonly TimelineEvent[]): string[];
}
```

The engine maps that order to row indices and y positions; strategies never touch
pixels or the camera (SRP). Built-in strategies:

- **`byFirstEvent`** (default): order elements by the time of their first event
  (chronological introduction). Predictable, stable, cheap. Event-less elements
  (no first-event key) sort last, in stable input order (§1).
- **`barycenter`**: a crossing-reduction pass over the **single row ordering**.
  This is *not* layered (Sugiyama) graph drawing — there are no layers; arrows run
  between arbitrary rows at arbitrary times. It is the single-axis
  ordering/linear-arrangement problem (NP-hard), for which iterative barycenter
  sweeps are a standard heuristic: starting from an initial order, repeatedly
  reposition each row at the average (barycenter) row-index of its neighbours
  across a few sweeps, to pull strongly-connected elements together and reduce
  arrow vertical span and crossings.
- **`explicit`**: honour `element.order` exactly (host-controlled / "pinned").

Layout output = ordered elements with y positions, recomputed on data change and
debounced. During **streaming** updates, the default is *stable append* (new
elements slot in without reshuffling existing rows) to avoid jarring jumps;
a full re-layout is opt-in.

> Drag-to-reorder is out of scope for v1, but `explicit` ordering provides the
> hook a future drag feature would write into.

---

## 8. Time Header & Axis

A multi-row sticky header (top of viewport, fixed vertically, panning with time):

- An **adaptive tick generator** chooses tick levels from `pxPerMs`:
  e.g. top row = year or month, bottom row = month or day, picking "nice" steps
  (1/2/5/10 days, weeks, months, quarters, years) so labels never overlap.
- Calendar math (month/year boundaries, day starts) is computed in **UTC** via
  `date-fns`, so day/month/year boundaries and labels are identical on every
  machine and stable for golden tests. Localised display, if ever needed, is a
  post-v1 concern (would require a configurable time zone and `date-fns-tz`).
- Tick label formatting is overridable: `(date, level) => string` (the `date` is
  the UTC instant of the tick).
- Major ticks extend faint **gridlines** down through the content on the base
  layer.

The axis is internally a generic continuous scale, so a future non-time
(numeric) axis is possible, but v1 ships only the time/date scale.

---

## 9. Interaction Model

A small pointer **state machine** in `@timeline/core` consumes DOM pointer/wheel
events on the canvas and emits high-level events; the React layer subscribes.

- **Pan**: pointer drag → update `originTime` (horizontal time anchor, §3) and
  `scrollY` (vertical). Momentum/inertia is a deferred enhancement.
- **Wheel**: vertical scroll by default; `shift`+wheel → horizontal pan (and
  trackpad horizontal swipe maps to the same); `ctrl`/`⌘`+wheel (and trackpad
  pinch) → horizontal zoom about the cursor.
- **Hover**: pointer moves are **coalesced to one hit-test per animation frame**
  (the latest position wins); hit-test → emit `hover` with the primitive + opaque
  `data`; overlay highlights it; React positions an HTML tooltip (crisp text, no
  canvas text blur).
- **Click & selection**: hit-test → emit `click`/`select`; selection state held
  in core; overlay draws selection outlines. Multi-select is opt-in via an option
  and uses modifier-click — `ctrl`/`⌘`+click toggles an item in/out of the
  selection, plain click replaces it; with multi-select off, click is
  single-select.
- **Live updates** are decoupled from interaction (Section 10).

A hit is a **discriminated union** so consumers narrow on `kind` and get a typed
`data` payload (the `TData` generic of §1), rather than a loose "primitive":

```ts
type HitResult<TData = unknown> =
  | { kind: 'element'; element: TimelineElement<TData> }
  | { kind: 'event';   event: TimelineEvent<TData> }
  | { kind: 'cluster'; events: TimelineEvent<TData>[]; count: number };
```

Engine events are a **typed emitter map** (not a stringly-typed `EventEmitter`),
so `on`/`off` are checked against the payload type per event name:

```ts
interface TimelineEventMap<TData = unknown> {
  viewportChange: { timeRange: [number, number]; scrollY: number; pxPerMs: number; visibleRowRange: [number, number] };
  hover:          HitResult<TData> | null;          // null on leave
  click:          { hit: HitResult<TData>; modifiers: { ctrlOrMeta: boolean; shift: boolean } };
  selectionChange:{ ids: string[] };
  dataChange:     { added: number; removed: number; updated: number };
  ready:          void;
}
```

---

## 10. Live / Streaming Updates

Imperative core API for incremental change without a full rebuild:

```ts
engine.setData(data);                 // full replace
engine.addEvents(events);             // insert into sorted index + buckets, update extents
engine.removeEvents(ids);
engine.addElements(elements);         // stable-append layout by default
engine.updateElement(id, patch);
```

Each mutation updates only the affected indexes and extents, marks the base layer
dirty, and (debounced) re-runs layout if configured.

**Insert complexity.** The temporal index is a sorted array (§5), so a single
insert is O(n) (shift cost). `addEvents` is therefore designed for **batched**
inserts: it sorts the incoming batch of size `m` once (O(m log m)) and performs a
**single merge** into the existing array (O(n + m)), not `m` individual splices.
Hosts streaming at high frequency should coalesce events into batches (e.g. one
`addEvents` per animation frame) rather than calling per event. If profiling ever
shows the merge dominating, the documented escalation is a bucketed index
(per-UTC-day buckets, each small and individually cheap to insert into) behind the
same API — deferred until measured.

**React sync.** The React layer drives `setData` from the `data` prop via
shallow diffing: when the `elements`/`events` array references change it issues a
full `setData` (a full rebuild — acceptable for prop-driven updates, not for
high-frequency streams). For high-frequency streams, hosts use the imperative
`ref` API (`addEvents`/`removeEvents`/…) directly to bypass React reconciliation
and get incremental index updates.

---

## 11. Styling, Theming & Customisation

- **Theme object**: background, gridline, header text, default line/arrow colours,
  fonts, `rowHeight`, gaps, arrow thickness, arrowhead size, label padding.
- **Per-item style resolvers** (data-driven): `(element) => Partial<ElementStyle>`
  and `(event) => Partial<EventStyle>`.
- **Formatters**: event label, tick label, element label.
- **Icons**: `element.icon` as URL/emoji/`HTMLImageElement`, drawn in the label
  area; images preloaded and cached.
- **Resolution order**, most specific wins, per visual property:
  **per-item `style`** → resolver callback → theme default. That is, an explicit
  value on `element.style`/`event.style` overrides the resolver's value for the
  same property, which in turn overrides the theme default. (Each property is
  resolved independently; partials only override the keys they set.)

Widths and sizes are in **CSS pixels** (the renderer multiplies by `dpr`
internally, §3); colours are any valid CSS colour string.

```ts
interface ElementStyle {
  lineColor: string;
  lineWidth: number;     // CSS px
  labelColor: string;
  labelFont: string;     // CSS font shorthand, e.g. "12px Inter, sans-serif"
  iconSize: number;      // CSS px
}
interface EventStyle {
  arrowColor: string;
  arrowWidth: number;    // CSS px
  arrowheadSize: number; // CSS px
  labelColor: string;
  labelFont: string;
  nodeRadius: number;    // CSS px, source node dot
}

interface Theme {
  background: string;
  gridlineColor: string;
  headerTextColor: string;
  headerFont: string;
  rowHeight: number;     // CSS px
  rowGap: number;        // CSS px
  labelPadding: number;  // CSS px
  element: ElementStyle; // theme-level defaults (the base of the resolution chain)
  event: EventStyle;
}
```

`ElementStyle`/`EventStyle` reuse the same type at every level of the resolution
chain (theme default → resolver → per-item `style`), so there is a single
definition of "what is stylable" rather than parallel shapes per layer (DRY).

---

## 12. React Layer (`@timeline/react`)

```tsx
<Timeline
  data={{ elements, events }}
  theme={theme}
  options={{ layout: 'byFirstEvent', clustering: {...}, zoom: {...} }}
  styleResolvers={{ element, event }}
  formatters={{ eventLabel, tickLabel }}
  onHover={(hit) => ...}
  onSelectionChange={(ids) => ...}
  onViewportChange={(v) => ...}
  ref={ref}
/>
```

- Owns the two `<canvas>` elements + a positioned HTML overlay container.
- The React layer owns a `ResizeObserver` on the container and calls
  `engine.resize(cssW, cssH, dpr)` (core attaches no observer of its own, §2).
  `useTimeline` instantiates the core engine once and syncs props → engine
  imperatively (avoids React in the render loop).
- **Prop-sync / referential-stability contract.** Props are diffed by reference
  and only re-applied to the engine when the reference changes. `data`,
  `styleResolvers`, `formatters`, `theme`, and `options` should therefore be
  **memoized by the host** (`useMemo`/`useCallback`); passing fresh inline
  objects/functions every render will re-apply (and, for `data`, trigger a full
  `setData`) each render. This is documented prominently because the demo masks
  it (its props are stable) while real apps will not.
- Tooltip rendered via portal from hover state.
- **StrictMode**-safe (idempotent setup/teardown), **SSR-safe** (no `window` at
  import time; engine created in effect).
- The component is generic: `Timeline<TData>` with `forwardRef` exposing a typed
  handle (`useImperativeHandle`). Props mirror the engine's event map (§9) as
  optional callbacks; every emitted event has a corresponding `on*` prop so the
  React surface is a faithful, segregated view of the core API (ISP) rather than
  an arbitrary subset:

```ts
interface TimelineProps<TData = unknown> {
  data: TimelineData<TData>;
  theme?: Partial<Theme>;
  options?: TimelineOptions;          // { layout, clustering, zoom, multiSelect, onDiagnostic, ... }
  styleResolvers?: { element?: (e: TimelineElement<TData>) => Partial<ElementStyle>;
                     event?:   (e: TimelineEvent<TData>)   => Partial<EventStyle>; };
  formatters?: { eventLabel?: ...; tickLabel?: ...; elementLabel?: ...; };
  onHover?: (hit: HitResult<TData> | null) => void;
  onClick?: (e: TimelineEventMap<TData>['click']) => void;
  onSelectionChange?: (ids: string[]) => void;
  onViewportChange?: (v: TimelineEventMap<TData>['viewportChange']) => void;
  onDataChange?: (d: TimelineEventMap<TData>['dataChange']) => void;
  onReady?: () => void;
}

interface TimelineHandle<TData = unknown> {
  zoomToRange(start: Time, end: Time): void;
  panToTime(t: Time): void;
  fit(): void;
  select(ids: string[]): void;
  getViewport(): TimelineEventMap<TData>['viewportChange'];
  resize(cssW: number, cssH: number, dpr: number): void;
  // streaming methods of §10:
  setData(d: TimelineData<TData>): void;
  addEvents(e: TimelineEvent<TData>[]): void;
  removeEvents(ids: string[]): void;
  addElements(el: TimelineElement<TData>[]): void;
  updateElement(id: string, patch: Partial<TimelineElement<TData>>): void;
}
```

---

## 13. Performance Plan & Budgets

- **Budget**: ≤16ms base-layer frame and ≤4ms overlay frame at 50k events. These
  are **per-layer** budgets, not additive — in steady state only one layer is
  dirty per frame (pan ⇒ base; hover ⇒ overlay). The rare frame where both are
  dirty (e.g. hovering mid-pan) may reach ~20ms and drop a single frame; this is
  accepted, not a budget violation, because it does not recur frame-over-frame.
- **Reproducible baseline.** "Mid-range laptop" is pinned for CI as Chromium with
  CPU throttling ×4 (via CDP `Emulation.setCPUThrottlingRate`) at DPR 1; the
  numeric thresholds above are asserted under that profile so the perf gate is
  deterministic across machines.
- **Worst case = full zoom-out** (whole domain visible), where per-frame work is
  O(n) (§5–§6). The 50k budget is asserted specifically in this regime, not just
  when zoomed in.
- Levers (all above): viewport culling, overlay/base split, label LOD,
  clustering, style-batched drawing, text/image caches, allocation-free hot path,
  integer-aligned coordinates.
- **Memory budget.** Derived structures at 50k events / 1000s of lines: the
  sorted event array, `Map<id,element>`, `Map<id,extent>`, and per-element
  buckets storing **integer indices into the sorted array** (not object copies).
  Target ≤ ~10 MB of derived index overhead on top of the host's own data;
  tracked as a benchmark, not a hard gate.
- **Benchmarks** (Playwright + perf marks): frame time vs dataset size
  (1k/10k/50k/100k), pan/zoom interaction latency, time-to-first-render, derived
  memory. 100k is measured as a **watchdog only** — it is out of scope for v1
  (§ decisions table) and is expected to degrade gracefully (no pass/fail
  threshold); it exists to catch super-linear regressions early.
- Deferred scale levers (documented, not built in v1): WebGL backend, web-worker
  indexing, aggregated bin rendering for the zoomed-out regime / 100k+.

---

## 14. Testing Strategy

- **Unit (Vitest)** — the bulk; everything in core is pure/deterministic:
  time scale & zoom-about-cursor math, tick generation, layout strategies,
  clustering, extent computation, index range queries, hit-testing geometry.
- **Visual / golden (Playwright)** — render fixed seeded datasets to canvas and
  screenshot-compare; covers lines, orthogonal arrows, header, clusters, theming.
- **Interaction (Playwright)** — pan/zoom/hover/select against the demo app.
- **Perf** — benchmarks from Section 13 with regression thresholds.
- Seeded synthetic dataset generator (deterministic) shared by demo + tests.

---

## 15. Phased Delivery Plan

Each phase ends with a runnable demo and explicit acceptance criteria.

- **Phase 0 — Tooling & scaffolding.** Install Node 20 + pnpm; monorepo,
  `@timeline/core` and `@timeline/react` package skeletons, tsup build, Vitest,
  Playwright, ESLint/Prettier, Vite demo app, CI.
  *Accept:* `pnpm build/test/lint` green; empty `<Timeline/>` mounts.

- **Phase 1 — Core skeleton & static lines.** Domain model + store, `TimeScale`,
  `Camera`, `Renderer` interface + `Canvas2DRenderer`, DPR, layered canvases,
  rAF dirty-flag loop, draw element lines + a basic time header. Basic pan only.
  *Accept:* lines render at correct times; smooth horizontal pan.

- **Phase 2 — Arrows, labels, element identity.** Orthogonal arrows (riser + node
  dot + arrowhead, direction-aware), event labels, element label+icon at line
  start with sticky-left fallback, viewport culling (by **linear scan** at this
  phase — correct and fine at 10k; the binary-search temporal index that makes
  culling sub-linear arrives in Phase 4). Culling uses the row-interval test of
  §5, so arrows crossing the band with both endpoints off-screen are retained.
  *Accept:* 10k synthetic events render correctly and culled.

- **Phase 3 — Interactions.** Zoom-about-cursor, vertical scroll, pointer state
  machine, per-frame hit-test grid, hover highlight + HTML tooltip (React),
  click/selection events + selection overlay.
  *Accept:* hover/select correct; overlay independent of base redraws.

- **Phase 4 — Scale & LOD.** Sorted temporal index + per-element buckets, label
  LOD, event collapsing/aggregation clusters with expand-on-zoom/click.
  *Accept:* 50k events at ≥60fps pan/zoom; clusters behave.

- **Phase 5 — Layout engine.** `byFirstEvent` (default), `barycenter`
  crossing-reduction, `explicit` ordering; debounced recompute.
  *Accept:* measurable crossing reduction on a connected fixture.

- **Phase 6 — Theming & customisation.** Theme object, per-item style resolvers,
  formatters, icon pipeline, full style resolution order.
  *Accept:* demo themes + data-driven colours/labels.

- **Phase 7 — Live/streaming updates.** Incremental index/extent updates, stable
  append layout, imperative React `ref` API, prop-diff sync.
  *Accept:* streaming inserts at interactive rates without full rebuild.

- **Phase 8 — Polish & release.** Perf passes, golden tests, docs, examples,
  Changesets publish setup.
  *Accept:* benchmarks meet budgets; docs complete.

---

## 16. Risks, Open Questions & Future Work

- **WebGL backend** (post-v1) for 100k+; the `Renderer` interface is the seam.
- **Duration/range items** (vis-timeline-style bars on a line) — not modelled in
  v1; the `Event` type could later gain an `endTime`.
- **Orthogonal arrow congestion**: many risers at the same x need sub-lane
  x-offsets; clustering mitigates most cases but dense same-day fan-outs can still
  overlap. **v1 stance**: Phase 2 ships a simple deterministic sub-lane x-offset
  (spread risers sharing an x-column by a few px in stable order) and otherwise
  *accepts* residual overlap, relying on clustering (Phase 4) to collapse the
  densest cases. A full lane-assignment / routing pass is **out of scope for v1**
  and tracked here as future work; it is not a Phase acceptance criterion.
- **Accessibility**: canvas is opaque to AT; a future DOM mirror / keyboard nav is
  out of scope for v1.
- **Minimap / overview**, **PNG export**, **inertia panning** — deferred
  enhancements.

---

## 17. Verification (how to validate the build end-to-end)

- `pnpm install && pnpm build` — both packages emit ESM/CJS/types.
- `pnpm test` — Vitest unit suites + Playwright golden/interaction/perf pass.
- `pnpm --filter demo dev` — open the demo, load the seeded 50k dataset, and
  manually verify: lines start just before first event with label+icon; orthogonal
  direction-aware arrows with labels; adaptive day/month/year header; smooth
  pan/zoom-about-cursor; hover tooltip + highlight; click selection; clusters
  collapse/expand on zoom; streaming inserts stay interactive.
- Perf benchmark report shows ≤16ms base frame at 50k events.
