# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Canvas-2D, domain-agnostic timeline library for React, in a pnpm monorepo.
It renders **elements** (horizontal lanes) and **events** (directed arrows
between lanes at a point in time), targeting smooth pan/zoom at ~50k events.

**`docs/DESIGN.md` is the authoritative spec.** It defines the domain model,
coordinate system, rendering pipeline, indexing, layout, interaction model, and
a numbered phased delivery plan (§15). Read the relevant section before
implementing — code comments reference these sections by number (e.g. "§5",
"DESIGN.md §12"). Keep that habit when adding code.

**Current state: Phase 5 complete (layout engine).** Phase 3 (interactions) layered
on the Phase 2 renderer: direction-aware orthogonal arrows (riser + source node
dot + target arrowhead), self-event loop glyphs, event labels, and element
label+icon at each line start with a sticky-left fallback, all culled by the §5
row-interval test; `drawBase` decomposed into pure CSS-px "primitive builder"
modules `render/{specs,rowBand,elementLines,arrows,snap,iconCache,batch}.ts`
feeding a single snap pass; a backend-free `Renderer` seam. On top of that the
engine handles interaction (§9, §12): zoom-about-cursor, vertical scroll, a
click/pan pointer state machine, a 64px screen-space hit grid rebuilt once per
base draw (§5), per-frame coalesced hover, and click selection. Hover/selection
draw on an independent overlay layer (`hover`/`selectionColor` from the Theme)
that re-renders whenever the base does, so highlights track content under
pan/zoom. The builders emit identity-carrying `HitTarget` specs from the same
geometry they already compute (DRY), feeding both the hit grid and the overlay.
The `@timeline/react` binding adds a portal-based default `Tooltip` plus
`onHover`/`onClick`/`onSelectionChange` callbacks and `select`/`zoomToRange` on
the imperative handle; the demo gains a status bar, multi-select, and a 10k
synthetic-dataset toggle.

Phase 4 (§5, §6) makes that scale to ~50k events. Events are kept **time-sorted**
behind a single `reindex()` (the one index-build path §5: `setData` clears, then
inserts, then reindexes) with stable `(time, seq)` ordering, plus per-element
buckets (`Map<elementId, eventIndex[]>`). Horizontal culling in `render/arrows.ts`
is now a binary search (`model/temporalIndex.ts` `lowerBound`/`upperBound` →
`store.getEventsInRange`) over the camera-derived visible window, not a linear
scan. A pure, pluggable clustering pass (`cluster/{types,strategies,cluster}.ts`,
mirroring `layout/`) collapses dense same-key events within `minSeparationPx` into
a "×N" count marker (themeable `clusterColor`); clusters are hit-testable and
**click-to-zoom-expand** via `zoomToRange`, and fan back out automatically as you
zoom in (no persisted state). Per-event labels are suppressed below an LOD zoom
threshold. `clustering`/`lod` are configurable through `TimelineEngineOptions` and
the React `TimelineOptions`; the demo adds a 50k toggle and cluster status.

Phase 5 (§7) completes the pluggable **layout** trio behind the existing
`LayoutStrategy.order(elements, events): string[]` seam (pure, no pixels/camera —
the §3 coordinate-truth invariant). Alongside the default `byFirstEvent`,
`layout/barycenter.ts` adds crossing-reduction via iterative barycenter sweeps
(Jacobi-style global re-sort, seeded from `byFirstEvent` for DRY) that returns
the lowest edge-span order seen and stops on period-1/2 oscillation, and
`layout/explicit.ts` honours the `element.order` pin (unpinned rows fall back to
`byFirstEvent`); a `layout/index.ts` barrel exports all three. A reusable
trailing-edge `engine/debounce.ts` (`cancel`/`flush`, SSR-safe) is wired into the
engine as the `scheduleLayoutRecompute()` seam (cancelled on dispose, behind
`layoutDebounceMs`) that Phase 7's incremental mutations will call — `setData`
stays synchronous. `layout` + the strategies are exposed through
`TimelineEngineOptions`, the React `TimelineOptions`, and a demo layout toggle.
The temporal index's bucket consumers and incremental updates land in Phase 6+.
When building a feature, find its phase in §15 and its design section first.

## Commands

Run from the repo root (pnpm workspace; Node ≥22 required, pinned in `.nvmrc`).

| Command          | Purpose                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| `pnpm install`   | Install (Corepack provides pnpm; `corepack enable pnpm`).                          |
| `pnpm dev`       | Vite demo at http://localhost:5173 (aliased to package _source_, no build needed). |
| `pnpm build`     | Build both library packages via tsup (ESM + CJS + `.d.ts`).                        |
| `pnpm typecheck` | `tsc --noEmit` across all packages (`pnpm -r`).                                    |
| `pnpm lint`      | ESLint + `prettier --check`. `pnpm format` to fix.                                 |
| `pnpm test`      | Vitest unit suites (run once). `pnpm test:watch` to watch.                         |
| `pnpm test:e2e`  | Playwright smoke/interaction tests against the demo.                               |

**Single test:** `pnpm vitest run path/to/file.test.ts`, or filter by name with
`pnpm vitest run -t "substring"`. Target one workspace project with
`pnpm vitest run --project core` (or `--project react`).

**Playwright locally** needs browser libs once: `pnpm exec playwright install
--with-deps chromium` (CI does this automatically).

**Releases** use Changesets: `pnpm changeset` to add one, `pnpm release` to
publish. The `demo` package is private and ignored by Changesets.

## Architecture & boundaries

Two published packages plus a private demo (`pnpm-workspace.yaml`):

- **`@timeline/core`** (`packages/core`) — the engine. Pure TypeScript, **zero
  React**, **never imports `CanvasRenderingContext2D`**. Its only runtime dep is
  `date-fns`, imported **per-function** (`import { addDays } from 'date-fns'`,
  never `import * as`) to stay tree-shakeable. It is handed a `<canvas>` and
  consumes pointer/wheel events directly; it attaches **no** `ResizeObserver` —
  size changes arrive via an imperative `engine.resize(cssW, cssH, dpr)` call
  the host drives.
- **`@timeline/react`** (`packages/react`) — thin binding. Owns the canvas
  layers, the `ResizeObserver`, and the HTML tooltip overlay; syncs props →
  engine imperatively (keeps React out of the render loop). React is a **peer
  dependency** (`>=18`).
- **`examples/demo`** — Vite + React playground. `vite.config.ts` aliases
  `@timeline/*` to package **source** (not `dist`), so the demo hot-reloads into
  the library and runs on a fresh clone without a prior build.

Both packages build with **tsup** (per-package `tsup.config.ts`), type-check
independently with `tsc --noEmit`, and have `sideEffects: false`.

### Invariants to preserve (from DESIGN.md — these are design decisions, not accidents)

- **Single source of coordinate truth (§3).** All time↔screen math
  (`timeToScreenX`, `screenXToTime`, `rowToScreenY`, …) lives **only** in the
  scale/Camera module. No raw `pxPerMs` arithmetic anywhere else — renderer,
  hit-test, and interaction all call the helpers. Pan is anchored in the **time
  domain** (`originTime`), never as a pixel offset.
- **One index-build path (§5).** `setData` (full rebuild) is defined as "clear,
  then apply through the incremental insert routine." Do **not** write a second
  parallel index builder — incremental and batch paths must share code.
- **Renderer is a backend-free seam (§4).** `Renderer` exposes only primitive
  draw verbs in device pixels so a WebGL backend can replace Canvas2D without
  engine changes. Don't leak Canvas2D types through it.
- **DPR handling (§3):** backing store is `cssSize * dpr`, the context is **not**
  pre-scaled — coordinates are multiplied by `dpr` and snapped to integer device
  pixels in draw code. Don't also `ctx.scale` (double-scaling).
- **Lenient validation (§1).** Invalid items are dropped, never thrown, and
  reported through an injectable `onDiagnostic` sink — not a hard-coded
  `console`. Keep the core decoupled from logging.
- **Calendar math in UTC** via `date-fns`, so ticks/golden tests are
  machine-stable.

## Conventions

- TypeScript is strict with `noUncheckedIndexedAccess`, `verbatimModuleSyntax`
  (use `import type` for types), and `isolatedModules`. Module resolution is
  `Bundler`.
- Prettier: single quotes, semicolons, trailing commas, 80-col.
- Unused vars error unless prefixed `_`.
- `tsconfig.base.json` deliberately does **not** use TS project references /
  `composite` (a documented deviation from DESIGN.md §2) — packages type-check
  independently and build with tsup. Don't reintroduce `tsc -b` without reason.

## Testing

`vitest.config.ts` is a single root config with two `projects`: `core` (node
env) and `react` (jsdom env, globals on, `vitest.setup.ts` for Testing
Library). `vitest run` at the root runs both. Unit tests live next to source as
`*.test.ts(x)`; Playwright e2e lives in `examples/demo/tests`. The bulk of core
logic is pure and deterministic — unit-test the math (scale, ticks, layout,
clustering, extents, hit-testing); reserve Playwright for golden render +
interaction + perf (§14).
