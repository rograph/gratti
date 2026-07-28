# Migration plan

Strangler-fig approach: the single-file app keeps working while logic moves
out into tested modules. Never break `index.html` mid-step.

## Done

- [x] Repo, Vite, Vitest scaffolding. Static build works.
- [x] Core logic extracted to `src/core/` as pure ES modules:
      format, types, dates, pipeline (aggregate/analytics), filter.
- [x] 37 unit tests over the extracted core. All passing.
- [x] Brand assets in `public/brand/`. Prototype frozen in `legacy/`.

## Next: swap the inline copies for imports

The inline `<script>` in `index.html` still contains its own copies of the
extracted functions. Replace them by loading the page script as a module:

1. Move the inline script body to `src/main.js`.
2. At the top of `src/main.js`, import from `./core/*.js` and delete the
   inline duplicates (`fmt`, `fmtVal`, `esc`, `tint`, `mix`, `inferType`,
   `toNum`, `parseDate`, `dateKey`, `prevKey`, `keyOf`, `reduceRows`,
   `bucket`, `aggregate`, `alignedSeries`, `analyticsOpts` math).
3. Adapt call sites: extracted functions take explicit `(rows, spec, cols)`
   parameters instead of reading globals. `rows()` becomes a thin wrapper
   over `filterRows(DATA, {filters, cross, slicers, ...})`.
4. `<script src=...>` becomes `<script type="module" src="/src/main.js">`.
   CDN libraries stay as classic scripts for now; they attach to `window`.
5. Run the app manually against `legacy/gratti-v5-prototype.html` and click
   through: load sample, one of each visual, slicer, save, reload, import.

## Then: split main.js

- `state.js`      DATA/COLS/BLOCKS/FILTERS/CROSS/SEL + mutation helpers
- `persist.js`    snapshot/restore, storage fallbacks, save index
- `renderers/`    chart2d.js, table.js, geo.js, three.js, card.js, slicer.js,
                  staticblocks.js
- `pane.js`       the right-hand properties panel
- `nl.js`         askAI prompt + offline keyword parser + spec clean()

Keep each under ~300 lines. Pipeline changes require a test first.

## Phase 2 backlog (hardening)

- [ ] Undo/redo: snapshot stack, Ctrl+Z, 20 deep
- [ ] Column type override in the fields list
- [ ] Virtualized table rows (only render the visible window)
- [ ] Lazy-load Plotly on first 3D/geo visual instead of at page load
- [ ] Save format v2: store dataset once, referenced by dashboards
- [ ] Row-count guardrail: sample or warn above ~50k rows

## Phase 3 (the business feature)

- [ ] Read-only viewer mode (no pane, no toolbar, no editing)
- [ ] Static export: one self-contained HTML file for iframe embedding
- [ ] "Hide Gratti branding" toggle in themes
