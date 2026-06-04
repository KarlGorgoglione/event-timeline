import { defineConfig } from 'vitest/config';

// A single root config drives both packages via `test.projects`, so
// `vitest run` at the repo root executes every unit suite. Each project pins
// the environment its code needs (node for the framework-agnostic core, jsdom
// for the React binding) — DESIGN.md §14.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'react',
          root: './packages/react',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
