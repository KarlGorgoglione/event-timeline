import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Timeline,
  barycenter,
  byFirstEvent,
  explicit,
  type HitResult,
  type LayoutStrategy,
  type TimelineHandle,
} from '@timeline/react';
import { demoData } from './fixture';
import { makeSynthetic } from './synthetic';

const LAYOUT_NAMES = ['byFirstEvent', 'barycenter', 'explicit'] as const;
type LayoutName = (typeof LAYOUT_NAMES)[number];
const LAYOUTS: Record<LayoutName, LayoutStrategy> = {
  byFirstEvent,
  barycenter,
  explicit,
};

/** Short human label for the status bar (mirrors the default tooltip content). */
function describeHit(hit: HitResult | null): string {
  if (hit === null) return '—';
  switch (hit.kind) {
    case 'event':
      return `event ${hit.event.id} (${hit.event.sourceId} → ${hit.event.targetId})`;
    case 'element':
      return `element ${hit.element.id}`;
    case 'cluster':
      return `${hit.count} events`;
  }
}

/**
 * Phase 4 demo: scale & LOD on top of Phase 3 interactions — the temporal index
 * culls by binary search, dense events collapse into "×N" cluster markers that
 * expand as you zoom in (or on click, which zooms to their span), and per-event
 * labels appear only past the label-LOD threshold. The status bar mirrors hover
 * and selection state. "Fit" reframes; "10k"/"50k" swap in synthetic datasets to
 * show culling and clustering at scale (drag to pan, ctrl/⌘+wheel to zoom).
 */
export function App() {
  const ref = useRef<TimelineHandle>(null);
  const [big, setBig] = useState(false);
  const [huge, setHuge] = useState(false);
  const [layoutName, setLayoutName] = useState<LayoutName>('byFirstEvent');
  const [hover, setHover] = useState<HitResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewport, setViewport] = useState({ pxPerMs: 0, scrollY: 0 });

  // Stable callbacks so the engine isn't re-created on every render (§12).
  const onHover = useCallback((hit: HitResult | null) => setHover(hit), []);
  const onSelectionChange = useCallback(
    (ids: string[]) => setSelected(ids),
    [],
  );
  const onViewportChange = useCallback(
    (v: { pxPerMs: number; scrollY: number }) =>
      setViewport({ pxPerMs: v.pxPerMs, scrollY: v.scrollY }),
    [],
  );
  // A new `options` reference (on layout change) re-creates the engine and
  // re-runs layout (§12 referential-stability contract).
  const options = useMemo(
    () => ({ multiSelect: true, layout: LAYOUTS[layoutName] }),
    [layoutName],
  );

  // Memoized so the referential-stability contract holds (§12): a stable `data`
  // reference avoids a full setData on every render. The 10k set is built once;
  // the 50k set is built lazily the first time it is shown (§15 acceptance).
  const synthetic = useMemo(() => makeSynthetic(), []);
  const synthetic50k = useMemo(
    () => (huge ? makeSynthetic(50_000, 400, 2) : null),
    [huge],
  );
  const data = synthetic50k ?? (big ? synthetic : demoData);

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
        }}
      >
        <h1 style={{ margin: 0, font: '600 14px system-ui' }}>
          react-timeline · demo
        </h1>
        <button
          type="button"
          onClick={() => ref.current?.fit()}
          style={{ font: '12px system-ui' }}
        >
          Fit
        </button>
        <button
          type="button"
          data-testid="toggle-dataset"
          onClick={() => setBig((v) => !v)}
          style={{ font: '12px system-ui' }}
        >
          {big ? 'Sample' : '10k'}
        </button>
        <button
          type="button"
          data-testid="toggle-50k"
          onClick={() => setHuge((v) => !v)}
          style={{ font: '12px system-ui' }}
        >
          {huge ? 'Sample' : '50k'}
        </button>
        <button
          type="button"
          data-testid="toggle-layout"
          onClick={() =>
            setLayoutName((name) => {
              const next =
                (LAYOUT_NAMES.indexOf(name) + 1) % LAYOUT_NAMES.length;
              return LAYOUT_NAMES[next]!;
            })
          }
          style={{ font: '12px system-ui' }}
        >
          layout: {layoutName}
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Timeline
          ref={ref}
          data={data}
          options={options}
          onHover={onHover}
          onSelectionChange={onSelectionChange}
          onViewportChange={onViewportChange}
          style={{ background: '#161b22' }}
        />
      </div>
      <footer
        style={{
          display: 'flex',
          gap: 16,
          padding: '6px 12px',
          font: '12px system-ui',
          color: '#9aa4b2',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span data-testid="status-hover">hover: {describeHit(hover)}</span>
        <span data-testid="status-selected">
          selected: {selected.length === 0 ? '—' : selected.join(', ')}
        </span>
        <span data-testid="status-pxperms">pxPerMs: {viewport.pxPerMs}</span>
        <span data-testid="status-scrolly">scrollY: {viewport.scrollY}</span>
      </footer>
    </main>
  );
}
