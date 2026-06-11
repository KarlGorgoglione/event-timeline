// CPU dash expansion for the WebGL backend (§4 look parity).
//
// Canvas2D dash semantics, reproduced exactly: the pattern alternates on/off
// run lengths, an odd-length pattern is doubled (canvas spec), and the phase
// restarts at zero on every subpath. The engine's LineBatch segments are
// independent moveTo/lineTo pairs, so each segment starts its own subpath —
// expansion is therefore per segment. Expanding on the CPU keeps the shader a
// plain solid-quad path and makes parity unit-testable.

import type { LineSegment } from '../types';

/**
 * Split segments into the solid "on" runs of a dash pattern.
 *
 * Patterns Canvas2D treats as solid (empty, all-zero) or ignores (negative or
 * non-finite entries) return the input unchanged.
 */
export function expandDashes(
  segments: readonly LineSegment[],
  pattern: readonly number[],
): LineSegment[] {
  const dashes = normalizePattern(pattern);
  if (dashes === null) return [...segments];

  const out: LineSegment[] = [];
  for (const seg of segments) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue; // butt caps: a zero-length dash draws nothing
    const ux = dx / length;
    const uy = dy / length;

    let distance = 0;
    let i = 0;
    while (distance < length) {
      const run = dashes[i % dashes.length] as number;
      const on = i % 2 === 0;
      const end = Math.min(distance + run, length);
      if (on && end > distance) {
        out.push({
          x1: seg.x1 + ux * distance,
          y1: seg.y1 + uy * distance,
          x2: seg.x1 + ux * end,
          y2: seg.y1 + uy * end,
        });
      }
      distance = end;
      i++;
    }
  }
  return out;
}

/** Apply the canvas-spec pattern rules; null means "draw solid". */
function normalizePattern(
  pattern: readonly number[],
): readonly number[] | null {
  if (pattern.length === 0) return null;
  let sum = 0;
  for (const value of pattern) {
    if (!Number.isFinite(value) || value < 0) return null;
    sum += value;
  }
  if (sum === 0) return null;
  return pattern.length % 2 === 0 ? pattern : [...pattern, ...pattern];
}
