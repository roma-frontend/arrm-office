import {
  calculatePayroll,
  computeGrossFromNet,
  type TaxRuleOverride,
} from '../../convex/lib/payrollCalculator';

// ════════════════════════════════════════════════════════════════════════════
// Regression guard: Armenia & Russia rules must stay pinned to the law they
// implement. Armenia follows the current (2025-2026) SRC/KGD scheme: flat 20%
// income tax, funded pension (5% up to 500k; 10% − 25k above, base capped at
// 1,125,000 → max 87,500), and military stamp duty (1,000 / 15,000 AMD).
// ════════════════════════════════════════════════════════════════════════════

describe('calculatePayroll — Armenia (default rule, 2025-2026 law)', () => {
  it('flat 20% income tax + pension 10%−25k + stamp duty 1,000 (1,000,000 gross)', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 1_000_000 });
    // income tax = 20% = 200,000
    // pension (high tier, >500k): 1,000,000×10% − 25,000 = 75,000
    // military stamp (<=1,000,000): 1,000
    expect(r.grossSalary).toBe(1_000_000);
    expect(r.deductions.incomeTax).toBe(200_000);
    expect(r.deductions.pension).toBe(75_000);
    expect(r.deductions.other).toBe(1_000);
    expect(r.deductions.total).toBe(276_000);
    expect(r.netSalary).toBe(724_000);
  });

  it('caps pension at 87,500 and applies 15,000 stamp duty above 1,000,000', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 4_000_000 });
    // income tax = 20% = 800,000
    // pension: min(4,000,000, 1,125,000)×10% − 25,000 = 87,500 (capped)
    // military stamp (>1,000,000): 15,000
    expect(r.deductions.incomeTax).toBe(800_000);
    expect(r.deductions.pension).toBe(87_500);
    expect(r.deductions.other).toBe(15_000);
    expect(r.deductions.total).toBe(902_500);
    expect(r.netSalary).toBe(3_097_500);
  });

  it('uses the 5% pension low tier below 500,000 gross (matches SRC example)', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 400_000 });
    // income tax = 80,000 ; pension = 5% = 20,000 ; stamp = 1,000 → net = 299,000
    expect(r.deductions.incomeTax).toBe(80_000);
    expect(r.deductions.pension).toBe(20_000);
    expect(r.deductions.total).toBe(101_000);
    expect(r.netSalary).toBe(299_000);
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
    const r = calculatePayroll({ country: 'armenia', baseSalary: 1_000_000, pensionExempt: true });
    // income tax = 200,000 ; pension skipped ; stamp duty = 1,000 → net 799,000
    expect(r.deductions.incomeTax).toBe(200_000);
    expect(r.deductions.pension).toBe(0);
    expect(r.deductions.other).toBe(1_000);
    expect(r.deductions.total).toBe(201_000);
    expect(r.netSalary).toBe(799_000);
  });

  it('keeps the stamp duty and income tax for exempt employees on high salary', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 4_000_000, pensionExempt: true });
    // income tax = 800,000 ; pension skipped ; stamp duty = 15,000 → net 3,185,000
    expect(r.deductions.pension).toBe(0);
    expect(r.deductions.other).toBe(15_000);
    expect(r.netSalary).toBe(3_185_000);
  });

  it('is identical to default when pensionExempt is false/omitted', () => {
    const exempt = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      pensionExempt: false,
    });
    const plain = calculatePayroll({ country: 'armenia', baseSalary: 1_000_000 });
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
      net: 799_000,
      pensionExempt: true,
    });
    const forward = calculatePayroll({
      country: 'armenia',
      baseSalary: r.baseSalary,
      pensionExempt: true,
    });
    expect(Math.abs(forward.netSalary - 799_000)).toBeLessThan(1);
  });
});

describe('calculatePayroll — taxOverride', () => {
  it('is a no-op when override is null/undefined (matches default)', () => {
    const withNull = calculatePayroll({
      country: 'armenia',
      baseSalary: 1_000_000,
      taxOverride: null,
    });
    const plain = calculatePayroll({ country: 'armenia', baseSalary: 1_000_000 });
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
    });
    expect(r.deductions.incomeTax).toBe(100_000);
    // contributions untouched → pension + stamp duty still apply
    expect(r.deductions.pension).toBe(75_000);
    expect(r.deductions.other).toBe(1_000);
    expect(r.deductions.total).toBe(176_000);
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
    expect(r.deductions.socialSecurity).toBe(50_000);
    expect(r.deductions.other).toBe(15_000);
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
    });
    // taxable = 1,000,000 - 200,000 = 800,000 @ 10% = 80,000
    expect(r.deductions.incomeTax).toBe(80_000);
  });
});

describe('computeGrossFromNet — respects taxOverride', () => {
  it('round-trips a net back to a self-consistent gross under an override', () => {
    const override: TaxRuleOverride = { incomeTaxBrackets: [{ min: 0, rate: 0.1 }] };
    const target = 800_000;
    const r = computeGrossFromNet({ country: 'armenia', net: target, taxOverride: override });
    // Re-run forward with the same override → net must match within rounding.
    const forward = calculatePayroll({
      country: 'armenia',
      baseSalary: r.baseSalary,
      taxOverride: override,
    });
    expect(Math.abs(forward.netSalary - target)).toBeLessThan(1);
  });
});
