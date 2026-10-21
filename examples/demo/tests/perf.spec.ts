import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { summarize, type PerfRecord } from '../src/perfStats';

// Perf budgets (DESIGN.md §13), measured under CPU ×4 / DPR 1 against the
// headless core harness of the production preview build (/bench.html). Each
// regime discards warm-up frames and asserts the median, not single spikes.
//
// Two projects drive the same scenarios:
//   - perf      Canvas2D, the fallback backend. Hard budget up to 10k events;
//               larger sizes are watchdogs (logged, regression-tracked).
//   - perf-gpu  WebGL2 on the machine's GPU (Chromium launched with GPU flags,
//               the backend `renderer: 'auto'` picks on hardware). Gate 2, the
//               1.0 requirement, is asserted here: 50k events at base ≤16 ms
//               and overlay ≤4 ms in every regime. Skipped where Chromium has
//               no hardware WebGL2 (e.g. shared CI runners).
//
// Every scenario also records the rAF cadence (wall-clock interval between
// frames, p95): the base time excludes rasterization and compositing, so the
// cadence is what shows whether the frame rate actually holds.
//
// With PERF_OUTPUT set, each scenario appends a JSON record to that file;
// the nightly workflow compares it with the last run on main (T-05).

const TOLERANCE_MS = Number(process.env.PERF_TOLERANCE_MS ?? 0);
const BASE_BUDGET_MS = 16 + TOLERANCE_MS;
const OVERLAY_BUDGET_MS = 4 + TOLERANCE_MS;
const WARMUP_FRAMES = 10;
const SAMPLE_FRAMES = 60;

interface Scenario {
  name: string;
  events: number;
  /** Element count; default scales with the event count (bench.ts). */
  elements?: number;
  regime: 'interactive' | 'zoomout';
}

const SCENARIOS: Scenario[] = [
  ...[1_000, 10_000, 50_000, 100_000].flatMap((events): Scenario[] => [
    { name: `interactive-${events}`, events, regime: 'interactive' },
    { name: `zoomout-${events}`, events, regime: 'zoomout' },
  ]),
  // 50k events over 20 elements: every row crowded (the aggregated path).
  {
    name: 'zoomout-dense-50000',
    events: 50_000,
    elements: 20,
    regime: 'zoomout',
  },
];

/** The budgets a scenario must meet on a backend (none: watchdog only). */
function budgets(
  backend: 'canvas2d' | 'webgl',
  scenario: Scenario,
): { base: boolean; overlay: boolean } {
  if (scenario.events > 50_000) return { base: false, overlay: false };
  if (backend === 'webgl') return { base: true, overlay: true };
  // Canvas2D is the fallback: gated where it holds the budget with margin.
  const small = scenario.events <= 10_000;
  return { base: small, overlay: small };
}

async function enableCpuThrottle(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

interface Samples {
  base: number[];
  overlay: number[];
  intervals: number[];
}

/**
 * Drive the harness in-page: load, frame the regime, warm up, then sample
 * base redraws (with their frame intervals) and overlay redraws.
 */
async function measure(page: Page, scenario: Scenario): Promise<Samples> {
  return page.evaluate(
    async ({ scenario, warmup, samples }) => {
      const bench = window.__bench;
      if (bench === undefined) throw new Error('bench harness not ready');
      const nextFrame = () =>
        new Promise<number>((resolve) => requestAnimationFrame(resolve));

      bench.reset();
      bench.load(scenario.events, scenario.elements);
      if (scenario.regime === 'interactive') bench.zoomInteractive();
      else bench.fit();
      await nextFrame();
      for (let i = 0; i < warmup; i++) {
        bench.nudge();
        await nextFrame();
      }

      bench.reset();
      const intervals: number[] = [];
      let last = await nextFrame();
      for (let i = 0; i < samples; i++) {
        bench.nudge();
        const now = await nextFrame();
        intervals.push(now - last);
        last = now;
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
      return { base, overlay, intervals };
    },
    { scenario, warmup: WARMUP_FRAMES, samples: SAMPLE_FRAMES },
  );
}

function record(path: string | undefined, entry: PerfRecord): void {
  if (path === undefined || path === '') return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
}

test.describe('perf budgets (§13)', () => {
  for (const scenario of SCENARIOS) {
    test(scenario.name, async ({ page }, info) => {
      // ~140 throttled, rAF-paced frames at 100k take a while.
      test.setTimeout(180_000);
      const backend = info.project.name === 'perf-gpu' ? 'webgl' : 'canvas2d';
      await enableCpuThrottle(page);
      // On the GPU project, `auto` must pick WebGL2 by itself: that is the
      // hardware check (it refuses software rasterizers).
      await page.goto(
        `/bench.html?renderer=${backend === 'webgl' ? 'auto' : 'canvas2d'}`,
      );
      await page.waitForFunction(() => window.__bench !== undefined);
      const drawing = await page.evaluate(() => window.__bench!.backend());
      test.skip(
        drawing !== backend,
        `no hardware WebGL2 here (drawing with ${drawing})`,
      );

      const samples = await measure(page, scenario);
      const base = summarize(samples.base);
      const overlay = summarize(samples.overlay);
      const cadence = summarize(samples.intervals);
      const entry: PerfRecord = {
        backend,
        scenario: scenario.name,
        baseMedian: base.median,
        baseP95: base.p95,
        overlayMedian: overlay.median,
        overlayP95: overlay.p95,
        cadenceP95: cadence.p95,
      };
      console.log(
        `[perf ${backend} ${scenario.name}] base median=${base.median.toFixed(2)}ms ` +
          `p95=${base.p95.toFixed(2)}ms | overlay median=${overlay.median.toFixed(2)}ms ` +
          `p95=${overlay.p95.toFixed(2)}ms | frame interval p95=${cadence.p95.toFixed(1)}ms`,
      );
      await info.attach('perf.json', {
        body: JSON.stringify(entry),
        contentType: 'application/json',
      });
      record(process.env.PERF_OUTPUT, entry);

      // Always confirm frames were collected (catches a broken harness).
      expect(base.count).toBeGreaterThan(0);
      expect(overlay.count).toBeGreaterThan(0);
      const gate = budgets(backend, scenario);
      if (gate.base) expect(base.median).toBeLessThanOrEqual(BASE_BUDGET_MS);
      if (gate.overlay) {
        expect(overlay.median).toBeLessThanOrEqual(OVERLAY_BUDGET_MS);
      }
    });
  }
});

declare global {
  interface Window {
    __bench?: {
      load(eventCount: number, elementCount?: number): void;
      fit(): void;
      zoomInteractive(): void;
      nudge(): void;
      overlayNudge(): void;
      reset(): void;
      backend(): string | null;
      frames: { layer: 'base' | 'overlay'; durationMs: number }[];
    };
  }
}
