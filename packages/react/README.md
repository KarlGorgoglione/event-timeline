# @event-timeline/react

React binding for [`@event-timeline/core`](https://www.npmjs.com/package/@event-timeline/core)
— a Canvas-based, domain-agnostic timeline that renders **elements** (horizontal
lanes) and **events** (directed arrows) and stays smooth at large scale.

A thin binding: it owns the two `<canvas>` layers, the `ResizeObserver`, and the
HTML tooltip overlay, and syncs props to the engine imperatively so React stays
out of the render loop. See
[`docs/DESIGN.md`](https://github.com/kgorgoglione/event-timeline/blob/main/docs/DESIGN.md)
§12 for the contract.

## Install

```bash
pnpm add @event-timeline/react @event-timeline/core react react-dom
```

`react` and `react-dom` are **peer dependencies** (`>=18`, i.e. React 18 & 19).

## Usage

```tsx
import { useMemo, useRef } from 'react';
import { Timeline, type TimelineHandle } from '@event-timeline/react';

function MyTimeline({ elements, events }) {
  const ref = useRef<TimelineHandle>(null);

  // Memoize props by reference — the binding diffs them and re-applies only on
  // change (passing fresh inline objects each render re-runs setData; §12).
  const data = useMemo(() => ({ elements, events }), [elements, events]);

  return (
    <Timeline
      ref={ref}
      data={data}
      options={{ multiSelect: true }}
      onHover={(hit) => {
        /* typed discriminated union: element | event | cluster | null */
      }}
      onSelectionChange={(ids) => {}}
      style={{ width: '100%', height: 480 }}
    />
  );
}
```

### Imperative handle

The `ref` exposes camera and streaming controls (§12): `fit()`, `panToTime(t)`,
`zoomToRange(start, end)`, `select(ids)`, `getViewport()`, `resize(w, h, dpr)`,
and the live-update methods `setData` / `addEvents` / `removeEvents` /
`addElements` / `updateElement`. For high-frequency streams, call these directly
to bypass React reconciliation and get incremental index updates.

### Props

Every engine event has a matching `on*` callback prop (`onHover`, `onClick`,
`onSelectionChange`, `onViewportChange`, `onDataChange`, `onReady`). Customise
via `theme` (`Partial<Theme>`), `styleResolvers`, `formatters`, and `options`
(`layout`, `clustering`, `lod`, `multiSelect`, `streamingLayout`,
`onDiagnostic`, `onFrameStats`, …). The component is generic — `Timeline<TData>`
threads your opaque `data` payload back through every callback. It is
StrictMode-safe and SSR-safe (the engine is created in an effect).

## License

[MIT](https://github.com/kgorgoglione/event-timeline/blob/main/LICENSE) ©
Karl Gorgoglione
