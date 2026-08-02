import { calculatePayroll, type PayrollCalculation } from './payrollCalculator';
import type { CountryCode } from './taxRules';

/**
 * Number of working days per month used to convert a monthly salary into a daily
 * rate. Common practice in Armenia (and configurable in the org settings later).
 */
export const WORKING_DAYS_PER_MONTH = 21;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Daily rate = monthly gross salary ÷ working days per month. */
export function dailyRateFromSalary(
  baseSalary: number,
  workingDays = WORKING_DAYS_PER_MONTH,
): number {
  if (baseSalary <= 0) return 0;
  return round2(baseSalary / workingDays);
}

export interface LeaveMoneyValue {
  /** Gross monetary value of `days` (days × daily rate). */
  gross: number;
  /** Net value after the country's income tax + contributions. */
  net: number;
  /** Full engine breakdown (deductions, employer cost…). */
  breakdown: PayrollCalculation;
}

/**
 * Monetary value of `days` of leave, valued at the employee's daily rate and
 * taxed through the standard payroll engine as if paid out in one month.
 */
export function valueLeaveDays(
  country: CountryCode,
  baseSalary: number,
  days: number,
  workingDays = WORKING_DAYS_PER_MONTH,
  pensionExempt = false,
): LeaveMoneyValue {
  const dailyRate = dailyRateFromSalary(baseSalary, workingDays);
  const gross = round2(days * dailyRate);
  const breakdown = calculatePayroll({ country, baseSalary: gross, pensionExempt });
  return { gross, net: breakdown.netSalary, breakdown };
}

/** Count Mon–Fri (working) days from the 1st of `lastDay`'s month through it, inclusive. */
export function countWorkingDaysUntil(date: Date): number {
  let count = 0;
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1);
  while (cursor.getTime() <= date.getTime()) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export interface SettlementInput {
  country: CountryCode;
  /** Monthly gross base salary. */
  baseSalary: number;
  /** Unused paid-leave days to compensate. */
  unusedLeaveDays: number;
  /** Timestamp (ms) of the employee's last working day. */
  lastDay: number;
  /** Optional gross severance amount (e.g. per Labour Code). Default 0. */
  severanceGross?: number;
  /** Override working days per month (default 21). */
  workingDays?: number;
  /** Employee exempt from the funded pension (Armenia: born before 1974). */
  pensionExempt?: boolean;
}

export interface SettlementBreakdown {
  dailyRate: number;
  unusedLeaveDays: number;
  /** Unused leave compensation, gross. */
  unusedLeaveGross: number;
  /** Working days of the departure month counted as prorated salary. */
  proratedDays: number;
  /** Prorated salary for the departure month, gross. */
  proratedSalaryGross: number;
  /** Severance, gross (0 unless provided). */
  severanceGross: number;
  /** Sum of all gross components. */
  totalGross: number;
  /** Engine result for the whole payout (taxes, net). */
  breakdown: PayrollCalculation;
  /** Net payable to the employee. */
  net: number;
}

/**
 * Final settlement on termination:
 *   unused leave compensation + prorated salary of the departure month + severance,
 * taxed through the standard payroll engine as one payout.
 */
export function calculateSettlement(input: SettlementInput): SettlementBreakdown {
  const workingDays = input.workingDays ?? WORKING_DAYS_PER_MONTH;
  const dailyRate = dailyRateFromSalary(input.baseSalary, workingDays);
  const unusedLeaveGross = round2(input.unusedLeaveDays * dailyRate);
  const proratedDays = countWorkingDaysUntil(new Date(input.lastDay));
  const proratedSalaryGross = round2(proratedDays * dailyRate);
  const severanceGross = round2(input.severanceGross ?? 0);
  const totalGross = round2(unusedLeaveGross + proratedSalaryGross + severanceGross);

  const breakdown = calculatePayroll({
    country: input.country,
    baseSalary: totalGross,
    pensionExempt: input.pensionExempt ?? false,
  });

  return {
    dailyRate,
    unusedLeaveDays: round2(input.unusedLeaveDays),
    unusedLeaveGross,
    proratedDays,
    proratedSalaryGross,
    severanceGross,
    totalGross,
    breakdown,
    net: breakdown.netSalary,
  };
}
