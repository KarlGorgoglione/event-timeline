import { useMemo, useRef, useState } from 'react';
import { Timeline, type TimelineHandle } from '@timeline/react';
import { demoData } from './fixture';
import { makeSynthetic } from './synthetic';

/**
 * Phase 2 demo: direction-aware arrows (riser + source dot + arrowhead), event
 * labels, and element label+icon at each line start with a sticky-left fallback,
 * all culled to the viewport. "Fit" reframes via the imperative handle; "10k"
 * swaps in a synthetic dataset to show culling at scale (drag to pan).
 */
export function App() {
  const ref = useRef<TimelineHandle>(null);
  const [big, setBig] = useState(false);

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
        <Timeline ref={ref} data={data} style={{ background: '#161b22' }} />
      </div>
    </main>
  );
}
