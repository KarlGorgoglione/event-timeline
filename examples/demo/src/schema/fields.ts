// Every editable value, declared once: its path, label, control and the hint
// shown beside it (taken from the type docs). The Advanced editor renders from
// this table and `fields.test.ts` checks it covers every leaf of the theme and
// of the options, so nothing the library exposes can go missing.

import type { OptionPath, ThemePath } from '../app/state';
import { LOCALES, type OptionsState } from '../app/options';
import type { HooksState } from '../scenarios/types';

export interface Choice {
  value: string;
  label: string;
}

export type Control =
  | { kind: 'color' }
  | { kind: 'number'; min: number; max: number; step: number; unit?: string }
  | { kind: 'toggle' }
  | { kind: 'select'; options: readonly Choice[] }
  | { kind: 'segmented'; options: readonly Choice[] }
  | { kind: 'dash' }
  | { kind: 'font' }
  | { kind: 'text'; placeholder?: string };

interface FieldBase {
  label: string;
  hint: string;
  control: Control;
}

export interface ThemeField extends FieldBase {
  target: 'theme';
  path: ThemePath;
}

export interface OptionField extends FieldBase {
  target: 'options';
  path: OptionPath;
  /** Greyed out unless this holds (e.g. hop budget only matters on 'auto'). */
  enabled?: (options: OptionsState) => boolean;
}

export interface HookField extends FieldBase {
  target: 'hooks';
  path: keyof HooksState;
}

export type Field = ThemeField | OptionField | HookField;

export interface FieldSection {
  id: string;
  title: string;
  /** The theme group or option it documents, shown as code. */
  code: string;
  fields: readonly Field[];
}

// --- Builders ----------------------------------------------------------------

const t = (
  path: ThemePath,
  label: string,
  control: Control,
  hint: string,
): ThemeField => ({ target: 'theme', path, label, control, hint });

const o = (
  path: OptionPath,
  label: string,
  control: Control,
  hint: string,
  enabled?: (options: OptionsState) => boolean,
): OptionField => ({
  target: 'options',
  path,
  label,
  control,
  hint,
  ...(enabled && { enabled }),
});

const color: Control = { kind: 'color' };
const dash: Control = { kind: 'dash' };
const fontC: Control = { kind: 'font' };
const toggle: Control = { kind: 'toggle' };
const px = (min: number, max: number, step = 1): Control => ({
  kind: 'number',
  min,
  max,
  step,
  unit: 'px',
});
const choices = (...pairs: Array<[string, string]>): Choice[] =>
  pairs.map(([value, label]) => ({ value, label }));

// --- Theme (DESIGN.md §11) ---------------------------------------------------

export const THEME_SECTIONS: readonly FieldSection[] = [
  {
    id: 'canvas',
    title: 'Canvas & grid',
    code: 'background · grid',
    fields: [
      t(
        'background',
        'Background',
        color,
        'Canvas fill; also masks the header.',
      ),
      t(
        'grid.color',
        'Gridlines',
        color,
        'Major-tick gridlines and the header baseline.',
      ),
      t('grid.width', 'Grid width', px(0, 4, 0.5), 'Gridline stroke width.'),
      t('grid.dash', 'Grid dash', dash, 'Dash pattern; solid is [].'),
    ],
  },
  {
    id: 'header',
    title: 'Time header',
    code: 'header',
    fields: [
      t('header.height', 'Height', px(28, 80), 'Height of the two-row header.'),
      t('header.textColor', 'Text', color, 'Tick label colour.'),
      t('header.font', 'Font', fontC, 'CSS font shorthand, sized in px.'),
      t(
        'header.majorTickRatio',
        'Major row at',
        { kind: 'number', min: 0, max: 1, step: 0.02 },
        'Vertical centre of the major (upper) labels, as a fraction of the height.',
      ),
      t(
        'header.minorTickRatio',
        'Minor row at',
        { kind: 'number', min: 0, max: 1, step: 0.02 },
        'Vertical centre of the minor (lower) labels, as a fraction of the height.',
      ),
    ],
  },
  {
    id: 'layout',
    title: 'Rows & spacing',
    code: 'layout',
    fields: [
      t(
        'layout.rowHeight',
        'Row height',
        px(12, 72),
        'Height of each element row.',
      ),
      t('layout.rowGap', 'Row gap', px(0, 32), 'Space between rows.'),
      t(
        'layout.edgePadding',
        'Edge padding',
        px(0, 32),
        "Space between the viewport's left edge and a sticky start marker.",
      ),
      t(
        'layout.lineLead',
        'Line lead',
        px(0, 48),
        "Length of line drawn before an element's first event.",
      ),
      t(
        'layout.markerGap',
        'Marker gap',
        px(0, 32),
        "Gap between a start marker (icon and label) and its line's left end.",
      ),
      t(
        'layout.eventLabelGap',
        'Label gap',
        px(0, 24),
        'Gap between a riser or cluster marker and its label.',
      ),
    ],
  },
  {
    id: 'element',
    title: 'Elements',
    code: 'element',
    fields: [
      t('element.lineColor', 'Line', color, 'Lane line colour.'),
      t('element.lineWidth', 'Line width', px(0.5, 8, 0.5), 'Lane line width.'),
      t('element.lineDash', 'Line dash', dash, 'Lane line dash pattern.'),
      t(
        'element.labelColor',
        'Label',
        color,
        'Start-marker label colour; also colours glyph icons.',
      ),
      t(
        'element.labelFont',
        'Label font',
        fontC,
        'Start-marker label font, sized in px.',
      ),
      t(
        'element.iconSize',
        'Icon size',
        px(0, 48),
        'Icon box, drawn above the label.',
      ),
    ],
  },
  {
    id: 'event',
    title: 'Events',
    code: 'event',
    fields: [
      t(
        'event.arrowColor',
        'Arrow',
        color,
        'Riser, source dot, target dot and arrowhead.',
      ),
      t(
        'event.arrowWidth',
        'Arrow width',
        px(0.5, 6, 0.25),
        'Riser stroke width.',
      ),
      t(
        'event.arrowDash',
        'Arrow dash',
        dash,
        'Riser and self-loop dash; arrowheads stay solid.',
      ),
      t(
        'event.arrowheadSize',
        'Arrowhead',
        px(0, 16, 0.5),
        'Arrowhead size; also sizes self-loops.',
      ),
      t(
        'event.nodeRadius',
        'Node radius',
        px(0, 10, 0.5),
        'Source and target dot radius.',
      ),
      t('event.labelColor', 'Label', color, 'Event label colour.'),
      t(
        'event.labelFont',
        'Label font',
        fontC,
        'Event label font, sized in px.',
      ),
    ],
  },
  {
    id: 'labelBox',
    title: 'Event label boxes',
    code: 'event.labelBox*',
    fields: [
      t(
        'event.labelBoxBackground',
        'Fill',
        color,
        "Box behind event labels; 'transparent' draws none.",
      ),
      t(
        'event.labelBoxBorderColor',
        'Border',
        color,
        "Box border; 'transparent' draws none.",
      ),
      t(
        'event.labelBoxBorderWidth',
        'Border width',
        px(0, 4, 0.5),
        '0 draws no border.',
      ),
      t(
        'event.labelBoxBorderDash',
        'Border dash',
        dash,
        'Box border dash pattern.',
      ),
      t(
        'event.labelBoxPadding',
        'Padding',
        px(0, 12, 0.5),
        'Text to box edge.',
      ),
    ],
  },
  {
    id: 'emphasis',
    title: 'Hover & selection',
    code: 'emphasis',
    fields: [
      t(
        'emphasis.hoverColor',
        'Hover',
        color,
        'Highlight colour under the pointer.',
      ),
      t(
        'emphasis.selectionColor',
        'Selection',
        color,
        'Highlight colour of selected items.',
      ),
      t(
        'emphasis.hoverWidthBonus',
        'Hover width +',
        px(0, 6, 0.5),
        'Stroke width added to a hovered item.',
      ),
      t(
        'emphasis.selectionWidthBonus',
        'Selection width +',
        px(0, 6, 0.5),
        'Stroke width added to a selected item.',
      ),
      t(
        'emphasis.radiusBonus',
        'Radius +',
        px(0, 6, 0.5),
        'Radius added to highlighted dots and arrowheads.',
      ),
    ],
  },
  {
    id: 'cluster',
    title: 'Clusters',
    code: 'cluster',
    fields: [
      t('cluster.color', 'Marker', color, 'Cluster riser and marker.'),
      t('cluster.textColor', 'Count', color, 'Colour of the ×N count label.'),
      t(
        'cluster.markerBonus',
        'Marker radius +',
        px(0, 8, 0.5),
        'Radius a marker gets over an ordinary dot.',
      ),
    ],
  },
  {
    id: 'rowSeparator',
    title: 'Row separators',
    code: 'rowSeparator',
    fields: [
      t(
        'rowSeparator.enabled',
        'Show',
        toggle,
        'A line centred in each row gap.',
      ),
      t('rowSeparator.color', 'Colour', color, 'Separator colour.'),
      t(
        'rowSeparator.width',
        'Width',
        px(0, 4, 0.5),
        'Separator stroke width.',
      ),
      t('rowSeparator.dash', 'Dash', dash, 'Separator dash pattern.'),
    ],
  },
];

// --- Options (DESIGN.md §3.1, §4, §6, §7, §9) --------------------------------

export const OPTION_SECTIONS: readonly FieldSection[] = [
  {
    id: 'rendering',
    title: 'Rendering',
    code: 'renderer',
    fields: [
      o(
        'renderer',
        'Renderer',
        {
          kind: 'segmented',
          options: choices(
            ['auto', 'Auto'],
            ['webgl', 'WebGL2'],
            ['canvas2d', 'Canvas2D'],
          ),
        },
        'Auto tries WebGL2 and falls back to Canvas2D; both look the same.',
      ),
    ],
  },
  {
    id: 'layoutStreaming',
    title: 'Row order & streaming',
    code: 'layout · streamingLayout',
    fields: [
      o(
        'layout',
        'Row order',
        {
          kind: 'select',
          options: choices(
            ['byFirstEvent', 'By first event'],
            ['barycenter', 'Barycenter (fewer crossings)'],
            ['explicit', 'Explicit (element.order)'],
          ),
        },
        'Layout strategy that orders the rows.',
      ),
      o(
        'emptyElements',
        'Empty rows',
        {
          kind: 'segmented',
          options: choices(['hide', 'Hide'], ['show', 'Show']),
        },
        'Elements without events: hidden, or shown as a label-only row.',
      ),
      o(
        'streamingLayout',
        'On live updates',
        {
          kind: 'segmented',
          options: choices(
            ['stable-append', 'Stable'],
            ['full', 'Full relayout'],
          ),
        },
        'Stable keeps rows put and appends new ones; full re-sorts (debounced).',
      ),
      o(
        'layoutDebounceMs',
        'Relayout debounce',
        { kind: 'number', min: 0, max: 1000, step: 10, unit: 'ms' },
        'Delay before a full relayout after live updates.',
        (s) => s.streamingLayout === 'full',
      ),
    ],
  },
  {
    id: 'clustering',
    title: 'Clustering & detail',
    code: 'clustering · lod',
    fields: [
      o(
        'clustering.enabled',
        'Cluster',
        toggle,
        'Merge nearby events into ×N markers.',
      ),
      o(
        'clustering.strategy',
        'Group by',
        {
          kind: 'select',
          options: choices(
            ['bySourceTargetColumn', 'Pair + pixel column'],
            ['byElementPair', 'Element pair'],
            ['byPixelColumn', 'Pixel column'],
            ['byDay', 'Calendar day (UTC)'],
          ),
        },
        'Which events may merge.',
        (s) => s.clustering.enabled,
      ),
      o(
        'clustering.minSeparationPx',
        'Merge within',
        px(2, 64),
        'Events of one group closer than this merge.',
        (s) => s.clustering.enabled,
      ),
      o(
        'clustering.aggregate',
        'Aggregate far out',
        toggle,
        'Past the marker budget, read pre-binned per-pair counts (pair strategies only).',
        (s) => s.clustering.enabled,
      ),
      o(
        'clustering.maxMarkers',
        'Marker budget',
        { kind: 'number', min: 100, max: 20000, step: 100 },
        'Most markers a frame draws before aggregation takes over.',
        (s) => s.clustering.enabled && s.clustering.aggregate,
      ),
      o(
        'lod.eventLabelPxPerDay',
        'Event labels from',
        { kind: 'number', min: 0, max: 400, step: 1, unit: 'px/day' },
        'Event labels appear at or above this zoom.',
      ),
    ],
  },
  {
    id: 'arrows',
    title: 'Arrows',
    code: 'arrows',
    fields: [
      o(
        'arrows.hops',
        'Crossing hops',
        {
          kind: 'segmented',
          options: choices(['off', 'Off'], ['auto', 'Auto'], ['on', 'On']),
        },
        'Bridge arcs where a riser crosses a line; auto stays within the budget.',
      ),
      o(
        'arrows.hopRadius',
        'Hop radius',
        px(0, 12, 0.5),
        'Radius of a hop arc.',
        (s) => s.arrows.hops !== 'off',
      ),
      o(
        'arrows.hopBudget',
        'Hop budget',
        { kind: 'number', min: 0, max: 2000, step: 50 },
        'Most hop arcs per frame for auto to draw them.',
        (s) => s.arrows.hops === 'auto',
      ),
      o(
        'arrows.subLaneStep',
        'Sub-lane step',
        px(0, 8, 0.5),
        'Horizontal nudge between arrows sharing a pixel column.',
      ),
      o(
        'arrows.subLaneMax',
        'Sub-lane max',
        { kind: 'number', min: 0, max: 12, step: 1 },
        'Most nudges applied in one column.',
      ),
      o(
        'arrows.targetDot',
        'Target dot',
        toggle,
        'Mark where an arrow lands with a dot.',
      ),
    ],
  },
  {
    id: 'labels',
    title: 'Labels',
    code: 'labels · eventLabel',
    fields: [
      o(
        'labels.placement',
        'Event labels at',
        {
          kind: 'segmented',
          options: choices(['midpoint', 'Midpoint'], ['sourceNode', 'Source']),
        },
        'Beside the riser, or centred on the source dot.',
      ),
      o(
        'labels.maxPerFrame',
        'Max per frame',
        { kind: 'number', min: 0, max: 2000, step: 10 },
        'Most event and cluster labels drawn in one frame.',
      ),
      o(
        'labels.avoidCollisions',
        'Avoid overlaps',
        toggle,
        'Skip labels that would overlap one already drawn.',
      ),
    ],
  },
  {
    id: 'navigation',
    title: 'Navigation',
    code: 'zoom · pan · keyboard · pointer',
    fields: [
      o(
        'navigation.zoomMinFit',
        'Zoom out to data',
        toggle,
        "zoom.min: 'fit', no further out than the whole extent.",
      ),
      o(
        'navigation.zoomMinPxPerDay',
        'Zoom out to',
        { kind: 'number', min: 0.05, max: 100, step: 0.05, unit: 'px/day' },
        'Deepest zoom-out when not limited to the data.',
        (s) => !s.navigation.zoomMinFit,
      ),
      o(
        'navigation.zoomMaxPxPerMinute',
        'Zoom in to',
        { kind: 'number', min: 1, max: 2000, step: 1, unit: 'px/min' },
        'Deepest zoom-in (zoom.max).',
      ),
      o(
        'navigation.panBounds',
        'Pan limits',
        {
          kind: 'segmented',
          options: choices(['none', 'Free'], ['data', 'Data']),
        },
        "'data' keeps the visible window on the data extent.",
      ),
      o(
        'navigation.fitOnDataChange',
        'Fit on new data',
        {
          kind: 'select',
          options: choices(
            ['auto', 'Auto (first, or out of view)'],
            ['always', 'Always'],
            ['first', 'First dataset only'],
            ['never', 'Never'],
          ),
        },
        'When setData refits the camera.',
      ),
      o(
        'navigation.keyboard',
        'Keyboard',
        toggle,
        'Arrows, +/−, 0 and Escape while the timeline has focus.',
      ),
      o(
        'navigation.pointer',
        'Pan with',
        {
          kind: 'segmented',
          options: choices(
            ['primary', 'Left'],
            ['primary+middle', 'Left + middle'],
          ),
        },
        'Mouse buttons that pan and click (pointer.buttons).',
      ),
      o(
        'multiSelect',
        'Multi-select',
        toggle,
        'Ctrl/⌘-click adds to the selection.',
      ),
    ],
  },
  {
    id: 'locale',
    title: 'Locale & accessibility',
    code: 'locale · accessibility',
    fields: [
      o(
        'locale',
        'Header locale',
        { kind: 'select', options: LOCALES },
        'Locale of the built-in tick labels (always UTC).',
      ),
      o(
        'accessibility.label',
        'Accessible name',
        { kind: 'text' },
        'aria-label of the timeline.',
      ),
      o(
        'accessibility.description',
        'Description',
        { kind: 'text', placeholder: 'Optional summary' },
        'Exposed through aria-describedby.',
      ),
    ],
  },
];

// --- Data hooks (§11) --------------------------------------------------------

const h = (
  path: keyof HooksState,
  label: string,
  control: Control,
  hint: string,
): HookField => ({ target: 'hooks', path, label, control, hint });

export const HOOK_SECTION: FieldSection = {
  id: 'hooks',
  title: 'Data hooks',
  code: 'styleResolvers · formatters',
  fields: [
    h(
      'colours',
      'Data colours',
      toggle,
      "The scenario's style resolvers: colour from each item's payload.",
    ),
    h(
      'formatters',
      'Formatters',
      toggle,
      "The scenario's label and tick formatters.",
    ),
    h(
      'eventLabels',
      'Event labels',
      toggle,
      'A formatter returning undefined draws no label.',
    ),
    h(
      'tooltip',
      'Tooltip',
      {
        kind: 'segmented',
        options: choices(
          ['rich', 'Rich'],
          ['default', 'Default'],
          ['off', 'Off'],
        ),
      },
      'renderTooltip card, the built-in tooltip, or none.',
    ),
  ],
};

export const ALL_FIELDS: readonly Field[] = [
  ...THEME_SECTIONS,
  ...OPTION_SECTIONS,
  HOOK_SECTION,
].flatMap((s) => s.fields);
