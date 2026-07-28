/**
 * Number and string formatting.
 * Pure functions, no DOM, no globals.
 */

/** Compact number: 1200 -> "1.2K", 3400000 -> "3.4M". */
export function fmt(n) {
  if (!isFinite(n)) return '0';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.abs(n) < 10 && n % 1 !== 0 ? n.toFixed(2) : Math.round(n).toLocaleString();
}

/** Mode-aware value formatting. Modes: auto | currency | int | pct1 */
export function fmtVal(n, mode) {
  if (mode === 'currency') return '$' + fmt(n);
  if (mode === 'int') return Math.round(n).toLocaleString();
  if (mode === 'pct1') return (isFinite(n) ? n.toFixed(1) : '0') + '%';
  return fmt(n);
}

/** HTML-escape for interpolating untrusted strings into markup. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

/** Lighten a hex colour toward white. amt in [0,1]. */
export function tint(hex, amt) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.round(v + (255 - v) * amt);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/** Linear blend between two hex colours. t in [0,1]. */
export function mix(a, b, t) {
  const p = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b), k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
}
