// What a showcase scenario is: a dataset plus the options, data hooks, focus
// range and story that make one set of library features shine.

import type {
  Formatters,
  StyleResolvers,
  TimelineData,
  TimelineElement,
  TimelineEvent,
} from '@event-timeline/react';
import type { Edits } from '../app/paths';
import type { OptionsState } from '../app/options';
import type { ThemePreset } from '../themes/presets';
import type { AmlPattern } from '../synthetic';

export type ScenarioId =
  | 'tour'
  | 'aml'
  | 'incident'
  | 'logistics'
  | 'live'
  | 'scale'
  | 'playground';

/**
 * The payload every scenario's items carry (`data`, echoed back in callbacks).
 * One loose shape keeps a single `<Timeline<Datum>>` across scenarios.
 */
export interface Datum {
  /** Palette slot: 0 = neutral background, 1–5 = `palette.series[n - 1]`. */
  category?: number;
  kind?: string;
  pattern?: AmlPattern;
  amount?: number;
  region?: string;
  code?: string;
  country?: string;
  mode?: 'sea' | 'air' | 'rail';
  cargo?: string;
  tier?: string;
  status?: string;
  latencyMs?: number;
}

export type DemoElement = TimelineElement<Datum>;
export type DemoEvent = TimelineEvent<Datum>;
export type DemoData = TimelineData<Datum>;

/** Data hooks the demo toggles on top of the scenario (§11). */
export interface HooksState {
  /** The scenario's data-driven style resolvers. */
  colours: boolean;
  /** The scenario's label and tick formatters. */
  formatters: boolean;
  /** Draw event labels at all (a formatter returning `undefined` hides one). */
  eventLabels: boolean;
  /** Hover tooltip: the scenario's rich card, the library default, or none. */
  tooltip: 'rich' | 'default' | 'off';
}

export const DEFAULT_HOOKS: HooksState = {
  colours: true,
  formatters: true,
  eventLabels: true,
  tooltip: 'rich',
};

/** Structured details of a hovered or selected item (tooltip, inspector). */
export interface Description {
  title: string;
  subtitle?: string;
  /** Colour chip shown beside the title. */
  swatch?: string;
  badge?: { text: string; color: string };
  rows: ReadonlyArray<readonly [string, string]>;
}

export interface DescribeContext {
  preset: ThemePreset;
  /** Display label of an element id. */
  labelOf: (id: string) => string;
}

export type LegendMark =
  | 'line'
  | 'arrow'
  | 'dashed'
  | 'dotted'
  | 'heavy'
  | 'loop'
  | 'cluster'
  | 'hop'
  | 'icon';

export interface LegendItem {
  label: string;
  mark: LegendMark;
  color: string;
  detail?: string;
  /** For `icon` marks: the glyph shown. */
  glyph?: string;
}

export interface Scenario {
  id: ScenarioId;
  /** Tab label. */
  short: string;
  title: string;
  tagline: string;
  summary: string;
  tryThis: readonly string[];
  /** Selectable dataset sizes or flavours; the first is the default. */
  variants?: ReadonlyArray<{ id: string; label: string }>;
  /** Generation is slow enough to deserve a loading overlay. */
  heavy?: boolean;
  load: (variant: string | undefined) => DemoData;
  /** Option overrides over the engine defaults. */
  options?: Edits<OptionsState>;
  hooks?: Partial<HooksState>;
  /** Initial window; `null` fits the whole extent. */
  focus?: (data: DemoData) => readonly [number, number] | null;
  /** Step for the inspector's "shift time" action. */
  nudgeMs: number;
  /** Time formatting for tooltips and the inspector. */
  formatTime: (t: number) => string;
  resolvers?: (preset: ThemePreset) => StyleResolvers<Datum>;
  formatters?: () => Formatters<Datum>;
  /** Element icons drawn for the preset (browser only), applied by id. */
  icons?: (preset: ThemePreset) => ReadonlyMap<string, CanvasImageSource>;
  describeElement?: (element: DemoElement, ctx: DescribeContext) => Description;
  describeEvent?: (event: DemoEvent, ctx: DescribeContext) => Description;
  legend?: (preset: ThemePreset) => LegendItem[];
  accessibility: { label: string; description: string };
}
