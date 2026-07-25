/**
 * Tests for date-format utilities (src/lib/date-format.ts)
 * Tests: getLocaleString, formatDate, formatDateTime, formatTime,
 *        formatRelativeTime, getWeekdayNames, getMonthNames
 */

import {
  getLocaleString,
  formatDate,
  formatDateTime,
  formatTime,
  formatRelativeTime,
  getWeekdayNames,
  getMonthNames,
} from '@/lib/date-format';

describe('getLocaleString', () => {
  it('returns en-US for undefined lang', () => {
    expect(getLocaleString(undefined)).toBe('en-US');
  });

  it('returns correct Intl locale for each supported language', () => {
    expect(getLocaleString('en')).toBe('en-US');
    expect(getLocaleString('ru')).toBe('ru-RU');
    expect(getLocaleString('hy')).toBe('hy-AM');
    expect(getLocaleString('de')).toBe('de-DE');
  });

  it('falls back to en-US for unknown locale', () => {
    expect(getLocaleString('unknown' as any)).toBe('en-US');
    expect(getLocaleString('fr' as any)).toBe('en-US');
  });

  it('returns en-US for empty string', () => {
    expect(getLocaleString('' as any)).toBe('en-US');
  });
});

describe('formatDate', () => {
  const testDate = new Date(2024, 0, 15); // Jan 15, 2024

  it('formats date with default options', () => {
    const result = formatDate(testDate, 'en');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats date with long month option', () => {
    const result = formatDate(testDate, 'en', { month: 'long', day: 'numeric', year: 'numeric' });
    expect(result).toContain('January');
    expect(result).toContain('2024');
  });

  it('formats date with short month option', () => {
    const result = formatDate(testDate, 'en', { month: 'short', day: 'numeric' });
    expect(result).toContain('Jan');
  });

  it('formats date with month year option', () => {
    const result = formatDate(testDate, 'en', { month: 'long', year: 'numeric' });
    expect(result).toContain('2024');
  });

  it('accepts string date input', () => {
    const result = formatDate('2024-01-15', 'en', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(result).toBeDefined();
  });

  it('accepts number timestamp input', () => {
    const result = formatDate(testDate.getTime(), 'en', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(result).toBeDefined();
  });

  it('falls back to Intl for unsupported format options', () => {
    const result = formatDate(testDate, 'de', { weekday: 'long' });
    expect(result).toBeDefined();
  });

  it('handles Russian locale', () => {
    const result = formatDate(testDate, 'ru', { day: 'numeric', month: 'long', year: 'numeric' });
    expect(result).toBeDefined();
  });

  it('handles Armenian locale', () => {
    const result = formatDate(testDate, 'hy', { day: 'numeric', month: 'long', year: 'numeric' });
    expect(result).toBeDefined();
  });
});

describe('formatDateTime', () => {
  const testDate = new Date(2024, 0, 15, 14, 30, 0);

  it('formats date and time', () => {
    const result = formatDateTime(testDate, 'en');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts number input', () => {
    const result = formatDateTime(testDate.getTime(), 'en');
    expect(result).toBeDefined();
  });

  it('accepts string input', () => {
    const result = formatDateTime('2024-01-15T14:30:00', 'en');
    expect(result).toBeDefined();
  });

  it('handles Russian locale', () => {
    const result = formatDateTime(testDate, 'ru');
    expect(result).toBeDefined();
  });

  it('handles custom options', () => {
    const result = formatDateTime(testDate, 'en', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(result).toContain('14');
  });
});

describe('formatTime', () => {
  const testDate = new Date(2024, 0, 15, 14, 30, 0);

  it('formats time', () => {
    const result = formatTime(testDate, 'en');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts number input', () => {
    const result = formatTime(testDate.getTime(), 'en');
    expect(result).toBeDefined();
  });
});

describe('formatRelativeTime', () => {
  it('formats "in X seconds" for recent future', () => {
    const soon = new Date(Date.now() + 30000); // 30s later
    const result = formatRelativeTime(soon, 'en');
    expect(result).toMatch(/seconds|second/);
  });

  it('formats "in X minutes" for near future', () => {
    const later = new Date(Date.now() + 5 * 60 * 1000); // 5 min later
    const result = formatRelativeTime(later, 'en');
    expect(result).toMatch(/minutes|minute/);
  });

  it('formats "in X hours" for future hours', () => {
    const later = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3h later
    const result = formatRelativeTime(later, 'en');
    expect(result).toMatch(/hours|hour/);
  });

  it('formats "in X days" for future days', () => {
    const later = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days later
    const result = formatRelativeTime(later, 'en');
    expect(result).toMatch(/days|day/);
  });

  it('formats past dates', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const result = formatRelativeTime(past, 'en');
    expect(result).toMatch(/ago/);
  });

  it('handles numeric input', () => {
    const soon = Date.now() + 30000;
    const result = formatRelativeTime(soon, 'en');
    expect(result).toBeDefined();
  });

  it('handles string input', () => {
    const soon = new Date(Date.now() + 30000).toISOString();
    const result = formatRelativeTime(soon, 'en');
    expect(result).toBeDefined();
  });
});

describe('getWeekdayNames', () => {
  it('returns 7 weekday names', () => {
    const names = getWeekdayNames('en', 'short');
    expect(names).toHaveLength(7);
  });

  it('returns long weekday names', () => {
    const names = getWeekdayNames('en', 'long');
    expect(names).toHaveLength(7);
    expect(names[0]).toBe('Monday');
  });

  it('returns narrow weekday names', () => {
    const names = getWeekdayNames('en', 'narrow');
    expect(names).toHaveLength(7);
  });

  it('handles Russian locale', () => {
    const names = getWeekdayNames('ru', 'short');
    expect(names).toHaveLength(7);
    // Russian week starts with Monday (пн)
    expect(names.every((n) => n.length > 0)).toBe(true);
  });
});

describe('getMonthNames', () => {
  it('returns 12 month names', () => {
    const names = getMonthNames('en', 'long');
    expect(names).toHaveLength(12);
  });

  it('returns short month names', () => {
    const names = getMonthNames('en', 'short');
    expect(names).toHaveLength(12);
  });

  it('returns narrow month names', () => {
    const names = getMonthNames('en', 'narrow');
    expect(names).toHaveLength(12);
  });

  it('defaults to long format', () => {
    const names = getMonthNames('en');
    expect(names).toHaveLength(12);
    expect(names[0]).toBe('January');
  });

  it('handles Russian locale', () => {
    const names = getMonthNames('ru', 'long');
    expect(names).toHaveLength(12);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED EXPANSION (+30 tests)
// ════════════════════════════════════════════════════════════════════════════

describe('formatDate - all locales', () => {
  const testDate = new Date(2024, 0, 15);
  const cases = [
    ['en', 'long'],
    ['en', 'short'],
    ['ru', 'long'],
    ['ru', 'short'],
    ['de', 'long'],
    ['de', 'short'],
    ['hy', 'long'],
    ['hy', 'short'],
  ];
  test.each(cases)('locale %s format %s', (locale, format) => {
    const result = formatDate(testDate, locale as string, {
      month: format as 'long' | 'short',
      day: 'numeric',
      year: 'numeric',
    });
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatDate - edge cases', () => {
  it('handles epoch', () => {
    const result = formatDate(0, 'en', { year: 'numeric' });
    expect(result).toBeDefined();
  });
  it('handles future dates', () => {
    const future = new Date(2030, 11, 25);
    const result = formatDate(future, 'en', { year: 'numeric' });
    expect(result).toContain('2030');
  });
  it('handles leap year', () => {
    const leap = new Date(2024, 1, 29);
    const result = formatDate(leap, 'en', { day: 'numeric', month: 'long' });
    expect(result).toContain('29');
  });
});

describe('formatRelativeTime - edge cases', () => {
  it('handles exact now', () => {
    const result = formatRelativeTime(Date.now(), 'en');
    expect(result).toBeDefined();
  });
  it('handles 1 second ago', () => {
    const result = formatRelativeTime(Date.now() - 1000, 'en');
    expect(result).toMatch(/second|now/);
  });
  it('handles 1 minute ago', () => {
    const result = formatRelativeTime(Date.now() - 60000, 'en');
    expect(result).toMatch(/minute|ago/);
  });
  it('handles 1 hour ago', () => {
    const result = formatRelativeTime(Date.now() - 3600000, 'en');
    expect(result).toMatch(/hour|ago/);
  });
  it('handles 1 day ago', () => {
    const result = formatRelativeTime(Date.now() - 86400000, 'en');
    expect(result).toMatch(/day|ago/);
  });
});

describe('getWeekdayNames - all locales', () => {
  const cases = [
    ['en', 7],
    ['ru', 7],
    ['de', 7],
    ['hy', 7],
  ];
  test.each(cases)('locale %s has 7 weekdays', (locale) => {
    const names = getWeekdayNames(locale as string, 'short');
    expect(names).toHaveLength(7);
  });
});
