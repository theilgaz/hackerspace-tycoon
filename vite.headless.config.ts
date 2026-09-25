import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Builds the sim + CLI harnesses for headless balance runs (CLAUDE.md §11). */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: { __APP_VERSION__: JSON.stringify(version) },
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
        'kickoff-check': 'tools/kickoff-check.ts',
        'layout-check': 'tools/layout-check.ts',
      },
    },
  },
});
