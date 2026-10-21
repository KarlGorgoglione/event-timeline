// Per-frame batch groups (DESIGN.md §4 "batch by style").
//
// A group pools one buffer per style id and remembers the order styles were
// first used in this frame, so primitives sharing a style draw in one call
// and draw order stays deterministic. `get` reports through `fresh` whether
// the buffer was just taken into use this frame, so the caller sets its
// device-px style once; lookups allocate nothing.

import {
  ArrowheadBuffer,
  LineBuffer,
  NodeBuffer,
  RectBuffer,
  TextBuffer,
} from './buffers';
import { scaleFontToDevice } from '../render/device';
import type { TextBatch } from '../render/types';

interface Stamped {
  stamp: number;
  count: number;
  reset(): void;
}

/** A pooled group of buffers keyed by a small integer. */
class Group<B extends Stamped> {
  private readonly pool = new Map<number, B>();
  /** Buffers used this frame, in first-use order. */
  readonly used: B[] = [];
  /** Whether the last {@link get} took its buffer into use this frame. */
  fresh = false;
  private frame = 1;
  private lastKey = -1;
  private last: B | null = null;

  constructor(private readonly make: () => B) {}

  begin(): void {
    this.frame++;
    this.used.length = 0;
    this.lastKey = -1;
    this.last = null;
  }

  /** The buffer for `key`; when {@link fresh}, set its style before use. */
  get(key: number): B {
    if (key === this.lastKey && this.last !== null) {
      this.fresh = false;
      return this.last;
    }
    let buffer = this.pool.get(key);
    if (buffer === undefined) {
      buffer = this.make();
      this.pool.set(key, buffer);
    }
    if (buffer.stamp !== this.frame) {
      buffer.stamp = this.frame;
      buffer.reset();
      this.used.push(buffer);
      this.fresh = true;
    } else {
      this.fresh = false;
    }
    this.lastKey = key;
    this.last = buffer;
    return buffer;
  }

  /** Drop pooled buffers (styles were re-interned, so keys changed meaning). */
  clear(): void {
    this.pool.clear();
    this.used.length = 0;
    this.lastKey = -1;
    this.last = null;
  }
}

export class LineGroup extends Group<LineBuffer> {
  constructor() {
    super(() => new LineBuffer('', 1));
  }
}

export class NodeGroup extends Group<NodeBuffer> {
  constructor() {
    super(() => new NodeBuffer('', 1));
  }
}

export class HeadGroup extends Group<ArrowheadBuffer> {
  constructor() {
    super(() => new ArrowheadBuffer('', 1));
  }
}

export class RectGroup extends Group<RectBuffer> {
  constructor() {
    super(() => new RectBuffer(''));
  }
}

const ALIGN_CODE: Record<TextBatch['align'], number> = {
  left: 0,
  center: 1,
  right: 2,
};
const BASELINE_CODE: Record<TextBatch['baseline'], number> = {
  middle: 0,
  top: 1,
  alphabetic: 2,
};

/** Text buffers keyed by (font id, alignment, baseline). */
export class TextGroup extends Group<TextBuffer> {
  constructor() {
    super(() => new TextBuffer('', '', 'left'));
  }

  static key(
    fontId: number,
    align: TextBatch['align'],
    baseline: TextBatch['baseline'],
  ): number {
    return fontId * 16 + ALIGN_CODE[align] * 4 + BASELINE_CODE[baseline];
  }
}

/** The interned style values a group buffer is set up from. */
interface StyleSource {
  strokes: {
    values: readonly {
      color: string;
      width: number;
      dash: readonly number[];
    }[];
  };
  fills: { values: readonly { color: string; size: number }[] };
  fonts: { values: readonly { color: string; font: string }[] };
  rects: { values: readonly string[] };
}

/** The line buffer for stroke `id`, styled in device px on first use. */
export function strokeBuffer(
  group: LineGroup,
  styles: StyleSource,
  id: number,
  dpr: number,
): LineBuffer {
  const b = group.get(id);
  if (group.fresh) {
    const stroke = styles.strokes.values[id]!;
    b.color = stroke.color;
    b.width = Math.max(1, Math.round(stroke.width * dpr));
    b.dash = deviceDash(stroke.dash, dpr);
  }
  return b;
}

/** The node buffer for fill `id` (its size is the radius). */
export function nodeBuffer(
  group: NodeGroup,
  styles: StyleSource,
  id: number,
  dpr: number,
): NodeBuffer {
  const b = group.get(id);
  if (group.fresh) {
    const fill = styles.fills.values[id]!;
    b.color = fill.color;
    b.radius = Math.max(1, Math.round(fill.size * dpr));
  }
  return b;
}

/** The arrowhead buffer for fill `id` (its size is the arrowhead size). */
export function headBuffer(
  group: HeadGroup,
  styles: StyleSource,
  id: number,
  dpr: number,
): ArrowheadBuffer {
  const b = group.get(id);
  if (group.fresh) {
    const fill = styles.fills.values[id]!;
    b.color = fill.color;
    b.size = Math.max(1, Math.round(fill.size * dpr));
  }
  return b;
}

/** The rect buffer for fill colour `id`. */
export function rectBuffer(
  group: RectGroup,
  styles: StyleSource,
  id: number,
): RectBuffer {
  const b = group.get(id);
  if (group.fresh) b.color = styles.rects.values[id]!;
  return b;
}

/** The text buffer for font `id` at an alignment, in device px. */
export function textBuffer(
  group: TextGroup,
  styles: StyleSource,
  fontId: number,
  align: TextBatch['align'],
  dpr: number,
): TextBuffer {
  const b = group.get(TextGroup.key(fontId, align, 'middle'));
  if (group.fresh) {
    const font = styles.fonts.values[fontId]!;
    b.color = font.color;
    b.font = scaleFontToDevice(font.font, dpr);
    b.align = align;
    b.baseline = 'middle';
  }
  return b;
}

/** A CSS-px dash pattern in device px; undefined for solid. */
export function deviceDash(
  dash: readonly number[],
  dpr: number,
): readonly number[] | undefined {
  return dash.length > 0 ? dash.map((d) => d * dpr) : undefined;
}
