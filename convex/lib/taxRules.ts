/**
 * Data-driven tax rules for payroll calculations.
 *
 * Adding a new country = adding an entry to TAX_RULES (no engine code changes).
 * Keep CountryCode in sync with the TAX_COUNTRY union in convex/schema/payroll.ts.
 *
 * ⚠️ Armenia & Russia reproduce the previously hardcoded constants EXACTLY and must
 * not be changed without updating the regression tests. Germany / UK / Poland / USA
 * are APPROXIMATE reference values — verify with an accountant before production use.
 */

export type CountryCode = 'armenia' | 'russia' | 'germany' | 'uk' | 'poland' | 'usa';

export const COUNTRY_CODES: CountryCode[] = ['armenia', 'russia', 'germany', 'uk', 'poland', 'usa'];

export interface TaxBracket {
  min: number;
  max?: number;
  rate: number;
}

/** Which named slot of the Deductions object an employee contribution maps to. */
export type DeductionField = 'socialSecurity' | 'healthInsurance' | 'pension' | 'other';

export interface Contribution {
  name: string;
  rate: number;
  /** Optional wage cap: rate applies to min(gross, cap). */
  cap?: number;
  /** Employee-side only: target Deductions slot (default 'other'). */
  field?: DeductionField;
}

export interface CountryTaxRule {
  code: CountryCode;
  label: string;
  currency: string;
  locale: string;
  /** Progressive income-tax brackets applied on (gross − taxFreeAllowance). */
  incomeTaxBrackets: TaxBracket[];
  /** Tax-free allowance deducted from gross before applying brackets. */
  taxFreeAllowance?: number;
  /** Contributions withheld from the employee (reduce net). */
  employeeContributions: Contribution[];
  /** Contributions paid by the employer on top of gross (increase total cost). */
  employerContributions: Contribution[];
  /** true for the approximate reference data that must be verified. */
  approximate?: boolean;
}

export const TAX_RULES: Record<CountryCode, CountryTaxRule> = {
  // ── Armenia — reproduces previous hardcoded constants exactly ──────────────
  armenia: {
    code: 'armenia',
    label: 'Armenia',
    currency: 'AMD',
    locale: 'hy-AM',
    incomeTaxBrackets: [
      { min: 0, max: 3000000, rate: 0.2 },
      { min: 3000000, rate: 0.23 },
    ],
    employeeContributions: [{ name: 'Social Security', rate: 0.05, field: 'socialSecurity' }],
    employerContributions: [],
  },

  // ── Russia — reproduces previous hardcoded constants exactly ───────────────
  russia: {
    code: 'russia',
    label: 'Russia',
    currency: 'RUB',
    locale: 'ru-RU',
    incomeTaxBrackets: [
      { min: 0, max: 5000000, rate: 0.13 },
      { min: 5000000, rate: 0.15 },
    ],
    employeeContributions: [],
    employerContributions: [
      { name: 'Social Insurance', rate: 0.029 },
      { name: 'Pension', rate: 0.22 },
      { name: 'Medical', rate: 0.051 },
      { name: 'Accident', rate: 0.002 },
    ],
  },

  // ── Germany (approximate, simplified band model) ───────────────────────────
  germany: {
    code: 'germany',
    label: 'Germany',
    currency: 'EUR',
    locale: 'de-DE',
    taxFreeAllowance: 11604,
    incomeTaxBrackets: [
      { min: 0, max: 17005, rate: 0.14 },
      { min: 17005, max: 66760, rate: 0.3 },
      { min: 66760, max: 277825, rate: 0.42 },
      { min: 277825, rate: 0.45 },
    ],
    employeeContributions: [
      { name: 'Pension', rate: 0.093, field: 'pension' },
      { name: 'Health Insurance', rate: 0.079, field: 'healthInsurance' },
      { name: 'Unemployment', rate: 0.013, field: 'socialSecurity' },
      { name: 'Long-term Care', rate: 0.018, field: 'other' },
    ],
    employerContributions: [
      { name: 'Pension', rate: 0.093 },
      { name: 'Health Insurance', rate: 0.079 },
      { name: 'Unemployment', rate: 0.013 },
      { name: 'Long-term Care', rate: 0.018 },
      { name: 'Accident', rate: 0.015 },
    ],
    approximate: true,
  },

  // ── United Kingdom (approximate, 2024/25) ──────────────────────────────────
  uk: {
    code: 'uk',
    label: 'United Kingdom',
    currency: 'GBP',
    locale: 'en-GB',
    taxFreeAllowance: 12570,
    incomeTaxBrackets: [
      { min: 0, max: 37700, rate: 0.2 },
      { min: 37700, max: 112570, rate: 0.4 },
      { min: 112570, rate: 0.45 },
    ],
    employeeContributions: [{ name: 'National Insurance', rate: 0.08, field: 'socialSecurity' }],
    employerContributions: [{ name: 'National Insurance', rate: 0.138 }],
    approximate: true,
  },

  // ── Poland (approximate, 2024) ─────────────────────────────────────────────
  poland: {
    code: 'poland',
    label: 'Poland',
    currency: 'PLN',
    locale: 'pl-PL',
    taxFreeAllowance: 30000,
    incomeTaxBrackets: [
      { min: 0, max: 120000, rate: 0.12 },
      { min: 120000, rate: 0.32 },
    ],
    employeeContributions: [
      { name: 'Social Insurance', rate: 0.1371, field: 'socialSecurity' },
      { name: 'Health Insurance', rate: 0.09, field: 'healthInsurance' },
    ],
    employerContributions: [{ name: 'Social Insurance', rate: 0.1993 }],
    approximate: true,
  },

  // ── USA federal (approximate, 2024 single filer) ──────────────────────────
  usa: {
    code: 'usa',
    label: 'United States (Federal)',
    currency: 'USD',
    locale: 'en-US',
    taxFreeAllowance: 14600,
    incomeTaxBrackets: [
      { min: 0, max: 11600, rate: 0.1 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, rate: 0.37 },
    ],
    employeeContributions: [
      { name: 'Social Security', rate: 0.062, cap: 168600, field: 'socialSecurity' },
      { name: 'Medicare', rate: 0.0145, field: 'other' },
    ],
    employerContributions: [
      { name: 'Social Security', rate: 0.062, cap: 168600 },
      { name: 'Medicare', rate: 0.0145 },
      { name: 'Federal Unemployment', rate: 0.006 },
    ],
    approximate: true,
  },
};

/** Resolve a (possibly free-text) country value to a valid rule, falling back to Armenia. */
export function getTaxRule(country?: string | null): CountryTaxRule {
  const code = (country ?? '').toLowerCase() as CountryCode;
  return TAX_RULES[code] ?? TAX_RULES.armenia;
}

/** Normalize a free-text country string to a CountryCode (or undefined if unknown). */
export function toCountryCode(country?: string | null): CountryCode | undefined {
  const code = (country ?? '').toLowerCase();
  return (COUNTRY_CODES as string[]).includes(code) ? (code as CountryCode) : undefined;
}
