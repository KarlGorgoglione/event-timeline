import { useDemo } from '../../app/context';
import { Card } from '../shared/Card';
import { Target } from '../icons';

const SPOTLIGHTS: ReadonlyArray<{ id: string; title: string; detail: string }> =
  [
    {
      id: 't6',
      title: 'The self-transfer',
      detail: 'Cash → Cash, drawn as a loop',
    },
    {
      id: 't15',
      title: 'The longest crossing',
      detail: 'Alice → Ivan hops every lane between',
    },
    {
      id: 't21',
      title: 'Crossing back up',
      detail: 'Heidi → Alice: arrowheads follow direction',
    },
  ];

/** Jump to a feature: `revealEvent` centres it, `select` highlights it. */
export function TourSpotlights() {
  const { handle } = useDemo();
  return (
    <Card title="Spotlights" eyebrow="revealEvent + select">
      <ul className="steps">
        {SPOTLIGHTS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="step"
              onClick={() => {
                handle.current?.revealEvent(s.id);
                handle.current?.select({ events: [s.id] });
              }}
            >
              <Target size={14} />
              <span className="step__text">
                <span className="step__title">{s.title}</span>
                <span className="step__detail">{s.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
