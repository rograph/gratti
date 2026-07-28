import { describe, it, expect } from 'vitest';
import { aggregate, reduceRows, alignedSeries, analytics, CAP_3D } from '../src/core/pipeline.js';
import { filterRows } from '../src/core/filter.js';

const cols = [
  { name: 'Month', type: 'date' },
  { name: 'City', type: 'category' },
  { name: 'Cat', type: 'category' },
  { name: 'Rev', type: 'number' },
  { name: 'Units', type: 'number' },
];

// Two months, two cities, two categories. Hand-checkable numbers.
const rows = [
  { Month: '2026-01', City: 'Boca', Cat: 'Coffee', Rev: 100, Units: 10 },
  { Month: '2026-01', City: 'Boca', Cat: 'Juice', Rev: 50, Units: 5 },
  { Month: '2026-01', City: 'Delray', Cat: 'Coffee', Rev: 80, Units: 8 },
  { Month: '2026-02', City: 'Boca', Cat: 'Coffee', Rev: 120, Units: 12 },
  { Month: '2026-02', City: 'Delray', Cat: 'Coffee', Rev: 90, Units: 9 },
  { Month: '2026-02', City: 'Delray', Cat: 'Juice', Rev: 60, Units: 6 },
];

const spec = over => ({
  type: 'bar', x: 'City', y: 'Rev', agg: 'sum', series: null,
  dateGroup: 'raw', sort: 'auto', topN: 0, compare: 'none', ...over,
});

describe('reduceRows', () => {
  const rs = rows.slice(0, 3);
  it('sums, averages, counts, mins, maxes', () => {
    expect(reduceRows(rs, 'Rev', 'sum')).toBe(230);
    expect(reduceRows(rs, 'Rev', 'avg')).toBeCloseTo(230 / 3);
    expect(reduceRows(rs, 'Rev', 'count')).toBe(3);
    expect(reduceRows(rs, 'Rev', 'min')).toBe(50);
    expect(reduceRows(rs, 'Rev', 'max')).toBe(100);
  });
  it('returns 0 for an empty group except under count', () => {
    expect(reduceRows([], 'Rev', 'sum')).toBe(0);
    expect(reduceRows([], 'Rev', 'count')).toBe(0);
  });
});

describe('aggregate', () => {
  it('groups and sums by category, sorted by value descending', () => {
    const { labels, matrix } = aggregate(rows, spec(), cols);
    expect(labels).toEqual(['Boca', 'Delray']); // 270 vs 230
    expect(matrix).toEqual([[270, 230]]);
  });
  it('sorts date axes chronologically regardless of totals', () => {
    const { labels } = aggregate(rows, spec({ x: 'Month' }), cols);
    expect(labels).toEqual(['2026-01', '2026-02']);
  });
  it('rolls dates up and compares to the prior period', () => {
    const { labels, matrix, compare } = aggregate(
      rows, spec({ x: 'Month', dateGroup: 'month', compare: 'prev' }), cols);
    expect(labels).toEqual(['2026-01', '2026-02']);
    expect(matrix).toEqual([[230, 270]]);
    // Jan has no prior month in the data; Feb's prior is Jan's 230.
    expect(compare).toEqual([null, 230]);
  });
  it('splits into series with a full matrix', () => {
    const { labels, names, matrix } = aggregate(rows, spec({ series: 'Cat' }), cols);
    expect(labels).toEqual(['Boca', 'Delray']);
    expect(names).toEqual(['Coffee', 'Juice']);
    expect(matrix).toEqual([[220, 170], [50, 60]]);
  });
  it('normalizes stack100 columns to 100', () => {
    const { matrix } = aggregate(rows, spec({ type: 'stack100', series: 'Cat' }), cols);
    const colTotals = matrix[0].map((_, i) => matrix.reduce((s, r) => s + r[i], 0));
    colTotals.forEach(t => expect(t).toBeCloseTo(100));
    // Boca: 220 of 270 coffee
    expect(matrix[0][0]).toBeCloseTo(220 / 270 * 100);
  });
  it('converts pct agg to share of grand total', () => {
    const { matrix } = aggregate(rows, spec({ agg: 'pct' }), cols);
    expect(matrix[0][0] + matrix[0][1]).toBeCloseTo(100);
    expect(matrix[0][0]).toBeCloseTo(270 / 500 * 100);
  });
  it('applies sort overrides and topN', () => {
    const asc = aggregate(rows, spec({ sort: 'value-asc' }), cols);
    expect(asc.labels).toEqual(['Delray', 'Boca']);
    const alpha = aggregate(rows, spec({ sort: 'label-asc' }), cols);
    expect(alpha.labels).toEqual(['Boca', 'Delray']);
    const top1 = aggregate(rows, spec({ topN: 1 }), cols);
    expect(top1.labels).toEqual(['Boca']);
  });
  it('caps 3D categories and reports the cut', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ City: 'C' + i, Rev: i + 1 }));
    const mcols = [{ name: 'City', type: 'category' }, { name: 'Rev', type: 'number' }];
    const { labels, cut } = aggregate(many, spec({ type: 'bar3d' }), mcols);
    expect(labels.length).toBe(CAP_3D);
    expect(cut).toBe(20 - CAP_3D);
  });
  it('caps pies at 10 slices unless topN is set', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ City: 'C' + i, Rev: i + 1 }));
    const mcols = [{ name: 'City', type: 'category' }, { name: 'Rev', type: 'number' }];
    expect(aggregate(many, spec({ type: 'pie' }), mcols).labels.length).toBe(10);
    expect(aggregate(many, spec({ type: 'pie', topN: 3 }), mcols).labels.length).toBe(3);
  });
});

describe('alignedSeries', () => {
  it('aligns a second measure to given labels', () => {
    const { labels } = aggregate(rows, spec(), cols);
    const units = alignedSeries(rows, spec(), cols, labels, 'Units', 'sum');
    expect(units).toEqual([27, 23]);
  });
});

describe('analytics', () => {
  it('computes reference lines from the visible matrix', () => {
    const { lines } = analytics(
      { target: 250, analytics: { avg: true, min: true, max: true } },
      [[270, 230]]);
    const byKind = Object.fromEntries(lines.map(l => [l.kind, l.value]));
    expect(byKind.target).toBe(250);
    expect(byKind.avg).toBe(250);
    expect(byKind.min).toBe(230);
    expect(byKind.max).toBe(270);
  });
  it('fits a least-squares trend', () => {
    const { trend } = analytics({ analytics: { trend: true } }, [[10, 20, 30, 40]]);
    expect(trend.a).toBeCloseTo(10);
    expect(trend.b).toBeCloseTo(10);
    expect(trend.n).toBe(4);
  });
  it('sums split series before fitting the trend', () => {
    const { trend } = analytics({ analytics: { trend: true } }, [[5, 10, 15], [5, 10, 15]]);
    expect(trend.a).toBeCloseTo(10);
  });
});

describe('filterRows', () => {
  it('combines strip filters, cross-filter, and slicers with AND', () => {
    const out = filterRows(rows, {
      filters: [{ col: 'Cat', val: 'Coffee' }],
      cross: { col: 'Month', val: '2026-02' },
      slicers: [{ col: 'City', picked: ['Delray'] }],
    });
    expect(out).toEqual([{ Month: '2026-02', City: 'Delray', Cat: 'Coffee', Rev: 90, Units: 9 }]);
  });
  it('skips the cross-filter for the chart that owns it', () => {
    const out = filterRows(rows, { cross: { col: 'City', val: 'Boca' }, skipCol: 'City' });
    expect(out.length).toBe(6);
  });
  it('skips the slicer being interacted with', () => {
    const out = filterRows(rows, {
      slicers: [{ col: 'City', picked: ['Boca'] }],
      skipSlicerIdx: 0,
    });
    expect(out.length).toBe(6);
  });
  it('treats empty selections and __all__ as inactive', () => {
    const out = filterRows(rows, {
      filters: [{ col: 'Cat', val: '__all__' }],
      slicers: [{ col: 'City', picked: [] }],
    });
    expect(out.length).toBe(6);
  });
});
