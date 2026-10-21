import { useState } from 'react';
import { Close } from '../icons';

const KEY = 'etd-hint-dismissed';

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** First-visit gesture hints over the canvas; dismissal is remembered. */
export function HintPill() {
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;
  return (
    <div className="hint" role="note">
      <span>
        <kbd>Drag</kbd> pan · <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>scroll</kbd>{' '}
        zoom · <kbd>Click</kbd> select · <kbd>?</kbd> shortcuts
      </span>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label="Dismiss hint"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(KEY, '1');
          } catch {
            // Storage may be unavailable (private mode); the hint just returns.
          }
        }}
      >
        <Close size={12} />
      </button>
    </div>
  );
}
