# Gratti

Lightweight, white-label dashboards. Upload a CSV, describe a chart in plain language, share the result.

Gratti exists because the two big BI tools leave the same gaps: Power BI overwhelms non-technical users, and Tableau charges per viewer and refuses true white-labeling. Gratti is for the salon owner who wants to see revenue by month, and the freelancer who builds it for them under their own brand.

## What it does

- 16 visual types: column, stacked, 100% stacked, bar, line, area, combo (bars + line on a second axis), sortable table with totals, pie, donut, radar, scatter, bubble map, region map, and three 3D types
- KPI cards with targets, progress, and trend sparklines
- On-canvas filter blocks (slicers), a filter strip, and click-to-cross-filter on any bar, slice, row, or map bubble
- Date rollup to month, quarter, or year, with prior-period comparison
- Analytics lines: average, min, max, target, and least-squares trend
- Conditional formatting on tables: data bars, colour scales, arrows
- Sort control and top N on every chart
- Text and image blocks in the same drag-and-resize 12-column grid
- Six palettes, custom accent, client logo. Themes save per dashboard
- Autosave, named saves, and portable `.gratti.json` export/import
- Natural-language chart creation through the Anthropic API, with a keyword parser fallback that works offline

## Running it

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests (Vitest)
npm run build    # one self-contained file at dist/index.html
```

`npm run build` inlines the whole module graph and the CSS back into a single
HTML file. Open `dist/index.html` straight off disk, drop it on any host, or
embed it in an iframe. Nothing else ships with it.

The source `index.html` loads `src/main.js` as an ES module, so it needs a
server. Opening the source file directly leaves you with a blank board and an
empty panel, because the browser refuses to load a module over `file://`. Use
`npm run dev` while working, and the built file for everything else.

## Architecture

The page script is `src/main.js`, loaded as an ES module. It is being split
down; `MIGRATION.md` tracks what is left. Everything already out of it is
either unit-tested or pure DOM work with no logic worth testing.

```
index.html         markup and CSS, plus the module tag
src/main.js        what is left: blocks, the panel, natural language, boot
src/state.js       shared state, setters, derived lookups
src/query.js       the row predicate and the pipeline adapters
src/storage.js     key/value store: host bridge, localStorage, memory
src/persist.js     snapshot shape, saved dashboards, autosave
src/theme.js       palette registry and the live theme
src/libs.js        CDN library detection and the Chart.js bootstrap
src/actions.js     the page actions renderers call back into
src/renderers/     one module per visual family, plus a dispatcher
src/core/          pure logic, no DOM, fully unit-tested
  format.js        number/string formatting, colour math
  types.js         column type inference, numeric coercion
  dates.js         date parsing, period rollup, prior-period keys
  pipeline.js      grouping, aggregation, sorting, topN, stacking, analytics
  filter.js        the row predicate: filters + cross-filter + slicers
test/              Vitest suites for everything outside main.js
legacy/            frozen single-file prototype, pre-migration
public/brand/      logo, favicon, lockup assets
```

`MIGRATION.md` tracks the remaining steps.

## Status

Working prototype, pre-release. Persistence is browser-local; hosted sharing is the next phase.
