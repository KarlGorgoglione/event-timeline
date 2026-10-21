// A renderer that draws nothing (DESIGN.md §4).
//
// Used when no drawing context exists at all (jsdom, an exhausted context
// budget) so the engine keeps working — data, camera, events and hit-testing
// — instead of throwing. Text is measured by a font-size estimate so label
// layout stays plausible.

import { parseFontPx } from './device';
import type { Renderer, TextMetricsLite } from './types';

/** Average glyph advance as a fraction of the font size, for the estimate. */
const GLYPH_WIDTH_EM = 0.55;

export class NullRenderer implements Renderer {
  readonly backend = 'none';
  resize(): void {}
  beginFrame(): void {}
  fillRect(): void {}
  drawRects(): void {}
  drawLines(): void {}
  drawArrowheads(): void {}
  drawNodes(): void {}
  drawText(): void {}
  drawImages(): void {}
  measureText(text: string, font: string): TextMetricsLite {
    return { width: text.length * parseFontPx(font) * GLYPH_WIDTH_EM };
  }
  endFrame(): void {}
}
