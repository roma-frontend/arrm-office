import {
  TAX_RULES,
  getTaxRule,
  applyTaxRuleOverride,
  type CountryCode,
  type CountryTaxRule,
  type TaxBracket,
  type TaxRuleOverride,
  type DeductionField,
} from './taxRules';

export type { TaxBracket, CountryCode, TaxRuleOverride } from './taxRules';

export interface Deductions {
  incomeTax: number;
  socialSecurity: number;
  healthInsurance?: number;
  pension?: number;
  other?: number;
  total: number;
}

export interface PayrollCalculation {
  country: CountryCode;
  baseSalary: number;
  bonuses: number;
  overtimePay: number;
  grossSalary: number;
  deductions: Deductions;
  netSalary: number;
  employerContributions?: number;
  totalCost?: number;
}

export interface PayrollInput {
  country: CountryCode;
  baseSalary: number;
  bonuses?: number;
  overtimeHours?: number;
  hourlyRate?: number;
  /** Org-level override of the country's rates/brackets (from salarySettings). */
  taxOverride?: TaxRuleOverride | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calculateProgressiveTax(taxableIncome: number, brackets: TaxBracket[]): number {
  let tax = 0;
  let remainingIncome = taxableIncome;

  for (const bracket of brackets) {
    if (remainingIncome <= 0) break;

    const taxableInBracket = bracket.max
      ? Math.min(remainingIncome, bracket.max - bracket.min)
      : remainingIncome;

    tax += taxableInBracket * bracket.rate;
    remainingIncome -= taxableInBracket;
  }

  return round2(tax);
}

function calculateOvertimePay(hours: number, hourlyRate: number, multiplier: number = 1.5): number {
  return round2(hours * hourlyRate * multiplier);
}

/**
 * Compute the employee-side deductions for a given gross salary using a country rule.
 * Income tax is rounded by calculateProgressiveTax; each named contribution is rounded
 * individually into its Deductions slot; total is the rounded sum.
 */
function computeDeductions(grossSalary: number, rule: CountryTaxRule): Deductions {
  const taxableIncome = Math.max(0, grossSalary - (rule.taxFreeAllowance ?? 0));
  const incomeTax = calculateProgressiveTax(taxableIncome, rule.incomeTaxBrackets);

  const deductions: Deductions = { incomeTax, socialSecurity: 0, total: 0 };

  for (const c of rule.employeeContributions) {
    const base = c.cap ? Math.min(grossSalary, c.cap) : grossSalary;
    const amount = round2(base * c.rate);
    const field: DeductionField = c.field ?? 'other';
    deductions[field] = round2((deductions[field] ?? 0) + amount);
  }

  const contributionsTotal = rule.employeeContributions.reduce((sum, c) => {
    const base = c.cap ? Math.min(grossSalary, c.cap) : grossSalary;
    return sum + round2(base * c.rate);
  }, 0);

  deductions.total = round2(incomeTax + contributionsTotal);
  return deductions;
}

/**
 * Employer-side contributions on top of gross. The sum of applicable amounts is
 * rounded once (matches the previous Russia implementation exactly).
 */
function computeEmployerContributions(grossSalary: number, rule: CountryTaxRule): number {
  const sum = rule.employerContributions.reduce((acc, c) => {
    const base = c.cap ? Math.min(grossSalary, c.cap) : grossSalary;
    return acc + base * c.rate;
  }, 0);
  return round2(sum);
}

export function calculatePayroll(input: PayrollInput): PayrollCalculation {
  const {
    country,
    baseSalary,
    bonuses = 0,
    overtimeHours = 0,
    hourlyRate = 0,
    taxOverride = null,
  } = input;
  const rule = applyTaxRuleOverride(getTaxRule(country), taxOverride);

  const overtimePay =
    overtimeHours > 0 && hourlyRate > 0 ? calculateOvertimePay(overtimeHours, hourlyRate) : 0;

  const grossSalary = baseSalary + bonuses + overtimePay;

  const deductions = computeDeductions(grossSalary, rule);
  const employerContributions = computeEmployerContributions(grossSalary, rule);
  const totalCost = round2(grossSalary + employerContributions);
  const netSalary = round2(grossSalary - deductions.total);

  return {
    country: rule.code,
    baseSalary,
    bonuses,
    overtimePay,
    grossSalary,
    deductions,
    netSalary,
    employerContributions,
    totalCost,
  };
}

export interface GrossFromNetInput {
  country: CountryCode;
  net: number;
  bonuses?: number;
  overtimeHours?: number;
  hourlyRate?: number;
  taxOverride?: TaxRuleOverride | null;
}

/**
 * Reverse calculation: given a desired NET salary, find the base salary that yields it.
 *
 * net(gross) = gross − deductions(gross) is monotonically increasing for any progressive
 * schedule, so we binary-search gross and reuse calculatePayroll as the single source of
 * truth. Returns the full self-consistent breakdown for the resolved gross.
 */
export function computeGrossFromNet(input: GrossFromNetInput): PayrollCalculation {
  const {
    country,
    net,
    bonuses = 0,
    overtimeHours = 0,
    hourlyRate = 0,
    taxOverride = null,
  } = input;

  const overtimePay =
    overtimeHours > 0 && hourlyRate > 0 ? calculateOvertimePay(overtimeHours, hourlyRate) : 0;
  const fixedAddon = bonuses + overtimePay;

  // netForBase(base) using the same forward engine.
  const netForBase = (base: number): number =>
    calculatePayroll({ country, baseSalary: base, bonuses, overtimeHours, hourlyRate, taxOverride })
      .netSalary;

  if (net <= 0) {
    return calculatePayroll({
      country,
      baseSalary: Math.max(0, -fixedAddon),
      bonuses,
      overtimeHours,
      hourlyRate,
      taxOverride,
    });
  }

  // Bracket the base salary. net is always <= gross, so base upper bound grows from net.
  let lo = 0;
  let hi = Math.max(net, 1);
  let guard = 0;
  while (netForBase(hi) < net && guard < 100) {
    hi *= 2;
    guard += 1;
  }

  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const midNet = netForBase(mid);
    if (Math.abs(midNet - net) < 0.005) {
      lo = mid;
      break;
    }
    if (midNet < net) lo = mid;
    else hi = mid;
  }

  const baseSalary = round2(lo);
  return calculatePayroll({ country, baseSalary, bonuses, overtimeHours, hourlyRate, taxOverride });
}

export function formatCurrency(amount: number, country: CountryCode): string {
  const rule = getTaxRule(country);
  return new Intl.NumberFormat(rule.locale, {
    style: 'currency',
    currency: rule.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getEffectiveTaxRate(grossSalary: number, deductions: Deductions): number {
  if (grossSalary === 0) return 0;
  return Math.round((deductions.total / grossSalary) * 10000) / 100;
}

// Re-export for consumers that referenced the engine's rules directly.
export { TAX_RULES };
