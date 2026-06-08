// Style-keyed batch accumulators (DESIGN.md §4 "batch by style").
//
// Builders group primitives that share a colour/width/font into one spec so the
// renderer issues a single path/fill per group, minimising context state
// changes. These helpers are the one place a batch key is formed, keeping the
// keying consistent across the elementLines and arrows builders (DRY).

import type {
  ArrowheadSpec,
  LabelSpec,
  LineSpec,
  NodeSpec,
  RectSpec,
} from './specs';

export function lineBatch(
  map: Map<string, LineSpec>,
  color: string,
  width: number,
  dash: number[] = [],
): LineSpec {
  // Dash is part of the key: two otherwise-identical lines with different dash
  // patterns cannot share a single path.
  const key = `${color}|${width}|${dash.join(',')}`;
  let batch = map.get(key);
  if (batch === undefined) {
    batch = { color, width, dash, segments: [] };
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

export function boxBatch(map: Map<string, RectSpec>, color: string): RectSpec {
  let batch = map.get(color);
  if (batch === undefined) {
    batch = { color, items: [] };
    map.set(color, batch);
  }
  return batch;
}

export function labelBatch(
  map: Map<string, LabelSpec>,
  color: string,
  font: string,
  align: LabelSpec['align'] = 'left',
  baseline: LabelSpec['baseline'] = 'middle',
): LabelSpec {
  // Alignment is part of the key: centered marker labels (§1) and left-anchored
  // event labels (§9) share a colour/font but must not land in the same path.
  const key = `${color}|${font}|${align}|${baseline}`;
  let batch = map.get(key);
  if (batch === undefined) {
    batch = { color, font, baseline, align, items: [] };
    map.set(key, batch);
  }
  return batch;
}
