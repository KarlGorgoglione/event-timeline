// Style-keyed batch accumulators (DESIGN.md §4 "batch by style").
//
// Builders group primitives that share a colour/width/font into one spec so the
// renderer issues a single path/fill per group, minimising context state
// changes. These helpers are the one place a batch key is formed, keeping the
// keying consistent across the elementLines and arrows builders (DRY).

import type { ArrowheadSpec, LabelSpec, LineSpec, NodeSpec } from './specs';

export function lineBatch(
  map: Map<string, LineSpec>,
  color: string,
  width: number,
): LineSpec {
  const key = `${color}|${width}`;
  let batch = map.get(key);
  if (batch === undefined) {
    batch = { color, width, segments: [] };
    map.set(key, batch);
  }
  return batch;
}

export function nodeBatch(
  map: Map<string, NodeSpec>,
  color: string,
  radius: number,
): NodeSpec {
  const key = `${color}|${radius}`;
  let batch = map.get(key);
  if (batch === undefined) {
    batch = { color, radius, items: [] };
    map.set(key, batch);
  }
  return batch;
}

export function arrowheadBatch(
  map: Map<string, ArrowheadSpec>,
  color: string,
  size: number,
): ArrowheadSpec {
  const key = `${color}|${size}`;
  let batch = map.get(key);
  if (batch === undefined) {
    batch = { color, size, items: [] };
    map.set(key, batch);
  }
  return batch;
}

export function labelBatch(
  map: Map<string, LabelSpec>,
  color: string,
  font: string,
): LabelSpec {
  const key = `${color}|${font}`;
  let batch = map.get(key);
  if (batch === undefined) {
    // Element, icon-emoji, and event labels all anchor left/middle (§1, §9).
    batch = { color, font, baseline: 'middle', align: 'left', items: [] };
    map.set(key, batch);
  }
  return batch;
}
