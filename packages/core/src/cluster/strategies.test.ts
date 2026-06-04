import { describe, expect, it } from 'vitest';
import {
  byDay,
  byElementPair,
  byPixelColumn,
  bySourceTargetColumn,
} from './strategies';
import type { ClusterContext } from './types';
import type { TimelineEvent } from '../model/types';

// timeToScreenX(t) === t, so "pixel column" == floor(time / minSep).
const ctx: ClusterContext = {
  minSeparationPx: 10,
  timeToScreenX: (t) => t,
};

const ev = (
  sourceId: string,
  targetId: string,
  time: number,
): TimelineEvent => ({
  id: `${sourceId}-${targetId}-${time}`,
  sourceId,
  targetId,
  time,
});

describe('cluster strategies (§6)', () => {
  it('byPixelColumn keys solely by binned screen column', () => {
    expect(byPixelColumn.key(ev('a', 'b', 3), ctx)).toBe('0');
    expect(byPixelColumn.key(ev('c', 'd', 9), ctx)).toBe('0'); // same 0..9 bin
    expect(byPixelColumn.key(ev('a', 'b', 11), ctx)).toBe('1');
  });

  it('byElementPair keys by direction-aware endpoints, ignoring time', () => {
    expect(byElementPair.key(ev('a', 'b', 1), ctx)).toBe(
      byElementPair.key(ev('a', 'b', 9999), ctx),
    );
    expect(byElementPair.key(ev('a', 'b', 1), ctx)).not.toBe(
      byElementPair.key(ev('b', 'a', 1), ctx),
    );
  });

  it('byDay buckets UTC calendar days (machine-stable)', () => {
    const day = 86_400_000;
    expect(byDay.key(ev('a', 'b', 0), ctx)).toBe('0');
    expect(byDay.key(ev('a', 'b', day - 1), ctx)).toBe('0');
    expect(byDay.key(ev('a', 'b', day), ctx)).toBe('1');
  });

  it('bySourceTargetColumn combines the pair and the column', () => {
    // Same pair + same column → same key; differing column → different key.
    expect(bySourceTargetColumn.key(ev('a', 'b', 2), ctx)).toBe(
      bySourceTargetColumn.key(ev('a', 'b', 8), ctx),
    );
    expect(bySourceTargetColumn.key(ev('a', 'b', 2), ctx)).not.toBe(
      bySourceTargetColumn.key(ev('a', 'b', 22), ctx),
    );
    expect(bySourceTargetColumn.key(ev('a', 'b', 2), ctx)).not.toBe(
      bySourceTargetColumn.key(ev('a', 'c', 2), ctx),
    );
  });
});
