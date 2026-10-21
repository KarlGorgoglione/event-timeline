import { forwardRef } from 'react';
import { Close } from '../icons';

// The engine's own bindings (interaction/keyboard.ts, pointer.ts, wheel.ts)
// plus the demo's two.
// Keys are written as a list; a '+' entry joins a chord.
const GROUPS: ReadonlyArray<{
  title: string;
  rows: ReadonlyArray<readonly [readonly string[], string]>;
}> = [
  {
    title: 'Timeline (when focused)',
    rows: [
      [['←', '→'], 'Pan by a tenth of the view (Shift: half)'],
      [['↑', '↓'], 'Scroll a row (Shift: a page)'],
      [['PgUp', 'PgDn'], 'Scroll a page'],
      [['+', '−'], 'Zoom in / out about the centre'],
      [['0'], 'Fit everything'],
      [['Esc'], 'Clear the selection'],
    ],
  },
  {
    title: 'Mouse, trackpad and touch',
    rows: [
      [['Drag'], 'Pan in time and scroll rows'],
      [
        ['Ctrl/⌘', '+', 'scroll'],
        'Zoom about the cursor (also trackpad pinch)',
      ],
      [['Shift', '+', 'scroll'], 'Pan in time'],
      [['Scroll'], 'Scroll rows'],
      [['Click'], 'Select; on a ×N cluster, expand it'],
      [['Ctrl/⌘', '+', 'click'], 'Add to the selection (multi-select)'],
      [['Two fingers'], 'Pinch to zoom, drag to pan'],
    ],
  },
  {
    title: 'Demo',
    rows: [
      [['/'], 'Find an element or event'],
      [['?'], 'This help'],
    ],
  },
];

export const ShortcutsDialog = forwardRef<HTMLDialogElement>(
  function ShortcutsDialog(_props, ref) {
    return (
      <dialog
        ref={ref}
        className="dialog"
        aria-labelledby="shortcuts-title"
        onClick={(e) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="dialog__body">
          <header className="dialog__head">
            <h2 id="shortcuts-title">Shortcuts</h2>
            <form method="dialog">
              <button className="icon-btn" aria-label="Close">
                <Close />
              </button>
            </form>
          </header>
          <div className="dialog__grid">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                <dl className="keys">
                  {g.rows.map(([keys, what]) => (
                    <div key={what} className="keys__row">
                      <dt>
                        {keys.map((k, i) =>
                          k === '+' && i > 0 ? (
                            <span key={i} className="keys__plus">
                              +
                            </span>
                          ) : (
                            <kbd key={i}>{k}</kbd>
                          ),
                        )}
                      </dt>
                      <dd>{what}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </dialog>
    );
  },
);
