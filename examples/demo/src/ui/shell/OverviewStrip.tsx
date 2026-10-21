// An overview of the whole dataset under the canvas: event density over time
// with a brush for the visible window. Drag the brush to pan, click to
// recentre, double-click to fit (`panToTime`, `fit`).

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useDemo } from '../../app/context';
import { useStore } from '../../app/store';
import type { DemoEvent } from '../../scenarios/types';

const BINS = 180;
const HEIGHT = 30;

/** The events to summarise: the loaded data, or the engine's for streams. */
function useOverviewEvents(): readonly DemoEvent[] {
  const { data, handle, dataRevision, scenario } = useDemo();
  const revision = useStore(dataRevision);
  const streams = scenario.id === 'live' || scenario.id === 'scale';
  const [events, setEvents] = useState(data.events);
  const last = useRef(0);
  useEffect(() => {
    if (!streams) {
      setEvents(data.events);
      return;
    }
    const now = performance.now();
    const wait = Math.max(0, 1500 - (now - last.current));
    const id = setTimeout(() => {
      last.current = performance.now();
      setEvents(handle.current?.getData()?.events ?? data.events);
    }, wait);
    return () => clearTimeout(id);
  }, [data, handle, revision, streams]);
  return events;
}

export function OverviewStrip() {
  const { handle, viewport } = useDemo();
  const view = useStore(viewport);
  const events = useOverviewEvents();
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry?.contentRect.width ?? 0),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { lo, hi, path } = useMemo(() => {
    if (events.length === 0) return { lo: 0, hi: 1, path: '' };
    let min = Infinity;
    let max = -Infinity;
    for (const e of events) {
      if (e.time < min) min = e.time;
      if (e.time > max) max = e.time;
    }
    const pad = Math.max(1, (max - min) * 0.02);
    const lo = min - pad;
    const hi = max + pad;
    const bins = new Array<number>(BINS).fill(0);
    for (const e of events) {
      const i = Math.min(
        BINS - 1,
        Math.floor(((e.time - lo) / (hi - lo)) * BINS),
      );
      bins[i]! += 1;
    }
    const peak = Math.sqrt(Math.max(...bins)) || 1;
    const pts = bins.map((n, i) => {
      const x = ((i + 0.5) / BINS) * 1000;
      const y = HEIGHT - 3 - (Math.sqrt(n) / peak) * (HEIGHT - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      lo,
      hi,
      path: `M0,${HEIGHT} L${pts.join(' L')} L1000,${HEIGHT} Z`,
    };
  }, [events]);

  // The brush may extend past the data when the view does.
  const spanLo = Math.min(lo, view?.timeRange[0] ?? lo);
  const spanHi = Math.max(hi, view?.timeRange[1] ?? hi);
  const toX = (t: number) => ((t - spanLo) / (spanHi - spanLo)) * width;
  const toT = (x: number) =>
    spanLo + (x / Math.max(1, width)) * (spanHi - spanLo);
  const dataX0 = toX(lo);
  const dataX1 = toX(hi);
  const brushX0 = view ? Math.max(0, toX(view.timeRange[0])) : 0;
  const brushX1 = view ? Math.min(width, toX(view.timeRange[1])) : 0;

  const drag = useRef<{ x: number; start: number } | null>(null);
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const h = handle.current;
    const v = h?.getViewport();
    if (!h || !v) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const span = v.timeRange[1] - v.timeRange[0];
    let start = v.timeRange[0];
    if (x < brushX0 || x > brushX1) {
      start = toT(x) - span / 2;
      h.panToTime(start);
    }
    drag.current = { x, start };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    handle.current?.panToTime(d.start + toT(x) - toT(d.x));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="overview">
      <svg
        ref={ref}
        className="overview__svg"
        height={HEIGHT}
        role="slider"
        aria-label="Visible window over the whole dataset"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width > 0 ? Math.round((brushX0 / width) * 100) : 0}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => handle.current?.fit()}
      >
        <svg
          x={dataX0}
          width={Math.max(0, dataX1 - dataX0)}
          height={HEIGHT}
          viewBox={`0 0 1000 ${HEIGHT}`}
          preserveAspectRatio="none"
        >
          <path d={path} className="overview__area" />
        </svg>
        {view && width > 0 && (
          <g className="overview__brush">
            <rect
              x={brushX0}
              y={1}
              width={Math.max(3, brushX1 - brushX0)}
              height={HEIGHT - 2}
              rx={4}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
