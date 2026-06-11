---
'@event-timeline/react': patch
---

Fix the published manifest so the package installs under any package manager
(npm, yarn, bun, …): the release workflow now packs with `pnpm pack`, which
rewrites the `@event-timeline/core` dependency from the pnpm-only
`workspace:` protocol to a real semver range (`^x.y.z`). Previously published
versions shipped `"@event-timeline/core": "workspace:*"` verbatim, which only
pnpm can resolve.
