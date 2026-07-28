/**
 * Date parsing and period grouping.
 * Supports ISO (2026-03, 2026-03-15) and US (3/15/2026) inputs.
 * Rollups: raw | month | quarter | year.
 */

/** Parse to {y, m, d} or null. Two-digit years read as 20xx. */
export function parseDate(v) {
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (m) return { y: +m[1], m: +m[2], d: m[3] ? +m[3] : 1 };
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return { y, m: +m[1], d: +m[2] }; }
  const dt = new Date(s);
  return isNaN(dt) ? null : { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** Group a date value into a period key: "2026" | "2026 Q1" | "2026-03" | raw. */
export function dateKey(v, group) {
  const p = parseDate(v);
  if (!p) return String(v ?? '—');
  const mm = String(p.m).padStart(2, '0');
  if (group === 'year') return String(p.y);
  if (group === 'quarter') return `${p.y} Q${Math.ceil(p.m / 3)}`;
  if (group === 'month') return `${p.y}-${mm}`;
  return String(v);
}

/**
 * The key one period earlier, for prior-period comparison.
 * Handles year boundaries: "2026-01" -> "2025-12", "2026 Q1" -> "2025 Q4".
 * Returns null when the key does not match the group's shape.
 */
export function prevKey(k, group) {
  if (group === 'year') return String(+k - 1);
  if (group === 'quarter') {
    const m = k.match(/^(\d{4}) Q(\d)$/);
    if (!m) return null;
    let y = +m[1], q = +m[2] - 1;
    if (q < 1) { q = 4; y--; }
    return `${y} Q${q}`;
  }
  if (group === 'month') {
    const m = k.match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    let y = +m[1], mo = +m[2] - 1;
    if (mo < 1) { mo = 12; y--; }
    return `${y}-${String(mo).padStart(2, '0')}`;
  }
  return null;
}
