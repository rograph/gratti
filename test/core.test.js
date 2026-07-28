import { describe, it, expect } from 'vitest';
import { fmt, fmtVal, esc, mix, tint } from '../src/core/format.js';
import { inferType, toNum, colType } from '../src/core/types.js';
import { parseDate, dateKey, prevKey } from '../src/core/dates.js';

describe('format', () => {
  it('compacts thousands and millions', () => {
    expect(fmt(1200)).toBe('1.2K');
    expect(fmt(3400000)).toBe('3.4M');
    expect(fmt(1000)).toBe('1K');
    expect(fmt(950)).toBe('950');
  });
  it('keeps two decimals for small fractions', () => {
    expect(fmt(3.14159)).toBe('3.14');
  });
  it('applies modes', () => {
    expect(fmtVal(1500, 'currency')).toBe('$1.5K');
    expect(fmtVal(1500.7, 'int')).toBe('1,501');
    expect(fmtVal(42.25, 'pct1')).toBe('42.3%');
  });
  it('handles non-finite input', () => {
    expect(fmt(NaN)).toBe('0');
    expect(fmtVal(Infinity, 'pct1')).toBe('0%');
  });
  it('escapes HTML', () => {
    expect(esc('<b>&"x"</b>')).toBe('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
  });
  it('mixes colours linearly', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('rgb(128,128,128)');
    expect(mix('#000000', '#FFFFFF', 0)).toBe('rgb(0,0,0)');
  });
  it('tints toward white', () => {
    expect(tint('#000000', 1)).toBe('rgb(255,255,255)');
  });
});

describe('types', () => {
  const rows = [
    { rev: '$1,200.50', qty: 3, month: '2026-01', city: 'Boca Raton', flag: 1 },
    { rev: '$980.00', qty: 5, month: '2026-02', city: 'Delray Beach', flag: 0 },
    { rev: '$1,010.25', qty: 4, month: '2026-03', city: 'Lake Worth', flag: 1 },
  ];
  it('detects numbers through currency formatting', () => {
    expect(inferType('rev', rows)).toBe('number');
    expect(inferType('qty', rows)).toBe('number');
  });
  it('detects ISO month dates', () => {
    expect(inferType('month', rows)).toBe('date');
  });
  it('detects categories', () => {
    expect(inferType('city', rows)).toBe('category');
  });
  it('treats a two-value integer column as a category, not a measure', () => {
    expect(inferType('flag', rows)).toBe('category');
  });
  it('coerces messy numerics and defaults bad input to 0', () => {
    expect(toNum('$1,234.50')).toBe(1234.5);
    expect(toNum('12%')).toBe(12);
    expect(toNum('abc')).toBe(0);
    expect(toNum(null)).toBe(0);
  });
  it('looks up column types from a schema', () => {
    const cols = [{ name: 'a', type: 'date' }];
    expect(colType(cols, 'a')).toBe('date');
    expect(colType(cols, 'missing')).toBeUndefined();
  });
});

describe('dates', () => {
  it('parses ISO and US formats', () => {
    expect(parseDate('2026-03-15')).toEqual({ y: 2026, m: 3, d: 15 });
    expect(parseDate('2026-03')).toEqual({ y: 2026, m: 3, d: 1 });
    expect(parseDate('3/15/2026')).toEqual({ y: 2026, m: 3, d: 15 });
    expect(parseDate('3/15/26')).toEqual({ y: 2026, m: 3, d: 15 });
  });
  it('rolls up to month, quarter, year', () => {
    expect(dateKey('2026-03-15', 'month')).toBe('2026-03');
    expect(dateKey('2026-03-15', 'quarter')).toBe('2026 Q1');
    expect(dateKey('2026-11-02', 'quarter')).toBe('2026 Q4');
    expect(dateKey('2026-03-15', 'year')).toBe('2026');
  });
  it('passes unparseable values through unchanged', () => {
    expect(dateKey('not a date at all §', 'month')).toBe('not a date at all §');
  });
  it('steps back one period, including across year boundaries', () => {
    expect(prevKey('2026-02', 'month')).toBe('2026-01');
    expect(prevKey('2026-01', 'month')).toBe('2025-12');
    expect(prevKey('2026 Q1', 'quarter')).toBe('2025 Q4');
    expect(prevKey('2026 Q3', 'quarter')).toBe('2026 Q2');
    expect(prevKey('2026', 'year')).toBe('2025');
  });
  it('returns null for keys that do not match the group shape', () => {
    expect(prevKey('garbage', 'month')).toBeNull();
    expect(prevKey('2026-01', 'quarter')).toBeNull();
  });
});
