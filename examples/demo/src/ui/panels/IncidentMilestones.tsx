import { useMemo } from 'react';
import { useDemo } from '../../app/context';
import { incidentTick } from '../../scenarios/incident';
import { Card } from '../shared/Card';

const MINUTE = 60_000;

/** The incident's key moments; each jump frames a few minutes around one. */
export function IncidentMilestones() {
  const { data, handle, preset } = useDemo();
  const milestones = useMemo(() => {
    const firstError = data.events.find((e) => e.data?.kind === 'error');
    const labelled = data.events.filter(
      (e) =>
        e.label !== undefined &&
        ['deploy', 'alert', 'ack', 'rollback'].includes(e.data?.kind ?? ''),
    );
    const list = [
      ...labelled,
      ...(firstError ? [{ ...firstError, label: 'first failure' }] : []),
    ];
    return list.sort((a, b) => a.time - b.time);
  }, [data]);

  const colour = (kind?: string) =>
    kind === 'error'
      ? preset.status.critical
      : kind === 'alert'
        ? preset.status.serious
        : kind === 'deploy' || kind === 'rollback'
          ? preset.status.good
          : preset.palette.series[0];

  return (
    <Card title="Milestones" eyebrow="custom tickLabel: T± from the deploy">
      <ol className="timeline-list">
        {milestones.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="step step--compact"
              onClick={() => {
                handle.current?.zoomToRange(
                  m.time - 4 * MINUTE,
                  m.time + 4 * MINUTE,
                );
                handle.current?.select({ events: [m.id] });
              }}
            >
              <span
                className="step__dot"
                style={{ background: colour(m.data?.kind) }}
              />
              <span className="step__time">
                {incidentTick(new Date(m.time), 'minute', 'minor')}
              </span>
              <span className="step__title">{m.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
