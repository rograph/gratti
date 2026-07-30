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

## Publishing a dashboard

A dashboard becomes a URL by living as a file under `public/dashboards/`.

1. Build it, then use Export file in the panel.
2. Rename the download to `<slug>.gratti.json` and drop it in
   `public/dashboards/`. Lowercase letters, digits and hyphens only; the
   filename is the slug.
3. `npm run dashboards` regenerates the index.

The dashboard is then live at `?d=<slug>`, and it appears in the gallery on
the empty board so every dashboard you own is one click away.

A `?d=` URL opens in viewer mode: no panel, no toolbar, no editing, and
nothing writes to storage. Slicers, cross-filtering and table sorting all
still work, so whoever you send it to can explore rather than just look. A
small "Built with Gratti" byline sits at the bottom.

The dashboard file carries its own data, so a published dashboard is a
snapshot, not a live feed. Re-export to update it.

## Protecting client data

Editing happens entirely in the browser. The CSV is parsed locally, saves go
to local storage, and nothing uploads anywhere. The one exception is the AI
chart builder, which sends the column names and three sample rows to the
Anthropic API when an endpoint is reachable; the keyword fallback sends
nothing at all.

Publishing is different: a plain published dashboard is a readable JSON file
carrying its full dataset, and anyone with the URL can open it. Use that for
demos. For client data, use Protected export instead:

1. Choose Protected export in the panel and pick a passphrase.
2. Publish the file exactly as above. What lands on the host is
   AES-256-GCM ciphertext; the host, or anyone browsing it, sees noise.
3. Send the client the `?d=<slug>` link and tell them the passphrase
   separately. The viewer asks for it and decrypts in their browser.

The passphrase is never stored and never travels with the file. Lose it and
the file is locked for good, including for you, so keep it somewhere safe.

Two related guardrails: the gallery index (`dashboards/index.json`) is
stripped from every build, so a deployed site never lists what is published,
and a visitor who tries a wrong slug gets an empty editor, not a directory of
your clients.

## Architecture

The page script is `src/main.js`, loaded as an ES module. It is being split
down; `MIGRATION.md` tracks what is left. Everything already out of it is
either unit-tested or pure DOM work with no logic worth testing.

```
index.html         markup and CSS, plus the module tag
src/main.js        what is left: blocks, the panel, boot
src/state.js       shared state, setters, derived lookups
src/query.js       the row predicate and the pipeline adapters
src/storage.js     key/value store: host bridge, localStorage, memory
src/persist.js     snapshot shape, saved dashboards, autosave
src/theme.js       palette registry and the live theme
src/libs.js        CDN library detection and the Chart.js bootstrap
src/actions.js     the page actions renderers call back into
src/nl.js          request to chart spec: the model, the parser, the guard
src/registries.js  option lists and the inline icon set
src/publish.js     the URL slug, the dashboard manifest, the payload
scripts/           dashboards.mjs regenerates the published index
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

Working prototype, pre-release. Editing is browser-local. Sharing is a
published file per dashboard, served straight from the site, so a viewer
costs nothing and needs no account.
