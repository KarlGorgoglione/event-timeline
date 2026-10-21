# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

## What this is

A Canvas-based, domain-agnostic timeline library in a pnpm monorepo: a
framework-free engine (`@event-timeline/core`) and a React binding
(`@event-timeline/react`). It renders **elements** (horizontal lanes) and
**events** (directed arrows between lanes at a point in time), and holds
60 fps at 50k events on its WebGL2 renderer (Canvas2D is the fallback).

- [`docs/DESIGN.md`](docs/DESIGN.md) is the **specification** of current
  behaviour. Code comments cite it by section (`§5`); keep doing that, and
  keep section numbers stable. Read the relevant section before changing
  behaviour, and update it when behaviour changes.
- [`docs/adr/`](docs/adr/README.md) records the decisions that bind the code;
  add one for a new binding decision.
- [`docs/HISTORY.md`](docs/HISTORY.md) and the package `CHANGELOG.md` files
  hold history. Don't narrate history in code comments or here.

## Commands

Run from the repo root (Node ≥ 22, `.nvmrc`; pnpm via `corepack enable pnpm`).

| Command              | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `pnpm install`       | Install.                                                      |
| `pnpm dev`           | Demo at http://localhost:5173 (packages aliased to source).   |
| `pnpm build`         | Build both packages with tsup (ESM + CJS + `.d.ts`).          |
| `pnpm typecheck`     | `tsc --noEmit` in every package.                              |
| `pnpm lint`          | Type-aware ESLint + `prettier --check`. `pnpm format` to fix. |
| `pnpm test`          | Vitest (projects: core, react, demo).                         |
| `pnpm test:coverage` | Vitest with coverage thresholds (what CI runs).               |
| `pnpm test:e2e`      | Playwright against the demo app.                              |
| `pnpm size`          | Bundle-size budgets.                                          |
| `pnpm docs:api`      | TypeDoc API reference into `docs/api/`.                       |

- One test: `pnpm vitest run path/to/file.test.ts`, or `-t "name"`;
  one project: `--project core`.
- Playwright projects: `interaction`, `interaction-firefox`,
  `interaction-webkit` (opt-in on Windows: `E2E_WEBKIT=1`), `golden` (Linux
  baselines only), `perf` (Canvas2D) and `perf-gpu` (WebGL2 on the GPU; run
  with `--workers=1`). Browsers: `pnpm exec playwright install --with-deps
chromium firefox webkit`.
- E2E specs drive the fixture page `examples/demo/e2e.html` through its URL and
  `window.__e2e`, never through the showcase UI. Its presets and data hooks
  (`examples/demo/src/e2e/fixtureTheme.ts`) are pinned by a snapshot and the
  goldens: don't change their values. Perf uses `examples/demo/bench.html`.

## Branching and releases

`main` is the trunk and is always releasable.

- Work on a branch off `main` (`git switch -c <type>/<name> main`) and open a
  PR; CI must pass.
- Add a changeset for every user-facing change (`pnpm changeset`;
  `patch`/`minor` until 1.0). Internal-only changes need none.
- After CI passes on main, the release workflow keeps a **Version Packages**
  PR open; merging it publishes. Never branch off or edit
  `changeset-release/main`.
- Publishing is tokenless (npm Trusted Publishing, OIDC) and only works from
  `release.yml` on main; there is no `NPM_TOKEN` and none must be added. See
  [ADR 0008](docs/adr/0008-release-pipeline.md).
- Workflow actions are pinned by commit SHA; update the SHA and its comment
  together.

## Architecture and invariants

- **`@event-timeline/core`** has zero runtime dependencies and never imports
  React (lint-enforced). The engine owns its DOM surface: `mount(container)`
  creates the wrapper and canvases, follows size and DPR unless
  `autoResize: false`, and `unmount()` removes them. Renderer, scheduler and
  clock are injectable.
- **`@event-timeline/react`** is a thin binding: it depends on core and
  re-exports what React apps need; React is a peer dependency. It diffs
  `options`/`theme`/`styleResolvers`/`formatters` field by field and keeps
  React out of the render loop.
- **Single source of coordinate truth (§3)**: time↔screen math lives only in
  `scale/` (Camera helpers). Lint rejects `*` or `/` on `pxPerMs` elsewhere.
  Pan is anchored in time (`originTime`), never as a pixel offset.
- **One index-build path (§5)**: `setData` is "clear, then the same
  sort-and-merge `addEvents` uses". Don't add a second builder.
- **Renderer seam (§4)**: backends get typed batches in device pixels and
  expose primitive verbs only; no backend type leaks through. The WebGL2 and
  Canvas2D backends must stay look-identical (golden parity at 1%).
- **Frames allocate nothing per event (§4)**: write into the typed buffers;
  resolve styles through the `StyleTable`.
- **Device pixels (§3)**: backing store is `cssSize × dpr`, the context is not
  scaled; builders multiply by `dpr` and snap once. Fonts must be in `px`.
- **Lenient validation (§1)**: drop invalid items and report them through
  `onDiagnostic`; never throw on data, never log directly.
- **UTC calendar math** with native `Date`, so ticks and goldens are
  machine-stable.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`, `verbatimModuleSyntax`
  (`import type` for types) and `isolatedModules`; module resolution `Bundler`.
  No TS project references (ADR 0007).
- Prettier: single quotes, semicolons, trailing commas, 80 columns. Unused
  variables error unless prefixed `_`.
- Comments explain why, not history. Cite DESIGN sections where a rule comes
  from the spec.

## Testing

Unit tests live next to the source as `*.test.ts(x)`. Core logic is pure and
deterministic: test the math and builders headlessly with the helpers in
`packages/core/src/testing/` (recording renderer, manual frames, `testFrame`,
fake GL). Reserve Playwright for golden renders, real input and perf (§14).
Coverage thresholds only ratchet up.
