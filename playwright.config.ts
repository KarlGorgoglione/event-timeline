import { defineConfig, devices } from '@playwright/test';

// e2e / golden / perf all run against the demo app (DESIGN.md §13–§14).
// Playwright boots the Vite dev server itself so `pnpm test:e2e` is one command;
// the dev server also serves the headless perf harness at /bench.html.
//
// Projects segregate the three test kinds:
//   - interaction: behavioural specs at the default device.
//   - golden:      screenshot compares pinned to DPR 1 + a fixed viewport so
//                  baselines are stable across machines (§14).
//   - perf:        frame-budget benchmarks, also DPR 1 to match the §13 baseline
//                  (CPU ×4 is applied per-test via CDP).
export default defineConfig({
  testDir: './examples/demo/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'interaction',
      testIgnore: [/golden\.spec\.ts/, /perf\.spec\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'golden',
      testMatch: /golden\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      // Perf measures the production preview server (minified build), so frame
      // times reflect shipped code rather than dev-mode transforms (§13).
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 1,
        baseURL: 'http://localhost:4173',
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter demo run dev --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Production build + preview for the perf benchmarks (§13).
      command:
        'pnpm --filter demo run build && pnpm --filter demo run preview --port 4173 --strictPort',
      url: 'http://localhost:4173/bench.html',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
