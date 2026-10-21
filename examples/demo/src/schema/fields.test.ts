import { describe, expect, it } from 'vitest';
import { defaultTheme, type TimelineOptions } from '@event-timeline/react';
import { getPath, leafPaths } from '../app/paths';
import { DEFAULT_OPTIONS, toTimelineOptions } from '../app/options';
import { DEFAULT_HOOKS } from '../scenarios/types';
import {
  ALL_FIELDS,
  HOOK_SECTION,
  OPTION_SECTIONS,
  THEME_SECTIONS,
} from './fields';

const paths = (target: string) =>
  ALL_FIELDS.filter((f) => f.target === target).map((f) => f.path as string);

/**
 * Every engine option key, and how the demo drives it. Listing them with
 * `satisfies` makes a new option a type error here until it is wired up.
 */
const ENGINE_OPTION_KEYS = [
  'renderer',
  'layout',
  'layoutDebounceMs',
  'multiSelect',
  'streamingLayout',
  'clustering',
  'lod',
  'arrows',
  'labels',
  'emptyElements',
  'eventLabel',
  'accessibility',
  'pointer',
  'keyboard',
  'zoom',
  'pan',
  'fitOnDataChange',
  'locale',
  // Wired by the app itself (diagnostics panel and the frame-stats HUD).
  'onDiagnostic',
  'onFrameStats',
] as const satisfies ReadonlyArray<keyof TimelineOptions>;

type Unlisted = Exclude<
  keyof TimelineOptions,
  (typeof ENGINE_OPTION_KEYS)[number]
>;
const everyKeyListed: Unlisted extends never ? true : Unlisted = true;

describe('field schema', () => {
  it('covers every theme key exactly once', () => {
    expect(paths('theme').sort()).toEqual(leafPaths(defaultTheme).sort());
  });

  it('covers every option exactly once', () => {
    expect(paths('options').sort()).toEqual(leafPaths(DEFAULT_OPTIONS).sort());
  });

  it('covers every data hook', () => {
    expect(paths('hooks').sort()).toEqual(Object.keys(DEFAULT_HOOKS).sort());
  });

  it('drives every engine option', () => {
    expect(everyKeyListed).toBe(true);
    const driven = Object.keys(toTimelineOptions(DEFAULT_OPTIONS));
    const appWired = ['onDiagnostic', 'onFrameStats'];
    expect([...driven, ...appWired].sort()).toEqual(
      [...ENGINE_OPTION_KEYS].sort(),
    );
  });

  it('gives every field a hint and in-range numeric defaults', () => {
    for (const section of [
      ...THEME_SECTIONS,
      ...OPTION_SECTIONS,
      HOOK_SECTION,
    ]) {
      for (const field of section.fields) {
        expect(field.hint.length, field.path).toBeGreaterThan(0);
        if (field.control.kind !== 'number') continue;
        const base = field.target === 'theme' ? defaultTheme : DEFAULT_OPTIONS;
        const value = getPath(base, field.path) as number;
        expect(value, field.path).toBeGreaterThanOrEqual(field.control.min);
        expect(value, field.path).toBeLessThanOrEqual(field.control.max);
      }
    }
  });

  it('translates the defaults to the engine defaults', () => {
    const o = toTimelineOptions(DEFAULT_OPTIONS);
    expect(o.lod?.eventLabelMinPxPerMs).toBeCloseTo(40 / 86_400_000, 15);
    expect(o.zoom).toEqual({ min: 'fit', max: 20 / 60_000 });
    expect(o.arrows).toEqual({
      hops: 'auto',
      hopRadius: 4,
      hopBudget: 400,
      subLaneStep: 2,
      subLaneMax: 4,
      targetDot: true,
    });
    expect(o.clustering?.maxMarkers).toBe(4000);
    expect(o.pointer).toEqual({ buttons: [0] });
    expect(o.accessibility).toEqual({ label: 'Timeline' });
  });

  it('turns aggregation off as an infinite marker budget', () => {
    const o = toTimelineOptions({
      ...DEFAULT_OPTIONS,
      clustering: { ...DEFAULT_OPTIONS.clustering, aggregate: false },
    });
    expect(o.clustering?.maxMarkers).toBe(Infinity);
  });
});
