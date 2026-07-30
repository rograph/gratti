/**
 * Regenerate public/dashboards/index.json from whatever is in the folder.
 *
 * Publishing a dashboard is two steps: export it from the app, drop the file
 * in as `<slug>.gratti.json`, then run `npm run dashboards`. The slug in the
 * filename is the slug in the URL. Nothing is hand-maintained.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'public/dashboards';
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const files = (await readdir(DIR).catch(() => []))
  .filter(f => f.endsWith('.gratti.json'));

const entries = [];
for (const file of files) {
  const slug = file.replace(/\.gratti\.json$/, '');
  if (!SLUG.test(slug)) {
    console.warn(`skipped ${file}: slug must be lowercase letters, digits and hyphens`);
    continue;
  }
  let snap;
  try {
    snap = JSON.parse(await readFile(join(DIR, file), 'utf8'));
  } catch (e) {
    console.warn(`skipped ${file}: not readable JSON`);
    continue;
  }
  /* A sealed dashboard is an encrypted envelope: no readable title, rows or
     blocks. Index it by slug so it shows in the owner's gallery, and say so. */
  if (snap && snap.gratti === 'enc1' && typeof snap.data === 'string') {
    entries.push({ slug, title: `${slug} (protected)`, rows: 0, blocks: 0, sealed: true });
    continue;
  }
  if (!snap || !Array.isArray(snap.blocks)) {
    console.warn(`skipped ${file}: no blocks, so it is not a dashboard`);
    continue;
  }
  entries.push({
    slug,
    title: snap.title || slug,
    rows: Array.isArray(snap.data) ? snap.data.length : 0,
    blocks: snap.blocks.length
  });
}

entries.sort((a, b) => a.title.localeCompare(b.title));
await writeFile(join(DIR, 'index.json'), JSON.stringify(entries, null, 2) + '\n');

console.log(`${entries.length} dashboard${entries.length === 1 ? '' : 's'} indexed`);
for (const e of entries) console.log(`  ?d=${e.slug}  ${e.title}  (${e.rows} rows, ${e.blocks} blocks)`);
