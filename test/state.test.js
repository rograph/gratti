import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/state.js';

const ROWS = [
  { Month: '2026-01', Store: 'Lake Worth', Units: 12, Revenue: 48.5 },
  { Month: '2026-02', Store: 'Delray', Units: 9, Revenue: 33.0 },
  { Month: '2026-02', Store: 'Lake Worth', Units: 4, Revenue: 15.25 }
];
const SCHEMA = [
  { name: 'Month', type: 'date' },
  { name: 'Store', type: 'category' },
  { name: 'Units', type: 'number' },
  { name: 'Revenue', type: 'number' }
];

beforeEach(() => {
  S.setDataset();
  S.clearFilters();
  S.setBlocks([]);
  S.setSel(null);
  S.setPaneMode('data');
  S.setAiState('unknown');
  S.setDragId(null);
});

describe('setters write through to the live bindings', () => {
  it('setDataset swaps data, cols, and file together', () => {
    S.setDataset({ data: ROWS, cols: SCHEMA, file: 'sales.csv' });
    expect(S.DATA).toHaveLength(3);
    expect(S.COLS).toHaveLength(4);
    expect(S.FILE).toBe('sales.csv');
  });

  it('setDataset with no argument empties everything', () => {
    S.setDataset({ data: ROWS, cols: SCHEMA, file: 'sales.csv' });
    S.setDataset();
    expect(S.DATA).toEqual([]);
    expect(S.COLS).toEqual([]);
    expect(S.FILE).toBe('');
  });

  it('clearFilters drops the strip and the cross-filter', () => {
    S.setFilters([{ col: 'Store', val: 'Delray' }]);
    S.setCrossFilter({ col: 'Month', val: '2026-02' });
    S.clearFilters();
    expect(S.FILTERS).toEqual([]);
    expect(S.CROSS).toBeNull();
  });

  it('tracks selection, pane mode, drag, and AI state', () => {
    S.setSel('b3'); S.setPaneMode('block'); S.setDragId('b3'); S.setAiState('off');
    expect([S.SEL, S.PANE_MODE, S.dragId, S.AI_STATE]).toEqual(['b3', 'block', 'b3', 'off']);
  });
});

describe('nextId', () => {
  it('never repeats', () => {
    const ids = Array.from({ length: 50 }, () => S.nextId());
    expect(new Set(ids).size).toBe(50);
    expect(ids[0]).toMatch(/^b\d+$/);
  });
});

describe('derived schema helpers', () => {
  beforeEach(() => S.setDataset({ data: ROWS, cols: SCHEMA, file: 'sales.csv' }));

  it('reads a column type, and undefined for an unknown name', () => {
    expect(S.colTypeOf('Revenue')).toBe('number');
    expect(S.colTypeOf('Nope')).toBeUndefined();
  });

  it('splits measures from everything else', () => {
    expect(S.numCols().map(c => c.name)).toEqual(['Units', 'Revenue']);
    expect(S.catCols().map(c => c.name)).toEqual(['Month', 'Store']);
    expect(S.dateCols().map(c => c.name)).toEqual(['Month']);
  });

  it('offers only low-cardinality categories as filters', () => {
    expect(S.filterCols().map(c => c.name)).toEqual(['Month', 'Store']);
    const wide = Array.from({ length: 41 }, (_, i) => ({ Id: 'x' + i }));
    S.setDataset({ data: wide, cols: [{ name: 'Id', type: 'category' }] });
    expect(S.filterCols()).toEqual([]);
  });
});
