import {
  TAX_RULES,
  getTaxRule,
  applyTaxRuleOverride,
  type CountryCode,
  type CountryTaxRule,
  type TaxBracket,
  type TaxRuleOverride,
  type DeductionField,
  type Contribution,
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
  /**
   * Employee is exempt from the mandatory funded pension (Armenia: born before
   * 1974). Skips contributions marked `pensionExemptible` in the rule.
   */
  pensionExempt?: boolean;
  /**
   * Employee participates in Armenia's mandatory health insurance system.
   * When false/undefined, health insurance contributions are skipped.
   */
  healthInsured?: boolean;
  /** Overtime pay multiplier from overtimeSettings (default 1.5; 0 = comp leave). */
  overtimeMultiplier?: number;
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
 * Compute one contribution line against a gross salary.
 *
 * Supports the extended Contribution model:
 *  - `fixedAmount` — flat amount (military stamp duty), ignores rate/cap;
 *  - `offset` — subtracted after rate × base (Armenia pension high tier: 10% − 25k),
 *    never below 0;
 *  - `minGross`/`maxGross` — tier gates: the contribution only applies while
 *    gross > minGross (strictly above) and gross <= maxGross (at or below).
 *  - `tiers` — array of {min?, max?, amount} for tiered fixed amounts
 *    (e.g. Armenia health insurance: 0/<200k, 4800/200k-500k, 10800/>500k).
 */
function computeContribution(grossSalary: number, c: Contribution): number {
  // No pay → no deductions (e.g. a zero-days leave payout must not attract a
  // fixed-amount stamp duty).
  if (grossSalary <= 0) return 0;
  if (c.minGross !== undefined && grossSalary <= c.minGross) return 0;
  if (c.maxGross !== undefined && grossSalary > c.maxGross) return 0;

  // Handle tiered fixed amounts (e.g. Armenia health insurance)
  if (c.tiers !== undefined && c.tiers.length > 0) {
    for (const tier of c.tiers) {
      const aboveMin = tier.min === undefined || grossSalary > tier.min;
      const belowMax = tier.max === undefined || grossSalary <= tier.max;
      if (aboveMin && belowMax) {
        return round2(tier.amount);
      }
    }
    return 0;
  }

  if (c.fixedAmount !== undefined) return round2(c.fixedAmount);
  const base = c.cap ? Math.min(grossSalary, c.cap) : grossSalary;
  const amount = base * (c.rate ?? 0) - (c.offset ?? 0);
  return round2(Math.max(0, amount));
}

/**
 * Compute the employee-side deductions for a given gross salary using a country rule.
 * Income tax is rounded by calculateProgressiveTax; each named contribution is rounded
 * individually into its Deductions slot; total is the rounded sum.
 */
function computeDeductions(
  grossSalary: number,
  rule: CountryTaxRule,
  pensionExempt = false,
  healthInsured = false,
): Deductions {
  const taxableIncome = Math.max(0, grossSalary - (rule.taxFreeAllowance ?? 0));
  const incomeTax = calculateProgressiveTax(taxableIncome, rule.incomeTaxBrackets);

  let applicable = pensionExempt
    ? rule.employeeContributions.filter((c) => !c.pensionExemptible)
    : rule.employeeContributions;

  // Filter out health insurance contributions when employee is not enrolled
  if (!healthInsured) {
    applicable = applicable.filter((c) => c.field !== 'healthInsurance');
  }

  // Optional slots are initialized to 0 so consumers can always read them
  // (e.g. `deductions.pension` stays 0 when the funded pension is skipped).
  const deductions: Deductions = {
    incomeTax,
    socialSecurity: 0,
    healthInsurance: 0,
    pension: 0,
    other: 0,
    total: 0,
  };

  for (const c of applicable) {
    const amount = computeContribution(grossSalary, c);
    const field: DeductionField = c.field ?? 'other';
    deductions[field] = round2((deductions[field] ?? 0) + amount);
  }

  const contributionsTotal = applicable.reduce(
    (sum, c) => sum + computeContribution(grossSalary, c),
    0,
  );

  deductions.total = round2(incomeTax + contributionsTotal);
  return deductions;
}

/**
 * Employer-side contributions on top of gross. The sum of applicable amounts is
 * rounded once (matches the previous Russia implementation exactly).
 */
function computeEmployerContributions(grossSalary: number, rule: CountryTaxRule): number {
  const sum = rule.employerContributions.reduce(
    (acc, c) => acc + computeContribution(grossSalary, c),
    0,
  );
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
    pensionExempt = false,
    healthInsured = false,
    overtimeMultiplier = 1.5,
  } = input;
  const rule = applyTaxRuleOverride(getTaxRule(country), taxOverride);

  const overtimePay =
    overtimeHours > 0 && hourlyRate > 0
      ? calculateOvertimePay(overtimeHours, hourlyRate, overtimeMultiplier)
      : 0;

  const grossSalary = baseSalary + bonuses + overtimePay;

  const deductions = computeDeductions(grossSalary, rule, pensionExempt, healthInsured);
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
  pensionExempt?: boolean;
  healthInsured?: boolean;
  overtimeMultiplier?: number;
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
    pensionExempt = false,
    healthInsured = false,
    overtimeMultiplier = 1.5,
  } = input;

  const overtimePay =
    overtimeHours > 0 && hourlyRate > 0
      ? calculateOvertimePay(overtimeHours, hourlyRate, overtimeMultiplier)
      : 0;
  const fixedAddon = bonuses + overtimePay;

  // netForBase(base) using the same forward engine.
  const netForBase = (base: number): number =>
    calculatePayroll({
      country,
      baseSalary: base,
      bonuses,
      overtimeHours,
      hourlyRate,
      taxOverride,
      pensionExempt,
      healthInsured,
      overtimeMultiplier,
    }).netSalary;

  if (net <= 0) {
    return calculatePayroll({
      country,
      baseSalary: Math.max(0, -fixedAddon),
      bonuses,
      overtimeHours,
      hourlyRate,
      taxOverride,
      pensionExempt,
      healthInsured,
      overtimeMultiplier,
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
  return calculatePayroll({
    country,
    baseSalary,
    bonuses,
    overtimeHours,
    hourlyRate,
    taxOverride,
    pensionExempt,
    healthInsured,
    overtimeMultiplier,
  });
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
