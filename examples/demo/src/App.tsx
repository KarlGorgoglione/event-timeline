import { useRef } from 'react';
import { Timeline, type TimelineHandle } from '@timeline/react';
import { demoData } from './fixture';

/**
 * Phase 1 demo: renders element lines at correct times under a basic adaptive
 * time header, with smooth horizontal pan (drag the canvas). "Fit" reframes the
 * data via the imperative handle.
 */
export function App() {
  const ref = useRef<TimelineHandle>(null);

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
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Timeline ref={ref} data={demoData} style={{ background: '#161b22' }} />
      </div>
    </main>
  );
}
