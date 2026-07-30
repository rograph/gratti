import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/state.js';
import { store, IDX_KEY, AUTO_KEY, dashKey, resetMemory } from '../src/storage.js';
import {
  SNAPSHOT_V, snapshot, listSaves, putSave, getSave, removeSave,
  readAutosave, writeAutosave
} from '../src/persist.js';

const THEME = { key: 'indigo', accent: '#3D3AF5', pal: ['#3D3AF5'], logo: null };

beforeEach(() => {
  resetMemory();
  S.setDataset({
    data: [{ Month: '2026-01', Revenue: 10 }],
    cols: [{ name: 'Month', type: 'date' }, { name: 'Revenue', type: 'number' }],
    file: 'sales.csv'
  });
  S.clearFilters();
  S.setBlocks([]);
});

describe('storage falls back cleanly', () => {
  it('round-trips through memory when no browser storage exists', async () => {
    expect(await store.get('missing')).toBeNull();
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    await store.del('k');
    expect(await store.get('k')).toBeNull();
  });

  it('reports false when only the memory tier accepted the write', async () => {
    // No window.storage and no localStorage here, which is what a locked-down
    // iframe looks like. The value is still readable, but only this session.
    expect(await store.set('k', 'v')).toBe(false);
    expect(await store.get('k')).toBe('v');
  });

  it('signals session-only saves through putSave', async () => {
    expect(await putSave('Q1', '{}', 1000)).toBe(false);
    expect(await getSave('Q1')).toBe('{}');
  });
});

describe('snapshot', () => {
  it('captures the dataset, theme, and blocks', () => {
    S.setFilters([{ col: 'Month', val: '2026-01' }]);
    S.setBlocks([{ id: 'b1', kind: 'chart', spec: { type: 'bar', x: 'Month' }, chart: 'live object' }]);
    const s = snapshot('Q1 review', THEME);
    expect(s.v).toBe(SNAPSHOT_V);
    expect(s.title).toBe('Q1 review');
    expect(s.file).toBe('sales.csv');
    expect(s.theme).toEqual(THEME);
    expect(s.filters).toEqual([{ col: 'Month', val: '2026-01' }]);
    expect(s.data).toHaveLength(1);
    expect(s.cols.map(c => c.name)).toEqual(['Month', 'Revenue']);
  });

  it('keeps only kind and spec per block, never the live chart', () => {
    S.setBlocks([{ id: 'b1', kind: 'chart', spec: { type: 'bar' }, chart: {}, node: {} }]);
    expect(snapshot('t', THEME).blocks).toEqual([{ kind: 'chart', spec: { type: 'bar' } }]);
  });

  it('carries the white-label flag with the theme', () => {
    const s = snapshot('t', { ...THEME, hideBrand: true });
    expect(JSON.parse(JSON.stringify(s)).theme.hideBrand).toBe(true);
  });

  it('survives a JSON round-trip', () => {
    S.setBlocks([{ id: 'b1', kind: 'card', spec: { y: 'Revenue' } }]);
    const s = snapshot('t', THEME);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('saved dashboards', () => {
  it('starts empty and tolerates a corrupt index', async () => {
    expect(await listSaves()).toEqual([]);
    await store.set(IDX_KEY, 'not json');
    expect(await listSaves()).toEqual([]);
  });

  it('writes the payload and indexes it', async () => {
    await putSave('Q1', JSON.stringify(snapshot('Q1', THEME)), 1000);
    expect(await listSaves()).toEqual([{ name: 'Q1', at: 1000 }]);
    expect(JSON.parse(await getSave('Q1')).title).toBe('Q1');
  });

  it('replaces an entry of the same name instead of duplicating it', async () => {
    await putSave('Q1', '{"a":1}', 1000);
    await putSave('Q1', '{"a":2}', 2000);
    expect(await listSaves()).toEqual([{ name: 'Q1', at: 2000 }]);
    expect(await getSave('Q1')).toBe('{"a":2}');
  });

  it('keeps distinct names side by side, in write order', async () => {
    await putSave('Q1', '{}', 1000);
    await putSave('Q2', '{}', 2000);
    expect((await listSaves()).map(s => s.name)).toEqual(['Q1', 'Q2']);
  });

  it('removes the payload and the index entry together', async () => {
    await putSave('Q1', '{}', 1000);
    await putSave('Q2', '{}', 2000);
    await removeSave('Q1');
    expect(await getSave('Q1')).toBeNull();
    expect((await listSaves()).map(s => s.name)).toEqual(['Q2']);
  });

  it('namespaces dashboard keys away from the index', () => {
    expect(dashKey('Q1')).toBe('gratti:dash:Q1');
    expect(dashKey('Q1')).not.toBe(IDX_KEY);
  });
});

describe('autosave', () => {
  it('reads back what it wrote, under its own key', async () => {
    expect(await readAutosave()).toBeNull();
    await writeAutosave('{"blocks":[]}');
    expect(await readAutosave()).toBe('{"blocks":[]}');
    expect(await store.get(AUTO_KEY)).toBe('{"blocks":[]}');
  });
});
