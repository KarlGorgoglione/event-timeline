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
      '@timeline/react': fileURLToPath(
        new URL('../../packages/react/src/index.ts', import.meta.url),
      ),
      '@timeline/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
