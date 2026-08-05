/**
 * Pure-TypeScript SHA-256.
 *
 * Why not Web Crypto: `crypto.subtle.digest` is async and only guaranteed inside
 * Convex *actions*, while the document integrity hash has to be computed in the
 * same transactional *mutation* that stores the content. Computing it on the
 * client and trusting the value would defeat the purpose — an integrity hash the
 * server never verified proves nothing.
 *
 * Deterministic and dependency-free, so it is safe in the Convex query/mutation
 * runtime. Only used for short document bodies, where throughput is irrelevant.
 */

/** SHA-256 round constants: first 32 bits of the fractional parts of cbrt(prime). */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

/** Initial hash values: first 32 bits of the fractional parts of sqrt(prime). */
const H0 = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * Encode a string as UTF-8 bytes.
 *
 * `TextEncoder` exists in the Convex runtime, but this fallback keeps the module
 * usable anywhere (and avoids surprises with lone surrogates, which are encoded
 * as U+FFFD exactly like TextEncoder does).
 */
function utf8Bytes(input: string): number[] {
  if (typeof TextEncoder !== 'undefined') {
    return Array.from(new TextEncoder().encode(input));
  }
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xd800 && code <= 0xdfff) {
      code = 0xfffd;
    }

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** Lowercase hex SHA-256 digest of a UTF-8 string. */
export function sha256Hex(message: string): string {
  const bytes = utf8Bytes(message);
  const bitLength = bytes.length * 8;

  // Padding: 0x80, then zeros until length ≡ 56 (mod 64), then the 64-bit length.
  const padded = bytes.slice();
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  // JS bitwise ops are 32-bit, so split the length across two 32-bit words.
  const highLength = Math.floor(bitLength / 0x100000000);
  const lowLength = bitLength >>> 0;
  padded.push(
    (highLength >>> 24) & 0xff,
    (highLength >>> 16) & 0xff,
    (highLength >>> 8) & 0xff,
    highLength & 0xff,
    (lowLength >>> 24) & 0xff,
    (lowLength >>> 16) & 0xff,
    (lowLength >>> 8) & 0xff,
    lowLength & 0xff,
  );

  const hash: number[] = [...H0];
  const w = new Array<number>(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] =
        (((padded[j] ?? 0) << 24) |
          ((padded[j + 1] ?? 0) << 16) |
          ((padded[j + 2] ?? 0) << 8) |
          (padded[j + 3] ?? 0)) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0) as number;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25);
      const ch = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + S1 + ch + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d! + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + a!) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b!) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c!) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d!) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e!) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f!) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g!) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h!) >>> 0;
  }

  return hash.map((word) => (word >>> 0).toString(16).padStart(8, '0')).join('');
}
