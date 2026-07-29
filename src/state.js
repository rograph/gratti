/**
 * Shared mutable state and the schema helpers derived from it.
 *
 * Modules read the exported bindings directly. ES module live bindings mean
 * an importer always sees the current value, so reads need no ceremony. An
 * imported binding cannot be assigned to, though, so every write goes
 * through a setter here. That is the whole contract: read the binding, call
 * the setter.
 *
 * No DOM, no rendering. Anything that touches the page belongs in main.js.
 */

export let DATA = [];      // parsed CSV rows
export let COLS = [];      // [{name, type}] schema inferred at load
export let BLOCKS = [];    // canvas blocks: charts, cards, slicers, text, images
export let FILTERS = [];   // filter strip: [{col, val}]
export let CROSS = null;   // click-selection from a chart: {col, val}
export let SEL = null;     // selected block id
export let FILE = '';      // source file name
export let PANE_MODE = 'data';      // data | block | theme
export let AI_STATE = 'unknown';    // unknown | ok | off
export let dragId = null;  // block id mid-drag

export const setData = v => { DATA = v; };
export const setCols = v => { COLS = v; };
export const setBlocks = v => { BLOCKS = v; };
export const setFilters = v => { FILTERS = v; };
export const setCrossFilter = v => { CROSS = v; };
export const setSel = v => { SEL = v; };
export const setFile = v => { FILE = v; };
export const setPaneMode = v => { PANE_MODE = v; };
export const setAiState = v => { AI_STATE = v; };
export const setDragId = v => { dragId = v; };

/** Swap the whole dataset in one call. Used by load, unload, and restore. */
export function setDataset({ data = [], cols = [], file = '' } = {}) {
  DATA = data; COLS = cols; FILE = file;
}

/** Drop every active filter: strip, cross-filter, and selection. */
export function clearFilters() {
  FILTERS = []; CROSS = null;
}

let uid = 0;
/** Block ids are unique per session, not stable across saves. */
export const nextId = () => 'b' + (++uid);

/* ---------- derived schema ---------- */

export const colTypeOf = n => (COLS.find(c => c.name === n) || {}).type;
export const numCols = () => COLS.filter(c => c.type === 'number');
export const catCols = () => COLS.filter(c => c.type !== 'number');
export const dateCols = () => COLS.filter(c => c.type === 'date');

/** Categories with few enough distinct values to drive a dropdown filter. */
export const filterCols = () =>
  catCols().filter(c => new Set(DATA.map(r => r[c.name])).size <= 40);
