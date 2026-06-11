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

**Current state: Phase 7 complete (live/streaming updates) + WebGL backend (§4, §16).** Phase 3 (interactions) layered
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
The `@event-timeline/react` binding adds a portal-based default `Tooltip` plus
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

Phase 6 (§11) completes the **style resolution chain** and **formatters**. A single
pure `render/resolveStyle.ts` (`overlayStyle` + `Element/EventStyleResolver` types)
defines the §11 order — per-item `style` → resolver → theme default, most specific
wins, undefined falls through — once, reused for both element and event styles
(DRY). The engine binds four functions from its theme + host resolvers
(`resolveElementStyle`/`resolveEventStyle`/`formatElementLabel`/`formatEventLabel`)
and passes them on `BuildContext`, so the builders read one resolved `ElementStyle`/
`EventStyle` instead of inline `?? theme` chains and the resolution lives in exactly
one place (the emoji-glyph icon now also takes the resolved `labelColor`). Tick
labels route the host `tickLabel` formatter into the already-pluggable
`generateTicks` seam; clusters keep theme defaults (a merged marker has no single
event style). `TimelineEngineOptions<TData>` gains `styleResolvers`/`formatters`
(shared `StyleResolvers`/`Formatters` interfaces, reused verbatim by the React
`styleResolvers`/`formatters` props per §12); the demo adds theme/colours/labels
toggles (a light `Partial<Theme>`, data-driven palette resolvers, upper-casing
formatters). Core ships no theme preset beyond `defaultTheme` — theming stays
host-driven.

Phase 7 (§10, §7, §12) adds **live/streaming updates**: four incremental mutations
(`addEvents`/`removeEvents`/`addElements`/`updateElement` — §10 intentionally has no
`removeElements`) that re-enter the §5 single index-build path rather than rebuilding.
`addEvents`/`removeEvents` reuse the private `insertEvent`/`reindex` (append-then-sort
is the §10 "single merge" under V8 Timsort); `removeEvents` re-derives only the touched
elements' extents via `recomputeExtentFor` (shrink, or delete when an element loses its
last event); `updateElement` is an in-place immutable-`id` patch merge. A correctness
fix swaps the stable-sort tiebreak from `events.length` to a monotonic `seqCounter`
(reset only by `clear`) so equal-`time` `(time, seq)` ordering survives remove-then-add.
A new pure `layout/stableAppend.ts` helper (engine-internal, **not** a `LayoutStrategy` —
it needs prior order, so it stays beside the strategies, not exported from the public
barrel) slots new rows in without reshuffling existing ones. The engine adds a shared
`applyMutation` (no-op short-circuit → relayout → `dataChange` → mark base dirty;
deliberately no `maybeFit`, so streaming never jerks the camera) and a
`recomputeLayout(mode)` split: `'full'` runs the strategy (used by `setData`),
`'stable-append'` applies the helper synchronously. A new `streamingLayout:
'stable-append' | 'full'` option (default `'stable-append'`) routes the opt-in `'full'`
relayout through the existing debounced `scheduleLayoutRecompute()` seam. The four
mutations are exposed on the React imperative handle and `streamingLayout` through
`TimelineOptions`; the demo gains a Stream toggle that appends batches via `addEvents`.

The **WebGL backend** (§4, §16 implementation notes) fills the long-promised
`Renderer` seam: `render/webgl/` adds a WebGL2 `WebGLRenderer` (one `GlLayer`
per canvas; a single shader program with solid/SDF-circle/textured fragment
modes; one order-preserving draw call per engine batch) selected by a
`createRenderer` factory behind a new `renderer: 'auto' | 'canvas2d' | 'webgl'`
option (default `'auto'`: WebGL2 only when hardware-accelerated — the probe
sets `failIfMajorPerformanceCaveat` — every failure path degrades to Canvas2D).
Look parity is by construction: shared `arrowGeometry.ts`, CPU dash expansion
with Canvas2D subpath phase (`webgl/dash.ts`), labels rasterized by an
offscreen 2D canvas into a per-context shelf-packed atlas keyed _including
colour_ (emoji ignore fillStyle), `measureText` from the same 2D context, and
premultiplied `(ONE, ONE_MINUS_SRC_ALPHA)` compositing. A canvas is bound to
its first context type for life, so the React binding keys the canvas elements
on the preference (backend switch = remount) and `dispose`/fallback paths never
`loseContext()` on a live canvas (StrictMode remounts re-acquire it). E2E:
existing pixel-reading specs pin `?renderer=canvas2d` (the demo seeds config
from that URL param), a parity golden renders WebGL against the Canvas2D
baseline, `webgl.spec.ts` smokes 10k + backend round-trip, and `bench.ts` pins
canvas2d so §13 budgets keep their calibration.

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

## Branching & releases

`main` is the trunk and the published branch — keep it green and releasable.

- **Feature work goes on a branch off `main`**, never directly on `main`:
  `git switch -c <type>/<short-name> main` (e.g. `feat/element-positioning`,
  `fix/cluster-hit-test`). Open a PR into `main`; CI runs on every PR
  (`pull_request`) and must pass before merge.
- **Add a changeset for every user-facing change**: `pnpm changeset`, pick the
  package(s) and bump type (`patch`/`minor` — stay pre-`1.0.0` until we
  deliberately cut v1), and commit the generated `.changeset/*.md` with the
  code. Internal-only changes (refactors, CI, docs) need none — skip it or use
  `pnpm changeset add --empty`.
- **Merging a PR into `main` does not publish.** The Changesets GitHub Action
  (`.github/workflows/release.yml`) keeps a single open **"Version Packages"**
  PR that accumulates all pending changesets (applying the version bumps +
  CHANGELOG). Publishing to npm happens only when **that** PR is merged — the
  workflow then builds and runs `npm publish` for each package whose version
  isn't on npm yet. So the release is a deliberate, separate merge, decoupled
  from feature merges.
- **Never branch off or hand-edit `changeset-release/main`** — it is the bot's
  auto-generated, force-pushed release branch.
- **Publishing uses npm Trusted Publishing (OIDC) — there is no `NPM_TOKEN`.**
  GitHub mints a short-lived OIDC credential per run (`id-token: write`), so
  publishing only works from this workflow on `main`, not locally. Requirements:
  each package has a **Trusted Publisher** configured on npmjs.com (owner
  `KarlGorgoglione`, repo `event-timeline`, workflow `release.yml`); the workflow
  upgrades npm to ≥ 11.5.1 (OIDC needs that + Node ≥ 22.14.0) and sets **no** npm
  auth token anywhere (any token, even empty, makes npm skip OIDC). We publish
  with `npm publish` rather than `changeset publish` because changesets shells
  out to pnpm, and pnpm 11.x has an open OIDC bug (pnpm/pnpm#11513). Both packages
  are public (`publishConfig.access: public`) with provenance attested from the
  workflow's OIDC identity. The repo also needs "Allow GitHub Actions to create
  and approve pull requests" enabled (for the Version Packages PR).

## Architecture & boundaries

Two published packages plus a private demo (`pnpm-workspace.yaml`):

- **`@event-timeline/core`** (`packages/core`) — the engine. Pure TypeScript, **zero
  React**, **never imports `CanvasRenderingContext2D`**. Its only runtime dep is
  `date-fns`, imported **per-function** (`import { addDays } from 'date-fns'`,
  never `import * as`) to stay tree-shakeable. It is handed a `<canvas>` and
  consumes pointer/wheel events directly; it attaches **no** `ResizeObserver` —
  size changes arrive via an imperative `engine.resize(cssW, cssH, dpr)` call
  the host drives.
- **`@event-timeline/react`** (`packages/react`) — thin binding. Owns the canvas
  layers, the `ResizeObserver`, and the HTML tooltip overlay; syncs props →
  engine imperatively (keeps React out of the render loop). React is a **peer
  dependency** (`>=18`).
- **`examples/demo`** — Vite + React playground. `vite.config.ts` aliases
  `@event-timeline/*` to package **source** (not `dist`), so the demo hot-reloads into
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
