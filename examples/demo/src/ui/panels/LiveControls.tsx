import { useDemo } from '../../app/context';
import { useStore } from '../../app/store';
import { Card } from '../shared/Card';
import { FieldRow, NumberInput, Segmented, Toggle } from '../controls';
import { Pause, Play } from '../icons';

const LAYOUTS = [
  { value: 'stable-append', label: 'Stable' },
  { value: 'full', label: 'Full relayout' },
];

export function LiveControls() {
  const { live, setLive, counts, options, dispatch } = useDemo();
  const { events } = useStore(counts);
  return (
    <Card
      title="Live stream"
      eyebrow="addEvents · removeEvents · panToTime"
      actions={
        <button
          type="button"
          className="btn btn--sm"
          aria-pressed={live.running}
          onClick={() => setLive({ running: !live.running })}
        >
          {live.running ? <Pause size={13} /> : <Play size={13} />}{' '}
          {live.running ? 'Pause' : 'Resume'}
        </button>
      }
    >
      <div className="stat-row">
        <div className="stat">
          <span className="stat__value">{events.toLocaleString('en-US')}</span>
          <span className="stat__label">events on canvas</span>
        </div>
        <div className="stat">
          <span className="stat__value">{live.running ? live.rate : 0}</span>
          <span className="stat__label">events / s</span>
        </div>
        <div className="stat">
          <span
            className={`stat__value ${live.running ? 'stat__value--live' : ''}`}
          >
            {live.running ? 'LIVE' : 'paused'}
          </span>
          <span className="stat__label">stream</span>
        </div>
      </div>
      <div className="fields">
        <FieldRow
          label="Rate"
          hint="Events per second, sent as one addEvents batch per tick."
        >
          <NumberInput
            label="Rate"
            value={live.rate}
            min={1}
            max={200}
            step={1}
            unit="/s"
            onChange={(rate) => setLive({ rate })}
          />
        </FieldRow>
        <FieldRow
          label="Keep at most"
          hint="The oldest events are trimmed with removeEvents past this."
        >
          <NumberInput
            label="Keep at most"
            value={live.cap}
            min={200}
            max={20000}
            step={100}
            onChange={(cap) => setLive({ cap })}
          />
        </FieldRow>
        <FieldRow
          label="Follow now"
          hint="Keep the right edge on the current time with panToTime."
        >
          <Toggle
            label="Follow now"
            value={live.follow}
            onChange={(follow) => setLive({ follow })}
          />
        </FieldRow>
        <FieldRow
          label="Row order"
          hint="streamingLayout: stable appends rows; full re-sorts them (debounced)."
        >
          <Segmented
            label="Streaming layout"
            size="sm"
            value={options.streamingLayout}
            options={LAYOUTS}
            onChange={(v) =>
              dispatch({ type: 'option', path: 'streamingLayout', value: v })
            }
          />
        </FieldRow>
      </div>
    </Card>
  );
}
