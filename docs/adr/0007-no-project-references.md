# 0007 — tsup builds, independent type-checks, no TS project references

**Status**: Accepted

## Context

TypeScript project references (`composite`, `tsc -b`) order builds across
packages, but the packages are built by tsup, the demo and tests resolve
workspace packages to their source, and `tsc -b` would add declaration
outputs and build-order coupling that nothing else needs.

## Decision

Each package type-checks on its own (`tsc --noEmit`) against the other
packages' source through `paths`, and builds with tsup (ESM, CJS, `.d.ts`).
Vitest and Vite alias the packages to source too, so a fresh clone tests and
runs without a build.

## Consequences

- `pnpm typecheck`, `pnpm test` and `pnpm dev` work without `pnpm build`.
- Type errors that only appear against built declarations are caught by
  `pnpm build`, which CI runs.
