import {
  orgDayKey,
  orgMonthDay,
  isDayKey,
  orgDayStart,
  orgDayEnd,
  daySpan,
  addDays,
  windowCoversDay,
  occurrenceFor,
} from '../../convex/lib/orgDays';

describe('orgDayKey', () => {
  it('returns yyyy-MM-dd format', () => {
    const key = orgDayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a date in the Armenian timezone (UTC+4)', () => {
    // 2026-01-15 01:30 UTC = 2026-01-15 05:30 AM in Yerevan → same day
    // But 2026-01-15 21:00 UTC = 2026-01-16 01:00 AM in Yerevan → next day
    const jan15_21UTC = Date.UTC(2026, 0, 15, 21, 0, 0);
    expect(orgDayKey(jan15_21UTC)).toBe('2026-01-16');
  });

  it('handles midnight boundary', () => {
    // 2026-06-01 20:00 UTC = 2026-06-02 00:00 Yerevan → June 2
    const midnight = Date.UTC(2026, 5, 1, 20, 0, 0);
    expect(orgDayKey(midnight)).toBe('2026-06-02');
  });

  it('handles specific timestamp', () => {
    // 2026-03-15 12:00 UTC = 2026-03-15 16:00 Yerevan → same day
    expect(orgDayKey(Date.UTC(2026, 2, 15, 12))).toBe('2026-03-15');
  });
});

describe('orgMonthDay', () => {
  it('returns --MM-DD format', () => {
    const md = orgMonthDay(Date.UTC(2026, 5, 15));
    expect(md).toBe('06-15');
  });

  it('returns the month-day for the given timestamp', () => {
    const md = orgMonthDay(Date.UTC(2026, 11, 25, 12));
    expect(md).toBe('12-25');
  });
});

describe('isDayKey', () => {
  it('accepts valid dates', () => {
    expect(isDayKey('2026-01-15')).toBe(true);
    expect(isDayKey('2026-12-31')).toBe(true);
    expect(isDayKey('2000-02-29')).toBe(true); // leap year
  });

  it('rejects invalid format', () => {
    expect(isDayKey('2026/01/15')).toBe(false);
    expect(isDayKey('15-01-2026')).toBe(false);
    expect(isDayKey('abc')).toBe(false);
    expect(isDayKey('')).toBe(false);
  });

  it('rejects impossible dates', () => {
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-04-31')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
  });

  it('rejects non-leap year Feb 29', () => {
    expect(isDayKey('2025-02-29')).toBe(false);
  });

  it('accepts leap year Feb 29', () => {
    expect(isDayKey('2024-02-29')).toBe(true);
  });
});

describe('orgDayStart / orgDayEnd', () => {
  it('orgDayStart is the start of the day in Armenian time', () => {
    // 2026-03-15 in Yerevan = 2026-03-14 20:00 UTC
    const start = orgDayStart('2026-03-15');
    expect(start).toBe(Date.UTC(2026, 2, 14, 20, 0, 0));
  });

  it('orgDayEnd is exactly 24 hours after orgDayStart', () => {
    const start = orgDayStart('2026-03-15');
    const end = orgDayEnd('2026-03-15');
    expect(end - start).toBe(86_400_000);
  });

  it('orgDayEnd for the next day matches orgDayStart of that day', () => {
    const end15 = orgDayEnd('2026-03-15');
    const start16 = orgDayStart('2026-03-16');
    expect(end15).toBe(start16);
  });
});

describe('daySpan', () => {
  it('returns 1 for the same day', () => {
    expect(daySpan('2026-01-01', '2026-01-01')).toBe(1);
  });

  it('returns 2 for consecutive days', () => {
    expect(daySpan('2026-01-01', '2026-01-02')).toBe(2);
  });

  it('returns correct count for a week', () => {
    expect(daySpan('2026-01-01', '2026-01-07')).toBe(7);
  });

  it('returns 0 for reversed order', () => {
    expect(daySpan('2026-01-07', '2026-01-01')).toBe(0);
  });

  it('returns 0 for invalid dates', () => {
    expect(daySpan('invalid', '2026-01-01')).toBe(0);
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2026-01-01', 1)).toBe('2026-01-02');
    expect(addDays('2026-01-01', 30)).toBe('2026-01-31');
  });

  it('subtracts negative days', () => {
    expect(addDays('2026-01-02', -1)).toBe('2026-01-01');
  });

  it('handles month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('handles zero days', () => {
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15');
  });
});

describe('windowCoversDay', () => {
  const nonRepeat = { repeat: 'none' as const };

  it('returns true when today is within a non-repeating window', () => {
    expect(
      windowCoversDay({ ...nonRepeat, startDate: '2026-01-01', endDate: '2026-01-31' }, '2026-01-15'),
    ).toBe(true);
  });

  it('returns false when today is before the window', () => {
    expect(
      windowCoversDay({ ...nonRepeat, startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-05'),
    ).toBe(false);
  });

  it('returns false when today is after the window', () => {
    expect(
      windowCoversDay({ ...nonRepeat, startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-25'),
    ).toBe(false);
  });

  it('returns true on start and end dates', () => {
    expect(
      windowCoversDay({ ...nonRepeat, startDate: '2026-03-10', endDate: '2026-03-15' }, '2026-03-10'),
    ).toBe(true);
    expect(
      windowCoversDay({ ...nonRepeat, startDate: '2026-03-10', endDate: '2026-03-15' }, '2026-03-15'),
    ).toBe(true);
  });

  describe('yearly repeat', () => {
    const yearly = { repeat: 'yearly' as const };

    it('matches on the same month-day', () => {
      expect(
        windowCoversDay({ ...yearly, startDate: '2020-06-15', endDate: '2020-06-20' }, '2026-06-17'),
      ).toBe(true);
    });

    it('does not match on a different month-day', () => {
      expect(
        windowCoversDay({ ...yearly, startDate: '2020-06-15', endDate: '2020-06-20' }, '2026-07-17'),
      ).toBe(false);
    });

    it('handles leap day (Feb 29) in a non-leap year by matching Feb 28', () => {
      // Window starts on Feb 29 in a leap year
      // In 2025 (non-leap), it should match Feb 28
      const result = windowCoversDay(
        { ...yearly, startDate: '2024-02-29', endDate: '2024-03-05' },
        '2025-02-28',
      );
      expect(result).toBe(true);
    });
  });
});

describe('occurrenceFor', () => {
  it('returns null when outside window', () => {
    expect(
      occurrenceFor(
        { startDate: '2026-03-10', endDate: '2026-03-15', repeat: 'none' },
        '2026-03-20',
      ),
    ).toBeNull();
  });

  it('returns the window dates for non-repeating', () => {
    const result = occurrenceFor(
      { startDate: '2026-03-10', endDate: '2026-03-15', repeat: 'none' },
      '2026-03-12',
    );
    expect(result).toEqual({ startDate: '2026-03-10', endDate: '2026-03-15' });
  });

  it('returns current year occurrence for yearly', () => {
    const result = occurrenceFor(
      { startDate: '2020-06-15', endDate: '2020-06-20', repeat: 'yearly' },
      '2026-06-17',
    );
    expect(result).toEqual({ startDate: '2026-06-15', endDate: '2026-06-20' });
  });
});
