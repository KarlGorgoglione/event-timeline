import { Timeline } from '@timeline/react';

/**
 * Phase 0 demo: mounts the (currently empty) <Timeline/> so the acceptance
 * criterion "empty <Timeline/> mounts" can be verified in a real browser and
 * by the Playwright smoke test. Real data + controls arrive in later phases.
 */
export function App() {
  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h1
        style={{ margin: 0, padding: '8px 12px', font: '600 14px system-ui' }}
      >
        react-timeline · demo
      </h1>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Timeline style={{ background: '#161b22' }} />
      </div>
    </main>
  );
}
