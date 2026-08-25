import {
  calculatePayroll,
  computeGrossFromNet,
  formatCurrency,
  getEffectiveTaxRate,
  type TaxRuleOverride,
} from '../../convex/lib/payrollCalculator';

// ════════════════════════════════════════════════════════════════════════════
// Regression guard: Armenia & Russia rules must stay pinned to the law they
// implement. Armenia follows the current (2025-2026) SRC/KGD scheme: flat 20%
// income tax, funded pension (5% up to 500k; 10% − 25k above, base capped at
// 1,125,000 → max 87,500), military stamp duty (1,000 / 15,000 AMD), and
// mandatory health insurance (0 / 4,800 / 10,800 AMD tiered by gross).
// ════════════════════════════════════════════════════════════════════════════

describe('calculatePayroll — Armenia (default rule, 2025-2026 law)', () => {
  it('flat 20% income tax + pension 10%−25k + stamp duty 1,000 + health ins 10,800 (1,000,000 gross, insured)', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 1_000_000, healthInsured: true });
    // income tax = 20% = 200,000
    // pension (high tier, >500k): 1,000,000×10% − 25,000 = 75,000
    // military stamp (<=1,000,000): 1,000
    // health insurance (>500k): 10,800
    expect(r.grossSalary).toBe(1_000_000);
    expect(r.deductions.incomeTax).toBe(200_000);
    expect(r.deductions.pension).toBe(75_000);
    expect(r.deductions.other).toBe(1_000);
    expect(r.deductions.healthInsurance).toBe(10_800);
    expect(r.deductions.total).toBe(286_800);
    expect(r.netSalary).toBe(713_200);
  });

  it('caps pension at 87,500 and applies 15,000 stamp duty + 10,800 health above 1,000,000', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 4_000_000, healthInsured: true });
    // income tax = 20% = 800,000
    // pension: min(4,000,000, 1,125,000)×10% − 25,000 = 87,500 (capped)
    // military stamp (>1,000,000): 15,000
    // health insurance (>500k): 10,800
    expect(r.deductions.incomeTax).toBe(800_000);
    expect(r.deductions.pension).toBe(87_500);
    expect(r.deductions.other).toBe(15_000);
    expect(r.deductions.healthInsurance).toBe(10_800);
    expect(r.deductions.total).toBe(913_300);
    expect(r.netSalary).toBe(3_086_700);
  });

  it('uses the 5% pension low tier below 500,000 gross and health ins 4,800 (200k-500k bracket)', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 400_000, healthInsured: true });
    // income tax = 80,000 ; pension = 5% = 20,000 ; stamp = 1,000 ; health ins = 4,800
    expect(r.deductions.incomeTax).toBe(80_000);
    expect(r.deductions.pension).toBe(20_000);
    expect(r.deductions.healthInsurance).toBe(4_800);
    expect(r.deductions.total).toBe(105_800);
    expect(r.netSalary).toBe(294_200);
  });

  it('no health insurance when gross < 200,000', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 176_000, healthInsured: true });
    // income tax = 35,200 ; pension = 5% = 8,800 ; stamp = 1,000 ; health ins = 0 (<200k)
    expect(r.deductions.incomeTax).toBe(35_200);
    expect(r.deductions.pension).toBe(8_800);
    expect(r.deductions.healthInsurance).toBe(0);
    expect(r.deductions.total).toBe(45_000);
    expect(r.netSalary).toBe(131_000);
  });
});

describe('calculatePayroll — Russia (default rule)', () => {
  it('applies 13% income tax and employer contributions', () => {
    const r = calculatePayroll({ country: 'russia', baseSalary: 100_000 });
    // income tax = 13% = 13,000 ; no employee contributions
    expect(r.deductions.incomeTax).toBe(13_000);
    expect(r.deductions.total).toBe(13_000);
    expect(r.netSalary).toBe(87_000);
    // employer contributions = (0.029 + 0.22 + 0.051 + 0.002) * 100,000 = 30,200
    expect(r.employerContributions).toBe(30_200);
    expect(r.totalCost).toBe(130_200);
  });
});

describe('calculatePayroll — overtime', () => {
  it('adds overtime pay at 1.5x into gross', () => {
    const r = calculatePayroll({
      country: 'armenia',
      baseSalary: 500_000,
      overtimeHours: 10,
      hourlyRate: 2_000,
    });
    // overtime = 10 * 2000 * 1.5 = 30,000 ; gross = 530,000
    expect(r.overtimePay).toBe(30_000);
    expect(r.grossSalary).toBe(530_000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Org-editable override behaviour (Task: editable salary rates)
// ════════════════════════════════════════════════════════════════════════════

describe('calculatePayroll — funded-pension exemption (Armenia, born before 1974)', () => {
  it('skips the funded pension when pensionExempt is true', () => {
    const r = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      pensionExempt: true,
      healthInsured: true,
    });
    // income tax = 200,000 ; pension skipped ; stamp duty = 1,000 ; health ins = 10,800 → net 788,200
    expect(r.deductions.incomeTax).toBe(200_000);
    expect(r.deductions.pension).toBe(0);
    expect(r.deductions.other).toBe(1_000);
    expect(r.deductions.healthInsurance).toBe(10_800);
    expect(r.deductions.total).toBe(211_800);
    expect(r.netSalary).toBe(788_200);
  });

  it('keeps the stamp duty and income tax for exempt employees on high salary', () => {
    const r = calculatePayroll({
      country: 'armenia',
      baseSalary: 4_000_000,
      pensionExempt: true,
      healthInsured: true,
    });
    // income tax = 800,000 ; pension skipped ; stamp duty = 15,000 ; health ins = 10,800 → net 3,174,200
    expect(r.deductions.pension).toBe(0);
    expect(r.deductions.other).toBe(15_000);
    expect(r.deductions.healthInsurance).toBe(10_800);
    expect(r.netSalary).toBe(3_174_200);
  });

  it('is identical to default when pensionExempt is false/omitted', () => {
    const exempt = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      pensionExempt: false,
      healthInsured: true,
    });
    const plain = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      healthInsured: true,
    });
    expect(exempt).toEqual(plain);
    expect(exempt.deductions.pension).toBe(75_000);
  });

  it('does not affect countries without an exemptible pension', () => {
    const r = calculatePayroll({ country: 'russia', baseSalary: 100_000, pensionExempt: true });
    expect(r.deductions.total).toBe(13_000); // unchanged Russia rule
  });

  it('round-trips computeGrossFromNet under pensionExempt', () => {
    const r = computeGrossFromNet({
      country: 'armenia',
      net: 788_200,
      pensionExempt: true,
      healthInsured: true,
    });
    const forward = calculatePayroll({
      country: 'armenia',
      baseSalary: r.baseSalary,
      pensionExempt: true,
      healthInsured: true,
    });
    expect(Math.abs(forward.netSalary - 788_200)).toBeLessThan(1);
  });
});

describe('calculatePayroll — taxOverride', () => {
  it('is a no-op when override is null/undefined (matches default)', () => {
    const withNull = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      taxOverride: null,
      healthInsured: true,
    });
    const plain = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      healthInsured: true,
    });
    expect(withNull.deductions.healthInsurance).toBe(10_800); // default includes health ins
    expect(withNull.deductions.total).toBe(286_800);
    expect(withNull).toEqual(plain);
  });

  it('overrides income-tax brackets wholesale', () => {
    const override: TaxRuleOverride = {
      incomeTaxBrackets: [{ min: 0, rate: 0.1 }], // flat 10%
    };
    const r = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      taxOverride: override,
      healthInsured: true,
    });
    expect(r.deductions.incomeTax).toBe(100_000);
    // contributions untouched → pension + stamp duty + health insurance still apply
    expect(r.deductions.pension).toBe(75_000);
    expect(r.deductions.other).toBe(1_000);
    expect(r.deductions.healthInsurance).toBe(10_800);
    expect(r.deductions.total).toBe(186_800);
  });

  it('overrides employee contributions (e.g. adds a stamp-duty line)', () => {
    const override: TaxRuleOverride = {
      employeeContributions: [
        { name: 'Social Security', rate: 0.05, field: 'socialSecurity' },
        { name: 'Stamp Duty', rate: 0.015, field: 'other' },
      ],
    };
    const r = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      taxOverride: override,
    });
    // Override replaces all contributions including health insurance
    expect(r.deductions.socialSecurity).toBe(50_000);
    expect(r.deductions.other).toBe(15_000);
    expect(r.deductions.healthInsurance).toBe(0); // replaced by override
    // total = income tax 200,000 + social 50,000 + stamp 15,000
    expect(r.deductions.total).toBe(265_000);
  });

  it('can clear contributions with an empty array', () => {
    const override: TaxRuleOverride = { employeeContributions: [] };
    const r = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      taxOverride: override,
    });
    expect(r.deductions.socialSecurity).toBe(0);
    expect(r.deductions.pension).toBe(0);
    expect(r.deductions.healthInsurance).toBe(0);
    expect(r.deductions.total).toBe(200_000); // income tax only
  });

  it('overrides taxFreeAllowance', () => {
    const override: TaxRuleOverride = {
      taxFreeAllowance: 200_000,
      incomeTaxBrackets: [{ min: 0, rate: 0.1 }],
    };
    const r = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      taxOverride: override,
      healthInsured: true,
    });
    // taxable = 1,000,000 - 200,000 = 800,000 @ 10% = 80,000
    expect(r.deductions.incomeTax).toBe(80_000);
  });
});

describe('calculatePayroll — health insurance enrollment (Armenia)', () => {
  it('skips health insurance when healthInsured is false', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 1_000_000, healthInsured: false });
    expect(r.deductions.healthInsurance).toBe(0);
    // Without health ins: 200,000 + 75,000 + 1,000 = 276,000
    expect(r.deductions.total).toBe(276_000);
    expect(r.netSalary).toBe(724_000);
  });

  it('skips health insurance when healthInsured is undefined (backward compat)', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 1_000_000 });
    // Default: healthInsured is false → no health insurance deducted
    expect(r.deductions.healthInsurance).toBe(0);
    expect(r.deductions.total).toBe(276_000);
  });

  it('applies health insurance tier 4,800 for gross 200,001-500,000', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 300_000, healthInsured: true });
    expect(r.deductions.healthInsurance).toBe(4_800);
    // 20% tax = 60,000; pension = 15,000; stamp = 1,000; health = 4,800
    expect(r.deductions.total).toBe(80_800);
    expect(r.netSalary).toBe(219_200);
  });

  it('applies health insurance tier 10,800 for gross > 500,000', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 600_000, healthInsured: true });
    expect(r.deductions.healthInsurance).toBe(10_800);
  });

  it('health ins 0 for gross <= 200,000', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 200_000, healthInsured: true });
    expect(r.deductions.healthInsurance).toBe(0);
  });
});

describe('computeGrossFromNet — respects taxOverride', () => {
  it('round-trips a net back to a self-consistent gross under an override', () => {
    const override: TaxRuleOverride = { incomeTaxBrackets: [{ min: 0, rate: 0.1 }] };
    const target = 800_000;
    const r = computeGrossFromNet({
      country: 'armenia',
      net: target,
      taxOverride: override,
      healthInsured: true,
    });
    // Re-run forward with the same override → net must match within rounding.
    const forward = calculatePayroll({
      country: 'armenia',
      baseSalary: r.baseSalary,
      taxOverride: override,
      healthInsured: true,
    });
    expect(Math.abs(forward.netSalary - target)).toBeLessThan(1);
  });

  it('short-circuits to the forward engine for a non-positive net', () => {
    // fixedAddon (bonuses) may exceed the requested net → the base flips to 0.
    const r = computeGrossFromNet({
      country: 'armenia',
      net: 0,
      bonuses: 50_000,
    });
    expect(r.baseSalary).toBe(0);
    expect(r.netSalary).toBeGreaterThanOrEqual(0);
    expect(r.deductions).toBeDefined();
  });

  it('round-trips computeGrossFromNet with healthInsured', () => {
    const target = 713_200; // net with full health insurance at 1M gross
    const r = computeGrossFromNet({ country: 'armenia', net: target, healthInsured: true });
    const forward = calculatePayroll({
      country: 'armenia',
      baseSalary: r.baseSalary,
      healthInsured: true,
    });
    expect(Math.abs(forward.netSalary - target)).toBeLessThan(1);
  });
});

describe('formatCurrency', () => {
  it('formats amounts using the country locale and currency', () => {
    expect(formatCurrency(1_000_000, 'armenia')).toContain('֏');
    expect(formatCurrency(1_000_000, 'russia')).toContain('₽');
  });

  it('keeps at most two fraction digits', () => {
    // Locale-dependent separators (narrow nbsp, comma) — assert the digits only.
    const arm = formatCurrency(1234.567, 'armenia').replace(/[^\d]/g, '');
    expect(arm).toBe('1234.57'.replace(/[^\d]/g, ''));
  });
});

describe('getEffectiveTaxRate', () => {
  it('returns 0 for a zero gross', () => {
    expect(getEffectiveTaxRate(0, { total: 1000, incomeTax: 0 } as never)).toBe(0);
  });

  it('returns the rounded percentage of deductions over gross', () => {
    const deductions = { total: 250_000, incomeTax: 200_000 } as never;
    expect(getEffectiveTaxRate(1_000_000, deductions)).toBe(25);
  });
});
