// Density: one control that rescales the row geometry, the header and the
// label sizes of any preset (Simple view). It produces a full `Theme`, so the
// Advanced editor's edits apply on top of it.

import type { Theme } from '@event-timeline/react';
import { resizeFont } from './fonts';

export type Density = 'compact' | 'comfortable' | 'spacious';

export const DENSITIES: ReadonlyArray<{ value: Density; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
];

const SCALE: Record<
  Exclude<Density, 'comfortable'>,
  { row: number; gap: number; header: number; font: number; node: number }
> = {
  compact: { row: 0.72, gap: 0.5, header: 0.86, font: -1, node: -0.5 },
  spacious: { row: 1.3, gap: 1.6, header: 1.12, font: 1, node: 0.5 },
};

export function applyDensity(theme: Theme, density: Density): Theme {
  if (density === 'comfortable') return theme;
  const s = SCALE[density];
  return {
    ...theme,
    header: {
      ...theme.header,
      height: Math.round(theme.header.height * s.header),
      font: resizeFont(theme.header.font, s.font),
    },
    layout: {
      ...theme.layout,
      rowHeight: Math.round(theme.layout.rowHeight * s.row),
      rowGap: Math.round(theme.layout.rowGap * s.gap),
    },
    element: {
      ...theme.element,
      labelFont: resizeFont(theme.element.labelFont, s.font),
      iconSize: Math.max(10, theme.element.iconSize + s.font * 2),
    },
    event: {
      ...theme.event,
      labelFont: resizeFont(theme.event.labelFont, s.font),
      nodeRadius: Math.max(1.5, theme.event.nodeRadius + s.node),
    },
  };
}
