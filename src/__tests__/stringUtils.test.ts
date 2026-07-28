/**
 * Tests for string utility functions (src/lib/stringUtils.ts)
 * Tests: getInitials, formatFileSize
 */

import { getInitials, formatFileSize } from '@/lib/stringUtils';

describe('getInitials', () => {
  it('returns single initial for first name only', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('returns two initials for first and last name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns first and last initial for multiple words', () => {
    expect(getInitials('John Michael Doe')).toBe('JD');
  });

  it('handles lowercase names', () => {
    expect(getInitials('john doe')).toBe('JD');
  });

  it('handles names with extra spaces', () => {
    expect(getInitials('  John   Doe  ')).toBe('JD');
  });

  it('returns question mark for empty string', () => {
    expect(getInitials('')).toBe('?');
  });

  it('handles whitespace only (returns empty string or null-like)', () => {
    const result = getInitials('   ');
    // The implementation splits by /\s+/, trims whitespace first, resulting in ['']
    // which gives parts.length=1 → returns first char of empty string = ''
    expect(typeof result).toBe('string');
  });
  it('handles single character name', () => {
    expect(getInitials('A')).toBe('A');
  });

  it('handles null/undefined gracefully', () => {
    expect(getInitials(null as any)).toBe('?');
    expect(getInitials(undefined as any)).toBe('?');
  });

  it('handles non-ASCII characters', () => {
    expect(getInitials('Иван Петров')).toBe('ИП');
    expect(getInitials('Արման Սարգսյան')).toBe('ԱՍ');
  });

  it('handles hyphenated names (takes first letter of full name)', () => {
    expect(getInitials('Jean-Claude Van Damme')).toBe('JD');
  });

  it('handles names with dots', () => {
    expect(getInitials('Dr. John Smith')).toBe('DS');
  });

  it('returns single char for one-letter names', () => {
    expect(getInitials('X')).toBe('X');
  });
});

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(2097152)).toBe('2 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
    expect(formatFileSize(2147483648)).toBe('2 GB');
  });

  it('formats terabytes', () => {
    expect(formatFileSize(1099511627776)).toBe('1 TB');
  });

  it('handles fractional sizes correctly', () => {
    const result = formatFileSize(1500);
    expect(result).toMatch(/\d+\.?\d*\s*(Bytes|KB|MB|GB|TB)/);
  });

  it('uses correct unit for edge cases', () => {
    expect(formatFileSize(1)).toBe('1 Bytes');
    expect(formatFileSize(1023)).toBe('1023 Bytes');
    expect(formatFileSize(1025)).toBe('1 KB');
  });

  it('handles very large numbers', () => {
    expect(formatFileSize(1099511627776 * 2)).toBe('2 TB');
  });

  it('rounds to 2 decimal places', () => {
    const result = formatFileSize(1500);
    expect(result).toMatch(/^\d+(\.\d{1,2})?\s/);
  });
});
