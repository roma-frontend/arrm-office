import { getArmenianHolidaysByYear } from './armenian-holidays';

/**
 * Working-day arithmetic used by the employee payroll dashboard.
 *
 * The day count per month matches the official Armenian holiday calendar
 * (the same list `getArmenianHolidaysByYear` already knows about), so
 * the daily / hourly rate an employee sees lines up with what HR
 * divides the base salary by in `Calculation.xlsx`.
 *
 * Weekends are always Saturday + Sunday in Armenia.
 */

export const HOURS_PER_DAY = 8;
export const OVERTIME_MULTIPLIER = 1.5;
export const SICK_DAY_MULTIPLIER = 0.8;
export const VACATION_DAY_MULTIPLIER = 1;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay();
  return dow === 0 || dow === 6;
}

function isHoliday(year: number, month: number, day: number): boolean {
  const list = getArmenianHolidaysByYear(year);
  const target = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return list.some((h) => h.date === target);
}

export function workingDaysInMonth(year: number, month: number): number {
  const total = daysInMonth(year, month);
  let count = 0;
  for (let d = 1; d <= total; d++) {
    if (isWeekend(year, month, d)) continue;
    if (isHoliday(year, month, d)) continue;
    count++;
  }
  return count;
}

/** "YYYY-MM" → working-day count for that month. Defaults to 22 on bad input. */
export function workingDaysForPeriod(period: string): number {
  const [yStr, mStr] = period.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return 22;
  }
  return workingDaysInMonth(year, month);
}

export interface DerivedRates {
  baseSalary: number;
  workingDays: number;
  dailyRate: number;
  hourlyRate: number;
  vacationDayRate: number;
  sickDayRate: number;
  overtimeHourlyRate: number;
  overtimeDayEquivalent: number;
}

/**
 * Derive the four per-unit rates from a monthly base salary and a working-day
 * count. Returns zeros for everything if `baseSalary` is missing so the UI
 * can render a friendly "no record" state instead of NaNs.
 */
export function deriveRates(baseSalary: number, workingDays: number): DerivedRates {
  if (!baseSalary || !workingDays) {
    return {
      baseSalary: 0,
      workingDays: 0,
      dailyRate: 0,
      hourlyRate: 0,
      vacationDayRate: 0,
      sickDayRate: 0,
      overtimeHourlyRate: 0,
      overtimeDayEquivalent: 0,
    };
  }
  const dailyRate = baseSalary / workingDays;
  const hourlyRate = dailyRate / HOURS_PER_DAY;
  return {
    baseSalary,
    workingDays,
    dailyRate,
    hourlyRate,
    vacationDayRate: dailyRate * VACATION_DAY_MULTIPLIER,
    sickDayRate: dailyRate * SICK_DAY_MULTIPLIER,
    overtimeHourlyRate: hourlyRate * OVERTIME_MULTIPLIER,
    overtimeDayEquivalent: dailyRate * OVERTIME_MULTIPLIER,
  };
}

/**
 * Extract the trailing 4 digits from a Convex user id (e.g. "k578abc123d")
 * so the employee has a memorable, deterministic PIN. Falls back to the
 * email's last 4 digits when the id contains too few digits.
 */
export function derivePin(userId: string, fallbackEmail?: string): string {
  const digits = (userId ?? '').replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  const fromEmail = (fallbackEmail ?? '').replace(/\D/g, '');
  if (fromEmail.length >= 4) return fromEmail.slice(-4);
  return digits.padStart(4, '0').slice(-4);
}
