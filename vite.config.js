import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The gallery index is a build-machine convenience. Deploying it would
// publish the whole client list, so the deploy never includes it: the
// dashboards themselves stay fetchable by slug, the list of them does not.
const stripManifest = () => ({
  name: 'strip-dashboard-manifest',
  apply: 'build',
  closeBundle() {
    try { rmSync(resolve('dist/dashboards/index.json')); } catch (e) { /* absent is fine */ }
  },
});

export default defineConfig({
  // Static app, no framework. index.html is the entry.
  //
  // The build inlines the module graph and the CSS back into one HTML file.
  // That keeps the open-the-file-directly workflow alive after the module
  // migration, and it is the same artifact a client embeds in an iframe.
  // Dev still serves the real module graph, so the imports stay honest.
  plugins: [viteSingleFile(), stripManifest()],
  build: { outDir: 'dist', assetsInlineLimit: Infinity },
  test: { environment: 'node' },
});
