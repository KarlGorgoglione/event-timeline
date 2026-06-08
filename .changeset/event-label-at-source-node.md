---
'@event-timeline/core': minor
'@event-timeline/react': minor
---

Add a configurable event-label **placement** (§11). `options.eventLabel.placement`
selects where each event's label sits relative to its arrow: `'sourceNode'`
centres it in a box above/below the source node dot (direction-aware), while
`'midpoint'` (the default) keeps it beside the riser at its vertical midpoint.

Placement only moves the label — its **style is identical in every placement**.
The themeable, per-event-resolvable label box (`EventStyle.labelBoxBackground`,
`labelBoxBorderColor`, `labelBoxBorderWidth`, `labelBoxBorderDash`,
`labelBoxPadding`) is drawn the same way wherever the label sits, so a box you
configure shows at the midpoint and at the source node alike. Defaults stay
transparent, so labels render as plain text until a fill or border is opted in.

Exposed on the React `options.eventLabel` prop; the `EventLabelPlacement` type is
exported from both packages.
