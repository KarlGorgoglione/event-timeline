import type {
  TimelineData,
  TimelineElement,
  TimelineEvent,
} from '@timeline/react';

// A deterministic synthetic dataset for exercising culling and clustering at
// scale (DESIGN.md §15: Phase 2 culls 10k events; Phase 4 collapses 50k into
// clusters at zoom-out). A seeded PRNG keeps it reproducible across runs so the
// demo and the Playwright tests see the same data; pass a larger `eventCount`
// (e.g. 50_000) for the indexed-phase acceptance run.

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

const DAY_MS = 86_400_000;

/** A tiny opaque payload, echoed back in callbacks; drives the demo's resolvers. */
export interface DemoDatum {
  /** Bucket 0–4 used by the demo's data-driven style resolvers (§11). */
  category: number;
}

/** Stable category bucket for an entity index (demo resolvers key on this). */
export const CATEGORY_COUNT = 5;

export function makeSynthetic(
  eventCount = 10_000,
  elementCount = 200,
  seed = 1,
): TimelineData<DemoDatum> {
  const rand = mulberry32(seed);
  const elements: TimelineElement<DemoDatum>[] = Array.from(
    { length: elementCount },
    (_, i) => ({
      id: `el-${i}`,
      label: `Entity ${i}`,
      data: { category: i % CATEGORY_COUNT },
    }),
  );

  const start = Date.UTC(2026, 0, 1);
  const yearMs = 365 * DAY_MS;

  // Events arrive in *bursts* of repeated transfers between the same pair over a
  // few days — the shape real flow data takes (recurring counterparties), and
  // the shape that makes the default `bySourceTargetColumn` clustering visible:
  // a burst's events share a pair and fall within a few days, so they collapse
  // into one "×N" marker at zoom-out and fan back out as you zoom in (§6).
  const events: TimelineEvent<DemoDatum>[] = [];
  let sourceIndex = 0;
  let targetIndex = 0;
  let time = start;
  for (let i = 0; i < eventCount; i++) {
    const continues = i > 0 && rand() < 0.6;
    if (continues) {
      // Same pair, 0–3 days after the previous event (a tight temporal burst).
      time += Math.floor(rand() * 3 * DAY_MS);
    } else {
      sourceIndex = Math.floor(rand() * elementCount);
      // ~3% self-events; otherwise a (usually) different target.
      targetIndex =
        rand() < 0.03 ? sourceIndex : Math.floor(rand() * elementCount);
      time = start + Math.floor(rand() * yearMs);
    }
    events.push({
      id: `ev-${i}`,
      sourceId: `el-${sourceIndex}`,
      targetId: `el-${targetIndex}`,
      time,
      label: i % 100 === 0 ? `#${i}` : undefined,
      data: { category: sourceIndex % CATEGORY_COUNT },
    });
  }

  return { elements, events };
}
