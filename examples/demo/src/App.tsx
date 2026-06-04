import { useCallback, useMemo, useRef, useState } from 'react';
import { Timeline, type HitResult, type TimelineHandle } from '@timeline/react';
import { demoData } from './fixture';
import { makeSynthetic } from './synthetic';

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
 * Phase 3 demo: interactions on top of Phase 2 rendering — zoom about the cursor
 * (ctrl/⌘+wheel), vertical scroll (wheel), hover highlight + tooltip, and click
 * selection (ctrl/⌘+click to multi-select). The status bar mirrors hover and
 * selection state. "Fit" reframes via the imperative handle; "10k" swaps in a
 * synthetic dataset to show culling at scale (drag to pan).
 */
export function App() {
  const ref = useRef<TimelineHandle>(null);
  const [big, setBig] = useState(false);
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
  const options = useMemo(() => ({ multiSelect: true }), []);

  // Memoized so the referential-stability contract holds (§12): a stable `data`
  // reference avoids a full setData on every render. The 10k set is built once.
  const synthetic = useMemo(() => makeSynthetic(), []);
  const data = big ? synthetic : demoData;

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
