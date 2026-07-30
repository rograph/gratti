import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  slugFromSearch, dashboardPath, MANIFEST_PATH, loadManifest, loadDashboard
} from '../src/publish.js';

describe('slugFromSearch', () => {
  it('reads a well-formed slug', () => {
    expect(slugFromSearch('?d=coffee-shop')).toBe('coffee-shop');
    expect(slugFromSearch('?theme=ink&d=q1-2026&x=1')).toBe('q1-2026');
  });

  it('returns null when there is no slug at all', () => {
    expect(slugFromSearch('')).toBeNull();
    expect(slugFromSearch(undefined)).toBeNull();
    expect(slugFromSearch('?edit=1')).toBeNull();
    expect(slugFromSearch('?d=')).toBeNull();
  });

  /*
   * The slug is concatenated into a fetch path, so it is allowlisted rather
   * than escaped. Anything outside [a-z0-9-] reads as absent and the editor
   * opens as normal, which fails safe.
   */
  it.each([
    '?d=../../etc/passwd',
    '?d=..%2F..%2Fsecrets.json',
    '?d=/absolute',
    '?d=has space',
    '?d=Coffee-Shop',
    '?d=trailing.json',
    '?d=-leading-hyphen',
    '?d=under_score',
    '?d=https://evil.test/x',
    '?d=' + 'a'.repeat(65)
  ])('rejects %s', q => expect(slugFromSearch(q)).toBeNull());
});

describe('paths', () => {
  it('are relative, so the build works at a root, a subpath, or from disk', () => {
    expect(dashboardPath('coffee-shop')).toBe('dashboards/coffee-shop.gratti.json');
    expect(MANIFEST_PATH).toBe('dashboards/index.json');
    expect(dashboardPath('x').startsWith('/')).toBe(false);
    expect(MANIFEST_PATH.startsWith('/')).toBe(false);
  });
});

describe('loadManifest', () => {
  const ok = body => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

  beforeEach(() => { globalThis.fetch = undefined; });
  afterEach(() => { delete globalThis.fetch; });

  it('returns the entries it was given', async () => {
    globalThis.fetch = ok([{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }]);
    expect((await loadManifest()).map(d => d.slug)).toEqual(['a', 'b']);
  });

  it('drops entries whose slug would not be fetchable', async () => {
    globalThis.fetch = ok([{ slug: 'good' }, { slug: '../bad' }, { slug: 'Bad' }, {}, null]);
    expect((await loadManifest()).map(d => d.slug)).toEqual(['good']);
  });

  it('is empty rather than broken when the manifest is missing', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    expect(await loadManifest()).toEqual([]);
  });

  it('is empty rather than broken when the manifest is not a list', async () => {
    globalThis.fetch = ok({ slug: 'not-an-array' });
    expect(await loadManifest()).toEqual([]);
  });

  it('is empty rather than broken when the network throws', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('offline'); });
    expect(await loadManifest()).toEqual([]);
  });
});

describe('loadDashboard', () => {
  afterEach(() => { delete globalThis.fetch; });

  it('fetches the slug and returns the snapshot', async () => {
    const snap = { v: 5, title: 'Coffee Shop Sales', blocks: [{ kind: 'chart', spec: {} }] };
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => snap }));
    expect(await loadDashboard('coffee-shop')).toEqual(snap);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('dashboards/coffee-shop.gratti.json');
  });

  it('rejects loudly on a miss, so the caller can fall back to the editor', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    await expect(loadDashboard('nope')).rejects.toThrow('404');
  });
});
