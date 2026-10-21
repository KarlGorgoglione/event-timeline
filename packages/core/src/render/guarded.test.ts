import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../model/diagnostics';
import { guardRenderer } from './guarded';
import { LineBuffer, TextBuffer } from '../scene/buffers';
import type { Renderer } from './types';

function throwingRenderer(calls: string[]): Renderer {
  const ok = (name: string) => () => {
    calls.push(name);
  };
  return {
    backend: 'canvas2d',
    resize: ok('resize'),
    beginFrame: ok('beginFrame'),
    fillRect: ok('fillRect'),
    drawRects: ok('drawRects'),
    drawLines: () => {
      throw new Error('boom');
    },
    drawArrowheads: ok('drawArrowheads'),
    drawNodes: ok('drawNodes'),
    drawText: ok('drawText'),
    drawImages: ok('drawImages'),
    measureText: () => {
      throw new Error('no font');
    },
    endFrame: ok('endFrame'),
  };
}

describe('guardRenderer (§4)', () => {
  it('isolates a throwing verb so the rest of the frame still draws', () => {
    const calls: string[] = [];
    const reported: Diagnostic[] = [];
    const r = guardRenderer(throwingRenderer(calls), (d) => reported.push(d));

    r.beginFrame('#000');
    r.drawLines(new LineBuffer('#fff', 1));
    r.drawText(new TextBuffer('#fff', '12px x', 'left'));
    r.endFrame();

    expect(calls).toEqual(['beginFrame', 'drawText', 'endFrame']);
    expect(reported).toEqual([
      expect.objectContaining({ code: 'render-error', kind: 'renderer' }),
    ]);
  });

  it('reports a repeating failure only once', () => {
    const reported: Diagnostic[] = [];
    const r = guardRenderer(throwingRenderer([]), (d) => reported.push(d));
    for (let i = 0; i < 5; i++) {
      r.drawLines(new LineBuffer('#fff', 1));
    }
    expect(reported).toHaveLength(1);
  });

  it('falls back to a zero width when measureText throws', () => {
    const r = guardRenderer(throwingRenderer([]), () => {});
    expect(r.measureText('abc', '12px x')).toEqual({ width: 0 });
    expect(r.backend).toBe('canvas2d');
  });
});
