// Error isolation for the Renderer seam (DESIGN.md §4).
//
// A draw verb that throws (a broken image, a lost GPU resource, a driver bug)
// must not abort the rest of the frame or escape the animation-frame callback.
// This decorator runs every verb in a try/catch and reports the failure once
// per verb and message through the diagnostics sink, so a repeating error does
// not flood it at 60 fps.

import type { OnDiagnostic } from '../model/diagnostics';
import type { Renderer } from './types';

type VoidVerb =
  | 'resize'
  | 'beginFrame'
  | 'fillRect'
  | 'drawRects'
  | 'drawLines'
  | 'drawArrowheads'
  | 'drawNodes'
  | 'drawText'
  | 'drawImages'
  | 'endFrame';

/** Wrap `renderer` so each draw verb fails alone and reports instead of throwing. */
export function guardRenderer(
  renderer: Renderer,
  onDiagnostic: OnDiagnostic,
): Renderer {
  const reported = new Set<string>();
  const report = (verb: string, error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    const key = `${verb}\u0000${message}`;
    if (reported.has(key)) return;
    reported.add(key);
    onDiagnostic({
      code: 'render-error',
      kind: 'renderer',
      reason: `${renderer.backend} ${verb} failed: ${message}`,
    });
  };
  const call =
    <K extends VoidVerb>(verb: K) =>
    (...args: Parameters<Renderer[K]>): void => {
      try {
        (renderer[verb] as (...a: Parameters<Renderer[K]>) => void).apply(
          renderer,
          args,
        );
      } catch (error) {
        report(verb, error);
      }
    };

  return {
    get backend() {
      return renderer.backend;
    },
    resize: call('resize'),
    beginFrame: call('beginFrame'),
    fillRect: call('fillRect'),
    drawRects: call('drawRects'),
    drawLines: call('drawLines'),
    drawArrowheads: call('drawArrowheads'),
    drawNodes: call('drawNodes'),
    drawText: call('drawText'),
    drawImages: call('drawImages'),
    endFrame: call('endFrame'),
    measureText: (text, font) => {
      try {
        return renderer.measureText(text, font);
      } catch (error) {
        report('measureText', error);
        return { width: 0 };
      }
    },
    dispose: () => {
      try {
        renderer.dispose?.();
      } catch (error) {
        report('dispose', error);
      }
    },
  };
}
