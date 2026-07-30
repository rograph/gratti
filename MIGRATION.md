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
- [x] `pane.js`       the right-hand properties panel, the last big piece

The split is done. `main.js` is 564 lines: boot, board and block lifecycle,
filters, KPI strip, drag and resize, persistence glue, and events. Every other
module is under 130 lines except `pane.js` at ~450, which is fine: it is six
template functions and their wiring, all one concern, and splitting it further
would just scatter the panel. Pipeline changes require a test first.

### How pane.js was extracted

The panes call back into block and file jobs that live in `main.js`
(`killBlock`, `loadCSV`, `saveAs`, ...), and `main.js` calls `renderPane()`.
That circle gets the actions.js fix: `pane.js` exports `registerPane(deps)`,
and `main.js` registers fifteen functions once at startup, right after
`registerActions`. Same rule as before: every registered function must be a
hoisted declaration, which is why `addChart` changed from a `const` arrow to a
function declaration.

The layout bounds (`SPAN_MIN`, `SPAN_MAX`, `H_MIN`, `H_MAX`) moved to
`registries.js`, since the pane's sliders and the canvas resize logic must
agree on them.

Verified three ways: the 136 unit tests, ESLint `no-undef` over `src/` with
the CDN globals declared (zero errors), and a headless-Chromium pass over the
built file that exercises every pane: load sample data, add a chart from a
starter chip, select, duplicate, re-sort, switch theme, add and delete a
card. No page errors.

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

### The nl.js map bug, now fixed

`offlineSpec` ran its type rules in order and let the last match win, and the
map rule matched the bare word "location", so "revenue by location as a
table" returned a bubble map. The pinned test flipped to the correct
expectation when the fix landed: map and choropleth now only run when nothing
more explicit matched. Rules after them (pie, ranked, 3D) stay unconditional,
so an explicit type later in the order still wins.

### The bug real data found

`offlineSpec` matched column names with `includes()`, and "Venue" is a
substring of "revenue". So on the Cooling Economy broadcast data, every chart
built from a request mentioning revenue was silently split by all 18 venues:
grouped bars instead of one bar per stage, and a table with a column per venue
that was almost entirely zeros. Names are matched on word boundaries now.

Worth remembering the shape of it. Any column whose name is a fragment of a
common word hits the same trap, and nothing about the output looks like an
error, it just looks like a badly designed dashboard.

### Two bugs fixed while building viewer mode

Both were invisible in the editor and obvious the moment a dashboard was on
screen for its own sake:

- `hbar` sets `indexAxis: 'y'`, which swaps which axis carries the labels and
  which carries the numbers. The scales object hardcoded x as the category
  axis, so every horizontal bar chart formatted its category names as
  currency and drew gridlines on the wrong axis. The axes are now described
  by role and assigned by orientation.
- The KPI strip auto-picked the first three numeric columns, which on any CSV
  with coordinates meant it led with Latitude. `state.metricCols()` now
  excludes the columns `guessLat`/`guessLon` identify.

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

- [x] Read-only viewer mode (no pane, no toolbar, no editing). `?d=<slug>`
      loads a published dashboard; charts stay interactive. `src/publish.js`
      owns slug parsing and fetching, `state.VIEWER` gates the editing paths,
      and autosave is skipped so a visitor cannot clobber an editor's work.
- [x] Static export: one self-contained HTML file for iframe embedding.
      `vite-plugin-singlefile`, wired into the default build.
- [x] Suggested starter dashboard. A "Build a dashboard for me" button on the
      empty board reads the schema and builds KPI cards for the top measures
      plus 4 to 6 charts. `askAISuggest` has the model design the set from
      the columns and sample rows; `offlineSuggest` does it from field types
      alone (trend, ranking, composition, map, detail), leading with the
      money column when one exists. Both prompts share one spec shape and
      rule list, and every spec still passes through `clean()`. The offline
      path is under test in `test/nl.test.js`.
- [x] Client data protection. `src/crypt.js` seals a snapshot with
      AES-256-GCM under a PBKDF2 passphrase key (WebCrypto, no dependency).
      Protected export in the panel produces an encrypted `.gratti.json`
      that is safe on a public host; the viewer and importer prompt for the
      passphrase and decrypt in the browser. Wrong passphrase or a flipped
      byte fails closed, under test in `test/crypt.test.js`. Alongside it,
      the build strips `dashboards/index.json` so a deployed site never
      lists the client roster, the bad-slug path no longer renders the
      gallery, and `npm run dashboards` indexes sealed files by slug only.
- [x] "Hide Gratti branding" toggle in themes. `THEME.hideBrand` rides in the
      theme, so it saves per dashboard and a published viewer honours it: on
      for the portfolio demo, off for a white-label client, per client. The
      flag's snapshot round-trip is pinned in `test/persist.test.js`.

Phase 3 is done.
