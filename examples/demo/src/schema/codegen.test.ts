import { describe, expect, it } from 'vitest';
import { defaultTheme } from '@event-timeline/react';
import { applyEdits } from '../app/paths';
import { DEFAULT_OPTIONS } from '../app/options';
import { optionsDiff, reactSnippet, themeDiff, toCode } from './codegen';

describe('themeDiff', () => {
  it('is empty for the default theme', () => {
    expect(themeDiff(defaultTheme)).toEqual({});
  });

  it('keeps only the changed keys, group by group', () => {
    const theme = applyEdits(defaultTheme, {
      background: '#000000',
      'event.arrowColor': '#ff0000',
      'grid.dash': [2, 2],
    });
    expect(themeDiff(theme)).toEqual({
      background: '#000000',
      grid: { dash: [2, 2] },
      event: { arrowColor: '#ff0000' },
    });
  });
});

describe('optionsDiff', () => {
  it('is empty for the engine defaults', () => {
    expect(optionsDiff(DEFAULT_OPTIONS)).toEqual({ value: {}, imports: [] });
  });

  it('references strategies by name and imports them', () => {
    const state = applyEdits(DEFAULT_OPTIONS, {
      layout: 'barycenter',
      'clustering.strategy': 'byDay',
      'clustering.aggregate': false,
    });
    const { value, imports } = optionsDiff(state);
    expect(imports).toEqual(['barycenter', 'byDay']);
    expect(toCode(value)).toBe(
      [
        '{',
        '  layout: barycenter,',
        '  clustering: {',
        '    strategy: byDay,',
        '    maxMarkers: Infinity,',
        '  },',
        '}',
      ].join('\n'),
    );
  });

  it('writes zoom and LOD in readable units', () => {
    const state = applyEdits(DEFAULT_OPTIONS, {
      'lod.eventLabelPxPerDay': 10,
      'navigation.zoomMaxPxPerMinute': 240,
    });
    const code = toCode(optionsDiff(state).value);
    expect(code).toContain(
      'eventLabelMinPxPerMs: 10 / 86_400_000, // px per day',
    );
    expect(code).toContain('max: 240 / 60_000, // px per minute');
  });
});

describe('reactSnippet', () => {
  it('produces a minimal component for the defaults', () => {
    expect(reactSnippet(defaultTheme, DEFAULT_OPTIONS)).toBe(
      [
        "import { Timeline } from '@event-timeline/react';",
        "import type { TimelineData } from '@event-timeline/react';",
        '',
        'export function MyTimeline({ data }: { data: TimelineData }) {',
        '  return <Timeline data={data} />;',
        '}',
      ].join('\n'),
    );
  });

  it('includes the theme and options when they differ', () => {
    const snippet = reactSnippet(
      applyEdits(defaultTheme, { background: '#0b1020' }),
      applyEdits(DEFAULT_OPTIONS, { locale: 'fr-FR' }),
    );
    expect(snippet).toContain(
      "const theme: ThemeInput = {\n  background: '#0b1020',\n};",
    );
    expect(snippet).toContain(
      "const options: TimelineOptions = {\n  locale: 'fr-FR',\n};",
    );
    expect(snippet).toContain(
      '<Timeline data={data} theme={theme} options={options} />',
    );
  });
});

describe('toCode', () => {
  it('quotes strings like Prettier', () => {
    expect(toCode('plain')).toBe("'plain'");
    expect(toCode("12px 'Inter', sans-serif")).toBe(
      `"12px 'Inter', sans-serif"`,
    );
    // Both quote kinds: single quotes, with the inner one escaped.
    expect(toCode(`say "it's"`)).toBe(String.raw`'say "it\'s"'`);
  });
});
