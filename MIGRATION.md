# Migration plan

Strangler-fig approach: the single-file app keeps working while logic moves
out into tested modules. Never break `index.html` mid-step.

## Done

- [x] Repo, Vite, Vitest scaffolding. Static build works.
- [x] Core logic extracted to `src/core/` as pure ES modules:
      format, types, dates, pipeline (aggregate/analytics), filter.
- [x] 37 unit tests over the extracted core. All passing.
- [x] Brand assets in `public/brand/`. Prototype frozen in `legacy/`.
- [x] Import swap. The inline `<script>` body moved to `src/main.js`, which
      imports from `./core/*.js`. Every duplicated copy is gone, so the
      tested modules are now the only implementation the page runs.
      `index.html` is markup and CSS plus one module tag.

### How the swap was done

The core takes explicit `(rows, spec, cols)` where the page code read
globals. Rather than rewrite ~40 call sites, `main.js` defines three thin
adapters that supply the current rows and schema:

```js
const bucket        = spec => bucketRows(rows(spec.x), spec, COLS);
const aggregate     = spec => aggregateRows(rows(spec.x), spec, COLS);
const alignedSeries = (spec, labels, col, agg) =>
  alignedSeriesFor(rows(spec.x), spec, COLS, labels, col, agg);
```

`rows()` is now a wrapper over `filterRows(DATA, {...})`, and `colType(n)`
over `colType(COLS, n)`. `analyticsOpts()` calls `analytics()` for the math
and keeps colour, label, and dash in the renderer where they belong.

CDN libraries stay classic scripts in `<head>`; they attach to `window` and
run before the deferred module. No inline `on*` handlers existed, so module
scope broke nothing.

One consequence: the source `index.html` can no longer be opened straight off
disk. A browser refuses to load a module over `file://`, so nothing runs and
you get the toolbar with an empty board and an empty panel. `npm run build`
now inlines everything back into one file, which restores that workflow and
doubles as the static export.

## In progress: split main.js

`src/main.js` was 1,654 lines after the import swap. Three modules are out:

- [x] `state.js`    DATA/COLS/BLOCKS/FILTERS/CROSS/SEL + setters + derived
      schema helpers (colTypeOf, numCols, catCols, dateCols, filterCols)
- [x] `storage.js`  the three-tier key/value store and its key names
- [x] `persist.js`  snapshot shape, the save index, autosave read/write
- [ ] `renderers/`  chart2d.js, table.js, geo.js, three.js, card.js,
                    slicer.js, staticblocks.js
- [ ] `pane.js`     the right-hand properties panel
- [ ] `nl.js`       askAI prompt + offline keyword parser + spec clean()

Keep each under ~300 lines. Pipeline changes require a test first.

### The state contract

`state.js` exports `let` bindings and setters. Reads use the binding directly,
since an ES live binding always shows the current value. Writes must go
through a setter, because an imported binding cannot be assigned to. Vite
fails the build on a stray assignment, so this is enforced, not a convention.

```js
import { CROSS, setCrossFilter } from './state.js';
if (CROSS) setCrossFilter(null);        // read the binding, call the setter
```

`persist.js` stays free of the DOM: `snapshot(title, theme)` takes the deck
title and the live theme as arguments rather than reaching for them, which is
what makes it testable. `restore()` is still in `main.js`, since rebuilding
the board is a DOM job.

## Phase 2 backlog (hardening)

- [ ] Undo/redo: snapshot stack, Ctrl+Z, 20 deep
- [ ] Column type override in the fields list
- [ ] Virtualized table rows (only render the visible window)
- [ ] Lazy-load Plotly on first 3D/geo visual instead of at page load
- [ ] Save format v2: store dataset once, referenced by dashboards
- [ ] Row-count guardrail: sample or warn above ~50k rows

## Phase 3 (the business feature)

- [ ] Read-only viewer mode (no pane, no toolbar, no editing)
- [x] Static export: one self-contained HTML file for iframe embedding.
      `vite-plugin-singlefile`, wired into the default build.
- [ ] "Hide Gratti branding" toggle in themes
