/**
 * Key/value persistence with three tiers, tried in order:
 *   1. window.storage, the host bridge when the page is embedded
 *   2. localStorage
 *   3. an in-memory map, so a sandboxed iframe degrades instead of throwing
 *
 * Every call is async because the bridge is. Nothing here throws; a failed
 * write returns false and the caller decides what to tell the user.
 */

const MEM = {};

export const IDX_KEY = 'gratti:index';
export const AUTO_KEY = 'gratti:autosave';
export const dashKey = name => 'gratti:dash:' + name;

export const store = {
  async get(k) {
    try { if (window.storage) { const r = await window.storage.get(k, false); return r ? r.value : null; } } catch (e) {}
    try { const v = localStorage.getItem(k); if (v != null) return v; } catch (e) {}
    return MEM[k] ?? null;
  },
  async set(k, v) {
    MEM[k] = v;
    try { if (window.storage) { await window.storage.set(k, v, false); return true; } } catch (e) {}
    try { localStorage.setItem(k, v); return true; } catch (e) {}
    return false;
  },
  async del(k) {
    delete MEM[k];
    try { if (window.storage) { await window.storage.delete(k, false); return; } } catch (e) {}
    try { localStorage.removeItem(k); } catch (e) {}
  }
};

/** Test hook: empty the in-memory tier. */
export const resetMemory = () => { for (const k of Object.keys(MEM)) delete MEM[k]; };
