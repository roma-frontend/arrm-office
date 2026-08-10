/**
 * SHA-256 correctness tests.
 *
 * A hand-written hash is only useful if it is provably the real algorithm, so
 * these check the published NIST vectors plus multi-byte input (Armenian and
 * Cyrillic are the whole point of this project) and the block-boundary cases
 * where padding logic usually breaks.
 */
import { createHash } from 'node:crypto';
import { sha256Hex } from '../../convex/lib/sha256';

describe('sha256Hex — known vectors', () => {
  it('hashes the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the 448-bit NIST vector', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('hashes a million "a" characters', () => {
    expect(sha256Hex('a'.repeat(1000000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });
});

describe('sha256Hex — agreement with node:crypto', () => {
  const cases: Array<[string, string]> = [
    ['single byte', 'a'],
    ['exactly 55 bytes (last size that fits one block)', 'x'.repeat(55)],
    ['exactly 56 bytes (forces a second block)', 'x'.repeat(56)],
    ['exactly 64 bytes (full block)', 'x'.repeat(64)],
    ['exactly 65 bytes', 'x'.repeat(65)],
    ['Armenian', 'Աշխատանքային պայմանագիր'],
    ['Cyrillic', 'Трудовой договор №15'],
    ['German umlauts', 'Arbeitsvertrag über Gehälter'],
    ['emoji (surrogate pair)', 'signed 🎉 and sealed'],
    ['mixed scripts', 'Հանձնված է՝ Lenovo X1 — Работник: Анна'],
    ['newlines and tabs', 'line one\nline two\tindented\r\n'],
  ];

  for (const [label, input] of cases) {
    it(`matches node:crypto for ${label}`, () => {
      const expected = createHash('sha256').update(input, 'utf8').digest('hex');
      expect(sha256Hex(input)).toBe(expected);
    });
  }
});

describe('sha256Hex — output shape', () => {
  it('always returns 64 lowercase hex characters', () => {
    for (const input of ['', 'a', 'Աշխատող', 'x'.repeat(200)]) {
      expect(sha256Hex(input)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('is deterministic', () => {
    const input = 'Աշխատանքային պայմանագիր № HR-2026-001';
    expect(sha256Hex(input)).toBe(sha256Hex(input));
  });

  it('changes completely when one character changes', () => {
    const a = sha256Hex('Position: Engineer');
    const b = sha256Hex('Position: Enginer');
    expect(a).not.toBe(b);
  });
});

describe('sha256Hex — TextEncoder fallback', () => {
  // Node always has TextEncoder, so the module's manual UTF-8 encoder is only
  // reachable by hiding the global. Its output must match the standard path.
  it('matches node:crypto without a global TextEncoder (manual UTF-8 encoder)', () => {
    const original = globalThis.TextEncoder;
    // @ts-expect-error — temporarily removing the global to reach the fallback.
    delete globalThis.TextEncoder;
    try {
      for (const input of [
        'abc',
        'ASCII only',
        'Армянский: Աշխատանքային պայմանագիր',
        'emoji 🎉 and lone surrogate \uD800',
        // Real lone high surrogate (no valid low surrogate after it) →
        // triggers the replacement branch at code = 0xfffd.
        String.fromCharCode(0xd800),
        'x'.repeat(100),
      ]) {
        expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
      }
    } finally {
      globalThis.TextEncoder = original;
    }
  });
});
