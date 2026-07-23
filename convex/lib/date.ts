/**
 * Safe date string extraction helpers.
 * Handles noUncheckedIndexedAccess: true in tsconfig.
 */

/** Extract YYYY-MM-DD from ISO string */
export function toDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0] ?? '';
}

/** Extract HH:MM from time string like "09:30" */
export function parseTime(timeStr: string): { hours: number; minutes: number } {
  const parts = timeStr.split(':');
  return {
    hours: Number(parts[0] ?? '0'),
    minutes: Number(parts[1] ?? '0'),
  };
}

/** Extract date part from ISO date-time string "2024-01-15" */
export function extractDatePart(dateStr: string): string {
  return dateStr.split('T')[0] ?? dateStr;
}
