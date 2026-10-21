// The scenario's tooltip card (`renderTooltip`, §12). Clusters list their
// first members and say how to open them.

import type { HitResult } from '@event-timeline/react';
import type { ThemePreset } from '../../themes/presets';
import {
  describeElementDefault,
  describeEventDefault,
} from '../../scenarios/common';
import type { Datum, Description, Scenario } from '../../scenarios/types';

export function describe(
  hit: Exclude<HitResult<Datum>, { kind: 'cluster' }>,
  scenario: Scenario,
  preset: ThemePreset,
  labelOf: (id: string) => string,
): Description {
  const ctx = { preset, labelOf };
  if (hit.kind === 'element') {
    return (
      scenario.describeElement?.(hit.element, ctx) ??
      describeElementDefault(hit.element, ctx)
    );
  }
  return (
    scenario.describeEvent?.(hit.event, ctx) ??
    describeEventDefault(hit.event, ctx, scenario.formatTime)
  );
}

export function DescriptionView({ d }: { d: Description }) {
  return (
    <>
      <div className="tt__head">
        {d.swatch !== undefined && (
          <span className="tt__swatch" style={{ background: d.swatch }} />
        )}
        <span className="tt__title">{d.title}</span>
        {d.badge && (
          <span
            className="tt__badge"
            style={{ ['--badge' as string]: d.badge.color }}
          >
            {d.badge.text}
          </span>
        )}
      </div>
      {d.subtitle !== undefined && (
        <div className="tt__subtitle">{d.subtitle}</div>
      )}
      {d.rows.length > 0 && (
        <dl className="tt__rows">
          {d.rows.map(([k, v]) => (
            <div key={k} className="tt__row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

const MEMBERS = 4;

export function RichTooltip({
  hit,
  scenario,
  preset,
  labelOf,
}: {
  hit: HitResult<Datum>;
  scenario: Scenario;
  preset: ThemePreset;
  labelOf: (id: string) => string;
}) {
  if (hit.kind !== 'cluster') {
    return (
      <div className="tt">
        <DescriptionView d={describe(hit, scenario, preset, labelOf)} />
      </div>
    );
  }
  const first = hit.events[0];
  const last = hit.events.at(-1);
  return (
    <div className="tt">
      <div className="tt__head">
        <span
          className="tt__swatch tt__swatch--round"
          style={{ background: preset.theme.cluster.color }}
        />
        <span className="tt__title">
          {hit.count.toLocaleString('en-US')} events
        </span>
      </div>
      {first && last && (
        <div className="tt__subtitle">
          {scenario.formatTime(first.time)}
          {last !== first && ` → ${scenario.formatTime(last.time)}`}
        </div>
      )}
      <ul className="tt__members">
        {hit.events.slice(0, MEMBERS).map((e) => (
          <li key={e.id}>
            {labelOf(e.sourceId)} → {labelOf(e.targetId)}
            {e.label !== undefined && (
              <span className="tt__muted"> · {e.label}</span>
            )}
          </li>
        ))}
        {hit.count > MEMBERS && (
          <li className="tt__muted">
            … and {(hit.count - MEMBERS).toLocaleString('en-US')} more
          </li>
        )}
      </ul>
      <div className="tt__hint">Click to expand</div>
    </div>
  );
}
