// The engine's events as they fire (§9): hover, click, selectionChange,
// viewportChange (sampled), dataChange, ready, firstFrame, plus diagnostics.

import { useState } from 'react';
import { useDemo, type LogEntry } from '../../app/context';
import { usePolled } from '../../app/store';
import { Card } from '../shared/Card';
import { Pause, Play, Trash } from '../icons';

const time = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function EventLog() {
  const { log } = useDemo();
  // Re-render when the log grows (polled, never per event).
  usePolled(() => log.version, 250);
  const [frozen, setFrozen] = useState<readonly LogEntry[] | null>(null);
  const paused = frozen !== null;
  const entries = frozen ?? log.values();

  return (
    <Card
      title="Event log"
      eyebrow="on(…) / onHover, onClick, onSelectionChange…"
      actions={
        <>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label={paused ? 'Resume log' : 'Pause log'}
            onClick={() => setFrozen(paused ? null : [...log.values()])}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label="Clear log"
            onClick={() => log.clear()}
          >
            <Trash size={13} />
          </button>
        </>
      }
    >
      <ol className="log" aria-live="off">
        {entries.length === 0 && (
          <li className="muted">Interact with the timeline…</li>
        )}
        {[...entries]
          .reverse()
          .slice(0, 80)
          .map((e, i) => (
            <li key={`${e.at}-${i}`} className="log__item">
              <span className="log__time">{time.format(e.at)}</span>
              <span className={`log__type log__type--${e.type}`}>{e.type}</span>
              <span className="log__text">{e.text}</span>
            </li>
          ))}
      </ol>
    </Card>
  );
}
