# react-timeline

A Canvas-based, domain-agnostic timeline library for React. It renders
**elements** (horizontal lanes) and **events** (directed arrows between lanes at
a point in time), designed to stay smooth while panning/zooming large datasets.
See [`docs/DESIGN.md`](docs/DESIGN.md) for the full architecture and phased plan.

> Status: **v1 feature-complete** (Phases 0–8). Pan/zoom, hover/selection,
> clustering & LOD, pluggable layout, theming, live/streaming updates, plus a
> perf/size/golden test gate and Changesets-driven publishing.

## Packages

| Package                                             | Description                                  |
| --------------------------------------------------- | -------------------------------------------- |
| [`@event-timeline/core`](packages/core/README.md)   | Framework-agnostic engine (pure TypeScript). |
| [`@event-timeline/react`](packages/react/README.md) | React binding — `<Timeline />`.              |
| `examples/demo`                                     | Vite + React playground (private).           |

## Install

```bash
# React apps:
pnpm add @event-timeline/react @event-timeline/core react react-dom

# Framework-agnostic (engine only):
pnpm add @event-timeline/core
```

See each package's README for usage. The fastest way to explore the surface is
the demo (`pnpm dev`).

## Prerequisites (development)

- **Node ≥ 22** (the toolchain pins pnpm, which requires Node 22+). With
  [nvm](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22`.
- **pnpm** via Corepack: `corepack enable pnpm`.

## Getting started

```bash
pnpm install
pnpm dev          # run the demo at http://localhost:5173
```

## Scripts (run from the repo root)

| Command          | What it does                                             |
| ---------------- | -------------------------------------------------------- |
| `pnpm build`     | Build both library packages (ESM + CJS + types).         |
| `pnpm typecheck` | `tsc --noEmit` across all packages.                      |
| `pnpm lint`      | ESLint + Prettier check.                                 |
| `pnpm test`      | Vitest unit suites (core + react + demo).                |
| `pnpm test:e2e`  | Playwright `interaction`, `golden`, and `perf` projects. |
| `pnpm size`      | Bundle-size budgets (size-limit; fails CI on overage).   |

> Running Playwright locally needs the browser system libraries:
> `pnpm exec playwright install --with-deps chromium` (CI does this
> automatically). Target one suite with `--project=interaction|golden|perf`.

## Performance

The engine is benchmarked against the [§13](docs/DESIGN.md) budgets under a
pinned baseline — Chromium, **CPU throttling ×4, DPR 1** — so the gate is
machine-independent. `pnpm test:e2e --project=perf` drives the headless harness
at `bench.html` over 1k/10k/50k/100k events and reports per-layer frame medians.

- **Hard gate:** ≤16 ms base-layer frame up to ~10k events, and ≤4 ms overlay
  frame through 50k, both in the interactive (windowed pan) regime.
- **Watchdogs (logged, not gated):** the full zoom-out regime is O(n) by design
  (§5) — the whole domain visible — and base time grows linearly with the
  visible event count; 100k is out of scope for v1. Meeting ≤16 ms base at 50k
  needs the precomputed zoomed-out aggregation deferred past v1 (§13/§16).

Bundle-size budgets (gzip/brotli, enforced by `pnpm size`): `@event-timeline/core`
≤ 30 KB, `@event-timeline/react` ≤ 5 KB on top of core.

## Releasing

Versioning and publishing use [Changesets](https://github.com/changesets/changesets):
`pnpm changeset` to record a change, then the release workflow versions and
publishes on merge to `main` (needs an `NPM_TOKEN` repo secret and the
`@event-timeline` scope). The `demo` package is private and never published.

## License

[MIT](LICENSE) © Karl Gorgoglione
