import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Static app, no framework. index.html is the entry.
  //
  // The build inlines the module graph and the CSS back into one HTML file.
  // That keeps the open-the-file-directly workflow alive after the module
  // migration, and it is the same artifact a client embeds in an iframe.
  // Dev still serves the real module graph, so the imports stay honest.
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: Infinity },
  test: { environment: 'node' },
});
