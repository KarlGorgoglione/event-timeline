---
'@event-timeline/core': minor
'@event-timeline/react': minor
---

Add a curated, fully backward-compatible set of look-and-feel theme knobs (§11):

- **Border styles** — element line and event arrow **dash patterns**
  (`ElementStyle.lineDash` / `EventStyle.arrowDash`), plus dashed gridlines
  (`Theme.gridlineDash`), plumbed through the backend-free `Renderer` seam
  (`LineBatch.dash`).
- **Row/lane separators** — optional lines between rows
  (`Theme.rowSeparator`: `enabled`/`color`/`width`/`dash`), off by default.
- **Promoted hardcoded constants** into the theme: `gridlineWidth`,
  `lineLeadPadding`, `markerGap`, `eventLabelGap`, `clusterTextColor`,
  `clusterMarkerBonus`, `hoverWidthBonus`, `selectionWidthBonus`,
  `emphasisRadiusBonus`, `headerMajorTickRatio`, `headerMinorTickRatio`.

New types `LineDash` and `RowSeparatorStyle` are exported, and `defaultTheme` is
now re-exported from `@event-timeline/react`. Every new field defaults to the
previous literal value, so existing themes render identically. The React `theme`
prop accepts all new fields with no API change.
