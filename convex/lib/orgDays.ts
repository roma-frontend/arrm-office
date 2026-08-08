/**
 * Whole calendar days in the organization's own timezone.
 *
 * Anything scheduled by date — a birthday, a company event — has to appear on the
 * day the admin picked and disappear when that day ends *there*, not when UTC
 * rolls over. A cron running at 01:00 UTC is still the previous evening in
 * Yerevan, so deriving days from UTC would publish and expire posts a day off for
 * part of every day.
 *
 * Days are handled as `yyyy-MM-dd` strings rather than timestamps: a date the
 * admin types carries no time, and storing it as an instant invites exactly the
 * drift this module exists to avoid.
 */

/** Armenia is UTC+4 all year (no DST), so a fixed offset is exact, not a guess. */
const ORG_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

const MS_PER_DAY = 86_400_000;

/** `yyyy-MM-dd` of the organization's current day. */
export function orgDayKey(at: number = Date.now()): string {
  return new Date(at + ORG_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** `--MM-DD` of the organization's current day, for yearly recurrences. */
export function orgMonthDay(at: number = Date.now()): string {
  return orgDayKey(at).slice(5);
}

/** Is this a well-formed `yyyy-MM-dd` that names a real date? */
export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return false;
  // Rejects 2026-02-30, which `Date.parse` would otherwise roll forward.
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/** First instant of `dayKey` in the organization's timezone, as UTC ms. */
export function orgDayStart(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`) - ORG_UTC_OFFSET_MS;
}

/**
 * The instant `dayKey` is over in the organization's timezone.
 *
 * Exclusive: use it as "expires at", so a post set to run through the 22nd is
 * gone the moment the 23rd begins locally.
 */
export function orgDayEnd(dayKey: string): number {
  return orgDayStart(dayKey) + MS_PER_DAY;
}

/** Days between two keys, inclusive of both ends. Negative order yields 0. */
export function daySpan(startKey: string, endKey: string): number {
  const start = Date.parse(`${startKey}T00:00:00.000Z`);
  const end = Date.parse(`${endKey}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / MS_PER_DAY) + 1;
}

/** Shifts a day key by whole days. */
export function addDays(dayKey: string, days: number): string {
  const ms = Date.parse(`${dayKey}T00:00:00.000Z`) + days * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Does a scheduled window cover the organization's day `today`?
 *
 * A yearly entry matches on month and day, so a birthday recorded once keeps
 * coming back. Multi-day yearly windows are compared as month-day strings, which
 * handles a window that wraps the new year (e.g. 12-30 → 01-02).
 */
export function windowCoversDay(
  window: { startDate: string; endDate: string; repeat: 'none' | 'yearly' },
  today: string,
): boolean {
  if (window.repeat === 'none') {
    return today >= window.startDate && today <= window.endDate;
  }

  const start = yearlyStartFor(window.startDate, today);
  const end = window.endDate.slice(5);
  const now = today.slice(5);

  if (start <= end) return now >= start && now <= end;
  // Window wraps the year boundary.
  return now >= start || now <= end;
}

/**
 * Month-day a yearly window starts on, as observed in the year of `today`.
 *
 * 29 February in a year that has none becomes the 28th, so a leap-day birthday is
 * greeted every year instead of once every four.
 */
function yearlyStartFor(startDate: string, today: string): string {
  const start = startDate.slice(5);
  if (start !== '02-29') return start;
  return isDayKey(`${today.slice(0, 4)}-02-29`) ? '02-29' : '02-28';
}

/**
 * The occurrence of `window` that covers `today`.
 *
 * A yearly entry stores the year it was created in, which says nothing about the
 * run happening now — and a window that wraps the new year began last year. Both
 * are resolved here so callers never do date arithmetic on stored years.
 *
 * @returns `null` when today is outside the window.
 */
export function occurrenceFor(
  window: { startDate: string; endDate: string; repeat: 'none' | 'yearly' },
  today: string,
): { startDate: string; endDate: string } | null {
  if (!windowCoversDay(window, today)) return null;
  if (window.repeat === 'none') {
    return { startDate: window.startDate, endDate: window.endDate };
  }

  const year = Number(today.slice(0, 4));
  const startMd = yearlyStartFor(window.startDate, today);
  const endMd = window.endDate.slice(5);
  const nowMd = today.slice(5);

  if (startMd <= endMd) {
    return { startDate: `${year}-${startMd}`, endDate: `${year}-${endMd}` };
  }

  // Wrapping window: before the turn of the year it ends next year, after it, it
  // started last year.
  return nowMd >= startMd
    ? { startDate: `${year}-${startMd}`, endDate: `${year + 1}-${endMd}` }
    : { startDate: `${year - 1}-${startMd}`, endDate: `${year}-${endMd}` };
}
