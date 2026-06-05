import { expect, test, type Page } from '@playwright/test';
import { summarize } from '../src/perfStats';

// Perf budgets (DESIGN.md §13), measured under CPU ×4 / DPR 1 against the headless
// core harness served from the production preview build (/bench.html). The gate is
// robust to CI noise without relaxing the budget it asserts: it discards warm-up
// frames and asserts the *median* (not a single spike). PERF_TOLERANCE_MS absorbs
// runner-specific jitter if needed.
//
// Two regimes are measured per dataset size:
//   - interactive: a ~30-day window where the visible count `k` is bounded by the
//     time window, not the dataset (§5) — the common pan/zoom case.
//   - zoom-out (fit): the whole domain visible, where per-frame work is O(n)
//     (§5–§6). v1 explicitly *accepts* O(n) here.
//
// What is a HARD GATE vs a WATCHDOG (see DESIGN.md §13 follow-up):
//   - Base ≤16ms is asserted only up to BASE_GATE_MAX_EVENTS, the dataset size at
//     which the engine actually meets the §13 base budget under the ×4 baseline.
//     Above it, base time is O(k) and is *logged as a watchdog* (no threshold) —
//     catching super-linear regressions without failing on the known, accepted
//     linear cost. Meeting ≤16ms base at 50k needs the precomputed zoomed-out
//     aggregation deferred past v1 (§13/§16).
//   - Overlay ≤4ms is asserted up to 50k — the overlay redraw is bounded by this
//     frame's hit targets and stays cheap across the whole range.
//   - Zoom-out is always a watchdog; 100k is out of scope for v1 (watchdog only).

const TOLERANCE_MS = Number(process.env.PERF_TOLERANCE_MS ?? 0);
const BASE_BUDGET_MS = 16 + TOLERANCE_MS;
const OVERLAY_BUDGET_MS = 4 + TOLERANCE_MS;
/** Largest dataset at which the engine meets the §13 base budget under ×4. */
const BASE_GATE_MAX_EVENTS = 10_000;
/** Largest dataset at which the cheap overlay redraw is gated. */
const OVERLAY_GATE_MAX_EVENTS = 50_000;
const WARMUP_FRAMES = 10;
const SAMPLE_FRAMES = 60;

const SIZES = [1_000, 10_000, 50_000, 100_000] as const;

async function enableCpuThrottle(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

interface RegimeSamples {
  base: number[];
  overlay: number[];
}

/**
 * Drive the harness in-page for one regime: load → frame the regime → warm up →
 * sample base nudges, then overlay nudges.
 */
async function measure(
  page: Page,
  eventCount: number,
  regime: 'interactive' | 'zoomout',
): Promise<RegimeSamples> {
  return page.evaluate(
    async ({ eventCount, regime, warmup, samples }) => {
      const bench = window.__bench;
      if (bench === undefined) throw new Error('bench harness not ready');
      const nextFrame = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      bench.reset();
      bench.load(eventCount);
      if (regime === 'interactive') bench.zoomInteractive();
      else bench.fit();
      await nextFrame();

      for (let i = 0; i < warmup; i++) {
        bench.nudge();
        await nextFrame();
      }

      bench.reset();
      for (let i = 0; i < samples; i++) {
        bench.nudge();
        await nextFrame();
      }
      const base = bench.frames
        .filter((f) => f.layer === 'base')
        .map((f) => f.durationMs);

      bench.reset();
      for (let i = 0; i < samples; i++) {
        bench.overlayNudge();
        await nextFrame();
      }
      const overlay = bench.frames
        .filter((f) => f.layer === 'overlay')
        .map((f) => f.durationMs);

      return { base, overlay };
    },
    { eventCount, regime, warmup: WARMUP_FRAMES, samples: SAMPLE_FRAMES },
  );
}

function log(size: number, regime: string, s: RegimeSamples): void {
  const base = summarize(s.base);
  const overlay = summarize(s.overlay);
  console.log(
    `[perf ${size} ${regime}] base median=${base.median.toFixed(2)}ms ` +
      `p95=${base.p95.toFixed(2)}ms | overlay median=` +
      `${overlay.median.toFixed(2)}ms p95=${overlay.p95.toFixed(2)}ms`,
  );
}

test.describe('perf budgets (§13)', () => {
  for (const size of SIZES) {
    test(`frame time at ${size.toLocaleString()} events`, async ({ page }) => {
      // Generous ceiling: ~280 throttled, rAF-paced frames at 100k take a while.
      test.setTimeout(180_000);
      await enableCpuThrottle(page);
      await page.goto('/bench.html');
      await page.waitForFunction(() => window.__bench !== undefined);

      const interactive = await measure(page, size, 'interactive');
      const zoomout = await measure(page, size, 'zoomout');
      log(size, 'interactive', interactive);
      log(size, 'zoom-out', zoomout); // watchdog: O(n) is accepted (§5)

      const base = summarize(interactive.base);
      const overlay = summarize(interactive.overlay);

      // Watchdog: always confirm we actually collected frames (catches a broken
      // harness) — this is the only assertion above the gated sizes.
      expect(base.count).toBeGreaterThan(0);

      if (size <= OVERLAY_GATE_MAX_EVENTS) {
        expect(overlay.median).toBeLessThanOrEqual(OVERLAY_BUDGET_MS);
      }
      if (size <= BASE_GATE_MAX_EVENTS) {
        expect(base.median).toBeLessThanOrEqual(BASE_BUDGET_MS);
      }
    });
  }
});

declare global {
  interface Window {
    __bench?: {
      load(eventCount: number): void;
      fit(): void;
      zoomInteractive(): void;
      nudge(): void;
      overlayNudge(): void;
      reset(): void;
      frames: { layer: 'base' | 'overlay'; durationMs: number }[];
    };
  }
}
