// A Renderer that records every verb call, for engine and binding tests
// (DESIGN.md §14). Batches are copied when recorded (the engine reuses its
// buffers), and text is measured as 6 px per character.

import type {
  ArrowheadBatch,
  ImageBatch,
  LineBatch,
  NodeBatch,
  RectBatch,
  Renderer,
  TextBatch,
  TextMetricsLite,
} from '../render/types';

export interface RecordedSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  join: boolean;
}

export type RecordedCall =
  | { verb: 'resize'; width: number; height: number }
  | { verb: 'beginFrame'; clearColor: string | null }
  | {
      verb: 'fillRect';
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    }
  | {
      verb: 'drawRects';
      color: string;
      rects: { x: number; y: number; w: number; h: number }[];
    }
  | {
      verb: 'drawLines';
      color: string;
      width: number;
      dash: number[];
      segments: RecordedSegment[];
    }
  | {
      verb: 'drawArrowheads';
      color: string;
      size: number;
      items: { x: number; y: number; angle: number }[];
    }
  | {
      verb: 'drawNodes';
      color: string;
      radius: number;
      items: { x: number; y: number }[];
    }
  | {
      verb: 'drawText';
      color: string;
      font: string;
      align: TextBatch['align'];
      baseline: TextBatch['baseline'];
      items: { x: number; y: number; text: string }[];
    }
  | { verb: 'drawImages'; items: ImageBatch['items'] }
  | { verb: 'measureText'; text: string; font: string }
  | { verb: 'endFrame' };

type Verb = RecordedCall['verb'];
type CallOf<V extends Verb> = Extract<RecordedCall, { verb: V }>;

export class RecordingRenderer implements Renderer {
  readonly backend = 'recording';
  calls: RecordedCall[] = [];

  reset(): void {
    this.calls = [];
  }

  /** Recorded calls of one verb, in order. */
  of<V extends Verb>(verb: V): CallOf<V>[] {
    return this.calls.filter((c): c is CallOf<V> => c.verb === verb);
  }

  /** Every drawn text string, in draw order. */
  texts(): string[] {
    return this.of('drawText').flatMap((c) => c.items.map((i) => i.text));
  }

  /** Total node dots drawn. */
  nodeCount(): number {
    return this.of('drawNodes').reduce((n, c) => n + c.items.length, 0);
  }

  /** Total line segments drawn. */
  segmentCount(): number {
    return this.of('drawLines').reduce((n, c) => n + c.segments.length, 0);
  }

  frames(): number {
    return this.of('beginFrame').length;
  }

  resize(width: number, height: number): void {
    this.calls.push({ verb: 'resize', width, height });
  }
  beginFrame(clearColor: string | null): void {
    this.calls.push({ verb: 'beginFrame', clearColor });
  }
  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void {
    this.calls.push({ verb: 'fillRect', x, y, width, height, color });
  }
  drawRects(batch: RectBatch): void {
    if (batch.count === 0) return;
    const c = batch.coords;
    const rects = [];
    for (let i = 0; i < batch.count * 4; i += 4) {
      rects.push({ x: c[i]!, y: c[i + 1]!, w: c[i + 2]!, h: c[i + 3]! });
    }
    this.calls.push({ verb: 'drawRects', color: batch.color, rects });
  }
  drawLines(batch: LineBatch): void {
    if (batch.count === 0) return;
    const c = batch.coords;
    const segments: RecordedSegment[] = [];
    for (let s = 0; s < batch.count; s++) {
      const i = s * 4;
      segments.push({
        x1: c[i]!,
        y1: c[i + 1]!,
        x2: c[i + 2]!,
        y2: c[i + 3]!,
        join: batch.joins?.[s] === 1,
      });
    }
    this.calls.push({
      verb: 'drawLines',
      color: batch.color,
      width: batch.width,
      dash: [...(batch.dash ?? [])],
      segments,
    });
  }
  drawArrowheads(batch: ArrowheadBatch): void {
    if (batch.count === 0) return;
    const c = batch.coords;
    const items = [];
    for (let i = 0; i < batch.count * 3; i += 3) {
      items.push({ x: c[i]!, y: c[i + 1]!, angle: c[i + 2]! });
    }
    this.calls.push({
      verb: 'drawArrowheads',
      color: batch.color,
      size: batch.size,
      items,
    });
  }
  drawNodes(batch: NodeBatch): void {
    if (batch.count === 0) return;
    const c = batch.coords;
    const items = [];
    for (let i = 0; i < batch.count * 2; i += 2) {
      items.push({ x: c[i]!, y: c[i + 1]! });
    }
    this.calls.push({
      verb: 'drawNodes',
      color: batch.color,
      radius: batch.radius,
      items,
    });
  }
  drawText(batch: TextBatch): void {
    if (batch.count === 0) return;
    const items = [];
    for (let i = 0; i < batch.count; i++) {
      items.push({ x: batch.xs[i]!, y: batch.ys[i]!, text: batch.texts[i]! });
    }
    this.calls.push({
      verb: 'drawText',
      color: batch.color,
      font: batch.font,
      align: batch.align,
      baseline: batch.baseline,
      items,
    });
  }
  drawImages(batch: ImageBatch): void {
    if (batch.items.length > 0) {
      this.calls.push({ verb: 'drawImages', items: [...batch.items] });
    }
  }
  measureText(text: string, font: string): TextMetricsLite {
    this.calls.push({ verb: 'measureText', text, font });
    return { width: text.length * 6 };
  }
  endFrame(): void {
    this.calls.push({ verb: 'endFrame' });
  }
}
