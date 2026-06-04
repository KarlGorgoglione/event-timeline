import type {
  TimelineData,
  TimelineElement,
  TimelineEvent,
} from '@timeline/react';

// A deterministic synthetic dataset for exercising Phase 2 culling at scale
// (DESIGN.md §15 acceptance: 10k events render correctly and culled). A seeded
// PRNG keeps it reproducible across runs so the demo and the Playwright test see
// the same data. The 50k perf/golden generator arrives with the indexed phases.

/** Mulberry32 — a tiny, fast, deterministic 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSynthetic(
  eventCount = 10_000,
  elementCount = 200,
  seed = 1,
): TimelineData {
  const rand = mulberry32(seed);
  const elements: TimelineElement[] = Array.from(
    { length: elementCount },
    (_, i) => ({ id: `el-${i}`, label: `Entity ${i}` }),
  );

  const start = Date.UTC(2026, 0, 1);
  const yearMs = 365 * 86_400_000;
  const events: TimelineEvent[] = Array.from({ length: eventCount }, (_, i) => {
    const sourceIndex = Math.floor(rand() * elementCount);
    // ~3% self-events; otherwise a (usually) different target.
    const targetIndex =
      rand() < 0.03 ? sourceIndex : Math.floor(rand() * elementCount);
    return {
      id: `ev-${i}`,
      sourceId: `el-${sourceIndex}`,
      targetId: `el-${targetIndex}`,
      time: start + Math.floor(rand() * yearMs),
      label: i % 100 === 0 ? `#${i}` : undefined,
    };
  });

  return { elements, events };
}
