/**
 * Passphrase protection for dashboard files.
 *
 * A sealed dashboard is an envelope: the snapshot JSON encrypted with
 * AES-256-GCM under a key derived from a passphrase with PBKDF2-SHA-256.
 * The envelope is safe to publish anywhere, including a public static host:
 * without the passphrase it is noise, and GCM means a flipped byte fails
 * closed instead of decrypting to garbage.
 *
 * The passphrase is never stored and never travels with the file. Losing it
 * means the file stays locked; that is the deal, and the UI says so.
 *
 * No DOM. Uses WebCrypto, which exists in every browser Gratti supports and
 * in Node for the tests.
 */

const VERSION = 'enc1';
const ITER = 310000;          // OWASP's PBKDF2-SHA-256 floor, with margin
const ITER_MAX = 5000000;     // refuse a hostile file that would hang the page

const te = new TextEncoder(), td = new TextDecoder();

/* Chunked conversions: String.fromCharCode(...bytes) overflows the argument
   list on a dashboard of any real size. */
function b64(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000)
    s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function bytes(s) {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export function isSealed(o) {
  return !!o && o.gratti === VERSION &&
    typeof o.data === 'string' && typeof o.salt === 'string' && typeof o.iv === 'string';
}

async function deriveKey(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Snapshot object in, envelope object out. */
export async function seal(snapshot, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITER);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(snapshot)));
  return { gratti: VERSION, kdf: 'pbkdf2-sha256', iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

/** Envelope object in, snapshot object out. Throws on anything wrong. */
export async function unseal(envelope, passphrase) {
  if (!isSealed(envelope)) throw new Error('not a sealed dashboard');
  const iter = +envelope.iter;
  if (!Number.isFinite(iter) || iter < 1 || iter > ITER_MAX) throw new Error('bad iteration count');
  const key = await deriveKey(passphrase, bytes(envelope.salt), iter);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes(envelope.iv) }, key, bytes(envelope.data));
  return JSON.parse(td.decode(plain));
}
