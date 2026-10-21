// The showcase's theme gallery (DESIGN.md §11: theming is the host's; core
// ships only `defaultTheme`). Each preset is a complete `Theme` plus the
// colours the demo needs around it:
//
// - `palette`: categorical colours for data-driven styling. `series` is the
//   validated five-slot order (blue, orange, aqua, yellow, magenta), stepped
//   per surface: the dark steps pass the dataviz validator on every dark
//   background below, the light steps on both light ones (lightness band,
//   chroma, adjacent-pair CVD separation, contrast >= 3:1). `neutral` is the
//   recessive colour for background activity, never an identity.
// - `status`: reserved state colours (good … critical), never a series.
// - `chrome`: the page around the canvas, so the UI follows the theme.

import { defaultTheme, type Theme } from '@event-timeline/react';
import { FAMILIES, font } from './fonts';

export type PresetId =
  | 'midnight'
  | 'daylight'
  | 'paper'
  | 'terminal'
  | 'synthwave'
  | 'contrast'
  | 'classic';

export interface DataPalette {
  neutral: string;
  series: readonly [string, string, string, string, string];
}

export interface StatusPalette {
  good: string;
  warning: string;
  serious: string;
  critical: string;
}

export interface ChromeTokens {
  /** Page plane behind the cards. */
  page: string;
  /** Card surface. */
  surface: string;
  /** Inputs and raised controls. */
  raised: string;
  border: string;
  text: string;
  muted: string;
  /** Soft accent glow behind the stage. */
  glow: string;
}

export interface ThemePreset {
  id: PresetId;
  name: string;
  blurb: string;
  scheme: 'dark' | 'light';
  theme: Theme;
  palette: DataPalette;
  status: StatusPalette;
  chrome: ChromeTokens;
}

const DARK_SERIES = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
] as const;
const LIGHT_SERIES = [
  '#2a78d6',
  '#c4501f',
  '#0f8a62',
  '#a86d00',
  '#c23f73',
] as const;

const DARK_STATUS: StatusPalette = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#e5484d',
};
const LIGHT_STATUS: StatusPalette = {
  good: '#15803d',
  warning: '#b45309',
  serious: '#c2410c',
  critical: '#b91c1c',
};

const roomy = {
  rowHeight: 32,
  rowGap: 8,
  edgePadding: 12,
  lineLead: 16,
  markerGap: 10,
  eventLabelGap: 6,
};

const midnight: ThemePreset = {
  id: 'midnight',
  name: 'Midnight',
  blurb: 'The signature look: deep navy, indigo lanes, pill labels.',
  scheme: 'dark',
  theme: {
    background: '#0b1020',
    grid: { color: 'rgba(129, 140, 248, 0.09)', width: 1, dash: [] },
    header: {
      height: 52,
      textColor: '#8e98bf',
      font: font(11, FAMILIES.inter, 600),
      majorTickRatio: 0.36,
      minorTickRatio: 0.74,
    },
    layout: roomy,
    emphasis: {
      hoverColor: '#fcd34d',
      selectionColor: '#38bdf8',
      hoverWidthBonus: 2,
      selectionWidthBonus: 2.5,
      radiusBonus: 1.5,
    },
    cluster: { color: '#f59e0b', textColor: '#fbbf24', markerBonus: 3 },
    rowSeparator: {
      enabled: true,
      color: 'rgba(129, 140, 248, 0.06)',
      width: 1,
      dash: [],
    },
    element: {
      lineColor: '#6d7cff',
      lineWidth: 2.5,
      lineDash: [],
      labelColor: '#e5e8f6',
      labelFont: font(12, FAMILIES.inter, 500),
      iconSize: 18,
    },
    event: {
      arrowColor: '#7b86ad',
      arrowWidth: 1.25,
      arrowDash: [],
      arrowheadSize: 7,
      labelColor: '#cdd3ee',
      labelFont: font(11, FAMILIES.inter, 500),
      nodeRadius: 3.5,
      labelBoxBackground: 'rgba(19, 26, 52, 0.92)',
      labelBoxBorderColor: 'rgba(109, 124, 255, 0.42)',
      labelBoxBorderWidth: 1,
      labelBoxBorderDash: [],
      labelBoxPadding: 4,
    },
  },
  palette: { neutral: '#525d85', series: DARK_SERIES },
  status: DARK_STATUS,
  chrome: {
    page: '#060914',
    surface: '#0d1326',
    raised: '#141b35',
    border: 'rgba(129, 140, 248, 0.16)',
    text: '#e5e8f6',
    muted: '#8e98bf',
    glow: 'rgba(99, 102, 241, 0.28)',
  },
};

const daylight: ThemePreset = {
  id: 'daylight',
  name: 'Daylight',
  blurb: 'Crisp and bright, for reports and well-lit rooms.',
  scheme: 'light',
  theme: {
    background: '#fbfcfe',
    grid: { color: 'rgba(15, 23, 42, 0.07)', width: 1, dash: [] },
    header: {
      height: 52,
      textColor: '#5b6782',
      font: font(11, FAMILIES.inter, 600),
      majorTickRatio: 0.36,
      minorTickRatio: 0.74,
    },
    layout: roomy,
    emphasis: {
      hoverColor: '#d97706',
      selectionColor: '#2563eb',
      hoverWidthBonus: 2,
      selectionWidthBonus: 2.5,
      radiusBonus: 1.5,
    },
    cluster: { color: '#b45309', textColor: '#92400e', markerBonus: 3 },
    rowSeparator: {
      enabled: true,
      color: 'rgba(15, 23, 42, 0.05)',
      width: 1,
      dash: [],
    },
    element: {
      lineColor: '#4f46e5',
      lineWidth: 2.5,
      lineDash: [],
      labelColor: '#0f172a',
      labelFont: font(12, FAMILIES.inter, 500),
      iconSize: 18,
    },
    event: {
      arrowColor: '#7a879f',
      arrowWidth: 1.25,
      arrowDash: [],
      arrowheadSize: 7,
      labelColor: '#334155',
      labelFont: font(11, FAMILIES.inter, 500),
      nodeRadius: 3.5,
      labelBoxBackground: 'rgba(255, 255, 255, 0.94)',
      labelBoxBorderColor: 'rgba(79, 70, 229, 0.3)',
      labelBoxBorderWidth: 1,
      labelBoxBorderDash: [],
      labelBoxPadding: 4,
    },
  },
  palette: { neutral: '#9aa3b5', series: LIGHT_SERIES },
  status: LIGHT_STATUS,
  chrome: {
    page: '#eef1f7',
    surface: '#ffffff',
    raised: '#f3f5fa',
    border: 'rgba(15, 23, 42, 0.1)',
    text: '#0f172a',
    muted: '#5b6782',
    glow: 'rgba(79, 70, 229, 0.14)',
  },
};

const paper: ThemePreset = {
  id: 'paper',
  name: 'Paper',
  blurb: 'Editorial: warm ivory, serif labels, dotted rules.',
  scheme: 'light',
  theme: {
    background: '#f6f1e7',
    grid: { color: 'rgba(87, 62, 32, 0.13)', width: 1, dash: [2, 4] },
    header: {
      height: 50,
      textColor: '#7a6650',
      font: font(12, FAMILIES.serif, 400, true),
      majorTickRatio: 0.36,
      minorTickRatio: 0.74,
    },
    layout: { ...roomy, rowHeight: 30, lineLead: 18 },
    emphasis: {
      hoverColor: '#c2410c',
      selectionColor: '#1d4ed8',
      hoverWidthBonus: 1.5,
      selectionWidthBonus: 2,
      radiusBonus: 1,
    },
    cluster: { color: '#9a3412', textColor: '#7c2d12', markerBonus: 2.5 },
    rowSeparator: {
      enabled: true,
      color: 'rgba(87, 62, 32, 0.12)',
      width: 1,
      dash: [1, 3],
    },
    element: {
      lineColor: '#3b342c',
      lineWidth: 1.5,
      lineDash: [],
      labelColor: '#2a241d',
      labelFont: font(13, FAMILIES.serif),
      iconSize: 16,
    },
    event: {
      arrowColor: '#8b7a63',
      arrowWidth: 1,
      arrowDash: [],
      arrowheadSize: 6,
      labelColor: '#4a3f33',
      labelFont: font(11, FAMILIES.serif, 400, true),
      nodeRadius: 2.5,
      labelBoxBackground: 'rgba(246, 241, 231, 0.92)',
      labelBoxBorderColor: 'transparent',
      labelBoxBorderWidth: 0,
      labelBoxBorderDash: [],
      labelBoxPadding: 3,
    },
  },
  palette: { neutral: '#a3927a', series: LIGHT_SERIES },
  status: LIGHT_STATUS,
  chrome: {
    page: '#ebe3d3',
    surface: '#f9f5ec',
    raised: '#f1eadb',
    border: 'rgba(87, 62, 32, 0.16)',
    text: '#2a241d',
    muted: '#7a6650',
    glow: 'rgba(194, 65, 12, 0.1)',
  },
};

const terminal: ThemePreset = {
  id: 'terminal',
  name: 'Terminal',
  blurb: 'Phosphor green on black, monospaced, dotted grid.',
  scheme: 'dark',
  theme: {
    background: '#07090a',
    grid: { color: 'rgba(74, 222, 128, 0.08)', width: 1, dash: [1, 3] },
    header: {
      height: 44,
      textColor: '#5fbf7f',
      font: font(11, FAMILIES.mono, 500),
      majorTickRatio: 0.34,
      minorTickRatio: 0.74,
    },
    layout: {
      rowHeight: 26,
      rowGap: 6,
      edgePadding: 10,
      lineLead: 10,
      markerGap: 8,
      eventLabelGap: 5,
    },
    emphasis: {
      hoverColor: '#ffb000',
      selectionColor: '#22d3ee',
      hoverWidthBonus: 2,
      selectionWidthBonus: 2,
      radiusBonus: 1,
    },
    cluster: { color: '#ffb000', textColor: '#ffcf66', markerBonus: 2 },
    rowSeparator: {
      enabled: false,
      color: 'rgba(74, 222, 128, 0.06)',
      width: 1,
      dash: [],
    },
    element: {
      lineColor: '#22c55e',
      lineWidth: 1.5,
      lineDash: [],
      labelColor: '#b6f5c9',
      labelFont: font(12, FAMILIES.mono, 500),
      iconSize: 14,
    },
    event: {
      arrowColor: '#2e8b57',
      arrowWidth: 1,
      arrowDash: [],
      arrowheadSize: 5,
      labelColor: '#86efac',
      labelFont: font(11, FAMILIES.mono),
      nodeRadius: 2.5,
      labelBoxBackground: 'rgba(7, 9, 10, 0.92)',
      labelBoxBorderColor: 'rgba(34, 197, 94, 0.55)',
      labelBoxBorderWidth: 1,
      labelBoxBorderDash: [2, 2],
      labelBoxPadding: 3,
    },
  },
  palette: { neutral: '#2f5d3f', series: DARK_SERIES },
  status: DARK_STATUS,
  chrome: {
    page: '#030405',
    surface: '#0b0e0f',
    raised: '#121719',
    border: 'rgba(74, 222, 128, 0.16)',
    text: '#b6f5c9',
    muted: '#5fbf7f',
    glow: 'rgba(34, 197, 94, 0.16)',
  },
};

const synthwave: ThemePreset = {
  id: 'synthwave',
  name: 'Synthwave',
  blurb: 'Neon pink lanes and cyan highlights on violet.',
  scheme: 'dark',
  theme: {
    background: '#140a24',
    grid: { color: 'rgba(244, 114, 182, 0.1)', width: 1, dash: [] },
    header: {
      height: 52,
      textColor: '#b9a0e3',
      font: font(11, FAMILIES.inter, 600),
      majorTickRatio: 0.36,
      minorTickRatio: 0.74,
    },
    layout: roomy,
    emphasis: {
      hoverColor: '#fde047',
      selectionColor: '#22d3ee',
      hoverWidthBonus: 2,
      selectionWidthBonus: 2.5,
      radiusBonus: 1.5,
    },
    cluster: { color: '#fb923c', textColor: '#fdba74', markerBonus: 3 },
    rowSeparator: {
      enabled: true,
      color: 'rgba(244, 114, 182, 0.06)',
      width: 1,
      dash: [],
    },
    element: {
      lineColor: '#f472b6',
      lineWidth: 2.5,
      lineDash: [],
      labelColor: '#f5e9ff',
      labelFont: font(12, FAMILIES.inter, 500),
      iconSize: 18,
    },
    event: {
      arrowColor: '#8b6bb8',
      arrowWidth: 1.25,
      arrowDash: [],
      arrowheadSize: 7,
      labelColor: '#e4d4ff',
      labelFont: font(11, FAMILIES.inter, 500),
      nodeRadius: 3.5,
      labelBoxBackground: 'rgba(32, 14, 56, 0.92)',
      labelBoxBorderColor: 'rgba(34, 211, 238, 0.45)',
      labelBoxBorderWidth: 1,
      labelBoxBorderDash: [],
      labelBoxPadding: 4,
    },
  },
  palette: { neutral: '#5e4a80', series: DARK_SERIES },
  status: DARK_STATUS,
  chrome: {
    page: '#0c0518',
    surface: '#170c2a',
    raised: '#211338',
    border: 'rgba(244, 114, 182, 0.18)',
    text: '#f5e9ff',
    muted: '#b9a0e3',
    glow: 'rgba(236, 72, 153, 0.3)',
  },
};

const contrast: ThemePreset = {
  id: 'contrast',
  name: 'High contrast',
  blurb: 'Maximum legibility: AAA text, heavy strokes and emphasis.',
  scheme: 'dark',
  theme: {
    background: '#000000',
    grid: { color: 'rgba(255, 255, 255, 0.32)', width: 1, dash: [] },
    header: {
      height: 52,
      textColor: '#ffffff',
      font: font(12, FAMILIES.inter, 700),
      majorTickRatio: 0.36,
      minorTickRatio: 0.74,
    },
    layout: { ...roomy, rowHeight: 34, rowGap: 10 },
    emphasis: {
      hoverColor: '#ffff00',
      selectionColor: '#00ffff',
      hoverWidthBonus: 3,
      selectionWidthBonus: 3,
      radiusBonus: 2,
    },
    cluster: { color: '#ffd700', textColor: '#ffff00', markerBonus: 3 },
    rowSeparator: {
      enabled: true,
      color: 'rgba(255, 255, 255, 0.28)',
      width: 1,
      dash: [],
    },
    element: {
      lineColor: '#ffffff',
      lineWidth: 3,
      lineDash: [],
      labelColor: '#ffffff',
      labelFont: font(13, FAMILIES.inter, 600),
      iconSize: 18,
    },
    event: {
      arrowColor: '#d4d4d4',
      arrowWidth: 2,
      arrowDash: [],
      arrowheadSize: 8,
      labelColor: '#ffffff',
      labelFont: font(12, FAMILIES.inter, 600),
      nodeRadius: 4,
      labelBoxBackground: '#000000',
      labelBoxBorderColor: '#ffffff',
      labelBoxBorderWidth: 1,
      labelBoxBorderDash: [],
      labelBoxPadding: 4,
    },
  },
  palette: { neutral: '#8a8a8a', series: DARK_SERIES },
  status: DARK_STATUS,
  chrome: {
    page: '#000000',
    surface: '#0a0a0a',
    raised: '#161616',
    border: 'rgba(255, 255, 255, 0.45)',
    text: '#ffffff',
    muted: '#d4d4d4',
    glow: 'transparent',
  },
};

const classic: ThemePreset = {
  id: 'classic',
  name: 'Classic',
  blurb: 'Exactly what you get out of the box: core’s defaultTheme.',
  scheme: 'dark',
  theme: defaultTheme,
  palette: { neutral: '#6b7280', series: DARK_SERIES },
  status: DARK_STATUS,
  chrome: {
    page: '#0e1116',
    surface: '#161b22',
    raised: '#1c2330',
    border: 'rgba(255, 255, 255, 0.12)',
    text: '#e6e6e6',
    muted: '#9aa4b2',
    glow: 'rgba(90, 160, 255, 0.12)',
  },
};

export const PRESETS: readonly ThemePreset[] = [
  midnight,
  daylight,
  paper,
  terminal,
  synthwave,
  contrast,
  classic,
];

export const DEFAULT_PRESET: PresetId = 'midnight';

export function presetById(id: string): ThemePreset {
  return PRESETS.find((p) => p.id === id) ?? midnight;
}

export const isPresetId = (id: string): id is PresetId =>
  PRESETS.some((p) => p.id === id);
