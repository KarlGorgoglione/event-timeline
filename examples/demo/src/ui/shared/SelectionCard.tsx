// What's selected, described by the scenario, with navigation actions (and,
// in Advanced, the mutation API: updateEvent, updateElement, remove…, add…).

import { useMemo } from 'react';
import { useDemo } from '../../app/context';
import { useStore } from '../../app/store';
import { padRange } from '../../scenarios/common';
import type { DemoElement, DemoEvent } from '../../scenarios/types';
import { Card } from './Card';
import { describe, DescriptionView } from './RichTooltip';
import { ArrowRight, Fit, Plus, Target, Trash } from '../icons';

const LIST_MAX = 6;

export function SelectionCard({ actions = false }: { actions?: boolean }) {
  const { selection, handle, scenario, preset, data, dataRevision, theme } =
    useDemo();
  const revision = useStore(dataRevision);
  const count = selection.elements.length + selection.events.length;

  // Look items up in what the engine holds now (streams and edits included).
  const current = useMemo(() => {
    void revision;
    if (count === 0) return null;
    const held = handle.current?.getData() ?? data;
    return {
      elements: new Map(held.elements.map((e) => [e.id, e])),
      events: held.events,
      eventById: new Map(held.events.map((e) => [e.id, e])),
    };
  }, [count, handle, data, revision]);

  if (count === 0 || current === null) {
    return (
      <Card title="Selection" className="selection selection--empty">
        <p className="muted">
          Click a lane or an arrow to inspect it
          {actions ? ' and edit it through the handle' : ''}.
        </p>
      </Card>
    );
  }

  const labelOf = (id: string) => current.elements.get(id)?.label ?? id;
  const elements = selection.elements
    .map((id) => current.elements.get(id))
    .filter((e): e is DemoElement => !!e);
  const events = selection.events
    .map((id) => current.eventById.get(id))
    .filter((e): e is DemoEvent => !!e);
  const h = handle.current;

  const singleElement = count === 1 ? elements[0] : undefined;
  const singleEvent =
    count === 1 && singleElement === undefined ? events[0] : undefined;
  const isElement = singleElement !== undefined;

  // Activity of a selected element: its events, in and out.
  const activity = singleElement
    ? (() => {
        const id = singleElement.id;
        const touching = current.events.filter(
          (e) => e.sourceId === id || e.targetId === id,
        );
        const out = touching.filter((e) => e.sourceId === id).length;
        const peers = new Map<string, number>();
        for (const e of touching) {
          const peer = e.sourceId === id ? e.targetId : e.sourceId;
          if (peer !== id) peers.set(peer, (peers.get(peer) ?? 0) + 1);
        }
        const top = [...peers.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        return { touching, out, top };
      })()
    : null;

  return (
    <Card
      title="Selection"
      eyebrow={count > 1 ? `${count} items` : isElement ? 'Element' : 'Event'}
      className="selection"
      actions={
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => h?.clearSelection()}
        >
          Clear
        </button>
      }
    >
      {singleElement || singleEvent ? (
        <div className="selection__detail">
          <DescriptionView
            d={describe(
              singleElement
                ? { kind: 'element', element: singleElement }
                : { kind: 'event', event: singleEvent! },
              scenario,
              preset,
              labelOf,
            )}
          />
          {activity && (
            <dl className="tt__rows">
              <div className="tt__row">
                <dt>Events</dt>
                <dd>
                  {activity.touching.length} ({activity.out} out,{' '}
                  {activity.touching.length - activity.out} in)
                </dd>
              </div>
              {activity.touching.length > 0 && (
                <div className="tt__row">
                  <dt>Active</dt>
                  <dd>
                    {scenario.formatTime(activity.touching[0]!.time)} →{' '}
                    {scenario.formatTime(activity.touching.at(-1)!.time)}
                  </dd>
                </div>
              )}
              {activity.top.length > 0 && (
                <div className="tt__row">
                  <dt>Most with</dt>
                  <dd>
                    {activity.top
                      .map(([id, n]) => `${labelOf(id)} (${n})`)
                      .join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      ) : (
        <ul className="selection__list">
          {elements.slice(0, LIST_MAX).map((e) => (
            <li key={e.id}>
              <span className="search__kind search__kind--element">Row</span>{' '}
              {e.label ?? e.id}
            </li>
          ))}
          {events.slice(0, Math.max(0, LIST_MAX - elements.length)).map((e) => (
            <li key={e.id}>
              <span className="search__kind search__kind--event">Event</span>{' '}
              {e.label ?? e.id}{' '}
              <span className="muted">
                {labelOf(e.sourceId)} → {labelOf(e.targetId)}
              </span>
            </li>
          ))}
          {count > LIST_MAX && (
            <li className="muted">… and {count - LIST_MAX} more</li>
          )}
        </ul>
      )}

      <div className="btn-row">
        {singleEvent && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => h?.revealEvent(singleEvent.id)}
          >
            <Target size={13} /> Reveal
          </button>
        )}
        {singleElement && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => h?.scrollToElement(singleElement.id)}
          >
            <ArrowRight size={13} /> Scroll to
          </button>
        )}
        {activity && activity.touching.length > 1 && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              const [a, b] = padRange(
                activity.touching[0]!.time,
                activity.touching.at(-1)!.time,
              );
              h?.zoomToRange(a, b);
            }}
          >
            <Fit size={13} /> Zoom to activity
          </button>
        )}
      </div>

      {actions && h && (
        <div className="mutations">
          <h3 className="subhead">Edit through the handle</h3>
          <div className="btn-row">
            {events.length > 0 && (
              <>
                <button
                  type="button"
                  className="btn btn--sm"
                  title="updateEvent(id, { time })"
                  onClick={() =>
                    events.forEach((e) =>
                      h.updateEvent(e.id, { time: e.time - scenario.nudgeMs }),
                    )
                  }
                >
                  − time
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  title="updateEvent(id, { time })"
                  onClick={() =>
                    events.forEach((e) =>
                      h.updateEvent(e.id, { time: e.time + scenario.nudgeMs }),
                    )
                  }
                >
                  + time
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  title="updateEvent(id, { style }) — a per-item override"
                  onClick={() =>
                    events.forEach((e) =>
                      h.updateEvent(e.id, {
                        style:
                          e.style?.arrowColor === theme.emphasis.hoverColor
                            ? {}
                            : {
                                arrowColor: theme.emphasis.hoverColor,
                                arrowWidth: 3,
                              },
                      }),
                    )
                  }
                >
                  Highlight
                </button>
              </>
            )}
            {elements.length > 0 && (
              <>
                <button
                  type="button"
                  className="btn btn--sm"
                  title="updateElement(id, { style })"
                  onClick={() =>
                    elements.forEach((e) =>
                      h.updateElement(e.id, {
                        style:
                          e.style?.lineColor === theme.emphasis.hoverColor
                            ? {}
                            : {
                                lineColor: theme.emphasis.hoverColor,
                                lineWidth: 5,
                              },
                      }),
                    )
                  }
                >
                  Highlight
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  title="addEvents([...]) from the selected element"
                  onClick={() => {
                    const view = h.getViewport();
                    const from = elements[0]!;
                    const others = [...current.elements.keys()].filter(
                      (id) => id !== from.id,
                    );
                    const to =
                      others[Math.floor(Math.random() * others.length)] ??
                      from.id;
                    const t = view
                      ? (view.timeRange[0] + view.timeRange[1]) / 2
                      : Date.now();
                    h.addEvents([
                      {
                        id: `added-${Date.now()}`,
                        sourceId: from.id,
                        targetId: to,
                        time: t,
                        label: 'added',
                      },
                    ]);
                  }}
                >
                  <Plus size={13} /> Add event
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn--sm btn--danger"
              title="removeEvents / removeElements (an element takes its events with it)"
              onClick={() => {
                if (events.length) h.removeEvents(events.map((e) => e.id));
                if (elements.length)
                  h.removeElements(elements.map((e) => e.id));
              }}
            >
              <Trash size={13} /> Remove
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
