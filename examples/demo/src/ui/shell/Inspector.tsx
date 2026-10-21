import { useState } from 'react';
import { useDemo } from '../../app/context';
import { SimpleView } from '../simple/SimpleView';
import { AdvancedView } from '../advanced/AdvancedView';
import { Close, Sliders } from '../icons';

/** The side panel; below 900 px it becomes a bottom sheet behind a button. */
export function Inspector() {
  const { state } = useDemo();
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside
        className="inspector"
        data-open={open || undefined}
        aria-label={
          state.view === 'simple' ? 'Showcase panel' : 'Customisation panel'
        }
      >
        <button
          type="button"
          className="icon-btn inspector__close show-narrow"
          aria-label="Close panel"
          onClick={() => setOpen(false)}
        >
          <Close />
        </button>
        {state.view === 'simple' ? <SimpleView /> : <AdvancedView />}
      </aside>
      <button
        type="button"
        className="fab show-narrow"
        aria-label="Open the panel"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Sliders size={18} />
        <span>{state.view === 'simple' ? 'Explore' : 'Customise'}</span>
      </button>
    </>
  );
}
