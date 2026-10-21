import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium flags that put WebGL on the machine's GPU instead of the software
 * rasterizer headless Chromium uses by default (for the perf-gpu project).
 */
const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  ...(process.platform === 'win32'
    ? ['--use-angle=d3d11']
    : process.platform === 'darwin'
      ? ['--use-angle=metal']
      : ['--use-angle=vulkan', '--enable-features=Vulkan']),
];

// e2e / golden / perf all run against the demo app (DESIGN.md §13–§14).
// Playwright boots the Vite dev server itself so `pnpm test:e2e` is one command;
// the dev server also serves the headless perf harness at /bench.html.
//
// Projects segregate the three test kinds:
//   - interaction: behavioural specs at the default device.
//   - golden:      screenshot compares pinned to DPR 1 + a fixed viewport so
//                  baselines are stable across machines (§14).
//   - perf:        frame-budget benchmarks on Canvas2D, also DPR 1 to match the
//                  §13 baseline (CPU ×4 is applied per-test via CDP).
//   - perf-gpu:    the same benchmarks on WebGL2 with the GPU enabled; Gate 2
//                  (50k events). Skips itself without hardware WebGL2.
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
    // The interaction specs again in Firefox and WebKit (audit T-06): wheel
    // deltas, shift+wheel, pointer capture and WebGL differ per engine.
    {
      name: 'interaction-firefox',
      testIgnore: [/golden\.spec\.ts/, /perf\.spec\.ts/],
      use: { ...devices['Desktop Firefox'] },
    },
    // On Windows, Playwright's WebKit worker intermittently hangs for minutes
    // at shutdown (after the tests pass), so there it is opt-in: E2E_WEBKIT=1.
    ...(process.platform !== 'win32' || process.env.E2E_WEBKIT === '1'
      ? [
          {
            name: 'interaction-webkit',
            testIgnore: [/golden\.spec\.ts/, /perf\.spec\.ts/],
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
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
    {
      name: 'perf-gpu',
      testMatch: /perf\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 1,
        baseURL: 'http://localhost:4173',
        launchOptions: { args: GPU_ARGS },
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
