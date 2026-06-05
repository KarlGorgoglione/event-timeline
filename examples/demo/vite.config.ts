import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Resolve the workspace packages to their TypeScript source so the demo gets
// live hot-reload into the library and runs on a fresh clone without a prior
// `pnpm build`. The published packages still consume the built `dist` output.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@event-timeline/react': fileURLToPath(
        new URL('../../packages/react/src/index.ts', import.meta.url),
      ),
      '@event-timeline/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  // Emit both HTML entries on `vite build`: the React demo and the headless perf
  // harness (§13). Perf benchmarks run against this *production* preview build,
  // not the dev server, so frame times reflect minified/optimised code.
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        bench: fileURLToPath(new URL('bench.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
