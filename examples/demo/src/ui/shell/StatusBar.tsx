// Live read-outs in human units: the visible window, the zoom scale, rows,
// counts, the renderer actually in use and the frame cost.

import { useDemo } from '../../app/context';
import { useStore } from '../../app/store';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '../../app/options';
import { FpsMeter } from '../shared/FpsMeter';

const UNITS: ReadonlyArray<readonly [string, number]> = [
  ['1 s', 1000],
  ['1 min', MS_PER_MINUTE],
  ['1 h', MS_PER_HOUR],
  ['1 day', MS_PER_DAY],
  ['1 week', 7 * MS_PER_DAY],
  ['30 days', 30 * MS_PER_DAY],
  ['1 year', 365 * MS_PER_DAY],
];

/** "1 day ≈ 42 px": the smallest unit at least 24 px wide. */
export function zoomScale(pxPerMs: number): string {
  for (const [label, ms] of UNITS) {
    const px = pxPerMs * ms;
    if (px >= 24)
      return `${label} ≈ ${px >= 100 ? Math.round(px) : px.toFixed(1)} px`;
  }
  return `1 year ≈ ${(pxPerMs * 365 * MS_PER_DAY).toFixed(1)} px`;
}

function rangeText(start: number, end: number, locale: string): string {
  const span = end - start;
  const opts: Intl.DateTimeFormatOptions =
    span < 2 * MS_PER_DAY
      ? {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'UTC',
        }
      : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  const fmt = new Intl.DateTimeFormat(locale, opts);
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

const BACKEND_LABEL: Record<string, string> = {
  webgl: 'WebGL2',
  canvas2d: 'Canvas2D',
};

export function StatusBar() {
  const { viewport, counts, backend, options, diagnostics, dispatch } =
    useDemo();
  const view = useStore(viewport);
  const held = useStore(counts);
  const diags = useStore(diagnostics);
  const wanted = options.renderer;
  const fellBack = wanted === 'webgl' && backend === 'canvas2d';

  return (
    <footer className="statusbar" aria-label="Timeline status">
      <span className="statusbar__item statusbar__range">
        {view
          ? rangeText(view.timeRange[0], view.timeRange[1], options.locale)
          : '—'}
      </span>
      <span className="statusbar__item hide-narrow">
        {view ? zoomScale(view.pxPerMs) : ''}
      </span>
      <span className="statusbar__item hide-narrow">
        {view
          ? `rows ${Math.min(view.visibleRowRange[0] + 1, view.visibleRowRange[1])}–${view.visibleRowRange[1]}`
          : ''}
      </span>
      <span className="statusbar__spacer" />
      <span className="statusbar__item hide-narrow">
        {held.elements.toLocaleString('en-US')} elements ·{' '}
        {held.events.toLocaleString('en-US')} events
      </span>
      {diags.length > 0 && (
        <button
          type="button"
          className="pill pill--warn"
          onClick={() => {
            // Land on the tab that lists them.
            try {
              localStorage.setItem('etd-advanced-tab', 'data');
            } catch {
              // Storage unavailable: Advanced opens on its last tab.
            }
            dispatch({ type: 'view', view: 'advanced' });
          }}
          title="Show the diagnostics (Advanced › Data & API)"
        >
          {diags.length} diagnostic{diags.length === 1 ? '' : 's'}
        </button>
      )}
      <span
        className="pill"
        data-backend={backend}
        title={
          fellBack
            ? 'WebGL2 unavailable: fell back to Canvas2D'
            : `Rendering with ${BACKEND_LABEL[backend] ?? backend}`
        }
      >
        {BACKEND_LABEL[backend] ?? backend}
        {fellBack ? ' (fallback)' : ''}
      </span>
      <FpsMeter />
    </footer>
  );
}
