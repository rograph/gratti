/**
 * The aggregation pipeline: rows + spec -> {labels, names, matrix}.
 *
 * Everything here is pure. The caller passes the (already filtered) rows
 * and the column schema; nothing reads global state. This is the module
 * every chart, table, card, and map renders from, so it carries the tests.
 *
 * A spec looks like:
 * {
 *   type: 'bar'|'stack'|'stack100'|'hbar'|'line'|'area'|'combo'|'table'
 *        |'pie'|'doughnut'|'radar'|'scatter'|'map'|'choropleth'
 *        |'bar3d'|'scatter3d'|'surface3d',
 *   x: string,            // group-by column
 *   y: string|null,       // measure column (null with agg 'count')
 *   agg: 'sum'|'avg'|'count'|'min'|'max'|'pct',
 *   series: string|null,  // split/stack column
 *   dateGroup: 'raw'|'month'|'quarter'|'year',
 *   sort: 'auto'|'value-desc'|'value-asc'|'label-asc'|'label-desc',
 *   topN: number,         // 0 = all
 *   compare: 'none'|'prev'
 * }
 */

import { toNum, colType } from './types.js';
import { dateKey, prevKey } from './dates.js';

const STACKED = ['stack', 'stack100'];
export const is3D = t => typeof t === 'string' && t.endsWith('3d');
export const isStack = t => STACKED.includes(t);
export const isGeo = t => t === 'map' || t === 'choropleth';

/** Cap on category count for 3D, past which bars occlude each other. */
export const CAP_3D = 12;

/** The group key for one row under a spec (applies date rollup). */
export function keyOf(row, spec, cols) {
  if (colType(cols, spec.x) === 'date' && spec.dateGroup && spec.dateGroup !== 'raw')
    return dateKey(row[spec.x], spec.dateGroup);
  return String(row[spec.x] ?? '—');
}

/** Reduce a set of rows to one number for a measure and aggregation. */
export function reduceRows(rows, col, agg) {
  if (agg === 'count') return rows.length;
  if (!rows.length) return 0;
  const v = rows.map(r => toNum(r[col]));
  if (agg === 'avg') return v.reduce((a, b) => a + b, 0) / v.length;
  if (agg === 'min') return Math.min(...v);
  if (agg === 'max') return Math.max(...v);
  return v.reduce((a, b) => a + b, 0);
}

/** Two-level grouping: label -> series -> rows. */
export function bucket(rows, spec, cols) {
  const g = new Map();
  rows.forEach(r => {
    const k = keyOf(r, spec, cols);
    const s = spec.series ? String(r[spec.series] ?? '—') : '_';
    if (!g.has(k)) g.set(k, new Map());
    const m = g.get(k);
    if (!m.has(s)) m.set(s, []);
    m.get(s).push(r);
  });
  return g;
}

/**
 * Full aggregation. Returns:
 *   labels  ordered group labels
 *   names   series names ('_' when unsplit)
 *   matrix  matrix[seriesIndex][labelIndex] = value
 *   cut     how many labels the 3D cap removed
 *   compare prior-period values aligned to labels, or null
 */
export function aggregate(rows, spec, cols) {
  const g = bucket(rows, spec, cols);
  const agg = spec.agg === 'pct' ? 'sum' : spec.agg;
  const xt = colType(cols, spec.x);
  const grouped = xt === 'date' && spec.dateGroup && spec.dateGroup !== 'raw';
  const names = spec.series
    ? [...new Set([].concat(...[...g.values()].map(m => [...m.keys()])))]
    : ['_'];
  let labels = [...g.keys()];

  const totalOf = l => {
    const m = g.get(l) || new Map();
    return names.reduce((s, n) => s + reduceRows(m.get(n) || [], spec.y, agg), 0);
  };

  const chrono = xt === 'date' || xt === 'number' || grouped;
  const sort = spec.sort || 'auto';
  if (sort === 'label-asc' || (sort === 'auto' && chrono))
    labels.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  else if (sort === 'label-desc')
    labels.sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
  else if (sort === 'value-asc') labels.sort((a, b) => totalOf(a) - totalOf(b));
  else labels.sort((a, b) => totalOf(b) - totalOf(a));

  if (spec.topN > 0) labels = labels.slice(0, spec.topN);
  if (['pie', 'doughnut'].includes(spec.type) && !spec.topN) labels = labels.slice(0, 10);
  let cut = 0;
  if (is3D(spec.type) && labels.length > CAP_3D) {
    cut = labels.length - CAP_3D;
    labels = labels.slice(0, CAP_3D);
  }

  let matrix = names.map(n => labels.map(l => reduceRows((g.get(l) || new Map()).get(n) || [], spec.y, agg)));

  if (spec.agg === 'pct') {
    const grand = matrix.flat().reduce((a, b) => a + b, 0) || 1;
    matrix = matrix.map(r => r.map(v => v / grand * 100));
  }
  if (spec.type === 'stack100') {
    labels.forEach((_, li) => {
      const col = matrix.reduce((s, r) => s + r[li], 0) || 1;
      matrix.forEach(r => { r[li] = r[li] / col * 100; });
    });
  }

  let compare = null;
  if (spec.compare === 'prev' && grouped && !spec.series) {
    compare = labels.map(l => {
      const pk = prevKey(l, spec.dateGroup);
      return pk && g.has(pk) ? reduceRows(g.get(pk).get('_') || [], spec.y, agg) : null;
    });
  }
  return { labels, names, matrix, cut, compare };
}

/** A second measure aligned to existing labels, for combo charts. */
export function alignedSeries(rows, spec, cols, labels, col, agg) {
  const g = bucket(rows, { ...spec, series: null }, cols);
  return labels.map(l => reduceRows((g.get(l) || new Map()).get('_') || [], col, agg));
}

/**
 * Reference lines and least-squares trend for the analytics plugin.
 * Returns {lines: [{value, kind}], trend: {a, b, n} | null}.
 * Colours and labels stay in the renderer; this is only the math.
 */
export function analytics(spec, matrix) {
  const lines = [];
  if (spec.target != null && isFinite(spec.target))
    lines.push({ value: +spec.target, kind: 'target' });
  const flat = matrix.flat().filter(v => isFinite(v));
  const a = spec.analytics || {};
  if (flat.length) {
    if (a.avg) lines.push({ value: flat.reduce((x, y) => x + y, 0) / flat.length, kind: 'avg' });
    if (a.min) lines.push({ value: Math.min(...flat), kind: 'min' });
    if (a.max) lines.push({ value: Math.max(...flat), kind: 'max' });
  }
  let trend = null;
  if (a.trend && matrix.length && matrix[0].length > 1) {
    const ys = matrix[0].map((_, i) => matrix.reduce((s, r) => s + (r[i] || 0), 0));
    const n = ys.length, sx = (n - 1) * n / 2;
    const sy = ys.reduce((x, y) => x + y, 0);
    const sxy = ys.reduce((s, y, i) => s + i * y, 0);
    const sxx = ys.reduce((s, _, i) => s + i * i, 0);
    const den = n * sxx - sx * sx;
    if (den) trend = { a: (n * sxy - sx * sy) / den, b: (sy * sxx - sx * sxy) / den, n };
  }
  return { lines, trend };
}
