import { describe, expect, it } from 'vitest';
import {
  ARROW_BASE_BACK,
  ARROW_BASE_HALF_WIDTH,
  ARROW_TIP,
} from '../arrowGeometry';
import { PROGRAMS, recordFloats } from './programs';

describe('WebGL programs (§4 look parity)', () => {
  it('draws arrowheads with the shared Canvas2D geometry', () => {
    const source = PROGRAMS.head.vertex;
    expect(ARROW_TIP).toBe(1);
    expect(source).toContain(`vec2(1.0, 0.0)`);
    expect(source).toContain(
      `vec2(${ARROW_BASE_BACK}, ${ARROW_BASE_HALF_WIDTH})`,
    );
    expect(source).toContain(
      `vec2(${ARROW_BASE_BACK}, -${ARROW_BASE_HALF_WIDTH})`,
    );
  });

  it('draws nothing for a zero-length butt segment, like Canvas2D', () => {
    expect(PROGRAMS.line.fragment).toContain(
      'if (v_length == 0.0 && !startRound && !endRound) discard;',
    );
  });

  it('sizes instance records from the attribute layout', () => {
    expect(recordFloats('line')).toBe(5);
    expect(recordFloats('node')).toBe(2);
    expect(recordFloats('head')).toBe(3);
    expect(recordFloats('rect')).toBe(4);
    expect(recordFloats('texture')).toBe(8);
  });
});
