// One frame's drawable output: batches in draw order, hit targets and the
// label pipeline (DESIGN.md §4). Reused across frames.

import type { ImageItem, Renderer } from '../render/types';
import { LineBuffer, TextBuffer } from './buffers';
import {
  HeadGroup,
  LineGroup,
  NodeGroup,
  RectGroup,
  TextGroup,
} from './groups';
import { LabelPlacer } from './labels';
import { TargetPool } from './targets';

/** A label waiting for collision culling (CSS px). */
export interface LabelCandidate {
  /** Lower draws first: cluster counts before event labels. */
  priority: number;
  text: string;
  /** Text anchor and the box it occupies (text plus padding). */
  x: number;
  y: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  fontId: number;
  align: 'left' | 'center';
  /** Interned rect/stroke ids for the label box, or −1. */
  boxFill: number;
  boxBorder: number;
}

function blankCandidate(): LabelCandidate {
  return {
    priority: 0,
    text: '',
    x: 0,
    y: 0,
    boxX: 0,
    boxY: 0,
    boxW: 0,
    boxH: 0,
    fontId: 0,
    align: 'left',
    boxFill: -1,
    boxBorder: -1,
  };
}

export class SceneOutput {
  readonly gridlines = new LineBuffer('', 1);
  readonly separators = new LineBuffer('', 1);
  readonly elementLines = new LineGroup();
  readonly eventLines = new LineGroup();
  readonly nodes = new NodeGroup();
  readonly heads = new HeadGroup();
  readonly boxFills = new RectGroup();
  readonly boxBorders = new LineGroup();
  readonly eventText = new TextGroup();
  readonly elementText = new TextGroup();
  readonly icons: ImageItem[] = [];
  iconCount = 0;
  readonly baseline = new LineBuffer('', 1);
  readonly majorText = new TextBuffer('', '', 'left');
  readonly minorText = new TextBuffer('', '', 'center');
  /** Header mask in device px. */
  mask = { width: 0, height: 0, color: '' };
  background = '';

  readonly targets = new TargetPool();
  readonly labels = new LabelPlacer();
  private readonly candidatePool: LabelCandidate[] = [];
  candidateCount = 0;

  begin(): void {
    this.gridlines.reset();
    this.separators.reset();
    this.elementLines.begin();
    this.eventLines.begin();
    this.nodes.begin();
    this.heads.begin();
    this.boxFills.begin();
    this.boxBorders.begin();
    this.eventText.begin();
    this.elementText.begin();
    this.iconCount = 0;
    this.baseline.reset();
    this.majorText.reset();
    this.minorText.reset();
    this.candidateCount = 0;
  }

  /** Drop pooled style buffers (interned style ids were reset). */
  clearStyles(): void {
    for (const group of [
      this.elementLines,
      this.eventLines,
      this.nodes,
      this.heads,
      this.boxFills,
      this.boxBorders,
      this.eventText,
      this.elementText,
    ]) {
      group.clear();
    }
  }

  icon(x: number, y: number, size: number, image: unknown): void {
    let item = this.icons[this.iconCount];
    if (item === undefined) {
      item = { x, y, size, image };
      this.icons.push(item);
    } else {
      item.x = x;
      item.y = y;
      item.size = size;
      item.image = image;
    }
    this.iconCount++;
  }

  candidate(): LabelCandidate {
    let c = this.candidatePool[this.candidateCount];
    if (c === undefined) {
      c = blankCandidate();
      this.candidatePool.push(c);
    }
    this.candidateCount++;
    return c;
  }

  candidateAt(index: number): LabelCandidate {
    return this.candidatePool[index] as LabelCandidate;
  }

  /** Play the frame back, bottom to top (§4). */
  draw(renderer: Renderer): void {
    renderer.beginFrame(this.background);
    renderer.drawLines(this.gridlines);
    renderer.drawLines(this.separators);
    for (const b of this.elementLines.used) renderer.drawLines(b);
    for (const b of this.eventLines.used) renderer.drawLines(b);
    for (const b of this.nodes.used) renderer.drawNodes(b);
    for (const b of this.heads.used) renderer.drawArrowheads(b);
    for (const b of this.boxFills.used) renderer.drawRects(b);
    for (const b of this.boxBorders.used) renderer.drawLines(b);
    for (const b of this.eventText.used) renderer.drawText(b);
    for (const b of this.elementText.used) renderer.drawText(b);
    if (this.iconCount > 0) {
      renderer.drawImages({ items: this.icons.slice(0, this.iconCount) });
    }
    // Header last: mask whatever bled into the header band, then the
    // baseline and the tick labels.
    renderer.fillRect(0, 0, this.mask.width, this.mask.height, this.mask.color);
    renderer.drawLines(this.baseline);
    renderer.drawText(this.majorText);
    renderer.drawText(this.minorText);
    renderer.endFrame();
  }
}
