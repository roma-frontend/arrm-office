import {
  isArmenianHoliday,
  getArmenianHoliday,
  getArmenianHolidaysByYear,
  getUpcomingArmenianHolidays,
  allArmenianHolidays,
  armenianHolidays2026,
  armenianHolidays2027,
} from '@/lib/armenian-holidays';

describe('isArmenianHoliday', () => {
  it('returns true for New Year (January 1)', () => {
    expect(isArmenianHoliday('2026-01-01')).toBe(true);
  });

  it('returns true for Christmas (January 6)', () => {
    expect(isArmenianHoliday('2026-01-06')).toBe(true);
  });

  it('returns true for Womens Day (March 8)', () => {
    expect(isArmenianHoliday('2026-03-08')).toBe(true);
  });

  it('returns true for Republic Day (May 28)', () => {
    expect(isArmenianHoliday('2026-05-28')).toBe(true);
  });

  it('returns true for Independence Day (September 21)', () => {
    expect(isArmenianHoliday('2026-09-21')).toBe(true);
  });

  it('returns false for regular day', () => {
    expect(isArmenianHoliday('2026-02-15')).toBe(false);
  });

  it('handles Date objects', () => {
    const date = new Date('2026-01-01');
    expect(isArmenianHoliday(date)).toBe(true);
  });
});

describe('getArmenianHoliday', () => {
  it('returns holiday object for valid date', () => {
    const holiday = getArmenianHoliday('2026-01-01');
    expect(holiday).not.toBeNull();
    expect(holiday?.nameEn).toContain('New Year');
  });

  it('returns null for non-holiday', () => {
    expect(getArmenianHoliday('2026-02-15')).toBeNull();
  });

  it('returns correct holiday for Christmas', () => {
    const holiday = getArmenianHoliday('2026-01-06');
    expect(holiday?.nameEn).toContain('Christmas');
  });
});

describe('getArmenianHolidaysByYear', () => {
  it('returns all holidays for a given year', () => {
    const holidays = getArmenianHolidaysByYear(2026);
    expect(holidays.length).toBeGreaterThan(0);
    holidays.forEach((h) => {
      expect(h.date).toMatch(/^2026-/);
    });
  });

  it('returns empty array for year with no holidays', () => {
    const holidays = getArmenianHolidaysByYear(1900);
    expect(holidays).toEqual([]);
  });

  it('returns correct number of fixed holidays', () => {
    const holidays = getArmenianHolidaysByYear(2026);
    expect(holidays.length).toBeGreaterThanOrEqual(10);
  });
});

describe('getUpcomingArmenianHolidays', () => {
  it('returns future holidays within default 90 days', () => {
    const holidays = getUpcomingArmenianHolidays();
    expect(Array.isArray(holidays)).toBe(true);
  });

  it('returns only holidays with future dates', () => {
    const holidays = getUpcomingArmenianHolidays(365);
    const now = new Date();
    holidays.forEach((h) => {
      const holidayDate = new Date(h.date);
      expect(holidayDate.getTime()).toBeGreaterThanOrEqual(now.getTime() - 86400000);
    });
  });

  it('accepts custom days ahead parameter', () => {
    const holidays = getUpcomingArmenianHolidays(30);
    expect(Array.isArray(holidays)).toBe(true);
  });
});

describe('allArmenianHolidays', () => {
  it('contains combined holidays from both years', () => {
    const allIds = allArmenianHolidays.map((h) => h.date);
    // Verify all 2026 holidays included
    armenianHolidays2026.forEach((h) => {
      expect(allIds).toContain(h.date);
    });
    // Verify all 2027 holidays included
    armenianHolidays2027.forEach((h) => {
      expect(allIds).toContain(h.date);
    });
  });

  it('total count equals sum of both years', () => {
    expect(allArmenianHolidays.length).toBe(
      armenianHolidays2026.length + armenianHolidays2027.length,
    );
  });

  it('every holiday has required fields', () => {
    allArmenianHolidays.forEach((holiday) => {
      expect(holiday.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(holiday.nameEn).toBeDefined();
      expect(holiday.nameEn.length).toBeGreaterThan(0);
      expect(holiday.nameHy).toBeDefined();
      expect(holiday.nameHy.length).toBeGreaterThan(0);
      expect(typeof holiday.isNational).toBe('boolean');
    });
  });

  it('all holidays are national', () => {
    allArmenianHolidays.forEach((holiday) => {
      expect(holiday.isNational).toBe(true);
    });
  });

  it('has no duplicate dates', () => {
    const dates = allArmenianHolidays.map((h) => h.date);
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe('armenianHolidays2026', () => {
  it('has correct number of holidays', () => {
    expect(armenianHolidays2026.length).toBe(12);
  });

  it('starts with New Year on Jan 1', () => {
    expect(armenianHolidays2026[0]?.date).toBe('2026-01-01');
    expect(armenianHolidays2026[0]?.nameEn).toContain('New Year');
  });

  it('ends with New Year Eve on Dec 31', () => {
    const last = armenianHolidays2026[armenianHolidays2026.length - 1];
    expect(last?.date).toBe('2026-12-31');
    expect(last?.nameEn).toContain('New Year');
  });

  it('dates are in ascending order', () => {
    for (let i = 1; i < armenianHolidays2026.length; i++) {
      expect(armenianHolidays2026[i]!.date >= armenianHolidays2026[i - 1]!.date).toBe(true);
    }
  });
});

describe('armenianHolidays2027', () => {
  it('has same number of holidays as 2026', () => {
    expect(armenianHolidays2027.length).toBe(armenianHolidays2026.length);
  });

  it('has dates in 2027', () => {
    armenianHolidays2027.forEach((h) => {
      expect(h.date).toMatch(/^2027-/);
    });
  });

  it('has the same holiday names as 2026', () => {
    armenianHolidays2026.forEach((holiday, index) => {
      expect(armenianHolidays2027[index]?.nameEn).toBe(holiday.nameEn);
    });
  });
});
