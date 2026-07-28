/**
 * Column type inference and numeric coercion.
 * A column is one of: 'number' | 'date' | 'category'.
 */

export const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

/**
 * Infer a column's type from up to 60 sample values.
 * Small sets of round integers read as categories (store number, flag),
 * not measures.
 */
export function inferType(name, rows) {
  const v = rows.map(r => r[name]).filter(x => x !== null && x !== undefined && x !== '').slice(0, 60);
  if (!v.length) return 'category';
  if (v.every(x => DATE_RE.test(String(x).trim()))) return 'date';
  if (v.every(x => typeof x === 'number' || (String(x).trim() !== '' && !isNaN(Number(String(x).replace(/[$,%\s,]/g, '')))))) {
    const u = new Set(v.map(Number));
    if (u.size <= 2 && v.every(x => Number.isInteger(Number(x)))) return 'category';
    return 'number';
  }
  return 'category';
}

/** Coerce a cell to a number, stripping $ , % and whitespace. Bad input -> 0. */
export function toNum(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[$,%\s,]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Look up a column's type from a schema array [{name, type}]. */
export function colType(cols, name) {
  return (cols.find(c => c.name === name) || {}).type;
}
