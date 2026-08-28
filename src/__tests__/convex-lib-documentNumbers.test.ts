import { normalizeSeries } from '../../convex/lib/documentNumbers';

describe('normalizeSeries', () => {
  it('returns "HR" as default when no series is provided', () => {
    expect(normalizeSeries()).toBe('HR');
  });

  it('returns "HR" when series is null', () => {
    expect(normalizeSeries(null)).toBe('HR');
  });

  it('returns "HR" when series is empty string', () => {
    expect(normalizeSeries('')).toBe('HR');
  });

  it('returns uppercase series', () => {
    expect(normalizeSeries('hr')).toBe('HR');
    expect(normalizeSeries('Nda')).toBe('NDA');
  });

  it('trims whitespace', () => {
    expect(normalizeSeries('  ORD  ')).toBe('ORD');
  });

  it('accepts valid 1-char series', () => {
    expect(normalizeSeries('A')).toBe('A');
  });

  it('accepts valid 8-char series', () => {
    expect(normalizeSeries('ABCD1234')).toBe('ABCD1234');
  });

  it('rejects series longer than 8 characters', () => {
    expect(normalizeSeries('ABCD12345')).toBe('HR');
  });

  it('rejects series starting with a digit', () => {
    expect(normalizeSeries('1ABC')).toBe('HR');
  });

  it('rejects series with lowercase-only starting char', () => {
    // After toUpperCase, 'abc' becomes 'ABC' which is valid
    expect(normalizeSeries('abc')).toBe('ABC');
  });

  it('rejects series with special characters', () => {
    expect(normalizeSeries('HR-2026')).toBe('HR');
  });

  it('rejects series with spaces', () => {
    expect(normalizeSeries('H R')).toBe('HR');
  });
});
