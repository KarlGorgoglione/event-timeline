// Streaming (DESIGN.md §10): append a batch with `addEvents` a few times a
// second, trim the oldest with `removeEvents`, and (Live) keep "now" in view.
// One batch per tick, never one call per event.

import { useEffect, useRef, type RefObject } from 'react';
import type { TimelineElement, TimelineHandle } from '@event-timeline/react';
import { makePaymentSource } from '../scenarios/data/live';
import { makeStreamBatch, type DemoDatum } from '../synthetic';
import type { Datum, DemoData } from '../scenarios/types';
import type { LiveSettings } from './context';

const TICK_MS = 200;

export function useLiveStream(
  handle: RefObject<TimelineHandle<Datum> | null>,
  data: DemoData,
  enabled: boolean,
  settings: LiveSettings,
): void {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!enabled) return;
    const source = makePaymentSource(Date.now() % 1_000_000, 's');
    // Oldest first: the history, then everything streamed.
    const queue = data.events.map((e) => e.id);
    let last = data.events.at(-1)?.time ?? Date.now();
    let owed = 0;

    const id = setInterval(() => {
      const h = handle.current;
      const s = settingsRef.current;
      if (h === null || !s.running) {
        last = Date.now();
        return;
      }
      const now = Date.now();
      owed += (s.rate * (now - last)) / 1000;
      const count = Math.floor(owed);
      owed -= count;
      if (count > 0) {
        const batch = source.batch(count, last, now);
        h.addEvents(batch);
        for (const e of batch) queue.push(e.id);
      }
      last = now;
      if (queue.length > s.cap)
        h.removeEvents(queue.splice(0, queue.length - s.cap));
    }, TICK_MS);

    // Follow "now" smoothly, a pan per animation frame, independent of the
    // batch ticks.
    let raf = requestAnimationFrame(function follow() {
      const h = handle.current;
      const s = settingsRef.current;
      const view = h?.getViewport();
      if (h && view && s.running && s.follow) {
        const span = view.timeRange[1] - view.timeRange[0];
        h.panToTime(Date.now() + span * 0.06 - span);
      }
      raf = requestAnimationFrame(follow);
    });
    return () => {
      clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, [enabled, data, handle]);
}

/** Scale: a steady stream of extra transfers into whatever is in view. */
export function useScaleStream(
  handle: RefObject<TimelineHandle<Datum> | null>,
  data: DemoData,
  enabled: boolean,
  perSecond = 250,
  cap = 5000,
): void {
  useEffect(() => {
    if (!enabled || data.elements.length === 0) return;
    const streamed: string[] = [];
    let index = 0;
    const id = setInterval(() => {
      const h = handle.current;
      const view = h?.getViewport();
      if (!h || !view) return;
      const count = Math.round((perSecond * 250) / 1000);
      // The batch generator only reads element ids.
      const elements = data.elements as readonly TimelineElement<DemoDatum>[];
      const batch = makeStreamBatch(
        elements,
        index,
        count,
        view.timeRange[0],
        view.timeRange[1],
      ).map((e) => ({ ...e, data: { category: 0, kind: 'streamed' } }));
      index += count;
      h.addEvents(batch);
      for (const e of batch) streamed.push(e.id);
      if (streamed.length > cap)
        h.removeEvents(streamed.splice(0, streamed.length - cap));
    }, 250);
    return () => {
      clearInterval(id);
      // Leave the dataset as it was loaded.
      if (streamed.length > 0) handle.current?.removeEvents(streamed);
    };
  }, [enabled, data, handle, perSecond, cap]);
}
