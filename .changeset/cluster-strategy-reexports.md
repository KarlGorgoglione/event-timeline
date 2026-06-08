---
'@event-timeline/react': minor
---

Re-export the built-in cluster strategies (`byPixelColumn`, `byElementPair`,
`byDay`, `bySourceTargetColumn`) and the `ClusterStrategy` type from
`@event-timeline/react`, mirroring the existing layout-strategy re-exports. Hosts
can now name a clustering strategy in `options.clustering.strategy` without taking
a direct dependency on `@event-timeline/core`.
