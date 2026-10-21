# 0008 — Tokenless publishing after CI, in least-privilege jobs

**Status**: Accepted

## Context

Publishing used one job that held `contents: write`, `pull-requests: write`
and `id-token: write` while running `pnpm install` (with install scripts) and
an unpinned `npm install -g npm@latest`, and it ran on every push to main in
parallel with CI, so a release could ship without lint, types or tests.
pnpm 11 has an open bug publishing with OIDC (pnpm/pnpm#11513).

## Decision

- Publish with npm Trusted Publishing (OIDC): no npm token exists anywhere.
- The release workflow runs on `workflow_run` after CI succeeds for a push to
  main, on the commit CI verified.
- Three jobs:
  - **version** opens the Changesets "Version Packages" PR and installs
    without scripts;
  - **build** packs each unpublished package with `pnpm pack` (which rewrites
    `workspace:` ranges) and has no write access;
  - **publish** holds `id-token: write`, installs nothing but a pinned npm, and
    runs `npm publish --provenance` on the tarballs, then creates the GitHub
    Releases.
- Every action in every workflow is pinned by commit SHA.

## Consequences

- Merging a PR never publishes; merging the Version Packages PR does, and only
  once CI is green.
- Publishing works only from this workflow on main (the Trusted Publisher on
  npmjs.com names `release.yml`).
- Action and npm upgrades are explicit edits to the pinned SHAs and version.
- CI holds no write permissions. Deploying the demo is a workflow of its own
  (`pages.yml`, also after CI passes), so a GitHub Pages outage can't fail CI
  and block a release.
