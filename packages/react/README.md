# @event-timeline/react

React binding for
[`@event-timeline/core`](https://www.npmjs.com/package/@event-timeline/core):
a timeline that renders **elements** (horizontal lanes) and **events**
(directed arrows) and stays at 60 fps with 50,000 events.

The binding mounts one engine into its container and keeps React out of the
render loop: props are applied to the engine imperatively, and the hover
tooltip is positioned without re-rendering. Contract:
[`docs/DESIGN.md`](https://github.com/KarlGorgoglione/event-timeline/blob/main/docs/DESIGN.md)
§12.

## Install

```bash
pnpm add @event-timeline/react
```

`react` and `react-dom` (`>=18`) are peer dependencies. The engine,
`@event-timeline/core`, comes with the binding, which re-exports its types,
strategies and `defaultTheme`: import everything from `@event-timeline/react`,
and don't add core separately (two versions would bundle two engines).

## Usage

```tsx
import { useRef } from 'react';
import {
  Timeline,
  type TimelineData,
  type TimelineHandle,
} from '@event-timeline/react';

function MyTimeline({ data }: { data: TimelineData<MyData> }) {
  const ref = useRef<TimelineHandle<MyData>>(null);
  return (
    <Timeline<MyData>
      ref={ref}
      data={data}
      // Inline objects are fine: options, theme, styleResolvers and formatters
      // are compared field by field, and only real changes reach the engine.
      options={{ multiSelect: true }}
      theme={{ header: { height: 52 } }}
      onHover={(hit) => {
        /* element | event | cluster | null, with your typed `data` */
      }}
      onSelectionChange={({ elements, events }) => {}}
      style={{ height: 480 }}
    />
  );
}
```

`data` is compared by reference: a new object calls `setData` (a full reload),
so keep it stable between renders (from state, a query cache, or `useMemo`).
Functions inside `options`, `styleResolvers` and `formatters` are compared by
reference too; a new function triggers a redraw.

### Imperative handle

The `ref` exposes the camera (`fit`, `panToTime`, `zoomToRange`, `zoomIn`,
`zoomOut`, `setScrollY`, `scrollToElement`, `revealEvent`), the selection
(`select`, `getSelection`, `clearSelection`), the data (`setData`, `getData`,
`addEvents`, `removeEvents`, `updateEvent`, `addElements`, `removeElements`,
`updateElement`), `getViewport`, `getRendererBackend`, `version` and the
`engine` itself. For high-frequency streams, call `addEvents` on the handle
rather than rebuilding `data`.

### Props

Every engine event has a callback prop: `onHover`, `onClick`,
`onSelectionChange`, `onViewportChange` (at most once per frame),
`onDataChange`, `onReady` and `onFirstFrame`. `options` accepts every engine
option (`renderer`, `layout`, `clustering`, `lod`, `labels`, `arrows`, `zoom`,
`pan`, `keyboard`, `locale`, `onDiagnostic`, `onFrameStats`, …). The default
tooltip shows the formatted label (and a member list for clusters) in the
theme's colours and flips at the viewport edges; pass `renderTooltip` to
customise it, return `null` from it to skip a hit, or set `tooltip={false}`.

The component is StrictMode-safe and SSR-safe (the engine is created in an
effect).

## License

[MIT](https://github.com/KarlGorgoglione/event-timeline/blob/main/LICENSE) ©
Karl Gorgoglione
