// The e2e fixture page's presets and data hooks are pinned by the Playwright
// specs and the golden baselines (DESIGN.md §14). This snapshot holds their
// exact output so a change to the demo can't drift them unnoticed.

import { describe, expect, it } from 'vitest';
import { defaultTheme } from '@event-timeline/react';
import type { TimelineElement, TimelineEvent } from '@event-timeline/react';
import type { DemoDatum } from '../synthetic';
import {
  PRESETS,
  buildFormatters,
  buildResolvers,
  buildTheme,
} from './fixtureTheme';

const element = (category?: number): TimelineElement<DemoDatum> => ({
  id: `el-${category ?? 'none'}`,
  label: 'Alice',
  ...(category === undefined ? {} : { data: { category } }),
});

const event = (category?: number): TimelineEvent<DemoDatum> => ({
  id: `ev-${category ?? 'none'}`,
  sourceId: 'a',
  targetId: 'b',
  time: 0,
  ...(category === undefined ? {} : { data: { category } }),
});

const CATEGORIES = [undefined, 0, 1, 2, 3, 4, 5];

describe('e2e fixture theme contract', () => {
  it('keeps the preset labels the specs select', () => {
    expect(PRESETS.map((p) => p.label)).toEqual([
      'Dark',
      'Light',
      'High-contrast',
      'Minimal',
    ]);
  });

  it('builds Dark as exactly the core default theme', () => {
    expect(buildTheme(PRESETS[0]!.theme)).toEqual(defaultTheme);
  });

  it('builds every preset unchanged', () => {
    for (const preset of PRESETS) {
      expect(buildTheme(preset.theme)).toMatchSnapshot(preset.label);
    }
  });

  it('keeps the data-driven colour resolvers unchanged', () => {
    expect(buildResolvers(false)).toBeUndefined();
    const resolvers = buildResolvers(true)!;
    const out = CATEGORIES.map((c) => ({
      category: c ?? null,
      element: resolvers.element!(element(c)),
      event: resolvers.event!(event(c)),
    }));
    expect(out).toMatchSnapshot();
  });

  it('keeps the label formatters unchanged', () => {
    expect(buildFormatters(false)).toBeUndefined();
    const formatters = buildFormatters(true)!;
    expect({
      element: formatters.elementLabel!(element(1)),
      unlabelled: formatters.elementLabel!({ id: 'bob' }),
      event: formatters.eventLabel!({ ...event(1), label: '$1,200' }),
      eventWithoutLabel: formatters.eventLabel!(event(1)),
    }).toMatchSnapshot();
  });
});
