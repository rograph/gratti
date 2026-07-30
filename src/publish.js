/**
 * Published dashboards.
 *
 * A dashboard becomes shareable by living as a file under
 * `public/dashboards/`. The app reads `?d=<slug>` off the URL, fetches
 * `dashboards/<slug>.gratti.json`, and boots read-only. `index.json` in the
 * same folder is the list the gallery renders, and `npm run dashboards`
 * regenerates it from whatever files are present.
 *
 * Paths are relative on purpose, so the same build works at a domain root,
 * under a Pages subpath, or from disk.
 *
 * No DOM. main.js decides what to do with what comes back.
 */

/**
 * A slug goes straight into a fetch path, so it is allowlisted rather than
 * escaped: lowercase, digits, hyphens, no leading hyphen, no dots and no
 * slashes. Anything else reads as absent and the editor opens as normal.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function slugFromSearch(search) {
  let v;
  try { v = new URLSearchParams(search || '').get('d'); } catch (e) { return null; }
  return v && SLUG.test(v) ? v : null;
}

export const MANIFEST_PATH = 'dashboards/index.json';
export const dashboardPath = slug => `dashboards/${slug}.gratti.json`;

async function readJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

/** The gallery list. A missing or malformed manifest is simply an empty one. */
export async function loadManifest() {
  try {
    const list = await readJSON(MANIFEST_PATH);
    return Array.isArray(list) ? list.filter(d => d && SLUG.test(String(d.slug || ''))) : [];
  } catch (e) {
    return [];
  }
}

/** One published dashboard, in the same shape snapshot() produces. */
export function loadDashboard(slug) {
  return readJSON(dashboardPath(slug));
}
