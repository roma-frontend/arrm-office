import { getInitials, formatFileSize } from '@/lib/stringUtils';

describe('getInitials', () => {
  it('returns initials for full name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns first letter for single word', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('handles extra whitespace', () => {
    expect(getInitials('  John   Doe  ')).toBe('JD');
  });

  it('returns ? for empty input', () => {
    expect(getInitials('')).toBe('?');
  });

  it('handles multiple words (first + last)', () => {
    expect(getInitials('John William Doe')).toBe('JD');
  });

  it('lowercases properly', () => {
    expect(getInitials('JOHN DOE')).toBe('JD');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1500)).toBe('1.46 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1500000)).toBe('1.43 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1500000000)).toBe('1.4 GB');
  });

  it('formats terabytes', () => {
    expect(formatFileSize(1500000000000)).toBe('1.36 TB');
  });

  it('handles zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED EXPANSION
// ════════════════════════════════════════════════════════════════════════════

describe('getInitials - parameterized', () => {
  const cases = [
    ['John Doe', 'JD'],
    ['Alice Bob', 'AB'],
    ['Alice Bob Charlie', 'AC'],
    ['a b', 'AB'],
    ['single', 'S'],
    ['JOHN DOE', 'JD'],
    ['  spaced  name  ', 'SN'],
    ['', '?'],
    ['   ', ''],
    ['A B C D E', 'AE'],
    ['multiple   spaces   between', 'MB'],
    ['edge-case', 'E'],
    ['123 test', '1T'],
    ['John Michael David Smith', 'JS'],
    ['X', 'X'],
    ['Y', 'Y'],
    ['Z', 'Z'],
  ];
  test.each(cases)('getInitials(%s) => %s', (input, expected) => {
    expect(getInitials(input as string)).toBe(expected);
  });
});

describe('formatFileSize - parameterized', () => {
  const cases = [
    [0, '0 Bytes'],
    [1, '1 Bytes'],
    [500, '500 Bytes'],
    [1023, '1023 Bytes'],
    [1024, '1 KB'],
    [1500, '1.46 KB'],
    [10240, '10 KB'],
    [1048576, '1 MB'],
    [1500000, '1.43 MB'],
    [1073741824, '1 GB'],
    [1500000000, '1.4 GB'],
    [1099511627776, '1 TB'],
    [1500000000000, '1.36 TB'],
    [999, '999 Bytes'],
    [1048575, '1024 KB'],
    [2048, '2 KB'],
    [3072, '3 KB'],
  ];
  test.each(cases)('formatFileSize(%s) => %s', (input, expected) => {
    expect(formatFileSize(input as number)).toBe(expected);
  });
});

describe('getInitials - edge cases', () => {
  const edgeCases = [
    ['', '?'],
    [' ', ''],
    ['  ', ''],
    ['   ', ''],
    ['A', 'A'],
    ['A B', 'AB'],
    ['a b c', 'AC'],
    ['1 2', '12'],
    ['! @', '!@'],
    ['Hello World', 'HW'],
    ['Foo Bar Baz', 'FB'],
  ];
  test.each(edgeCases)('edge: getInitials(%s) => %s', (input, expected) => {
    expect(getInitials(input as string)).toBe(expected);
  });
});

describe('formatFileSize - edge sizes', () => {
  const edgeCases = [
    [0, '0 Bytes'],
    [1024, '1 KB'],
    [1048576, '1 MB'],
    [1073741824, '1 GB'],
    [1099511627776, '1 TB'],
    [1, '1 Bytes'],
    [1024000, '1000 KB'],
  ];
  test.each(edgeCases)('edge: formatFileSize(%s) => %s', (input, expected) => {
    expect(formatFileSize(input as number)).toBe(expected);
  });
});
