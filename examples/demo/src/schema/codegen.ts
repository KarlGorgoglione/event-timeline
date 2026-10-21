// Export what's on screen as code: the theme as a `ThemeInput` holding only
// what differs from `defaultTheme`, and a ready-to-paste `<Timeline>` with the
// options that differ from the engine defaults.

import {
  defaultTheme,
  type Theme,
  type ThemeInput,
} from '@event-timeline/react';
import { sameValue } from '../app/paths';
import { DEFAULT_OPTIONS, type OptionsState } from '../app/options';

/** The groups and keys of `theme` that differ from `defaultTheme`. */
export function themeDiff(theme: Theme): ThemeInput {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(defaultTheme) as Array<keyof Theme>) {
    const value = theme[key];
    const base = defaultTheme[key];
    if (typeof value !== 'object' || typeof base !== 'object') {
      if (!sameValue(value, base)) out[key] = value;
      continue;
    }
    const group: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!sameValue(v, (base as unknown as Record<string, unknown>)[k])) {
        group[k] = v;
      }
    }
    if (Object.keys(group).length > 0) out[key] = group;
  }
  return out;
}

/** A verbatim code fragment inside a value tree. */
class Code {
  constructor(readonly text: string) {}
}

const DAY = '86_400_000';
const MINUTE = '60_000';

/** The options that differ from the engine defaults, as a code value tree. */
export function optionsDiff(s: OptionsState): {
  value: Record<string, unknown>;
  imports: string[];
} {
  const d = DEFAULT_OPTIONS;
  const out: Record<string, unknown> = {};
  const imports = new Set<string>();
  const group = (key: string, entries: Record<string, unknown>) => {
    if (Object.keys(entries).length > 0) out[key] = entries;
  };
  const strategy = (name: string) => {
    imports.add(name);
    return new Code(name);
  };

  if (s.renderer !== d.renderer) out.renderer = s.renderer;
  if (s.layout !== d.layout) out.layout = strategy(s.layout);
  if (s.streamingLayout !== d.streamingLayout) {
    out.streamingLayout = s.streamingLayout;
  }
  if (s.layoutDebounceMs !== d.layoutDebounceMs) {
    out.layoutDebounceMs = s.layoutDebounceMs;
  }
  if (s.emptyElements !== d.emptyElements) out.emptyElements = s.emptyElements;
  if (s.multiSelect !== d.multiSelect) out.multiSelect = s.multiSelect;

  const c = s.clustering;
  const cd = d.clustering;
  const maxMarkers = c.aggregate ? c.maxMarkers : Infinity;
  group('clustering', {
    ...(c.enabled !== cd.enabled && { enabled: c.enabled }),
    ...(c.strategy !== cd.strategy && { strategy: strategy(c.strategy) }),
    ...(c.minSeparationPx !== cd.minSeparationPx && {
      minSeparationPx: c.minSeparationPx,
    }),
    ...(maxMarkers !== cd.maxMarkers && {
      maxMarkers: maxMarkers === Infinity ? new Code('Infinity') : maxMarkers,
    }),
  });

  if (s.lod.eventLabelPxPerDay !== d.lod.eventLabelPxPerDay) {
    group('lod', {
      eventLabelMinPxPerMs: new Code(
        `${s.lod.eventLabelPxPerDay} / ${DAY}, // px per day`,
      ),
    });
  }

  const a = s.arrows;
  const ad = d.arrows;
  group('arrows', {
    ...(a.hops !== ad.hops && {
      hops: a.hops === 'auto' ? 'auto' : a.hops === 'on',
    }),
    ...(a.hopRadius !== ad.hopRadius && { hopRadius: a.hopRadius }),
    ...(a.hopBudget !== ad.hopBudget && { hopBudget: a.hopBudget }),
    ...(a.subLaneStep !== ad.subLaneStep && { subLaneStep: a.subLaneStep }),
    ...(a.subLaneMax !== ad.subLaneMax && { subLaneMax: a.subLaneMax }),
    ...(a.targetDot !== ad.targetDot && { targetDot: a.targetDot }),
  });

  const l = s.labels;
  const ld = d.labels;
  group('labels', {
    ...(l.maxPerFrame !== ld.maxPerFrame && { maxPerFrame: l.maxPerFrame }),
    ...(l.avoidCollisions !== ld.avoidCollisions && {
      avoidCollisions: l.avoidCollisions,
    }),
  });
  if (l.placement !== ld.placement)
    group('eventLabel', { placement: l.placement });

  const n = s.navigation;
  const nd = d.navigation;
  const minChanged =
    n.zoomMinFit !== nd.zoomMinFit ||
    (!n.zoomMinFit && n.zoomMinPxPerDay !== nd.zoomMinPxPerDay);
  group('zoom', {
    ...(minChanged && {
      min: n.zoomMinFit
        ? 'fit'
        : new Code(`${n.zoomMinPxPerDay} / ${DAY}, // px per day`),
    }),
    ...(n.zoomMaxPxPerMinute !== nd.zoomMaxPxPerMinute && {
      max: new Code(`${n.zoomMaxPxPerMinute} / ${MINUTE}, // px per minute`),
    }),
  });
  if (n.panBounds !== nd.panBounds) group('pan', { bounds: n.panBounds });
  if (n.fitOnDataChange !== nd.fitOnDataChange) {
    out.fitOnDataChange = n.fitOnDataChange;
  }
  if (n.keyboard !== nd.keyboard) out.keyboard = n.keyboard;
  if (n.pointer !== nd.pointer) {
    group('pointer', { buttons: n.pointer === 'primary' ? [0] : [0, 1] });
  }
  if (s.locale !== d.locale) out.locale = s.locale;
  const description = s.accessibility.description.trim();
  group('accessibility', {
    ...(s.accessibility.label !== d.accessibility.label && {
      label: s.accessibility.label,
    }),
    ...(description !== '' && { description }),
  });

  return { value: out, imports: [...imports].sort() };
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A string literal, single-quoted unless the text holds one (as Prettier). */
function quote(text: string): string {
  const escaped = text.replace(/\\/g, '\\\\');
  return text.includes("'") && !text.includes('"')
    ? `"${escaped}"`
    : `'${escaped.replace(/'/g, "\\'")}'`;
}

/** TypeScript source for a value tree (single quotes, trailing commas). */
export function toCode(value: unknown, indent = ''): string {
  if (value instanceof Code) return value.text;
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value))
    return `[${value.map((v) => toCode(v)).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const inner = `${indent}  `;
    const lines = entries.map(([k, v]) => {
      const key = IDENT.test(k) ? k : `'${k}'`;
      const code = toCode(v, inner);
      // A code fragment may carry its own trailing comma and comment.
      return `${inner}${key}: ${code}${code.includes('//') ? '' : ','}`;
    });
    return `{\n${lines.join('\n')}\n${indent}}`;
  }
  return String(value);
}

export function themeJson(theme: Theme): string {
  return JSON.stringify(themeDiff(theme), null, 2);
}

export function reactSnippet(theme: Theme, options: OptionsState): string {
  const themeInput = themeDiff(theme);
  const { value: opts, imports } = optionsDiff(options);
  const hasTheme = Object.keys(themeInput).length > 0;
  const hasOptions = Object.keys(opts).length > 0;
  const values = ['Timeline', ...imports];
  const types = [
    ...(hasTheme ? ['ThemeInput'] : []),
    ...(hasOptions ? ['TimelineOptions'] : []),
    'TimelineData',
  ];
  const lines = [
    `import { ${values.join(', ')} } from '@event-timeline/react';`,
    `import type { ${types.join(', ')} } from '@event-timeline/react';`,
    '',
  ];
  if (hasTheme)
    lines.push(`const theme: ThemeInput = ${toCode(themeInput)};`, '');
  if (hasOptions)
    lines.push(`const options: TimelineOptions = ${toCode(opts)};`, '');
  const props = [
    'data={data}',
    ...(hasTheme ? ['theme={theme}'] : []),
    ...(hasOptions ? ['options={options}'] : []),
  ];
  lines.push(
    'export function MyTimeline({ data }: { data: TimelineData }) {',
    `  return <Timeline ${props.join(' ')} />;`,
    '}',
  );
  return lines.join('\n');
}
