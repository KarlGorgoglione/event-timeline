import { useMemo } from 'react';
import { useDemo } from '../../app/context';
import { extentOf } from '../../scenarios/common';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '../../app/options';
import { Clear, Expand, Fit, Shrink, ZoomIn, ZoomOut } from '../icons';
import { Search } from './Search';

const SPANS: ReadonlyArray<readonly [string, number]> = [
  ['5m', 5 * MS_PER_MINUTE],
  ['15m', 15 * MS_PER_MINUTE],
  ['1h', MS_PER_HOUR],
  ['6h', 6 * MS_PER_HOUR],
  ['1d', MS_PER_DAY],
  ['1w', 7 * MS_PER_DAY],
  ['1mo', 30 * MS_PER_DAY],
  ['3mo', 91 * MS_PER_DAY],
  ['1y', 365 * MS_PER_DAY],
];

export function StageToolbar({
  fullscreen,
  onFullscreen,
}: {
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const { scenario, data, handle, selection } = useDemo();
  const hasSelection = selection.elements.length + selection.events.length > 0;

  // The four widest spans that fit inside the data, plus "All".
  const spans = useMemo(() => {
    const extent = extentOf(data);
    const total = extent ? extent[1] - extent[0] : 0;
    return SPANS.filter(([, ms]) => ms < total * 0.8).slice(-4);
  }, [data]);

  const zoomTo = (ms: number) => {
    const h = handle.current;
    const view = h?.getViewport();
    if (!h || !view) return;
    const mid = (view.timeRange[0] + view.timeRange[1]) / 2;
    h.zoomToRange(mid - ms / 2, mid + ms / 2);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Timeline controls">
      <div className="toolbar__title">
        <h1>{scenario.title}</h1>
        <span className="toolbar__tagline">{scenario.tagline}</span>
      </div>
      <Search />
      <div
        className="toolbar__group hide-narrow"
        role="group"
        aria-label="Zoom to a span"
      >
        {spans.map(([label, ms]) => (
          <button
            key={label}
            type="button"
            className="chip"
            onClick={() => zoomTo(ms)}
            title={`Show ${label} around the centre`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => handle.current?.fit()}
          title="Fit everything (0)"
        >
          All
        </button>
      </div>
      <div className="toolbar__group" role="group" aria-label="Zoom">
        <button
          type="button"
          className="icon-btn"
          onClick={() => handle.current?.zoomOut()}
          title="Zoom out (−)"
          aria-label="Zoom out"
        >
          <ZoomOut />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => handle.current?.zoomIn()}
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <ZoomIn />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => handle.current?.fit()}
          title="Fit (0)"
          aria-label="Fit"
        >
          <Fit />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => handle.current?.clearSelection()}
          disabled={!hasSelection}
          title="Clear selection (Esc)"
          aria-label="Clear selection"
        >
          <Clear />
        </button>
        <button
          type="button"
          className="icon-btn hide-narrow"
          onClick={onFullscreen}
          title={fullscreen ? 'Exit full screen' : 'Full screen'}
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
        >
          {fullscreen ? <Shrink /> : <Expand />}
        </button>
      </div>
    </div>
  );
}
