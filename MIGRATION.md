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

`src/main.js` was 1,654 lines after the import swap. It is now 941.

- [x] `state.js`      DATA/COLS/BLOCKS/FILTERS/CROSS/SEL, setters, block
                      lookups, derived schema helpers
- [x] `storage.js`    the three-tier key/value store and its key names
- [x] `persist.js`    snapshot shape, the save index, autosave read/write
- [x] `libs.js`       which CDN libraries loaded, plus the Chart.js bootstrap
- [x] `theme.js`      the palette registry and the live theme
- [x] `query.js`      `rows()`, the pipeline adapters, analytics line styling
- [x] `actions.js`    the three page actions renderers call back into
- [x] `renderers/`    chart2d, table, geo, three, card, slicer, staticblocks,
                      and an index.js that dispatches on visual type
- [x] `registries.js` the static option lists and the inline icon set
- [x] `nl.js`         askAI prompt + offline keyword parser + spec clean()
- [ ] `pane.js`       the right-hand properties panel, the last big piece

Every module outside `main.js` is under 130 lines. Pipeline changes require a
test first.

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

### Why actions.js exists

Clicking a bar has to refresh every block, and that refresh has to call back
into the renderers. Left alone that is a circular import. `actions.js` holds
four one-line pass-throughs, and `main.js` registers the real functions once
at startup:

```js
registerActions({ setCross, recalc, scheduleAutosave, refreshBlock });
```

All four must be hoisted function declarations, not `const` arrows, or the
registration hits the temporal dead zone. That bites at runtime, not at build
time, so it is worth remembering when adding a fifth.

### Known bug found while testing nl.js

`offlineSpec` runs its type rules in order and lets the last match win, and
the map rule matches the bare word "location". An incidental mention beats an
explicit request, so "revenue by location as a table" returns a bubble map.
`test/nl.test.js` pins the current behaviour under a comment, so a fix shows
up as a failing test rather than a silent change. The fix is to only consider
map and choropleth when nothing more explicit matched:

```js
if (type === 'bar' && /\bmap\b|location|geograph|where/.test(s) && guessLat() && guessLon())
  type = 'map';
```

### Watch for missing imports

A stray identifier inside a module is a runtime `ReferenceError`, and neither
Vite nor Vitest will catch it, because nothing imports the broken path until
someone clicks. Run ESLint with `no-undef` and the CDN globals declared after
any move of this size. That is how the two mistakes in this step were found.

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
