import { describe, it, expect } from 'vitest';
import { seal, unseal, isSealed } from '../src/crypt.js';

const SNAP = {
  title: 'Delray Cafe',
  data: [{ Month: '2026-01', Revenue: 4200 }, { Month: '2026-02', Revenue: 4610 }],
  cols: [{ name: 'Month', type: 'date' }, { name: 'Revenue', type: 'number' }],
  blocks: [{ id: 'b1', kind: 'chart', spec: { type: 'line', x: 'Month', y: 'Revenue' } }]
};

describe('seal and unseal round-trip a dashboard', () => {
  it('returns the exact snapshot for the right passphrase', async () => {
    const env = await seal(SNAP, 'correct horse battery');
    expect(await unseal(env, 'correct horse battery')).toEqual(SNAP);
  });

  it('rejects the wrong passphrase', async () => {
    const env = await seal(SNAP, 'correct horse battery');
    await expect(unseal(env, 'wrong horse')).rejects.toThrow();
  });

  it('rejects a tampered ciphertext', async () => {
    const env = await seal(SNAP, 'pw12345678');
    const bytes = atob(env.data).split('');
    bytes[4] = bytes[4] === 'A' ? 'B' : 'A';
    env.data = btoa(bytes.join(''));
    await expect(unseal(env, 'pw12345678')).rejects.toThrow();
  });

  it('rejects a non-envelope', async () => {
    await expect(unseal({ some: 'json' }, 'pw')).rejects.toThrow();
  });
});

describe('the envelope keeps its secrets', () => {
  it('never contains the plaintext', async () => {
    const env = await seal(SNAP, 'pw12345678');
    const raw = JSON.stringify(env);
    expect(raw).not.toContain('Delray');
    expect(raw).not.toContain('Revenue');
    expect(raw).not.toContain('4200');
  });

  it('uses a fresh salt and iv every time', async () => {
    const a = await seal(SNAP, 'pw12345678');
    const b = await seal(SNAP, 'pw12345678');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('is recognised by isSealed, and plain snapshots are not', async () => {
    expect(isSealed(await seal(SNAP, 'pw12345678'))).toBe(true);
    expect(isSealed(SNAP)).toBe(false);
    expect(isSealed(null)).toBe(false);
    expect(isSealed({ gratti: 'enc1' })).toBe(false);
  });

  it('survives a JSON round-trip, which is how it travels as a file', async () => {
    const env = JSON.parse(JSON.stringify(await seal(SNAP, 'pw12345678')));
    expect(await unseal(env, 'pw12345678')).toEqual(SNAP);
  });

  it('handles a dashboard large enough to matter', async () => {
    const big = { ...SNAP, data: Array.from({ length: 20000 }, (_, i) => ({ Month: '2026-01', Revenue: i })) };
    const env = await seal(big, 'pw12345678');
    expect((await unseal(env, 'pw12345678')).data).toHaveLength(20000);
  });

  it('refuses an absurd iteration count instead of hanging the page', async () => {
    const env = await seal(SNAP, 'pw12345678');
    env.iter = 100_000_000;
    await expect(unseal(env, 'pw12345678')).rejects.toThrow();
  });
});
