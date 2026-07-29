/**
 * Late-bound page actions.
 *
 * A renderer needs to kick off a global refresh when someone clicks a bar,
 * and that refresh has to call back into the renderers. Rather than let the
 * two import each other in a circle, main.js registers the real functions
 * here at startup and the renderers call through.
 */

let impl = {};

/** main.js calls this once, before anything can be clicked. */
export const registerActions = a => { impl = a; };

/** Toggle the click-selection on a chart, then refresh everything. */
export const setCross = (col, val) => impl.setCross(col, val);

/** Redraw the KPI strip and every block except one, then autosave. */
export const recalc = exceptId => impl.recalc(exceptId);

/** Debounced write of the current dashboard. */
export const scheduleAutosave = () => impl.scheduleAutosave();

/** Redraw one block in place, whatever kind it is. */
export const refreshBlock = id => impl.refreshBlock(id);
