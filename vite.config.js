import { defineConfig } from 'vite';

export default defineConfig({
  // Static app, no framework. index.html is the entry.
  build: { outDir: 'dist' },
  test: { environment: 'node' },
});
