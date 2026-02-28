import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // Provide browser-compatible zlib shim for nexrad-level-2-data
      zlib: path.resolve(__dirname, 'src/shims/zlib.ts'),
    },
  },
  // Use es2022 target so esbuild passes class fields through natively,
  // avoiding __publicField helper injection which breaks MapLibre's web worker.
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  server: {
    proxy: {
      '/api/iem': {
        target: 'https://mesonet.agron.iastate.edu',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/iem/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
