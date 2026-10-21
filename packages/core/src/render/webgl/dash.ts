// CPU dash expansion for the WebGL backend (§4 look parity).
//
// Canvas2D dash semantics, reproduced: the pattern alternates on/off run
// lengths, an odd-length pattern is doubled (canvas spec), and the phase runs
// continuously along a subpath — restarting only where a new subpath begins
// (a segment that is not joined to the previous one). A dash that runs on
// across a joined corner stays joined, so it gets a join rather than a notch.
// Expanding on the CPU keeps the shader a plain solid-segment path and makes
// parity testable.

export interface DashedSegments {
  /** `x1, y1, x2, y2` per piece. */
  coords: Float32Array;
  /** 1 where a piece continues the previous one across a corner. */
  joins: Uint8Array;
  count: number;
}

/** Solid "on" runs of `pattern` over the segments. */
export function expandDashes(
  coords: Float32Array,
  count: number,
  joins: Uint8Array | undefined,
  pattern: readonly number[],
): DashedSegments {
  const dashes = normalizePattern(pattern);
  if (dashes === null) {
    return { coords, joins: joins ?? new Uint8Array(count), count };
  }
  const out: number[] = [];
  const outJoins: number[] = [];
  let index = 0;
  let into = 0; // distance already consumed of the current run
  let openAtEnd = false; // the last piece reached its segment's end mid-run
  for (let s = 0; s < count; s++) {
    const joined = joins !== undefined && joins[s] === 1;
    if (!joined) {
      index = 0;
      into = 0;
      openAtEnd = false;
    }
    const x1 = coords[s * 4] as number;
    const y1 = coords[s * 4 + 1] as number;
    const x2 = coords[s * 4 + 2] as number;
    const y2 = coords[s * 4 + 3] as number;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length === 0) continue; // butt caps: nothing to draw
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;
    let distance = 0;
    let continuing = joined && openAtEnd;
    openAtEnd = false;
    while (distance < length) {
      const run = dashes[index % dashes.length] as number;
      const end = Math.min(distance + run - into, length);
      const on = index % 2 === 0;
      if (on && end > distance) {
        out.push(
          x1 + ux * distance,
          y1 + uy * distance,
          x1 + ux * end,
          y1 + uy * end,
        );
        outJoins.push(continuing && distance === 0 ? 1 : 0);
      }
      continuing = false;
      if (distance + run - into <= length) {
        index++;
        into = 0;
      } else {
        into += end - distance;
        openAtEnd = on;
      }
      distance = end;
    }
  }
  return {
    coords: Float32Array.from(out),
    joins: Uint8Array.from(outJoins),
    count: outJoins.length,
  };
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
