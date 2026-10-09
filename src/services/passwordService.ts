/**
 * Password credentials.
 *
 * The app authenticates on the client (it has no server session), so the stored
 * credential doubles as the verifier. Plaintext passwords are therefore never
 * persisted: what we keep is a salted, iterated SHA-256 digest in the form
 *
 *   sha256$<iterations>$<saltBase64>$<hashBase64>
 *
 * A random per-user salt means two employees with the same password never share
 * a digest, and the iteration count slows an offline dictionary attack. The
 * format is deliberately computable in Postgres (see
 * supabase/secure_user_credentials.sql) so existing rows can be migrated in one
 * statement without a custom extension.
 */

const ALGO = 'sha256';
const ITERATIONS = 10000;
const SALT_BYTES = 16;
const PREFIX = `${ALGO}$${ITERATIONS}$`;

// Postgres base64 output can be line-wrapped, so normalise before comparing.
const normalizeCredential = (value: string): string => (value || '').replace(/\s+/g, '');

export function isHashedCredential(stored: string | undefined | null): boolean {
  return typeof stored === 'string' && normalizeCredential(stored).startsWith(PREFIX) && normalizeCredential(stored).split('$').length === 4;
}

export function isLegacyPlaintext(stored: string | undefined | null): boolean {
  return typeof stored === 'string' && stored.trim().length > 0 && !isHashedCredential(stored);
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

let subtleDigest: ((data: Uint8Array) => Promise<Uint8Array>) | null = null;

async function digestBytes(data: Uint8Array): Promise<Uint8Array> {
  if (subtleDigest === null) {
    subtleDigest = typeof crypto !== 'undefined' && crypto.subtle
      ? async (input: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', input))
      : sha256Fallback;
  }
  return subtleDigest(data);
}

async function hashWithSalt(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  let block = new Uint8Array(salt.length + 1 + utf8(password).length);
  block.set(salt, 0);
  block[salt.length] = 0x3a; // ':' separator, same as the SQL migration
  block.set(utf8(password), salt.length + 1);
  let digest = await digestBytes(block);
  for (let i = 1; i < iterations; i++) digest = await digestBytes(digest);
  return toBase64(digest);
}

export async function hashPassword(password: string): Promise<string> {
  const clean = (password || '').trim();
  if (!clean) return '';
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await hashWithSalt(clean, salt, ITERATIONS);
  return `${PREFIX}${toBase64(salt)}$${hash}`;
}

export interface VerifyResult {
  valid: boolean;
  /** True when the stored credential was plaintext and should be upgraded. */
  legacy: boolean;
}

export async function verifyPassword(
  password: string,
  stored: string | undefined | null
): Promise<VerifyResult> {
  const clean = (password || '').trim();
  const value = normalizeCredential(stored || '').trim();
  if (!clean || !value) return { valid: false, legacy: false };

  if (!isHashedCredential(value)) {
    return { valid: value === clean, legacy: true };
  }

  const [, iterationText, saltPart, expectedPart] = value.split('$');
  const iterations = Number(iterationText);
  if (!iterations || iterations < 1 || !saltPart || !expectedPart) {
    return { valid: false, legacy: false };
  }

  const computed = await hashWithSalt(clean, fromBase64(saltPart), iterations);
  return { valid: constantTimeEquals(computed, expectedPart), legacy: false };
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Boundary guard for every write path: a credential that is still plaintext is
 * hashed here, so no code path can store a readable password by accident.
 */
export async function withHashedCredential<T extends { password?: string }>(user: T): Promise<T> {
  const stored = user.password || '';
  if (!stored.trim() || isHashedCredential(stored)) return user;
  return { ...user, password: await hashPassword(stored) };
}

// --- SHA-256 fallback for insecure contexts where crypto.subtle is unavailable ---

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

async function sha256Fallback(message: Uint8Array): Promise<Uint8Array> {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLength = message.length * 8;
  const padded = new Uint8Array(((message.length + 9 + 63) >> 6) << 6);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((value, index) => outView.setUint32(index * 4, value, false));
  return out;
}

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/** Exposed for tests: verifies the fallback matches the platform digest. */
export const __testing = { hashWithSalt, sha256Fallback, toBase64 };