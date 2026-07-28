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
npm run build    # static production build in dist/
```

The app is a static site. Deploy `dist/` anywhere that serves files.

## Architecture

The app currently lives in `index.html` as a self-contained page (the prototype grew up in a chat-based workflow where a single file was the right shape). The migration to modules is underway, extraction-first:

```
src/core/          pure logic, no DOM, fully unit-tested
  format.js        number/string formatting, colour math
  types.js         column type inference, numeric coercion
  dates.js         date parsing, period rollup, prior-period keys
  pipeline.js      grouping, aggregation, sorting, topN, stacking, analytics
  filter.js        the row predicate: filters + cross-filter + slicers
test/              Vitest suites for everything in src/core
legacy/            frozen copy of the last single-file prototype
public/brand/      logo, favicon, lockup assets
```

`MIGRATION.md` tracks the remaining steps.

## Status

Working prototype, pre-release. Persistence is browser-local; hosted sharing is the next phase.
