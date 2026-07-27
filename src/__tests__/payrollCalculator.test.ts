import {
  calculatePayroll,
  computeGrossFromNet,
  type TaxRuleOverride,
} from '../../convex/lib/payrollCalculator';

// ════════════════════════════════════════════════════════════════════════════
// Regression guard: Armenia & Russia must reproduce the previously hardcoded
// constants EXACTLY. These are the values the calculator shipped with before the
// tax rules became data-driven and (now) org-editable — they must not drift.
// ════════════════════════════════════════════════════════════════════════════

describe('calculatePayroll — Armenia (default rule)', () => {
  it('applies 20% income tax + 5% social security below the 3M threshold', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 1_000_000 });
    // gross = 1,000,000; income tax = 20% = 200,000; social = 5% = 50,000
    expect(r.grossSalary).toBe(1_000_000);
    expect(r.deductions.incomeTax).toBe(200_000);
    expect(r.deductions.socialSecurity).toBe(50_000);
    expect(r.deductions.total).toBe(250_000);
    expect(r.netSalary).toBe(750_000);
  });

  it('applies the 23% top bracket above the 3M threshold', () => {
    const r = calculatePayroll({ country: 'armenia', baseSalary: 4_000_000 });
    // 3,000,000 @ 20% = 600,000 ; 1,000,000 @ 23% = 230,000 → tax = 830,000
    // social = 5% of 4,000,000 = 200,000
    expect(r.deductions.incomeTax).toBe(830_000);
    expect(r.deductions.socialSecurity).toBe(200_000);
    expect(r.deductions.total).toBe(1_030_000);
    expect(r.netSalary).toBe(2_970_000);
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
    // social security untouched → still 5%
    expect(r.deductions.socialSecurity).toBe(50_000);
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
