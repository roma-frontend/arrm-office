/**
 * Tests for convex/lib/recurrence.ts — the rule math behind recurring tasks.
 *
 * Pure functions, no Convex context: the cases that matter are the calendar edges
 * (a monthly rule on the 31st in February, a weekly rule bounded by a window)
 * rather than the happy path.
 */

import { describe, it, expect } from '@jest/globals';
import {
  daysInMonth,
  monthlyLandingDay,
  nextOccurrence,
  occursOnDay,
  validateRule,
  weekdayOf,
  type RecurrenceRule,
} from '../../convex/lib/recurrence';

const weekly = (daysOfWeek: number[], startDate = '2026-01-01', endDate?: string) =>
  ({ frequency: 'weekly', daysOfWeek, startDate, endDate }) as RecurrenceRule;

const monthly = (dayOfMonth: number, startDate = '2026-01-01', endDate?: string) =>
  ({ frequency: 'monthly', dayOfMonth, startDate, endDate }) as RecurrenceRule;

describe('weekdayOf', () => {
  it('reads the weekday without drifting through local time', () => {
    // 2026-08-10 is a Monday.
    expect(weekdayOf('2026-08-10')).toBe(1);
    expect(weekdayOf('2026-08-09')).toBe(0);
    expect(weekdayOf('2026-08-15')).toBe(6);
  });
});

describe('daysInMonth', () => {
  it('handles the short months and leap years', () => {
    expect(daysInMonth('2026-01-15')).toBe(31);
    expect(daysInMonth('2026-02-15')).toBe(28);
    expect(daysInMonth('2028-02-15')).toBe(29); // leap year
    expect(daysInMonth('2026-04-15')).toBe(30);
    expect(daysInMonth('2026-12-01')).toBe(31);
  });
});

describe('monthlyLandingDay', () => {
  it('clamps a date the month does not have to its last day', () => {
    expect(monthlyLandingDay(31, '2026-02-01')).toBe(28);
    expect(monthlyLandingDay(31, '2028-02-01')).toBe(29);
    expect(monthlyLandingDay(31, '2026-04-01')).toBe(30);
    expect(monthlyLandingDay(31, '2026-01-01')).toBe(31);
  });

  it('leaves a date the month does have alone', () => {
    expect(monthlyLandingDay(15, '2026-02-01')).toBe(15);
    expect(monthlyLandingDay(1, '2026-02-01')).toBe(1);
  });
});

describe('occursOnDay — weekly', () => {
  it('fires on the chosen weekdays and no others', () => {
    const rule = weekly([1, 3]); // Monday and Wednesday
    expect(occursOnDay(rule, '2026-08-10')).toBe(true); // Mon
    expect(occursOnDay(rule, '2026-08-12')).toBe(true); // Wed
    expect(occursOnDay(rule, '2026-08-11')).toBe(false); // Tue
    expect(occursOnDay(rule, '2026-08-16')).toBe(false); // Sun
  });

  it('does not fire before the start date', () => {
    const rule = weekly([1], '2026-08-17');
    expect(occursOnDay(rule, '2026-08-10')).toBe(false);
    expect(occursOnDay(rule, '2026-08-17')).toBe(true);
  });

  it('does not fire after the end date', () => {
    const rule = weekly([1], '2026-08-01', '2026-08-17');
    expect(occursOnDay(rule, '2026-08-17')).toBe(true);
    expect(occursOnDay(rule, '2026-08-24')).toBe(false);
  });

  it('never fires with no weekdays chosen', () => {
    expect(occursOnDay(weekly([]), '2026-08-10')).toBe(false);
  });
});

describe('occursOnDay — monthly', () => {
  it('fires on the chosen date each month', () => {
    const rule = monthly(15);
    expect(occursOnDay(rule, '2026-01-15')).toBe(true);
    expect(occursOnDay(rule, '2026-02-15')).toBe(true);
    expect(occursOnDay(rule, '2026-02-14')).toBe(false);
  });

  it('fires on the last day of a month too short for the chosen date', () => {
    const rule = monthly(31);
    expect(occursOnDay(rule, '2026-01-31')).toBe(true);
    expect(occursOnDay(rule, '2026-02-28')).toBe(true); // clamped
    expect(occursOnDay(rule, '2026-02-27')).toBe(false);
    expect(occursOnDay(rule, '2026-04-30')).toBe(true); // clamped
    expect(occursOnDay(rule, '2026-04-29')).toBe(false);
  });

  it('fires on 29 February in a leap year rather than the 28th', () => {
    const rule = monthly(31, '2028-01-01');
    expect(occursOnDay(rule, '2028-02-29')).toBe(true);
    expect(occursOnDay(rule, '2028-02-28')).toBe(false);
  });

  it('rejects an out-of-range day of month instead of firing oddly', () => {
    expect(occursOnDay(monthly(0), '2026-01-01')).toBe(false);
    expect(occursOnDay(monthly(32), '2026-01-01')).toBe(false);
  });
});

describe('occursOnDay — malformed input', () => {
  it('returns false rather than throwing, so one bad row cannot stop a sweep', () => {
    expect(occursOnDay(weekly([1]), 'not-a-date')).toBe(false);
    expect(occursOnDay(weekly([1], '2026-02-30'), '2026-08-10')).toBe(false);
    expect(occursOnDay(weekly([1], '2026-01-01', 'nonsense'), '2026-08-10')).toBe(false);
  });
});

describe('nextOccurrence', () => {
  it('finds the next weekly hit from a mid-week day', () => {
    // From Tuesday, a Monday/Wednesday rule lands on Wednesday.
    expect(nextOccurrence(weekly([1, 3]), '2026-08-11')).toBe('2026-08-12');
  });

  it('returns the day itself when it is already an occurrence', () => {
    expect(nextOccurrence(weekly([1]), '2026-08-10')).toBe('2026-08-10');
  });

  it('jumps forward to the start date when asked from before it', () => {
    expect(nextOccurrence(weekly([1], '2026-09-01'), '2026-08-10')).toBe('2026-09-07');
  });

  it('crosses the month boundary for a monthly rule', () => {
    expect(nextOccurrence(monthly(1), '2026-08-11')).toBe('2026-09-01');
  });

  it('returns null once the window has closed', () => {
    expect(nextOccurrence(weekly([1], '2026-01-01', '2026-08-09'), '2026-08-10')).toBeNull();
  });

  it('returns null for an unusable rule instead of scanning forever', () => {
    expect(nextOccurrence(weekly([]), '2026-08-10')).toBeNull();
  });
});

describe('validateRule', () => {
  it('accepts a usable weekly rule', () => {
    expect(validateRule(weekly([1, 5]))).toBeNull();
  });

  it('accepts a usable monthly rule', () => {
    expect(validateRule(monthly(15))).toBeNull();
  });

  it('rejects a weekly rule with no days', () => {
    expect(validateRule(weekly([]))).toBe('NO_WEEKDAYS');
  });

  it('rejects an out-of-range weekday', () => {
    expect(validateRule(weekly([7]))).toBe('INVALID_WEEKDAY');
    expect(validateRule(weekly([-1]))).toBe('INVALID_WEEKDAY');
  });

  it('rejects the same weekday twice', () => {
    expect(validateRule(weekly([1, 1]))).toBe('DUPLICATE_WEEKDAY');
  });

  it('rejects a monthly rule without a valid day', () => {
    expect(validateRule(monthly(0))).toBe('INVALID_DAY_OF_MONTH');
    expect(validateRule(monthly(32))).toBe('INVALID_DAY_OF_MONTH');
  });

  it('rejects dates that are not real', () => {
    expect(validateRule(weekly([1], '2026-02-30'))).toBe('INVALID_START_DATE');
    expect(validateRule(weekly([1], '2026-01-01', '2026-13-01'))).toBe('INVALID_END_DATE');
  });

  it('rejects a window that ends before it starts', () => {
    expect(validateRule(weekly([1], '2026-08-10', '2026-08-01'))).toBe('END_BEFORE_START');
  });
});
