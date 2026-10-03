import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {monarchDevPlugin} from './scripts/vite-monarch-plugin.ts';

export default defineConfig(({mode}) => ({
  // monarchDevPlugin declares `apply: 'serve'` itself, so it's a no-op for
  // every build mode (including gh-pages) and only ever runs under `vite dev`.
  plugins: [react(), monarchDevPlugin()],
  base: mode === 'gh-pages' ? '/northstar/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
