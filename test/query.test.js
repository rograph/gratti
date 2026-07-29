import { describe, it, expect, beforeEach } from 'vitest';
import * as S from '../src/state.js';
import { rows, bucket, aggregate, alignedSeries, analyticsOpts } from '../src/query.js';

const DATA = [
  { Month: '2026-01', Store: 'Lake Worth', Channel: 'In-store', Units: 10, Revenue: 100 },
  { Month: '2026-01', Store: 'Lake Worth', Channel: 'Online', Units: 5, Revenue: 50 },
  { Month: '2026-01', Store: 'Delray', Channel: 'In-store', Units: 8, Revenue: 80 },
  { Month: '2026-02', Store: 'Lake Worth', Channel: 'In-store', Units: 20, Revenue: 200 },
  { Month: '2026-02', Store: 'Delray', Channel: 'Online', Units: 2, Revenue: 20 }
];
const COLS = [
  { name: 'Month', type: 'date' }, { name: 'Store', type: 'category' },
  { name: 'Channel', type: 'category' }, { name: 'Units', type: 'number' },
  { name: 'Revenue', type: 'number' }
];
const SPEC = { type: 'bar', x: 'Store', y: 'Revenue', agg: 'sum', dateGroup: 'raw', sort: 'label-asc', topN: 0 };

beforeEach(() => {
  S.setDataset({ data: DATA, cols: COLS, file: 'sales.csv' });
  S.clearFilters();
  S.setBlocks([]);
});

describe('rows', () => {
  it('returns everything when nothing is filtering', () => {
    expect(rows()).toHaveLength(5);
  });

  it('applies the filter strip, and ignores an inactive entry', () => {
    S.setFilters([{ col: 'Store', val: 'Delray' }]);
    expect(rows()).toHaveLength(2);
    S.setFilters([{ col: 'Store', val: '__all__' }]);
    expect(rows()).toHaveLength(5);
  });

  it('applies the cross-filter, unless the caller owns that column', () => {
    S.setCrossFilter({ col: 'Store', val: 'Delray' });
    expect(rows()).toHaveLength(2);
    expect(rows('Store')).toHaveLength(5);
  });

  it('applies slicer blocks, and skips the one being interacted with', () => {
    S.setBlocks([{ id: 'b1', kind: 'slicer', spec: { col: 'Channel', picked: ['Online'] } }]);
    expect(rows()).toHaveLength(2);
    expect(rows(null, 'b1')).toHaveLength(5);
  });

  it('ignores a slicer with nothing picked, and non-slicer blocks', () => {
    S.setBlocks([
      { id: 'b1', kind: 'slicer', spec: { col: 'Channel', picked: [] } },
      { id: 'b2', kind: 'chart', spec: { col: 'Channel', picked: ['Online'] } }
    ]);
    expect(rows()).toHaveLength(5);
  });

  it('stacks the strip, the cross-filter, and a slicer together', () => {
    S.setFilters([{ col: 'Month', val: '2026-01' }]);
    S.setCrossFilter({ col: 'Store', val: 'Lake Worth' });
    S.setBlocks([{ id: 'b1', kind: 'slicer', spec: { col: 'Channel', picked: ['In-store'] } }]);
    expect(rows()).toEqual([DATA[0]]);
  });
});

describe('the pipeline adapters see the filtered rows', () => {
  it('aggregate groups the full set by default', () => {
    const { labels, matrix } = aggregate(SPEC);
    expect(labels).toEqual(['Delray', 'Lake Worth']);
    expect(matrix[0]).toEqual([100, 350]);
  });

  it('aggregate narrows when a filter is active', () => {
    S.setFilters([{ col: 'Month', val: '2026-01' }]);
    const { labels, matrix } = aggregate(SPEC);
    expect(labels).toEqual(['Delray', 'Lake Worth']);
    expect(matrix[0]).toEqual([80, 150]);
  });

  it('aggregate keeps a chart its own bars when it owns the cross-filter', () => {
    S.setCrossFilter({ col: 'Store', val: 'Delray' });
    expect(aggregate(SPEC).labels).toEqual(['Delray', 'Lake Worth']);
  });

  it('bucket groups rows by label', () => {
    const g = bucket(SPEC);
    expect([...g.keys()].sort()).toEqual(['Delray', 'Lake Worth']);
    expect(g.get('Delray').get('_')).toHaveLength(2);
  });

  it('alignedSeries lines a second measure up with existing labels', () => {
    expect(alignedSeries(SPEC, ['Delray', 'Lake Worth'], 'Units', 'sum')).toEqual([10, 35]);
    expect(alignedSeries(SPEC, ['Lake Worth', 'Nowhere'], 'Units', 'sum')).toEqual([35, 0]);
  });
});

describe('analyticsOpts', () => {
  const matrix = [[10, 20, 30]];

  it('returns nothing to draw when nothing was asked for', () => {
    expect(analyticsOpts({ analytics: {} }, matrix, 'auto')).toEqual({ lines: [], trend: null });
  });

  it('labels each line with its formatted value', () => {
    const { lines } = analyticsOpts({ target: 25, analytics: { avg: true, min: true, max: true } }, matrix, 'currency');
    expect(lines.map(l => l.label)).toEqual(['Target $25', 'Avg $20', 'Min $10', 'Max $30']);
    expect(lines.map(l => l.value)).toEqual([25, 20, 10, 30]);
  });

  it('gives every line a colour and a dash pattern', () => {
    const { lines } = analyticsOpts({ analytics: { avg: true } }, matrix, 'auto');
    expect(lines[0].color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(lines[0].dash).toHaveLength(2);
  });

  it('carries the trend through with its own colour', () => {
    const { trend } = analyticsOpts({ analytics: { trend: true } }, matrix, 'auto');
    expect(trend.a).toBeCloseTo(10);
    expect(trend.b).toBeCloseTo(10);
    expect(trend.color).toBe('#8A93A3');
  });

  it('skips a target that is not a finite number', () => {
    expect(analyticsOpts({ target: 'soon', analytics: {} }, matrix, 'auto').lines).toEqual([]);
  });
});
