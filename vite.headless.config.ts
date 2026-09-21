import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/** Builds the sim + CLI harnesses for headless balance runs (CLAUDE.md §11). */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    ssr: true,
    outDir: 'dist-headless',
    target: 'node20',
    emptyOutDir: true,
    minify: false,
    rolldownOptions: {
      input: {
        'sim-check': 'tools/sim-check.ts',
        'time-budget': 'tools/time-budget.ts',
        'project-times': 'tools/project-times.ts',
        'era-pace': 'tools/era-pace.ts',
        'hype-check': 'tools/hype-check.ts',
      },
    },
  },
});
