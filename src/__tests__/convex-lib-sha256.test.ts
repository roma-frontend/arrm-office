import { sha256Hex } from '../../convex/lib/sha256';

describe('sha256Hex', () => {
  // Reference values from https://emn178.github.io/online-tools/sha256.html
  it('hashes the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes "hello world"', () => {
    expect(sha256Hex('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('hashes a longer string', () => {
    const input = 'The quick brown fox jumps over the lazy dog';
    const result = sha256Hex(input);
    expect(result).toHaveLength(64);
    expect(result).toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
  });

  it('returns a lowercase hex string of exactly 64 characters', () => {
    const result = sha256Hex('test');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input produces same output', () => {
    const a = sha256Hex('deterministic');
    const b = sha256Hex('deterministic');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = sha256Hex('input1');
    const b = sha256Hex('input2');
    expect(a).not.toBe(b);
  });

  it('handles unicode characters', () => {
    const result = sha256Hex('Привет мир');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles Armenian characters', () => {
    const result = sha256Hex('Բարև աշխարհ');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});
