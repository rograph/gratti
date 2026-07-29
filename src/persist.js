/**
 * Dashboard persistence: what a saved dashboard contains and where it goes.
 *
 * Snapshot building is pure, so it is unit-tested. Anything that reads the
 * page (the deck title, the live theme) is passed in by the caller rather
 * than reached for here, which keeps this module free of the DOM.
 *
 * Layout in storage:
 *   gratti:index        [{name, at}] most recent write order
 *   gratti:dash:<name>  one serialized snapshot
 *   gratti:autosave     the same shape, rewritten as you work
 */

import { store, IDX_KEY, AUTO_KEY, dashKey } from './storage.js';
import { DATA, COLS, BLOCKS, FILTERS, FILE } from './state.js';

/** Bumped when the saved shape changes in a way readers must notice. */
export const SNAPSHOT_V = 5;

/** Everything needed to rebuild the current dashboard. */
export function snapshot(title, theme) {
  return {
    v: SNAPSHOT_V,
    title,
    file: FILE,
    theme,
    filters: FILTERS,
    cols: COLS,
    data: DATA,
    blocks: BLOCKS.map(b => ({ kind: b.kind, spec: b.spec }))
  };
}

export async function listSaves() {
  try { return JSON.parse(await store.get(IDX_KEY) || '[]'); } catch (e) { return []; }
}

/**
 * Write one dashboard and update the index. `at` is passed in so callers
 * control the clock. Returns false when storage refused the write, in which
 * case the dashboard still lives in memory for this session.
 */
export async function putSave(name, payload, at) {
  const ok = await store.set(dashKey(name), payload);
  const list = await listSaves();
  const entry = { name, at: at ?? Date.now() };
  const i = list.findIndex(s => s.name === name);
  i >= 0 ? list[i] = entry : list.push(entry);
  await store.set(IDX_KEY, JSON.stringify(list));
  return ok;
}

export const getSave = name => store.get(dashKey(name));

export async function removeSave(name) {
  await store.del(dashKey(name));
  const list = (await listSaves()).filter(s => s.name !== name);
  await store.set(IDX_KEY, JSON.stringify(list));
}

export const readAutosave = () => store.get(AUTO_KEY);
export const writeAutosave = payload => store.set(AUTO_KEY, payload);
