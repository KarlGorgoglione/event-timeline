import { useDemo } from '../../app/context';
import { PATTERNS, patternSlice } from '../../scenarios/aml';
import { padRange, slotColor } from '../../scenarios/common';
import { Card } from '../shared/Card';
import { FieldRow, Segmented } from '../controls';

const ORDERS = [
  { value: 'explicit', label: 'Flagged first' },
  { value: 'byFirstEvent', label: 'First event' },
  { value: 'barycenter', label: 'Barycenter' },
];

/** Each step zooms to a pattern and selects its transfers and accounts. */
export function PatternTour() {
  const { data, handle, preset, options, dispatch } = useDemo();
  return (
    <Card title="Pattern tour" eyebrow="zoomToRange · select · scrollToElement">
      <ol className="steps">
        {PATTERNS.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              className="step"
              onClick={() => {
                const h = handle.current;
                if (!h) return;
                const slice = patternSlice(data, p);
                const [a, b] = padRange(slice.range[0], slice.range[1], 0.6);
                h.zoomToRange(a, b);
                // Events only: a selected element would also light every
                // background transfer it touches.
                h.select({ events: slice.events });
                if (slice.elements[0]) h.scrollToElement(slice.elements[0]);
              }}
            >
              <span
                className="step__num"
                style={{ background: slotColor(preset, p.category) }}
              >
                {i + 1}
              </span>
              <span className="step__text">
                <span className="step__title">{p.label}</span>
                <span className="step__detail">{p.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="fields">
        <FieldRow
          label="Row order"
          hint="explicit honours element.order; barycenter shortens arrows; first event is the default."
        >
          <Segmented
            label="Row order"
            size="sm"
            value={options.layout}
            options={ORDERS}
            onChange={(v) =>
              dispatch({ type: 'option', path: 'layout', value: v })
            }
          />
        </FieldRow>
      </div>
    </Card>
  );
}
