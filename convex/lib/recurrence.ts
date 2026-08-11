/**
 * Recurrence rules for repeating work, expressed in whole organization days.
 *
 * Deliberately narrow: weekly on chosen weekdays, or monthly on a chosen date.
 * That covers "every Monday" and "the 1st of each month" — the two shapes people
 * actually ask for — without dragging in RFC 5545. Anything richer belongs in a
 * real rrule library, and nothing here forecloses that.
 *
 * Days are `yyyy-MM-dd` keys in the organization's timezone, the same currency
 * `lib/orgDays.ts` deals in, so a rule never drifts a day when a sweep happens to
 * run either side of UTC midnight.
 */

import { isDayKey } from './orgDays';

/** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RecurrenceRule {
  frequency: 'weekly' | 'monthly';
  /** Weekly only: which weekdays it lands on. */
  daysOfWeek?: number[];
  /** Monthly only: which date of the month. Clamped to the month's length. */
  dayOfMonth?: number;
  /** First day the rule may produce anything, inclusive. */
  startDate: string;
  /** Last day the rule may produce anything, inclusive. Open-ended when absent. */
  endDate?: string;
}

/** Weekday of a day key, without constructing a local-time Date. */
export function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
}

/** How many days the month containing `dayKey` has. */
export function daysInMonth(dayKey: string): number {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7)); // 1-12
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The date a monthly rule lands on in the month containing `dayKey`.
 *
 * A rule set to the 31st still has to fire in February, and a rule set to the
 * 30th in a 28-day month cannot silently skip the month — both clamp to the last
 * day, which is what "monthly on the 31st" is universally taken to mean.
 */
export function monthlyLandingDay(dayOfMonth: number, dayKey: string): number {
  return Math.min(dayOfMonth, daysInMonth(dayKey));
}

/**
 * Is `dayKey` an occurrence of `rule`?
 *
 * Returns false for malformed rules rather than throwing: this runs inside a
 * sweep over every organization's rules, and one bad row must not stop the rest.
 */
export function occursOnDay(rule: RecurrenceRule, dayKey: string): boolean {
  if (!isDayKey(dayKey) || !isDayKey(rule.startDate)) return false;
  if (dayKey < rule.startDate) return false;
  if (rule.endDate) {
    if (!isDayKey(rule.endDate)) return false;
    if (dayKey > rule.endDate) return false;
  }

  if (rule.frequency === 'weekly') {
    const days = rule.daysOfWeek;
    if (!days || days.length === 0) return false;
    return days.includes(weekdayOf(dayKey));
  }

  const dayOfMonth = rule.dayOfMonth;
  if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) return false;
  return Number(dayKey.slice(8, 10)) === monthlyLandingDay(dayOfMonth, dayKey);
}

/**
 * The first occurrence on or after `from`, or `null` within the search horizon.
 *
 * Used to tell someone when a rule they just set up will next produce something,
 * so a mistyped weekday shows up immediately instead of as silence. The horizon
 * is a year and a bit: enough for any monthly date, and bounded so a rule whose
 * window has closed terminates.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  from: string,
  horizonDays = 400,
): string | null {
  if (!isDayKey(from)) return null;
  let cursor = from < rule.startDate ? rule.startDate : from;
  if (!isDayKey(cursor)) return null;

  for (let i = 0; i <= horizonDays; i++) {
    if (rule.endDate && cursor > rule.endDate) return null;
    if (occursOnDay(rule, cursor)) return cursor;
    cursor = shiftDay(cursor, 1);
  }
  return null;
}

/** Local copy of day shifting to keep this module free of import cycles. */
function shiftDay(dayKey: string, days: number): string {
  const ms = Date.parse(`${dayKey}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Rejects rules that could never fire, so the mistake surfaces at the form
 * rather than as a series that quietly produces nothing.
 *
 * @returns an error code, or `null` when the rule is usable.
 */
export function validateRule(rule: RecurrenceRule): string | null {
  if (!isDayKey(rule.startDate)) return 'INVALID_START_DATE';
  if (rule.endDate) {
    if (!isDayKey(rule.endDate)) return 'INVALID_END_DATE';
    if (rule.endDate < rule.startDate) return 'END_BEFORE_START';
  }

  if (rule.frequency === 'weekly') {
    const days = rule.daysOfWeek ?? [];
    if (days.length === 0) return 'NO_WEEKDAYS';
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'INVALID_WEEKDAY';
    if (new Set(days).size !== days.length) return 'DUPLICATE_WEEKDAY';
    return null;
  }

  const dayOfMonth = rule.dayOfMonth;
  if (!Number.isInteger(dayOfMonth) || !dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) {
    return 'INVALID_DAY_OF_MONTH';
  }
  return null;
}
