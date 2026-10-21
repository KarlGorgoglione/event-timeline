import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Workspace packages resolve to their TypeScript source, as the demo's Vite
// config and the React tsconfig already do, so `pnpm test` works on a fresh
// clone without a prior `pnpm build` (core's package `exports` point at dist).
const sourceAliases = {
  '@event-timeline/core': fileURLToPath(
    new URL('./packages/core/src/index.ts', import.meta.url),
  ),
  '@event-timeline/react': fileURLToPath(
    new URL('./packages/react/src/index.ts', import.meta.url),
  ),
};

// A single root config drives every package via `test.projects`, so
// `vitest run` at the repo root executes every unit suite. Each project pins
// the environment its code needs: node for the framework-agnostic core, jsdom
// for the React binding.
export default defineConfig({
  test: {
    // `pnpm test:coverage`: v8 coverage of the library sources (audit T-07).
    // The thresholds are a ratchet, set just under the measured coverage:
    // raise them as coverage grows, never lower them.
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', 'packages/core/src/testing/**'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        statements: 94,
        branches: 90,
        functions: 90,
        lines: 94,
      },
    },
    projects: [
      {
        resolve: { alias: sourceAliases },
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        esbuild: { jsx: 'automatic' },
        resolve: { alias: sourceAliases },
        test: {
          name: 'react',
          root: './packages/react',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: { alias: sourceAliases },
        test: {
          name: 'demo',
          root: './examples/demo',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
});
