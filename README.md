# react-timeline

A Canvas-based, domain-agnostic timeline library for React. It renders
**elements** (horizontal lanes) and **events** (directed arrows between lanes at
a point in time), designed to stay smooth at ~50k events. See
[`docs/DESIGN.md`](docs/DESIGN.md) for the full architecture and phased plan.

> Status: **Phase 0 (tooling & scaffolding)**. The packages currently ship
> typed placeholders; the engine lands in later phases.

## Packages

| Package           | Description                                  |
| ----------------- | -------------------------------------------- |
| `@timeline/core`  | Framework-agnostic engine (pure TypeScript). |
| `@timeline/react` | React binding — `<Timeline />`.              |
| `examples/demo`   | Vite + React playground (private).           |

## Prerequisites

- **Node ≥ 22** (the toolchain pins pnpm, which requires Node 22+). With
  [nvm](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22`.
- **pnpm** via Corepack: `corepack enable pnpm`.

## Getting started

```bash
pnpm install
pnpm dev          # run the demo at http://localhost:5173
```

## Scripts (run from the repo root)

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm build`     | Build both library packages (ESM + CJS + types). |
| `pnpm typecheck` | `tsc --noEmit` across all packages.              |
| `pnpm lint`      | ESLint + Prettier check.                         |
| `pnpm test`      | Vitest unit suites (core + react).               |
| `pnpm test:e2e`  | Playwright smoke test against the demo.          |

> Running Playwright locally needs the browser system libraries:
> `pnpm exec playwright install --with-deps chromium` (CI does this
> automatically).
