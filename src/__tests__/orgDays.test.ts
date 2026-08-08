/**
 * Calendar-day arithmetic behind the dated news list.
 *
 * A post dated the 22nd has to appear on the 22nd in the office's timezone and be
 * gone when the 23rd begins there — not when UTC turns over, which for Yerevan is
 * four hours earlier and therefore the previous evening. Yearly entries add the
 * cases that are easy to get wrong: a window that wraps New Year, and 29 February
 * in the three years out of four that do not have one.
 */

import { describe, it, expect } from '@jest/globals';
import {
  addDays,
  daySpan,
  isDayKey,
  occurrenceFor,
  orgDayEnd,
  orgDayKey,
  orgDayStart,
  orgMonthDay,
  windowCoversDay,
} from '../../convex/lib/orgDays';

/** Yerevan is UTC+4, so 20:00 UTC is already the next day there. */
const LATE_UTC = Date.parse('2026-05-21T20:30:00.000Z');
const EARLY_UTC = Date.parse('2026-05-22T03:30:00.000Z');

describe('organization day keys', () => {
  it('rolls over four hours before UTC does', () => {
    expect(orgDayKey(LATE_UTC)).toBe('2026-05-22');
    expect(orgDayKey(EARLY_UTC)).toBe('2026-05-22');
  });

  it('reports the month and day for yearly matching', () => {
    expect(orgMonthDay(LATE_UTC)).toBe('05-22');
  });

  it('starts and ends a day at the local boundaries', () => {
    const start = orgDayStart('2026-05-22');
    const end = orgDayEnd('2026-05-22');

    expect(new Date(start).toISOString()).toBe('2026-05-21T20:00:00.000Z');
    expect(end - start).toBe(86_400_000);
    // The end is exclusive: the first instant of the next local day.
    expect(orgDayEnd('2026-05-22')).toBe(orgDayStart('2026-05-23'));
  });

  it('accepts real dates and rejects impossible ones', () => {
    expect(isDayKey('2026-05-22')).toBe(true);
    expect(isDayKey('2024-02-29')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('22-05-2026')).toBe(false);
    expect(isDayKey('')).toBe(false);
  });

  it('counts a span inclusively', () => {
    expect(daySpan('2026-05-22', '2026-05-22')).toBe(1);
    expect(daySpan('2026-05-22', '2026-05-24')).toBe(3);
    expect(daySpan('2026-05-24', '2026-05-22')).toBe(0);
    expect(daySpan('2026-12-30', '2027-01-02')).toBe(4);
  });

  it('shifts by whole days across a month end', () => {
    expect(addDays('2026-05-31', 1)).toBe('2026-06-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('one-off windows', () => {
  const window = { startDate: '2026-05-22', endDate: '2026-05-24', repeat: 'none' as const };

  it('covers every day of the run and nothing outside it', () => {
    expect(windowCoversDay(window, '2026-05-21')).toBe(false);
    expect(windowCoversDay(window, '2026-05-22')).toBe(true);
    expect(windowCoversDay(window, '2026-05-23')).toBe(true);
    expect(windowCoversDay(window, '2026-05-24')).toBe(true);
    expect(windowCoversDay(window, '2026-05-25')).toBe(false);
  });

  it('returns the stored dates as the occurrence', () => {
    expect(occurrenceFor(window, '2026-05-23')).toEqual({
      startDate: '2026-05-22',
      endDate: '2026-05-24',
    });
    expect(occurrenceFor(window, '2026-05-25')).toBeNull();
  });

  it('does not repeat the following year', () => {
    expect(windowCoversDay(window, '2027-05-23')).toBe(false);
  });
});

describe('yearly windows', () => {
  const birthday = { startDate: '2020-05-22', endDate: '2020-05-22', repeat: 'yearly' as const };

  it('comes back regardless of the year it was recorded in', () => {
    expect(windowCoversDay(birthday, '2026-05-22')).toBe(true);
    expect(windowCoversDay(birthday, '2031-05-22')).toBe(true);
    expect(windowCoversDay(birthday, '2026-05-23')).toBe(false);
  });

  it('resolves the occurrence into the year being asked about', () => {
    expect(occurrenceFor(birthday, '2026-05-22')).toEqual({
      startDate: '2026-05-22',
      endDate: '2026-05-22',
    });
  });

  it('keeps a multi-day yearly run together', () => {
    const week = { startDate: '2021-06-01', endDate: '2021-06-07', repeat: 'yearly' as const };
    expect(windowCoversDay(week, '2026-06-04')).toBe(true);
    expect(occurrenceFor(week, '2026-06-04')).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-07',
    });
  });

  it('handles a window that wraps New Year', () => {
    const holidays = { startDate: '2021-12-30', endDate: '2022-01-02', repeat: 'yearly' as const };

    expect(windowCoversDay(holidays, '2026-12-31')).toBe(true);
    expect(windowCoversDay(holidays, '2026-01-01')).toBe(true);
    expect(windowCoversDay(holidays, '2026-06-15')).toBe(false);

    // Before the turn: the run ends next year.
    expect(occurrenceFor(holidays, '2026-12-31')).toEqual({
      startDate: '2026-12-30',
      endDate: '2027-01-02',
    });
    // After it: the run began last year, so the post is not re-published.
    expect(occurrenceFor(holidays, '2026-01-01')).toEqual({
      startDate: '2025-12-30',
      endDate: '2026-01-02',
    });
  });

  it('greets a leap-day birthday in ordinary years too', () => {
    const leap = { startDate: '2024-02-29', endDate: '2024-02-29', repeat: 'yearly' as const };

    expect(windowCoversDay(leap, '2028-02-29')).toBe(true);
    // 2026 has no 29th; the greeting moves to the 28th rather than being skipped.
    expect(windowCoversDay(leap, '2026-02-28')).toBe(true);
    expect(windowCoversDay(leap, '2026-03-01')).toBe(false);
    expect(occurrenceFor(leap, '2026-02-28')?.startDate).toBe('2026-02-28');
  });

  it('expires a post at the end of its last local day', () => {
    const occurrence = occurrenceFor(
      { startDate: '2020-05-22', endDate: '2020-05-24', repeat: 'yearly' },
      '2026-05-22',
    );
    const expiresAt = orgDayEnd(occurrence!.endDate);

    // Still up during the last day, gone once it is over.
    expect(expiresAt).toBeGreaterThan(Date.parse('2026-05-24T19:59:00.000Z'));
    expect(expiresAt).toBe(Date.parse('2026-05-24T20:00:00.000Z'));
  });
});
