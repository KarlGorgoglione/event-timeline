// Reusable, growable batch buffers (DESIGN.md §4).
//
// Each buffer implements one Renderer batch interface over typed arrays that
// grow geometrically and are reused from frame to frame: `reset()` only
// rewinds the count, so steady-state frames allocate nothing per primitive.

import type {
  ArrowheadBatch,
  LineBatch,
  NodeBatch,
  RectBatch,
  TextBatch,
} from '../render/types';

function growFloat(
  array: Float32Array<ArrayBuffer>,
  needed: number,
): Float32Array<ArrayBuffer> {
  if (needed <= array.length) return array;
  const next = new Float32Array(Math.max(needed, array.length * 2));
  next.set(array);
  return next;
}

export class LineBuffer implements LineBatch {
  coords = new Float32Array(64);
  joins = new Uint8Array(16);
  count = 0;
  stamp = 0;
  dash: readonly number[] | undefined;

  constructor(
    public color: string,
    public width: number,
    dash?: readonly number[],
  ) {
    this.dash = dash !== undefined && dash.length > 0 ? dash : undefined;
  }

  /** Append a segment; `join` marks it as continuing the previous segment. */
  push(x1: number, y1: number, x2: number, y2: number, join = false): void {
    const i = this.count * 4;
    if (i + 4 > this.coords.length) this.coords = growFloat(this.coords, i + 4);
    if (this.count >= this.joins.length) {
      const next = new Uint8Array(this.joins.length * 2);
      next.set(this.joins);
      this.joins = next;
    }
    this.coords[i] = x1;
    this.coords[i + 1] = y1;
    this.coords[i + 2] = x2;
    this.coords[i + 3] = y2;
    this.joins[this.count] = join ? 1 : 0;
    this.count++;
  }

  reset(): void {
    this.count = 0;
  }
}

export class NodeBuffer implements NodeBatch {
  coords = new Float32Array(64);
  count = 0;
  stamp = 0;

  constructor(
    public color: string,
    public radius: number,
  ) {}

  push(x: number, y: number): void {
    const i = this.count * 2;
    if (i + 2 > this.coords.length) this.coords = growFloat(this.coords, i + 2);
    this.coords[i] = x;
    this.coords[i + 1] = y;
    this.count++;
  }

  reset(): void {
    this.count = 0;
  }
}

export class ArrowheadBuffer implements ArrowheadBatch {
  coords = new Float32Array(96);
  count = 0;
  stamp = 0;

  constructor(
    public color: string,
    public size: number,
  ) {}

  push(x: number, y: number, angle: number): void {
    const i = this.count * 3;
    if (i + 3 > this.coords.length) this.coords = growFloat(this.coords, i + 3);
    this.coords[i] = x;
    this.coords[i + 1] = y;
    this.coords[i + 2] = angle;
    this.count++;
  }

  reset(): void {
    this.count = 0;
  }
}

export class RectBuffer implements RectBatch {
  coords = new Float32Array(64);
  count = 0;
  stamp = 0;

  constructor(public color: string) {}

  push(x: number, y: number, w: number, h: number): void {
    const i = this.count * 4;
    if (i + 4 > this.coords.length) this.coords = growFloat(this.coords, i + 4);
    this.coords[i] = x;
    this.coords[i + 1] = y;
    this.coords[i + 2] = w;
    this.coords[i + 3] = h;
    this.count++;
  }

  reset(): void {
    this.count = 0;
  }
}

export class TextBuffer implements TextBatch {
  xs = new Float32Array(32);
  ys = new Float32Array(32);
  texts: string[] = [];
  count = 0;
  stamp = 0;

  constructor(
    public color: string,
    public font: string,
    public align: TextBatch['align'],
    public baseline: TextBatch['baseline'] = 'middle',
  ) {}

  push(x: number, y: number, text: string): void {
    if (this.count >= this.xs.length) {
      this.xs = growFloat(this.xs, this.count + 1);
      this.ys = growFloat(this.ys, this.count + 1);
    }
    this.xs[this.count] = x;
    this.ys[this.count] = y;
    this.texts[this.count] = text;
    this.count++;
  }

  reset(): void {
    this.count = 0;
  }
}
