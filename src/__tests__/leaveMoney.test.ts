import {
  dailyRateFromSalary,
  valueLeaveDays,
  countWorkingDaysUntil,
  calculateSettlement,
  WORKING_DAYS_PER_MONTH,
} from '../../convex/lib/leaveMoney';

describe('dailyRateFromSalary', () => {
  it('is baseSalary ÷ 21 working days', () => {
    expect(dailyRateFromSalary(420_000)).toBe(20_000);
    expect(dailyRateFromSalary(1_050_000)).toBe(50_000);
    expect(dailyRateFromSalary(100_000)).toBe(round2(100_000 / 21));
  });

  it('returns 0 for zero/negative salary', () => {
    expect(dailyRateFromSalary(0)).toBe(0);
    expect(dailyRateFromSalary(-500)).toBe(0);
  });

  it('honours a custom working-days-per-month', () => {
    expect(dailyRateFromSalary(420_000, 22)).toBe(round2(420_000 / 22));
  });
});

describe('valueLeaveDays', () => {
  it('values days at daily rate and taxes them via the Armenia engine', () => {
    // base 420,000 → daily 20,000 ; 10 days → gross 200,000
    // tax: 20% income = 40,000 ; pension 5% (≤500k) = 10,000 ; stamp = 1,000 → net 149,000
    const r = valueLeaveDays('armenia', 420_000, 10);
    expect(r.gross).toBe(200_000);
    expect(r.net).toBe(149_000);
    expect(r.breakdown.deductions.total).toBe(51_000);
  });

  it('applies the high pension tier when the payout exceeds 500,000', () => {
    // base 1,050,000 → daily 50,000 ; 14 days → gross 700,000
    // tax: 20% = 140,000 ; pension 10%×700k − 25k = 45,000 ; stamp 1,000 → net 514,000
    const r = valueLeaveDays('armenia', 1_050_000, 14);
    expect(r.gross).toBe(700_000);
    expect(r.breakdown.deductions.pension).toBe(45_000);
    expect(r.net).toBe(514_000);
  });

  it('returns zero gross for zero days', () => {
    const r = valueLeaveDays('armenia', 420_000, 0);
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });
});

describe('countWorkingDaysUntil', () => {
  // Jan 1, 2026 is a Thursday (verified: 2024-01-01 Mon, 2025 Wed, 2026 Thu).
  it('counts Mon–Fri only, inclusive of the target day', () => {
    expect(countWorkingDaysUntil(new Date(2026, 0, 1))).toBe(1); // Thu
    expect(countWorkingDaysUntil(new Date(2026, 0, 2))).toBe(2); // Thu, Fri
    expect(countWorkingDaysUntil(new Date(2026, 0, 4))).toBe(2); // Sun — weekend not counted
    expect(countWorkingDaysUntil(new Date(2026, 0, 5))).toBe(3); // Mon
  });

  it('counts a full January 2026 as 22 working days', () => {
    expect(countWorkingDaysUntil(new Date(2026, 0, 31))).toBe(22);
  });

  it('skips a Sunday 1st and counts the following Monday', () => {
    // Feb 1, 2026 is a Sunday (Jan 31 2026 is a Saturday), Feb 2 is a Monday.
    expect(countWorkingDaysUntil(new Date(2026, 1, 2))).toBe(1);
  });
});

describe('calculateSettlement', () => {
  it('sums unused leave + prorated month salary and taxes the payout', () => {
    // base 420,000 → daily 20,000 ; last working day Fri 2026-01-30
    // unused 10 days → 200,000 ; prorated 22 days → 440,000 ; total gross 640,000
    // tax: 20% = 128,000 ; pension 10%×640k − 25k = 39,000 ; stamp 1,000 → net 472,000
    const r = calculateSettlement({
      country: 'armenia',
      baseSalary: 420_000,
      unusedLeaveDays: 10,
      lastDay: new Date(2026, 0, 30).getTime(),
    });
    expect(r.dailyRate).toBe(20_000);
    expect(r.unusedLeaveGross).toBe(200_000);
    expect(r.proratedDays).toBe(22);
    expect(r.proratedSalaryGross).toBe(440_000);
    expect(r.severanceGross).toBe(0);
    expect(r.totalGross).toBe(640_000);
    expect(r.breakdown.deductions.incomeTax).toBe(128_000);
    expect(r.breakdown.deductions.pension).toBe(39_000);
    expect(r.net).toBe(472_000);
  });

  it('adds severance into the taxable pool when provided', () => {
    // total gross = 200,000 + 440,000 + 100,000 severance = 740,000
    // tax: 20% = 148,000 ; pension 10%×740k − 25k = 49,000 ; stamp 1,000 → net 542,000
    const r = calculateSettlement({
      country: 'armenia',
      baseSalary: 420_000,
      unusedLeaveDays: 10,
      lastDay: new Date(2026, 0, 30).getTime(),
      severanceGross: 100_000,
    });
    expect(r.severanceGross).toBe(100_000);
    expect(r.totalGross).toBe(740_000);
    expect(r.breakdown.deductions.total).toBe(198_000);
    expect(r.net).toBe(542_000);
  });

  it('handles a zero-salary employee without crashing', () => {
    const r = calculateSettlement({
      country: 'armenia',
      baseSalary: 0,
      unusedLeaveDays: 5,
      lastDay: new Date(2026, 0, 30).getTime(),
    });
    expect(r.dailyRate).toBe(0);
    expect(r.totalGross).toBe(0);
    expect(r.net).toBe(0);
  });
});

describe('valueLeaveDays — funded-pension exemption', () => {
  it('increases net when pensionExempt is true (no pension deduction)', () => {
    // base 420,000 → daily 20,000 ; 10 days → gross 200,000
    // exempt: income 40,000 ; pension 0 ; stamp 1,000 → net 159,000 (vs 149,000)
    const r = valueLeaveDays('armenia', 420_000, 10, 21, true);
    expect(r.gross).toBe(200_000);
    expect(r.breakdown.deductions.pension).toBe(0);
    expect(r.net).toBe(159_000);
  });
});

describe('calculateSettlement — funded-pension exemption', () => {
  it('skips pension for exempt employees on the final payout', () => {
    // total gross 640,000 ; exempt: income 128,000 ; pension 0 ; stamp 1,000 → net 511,000
    const r = calculateSettlement({
      country: 'armenia',
      baseSalary: 420_000,
      unusedLeaveDays: 10,
      lastDay: new Date(2026, 0, 30).getTime(),
      pensionExempt: true,
    });
    expect(r.breakdown.deductions.pension).toBe(0);
    expect(r.breakdown.deductions.total).toBe(129_000);
    expect(r.net).toBe(511_000);
  });
});

describe('WORKING_DAYS_PER_MONTH', () => {
  it('defaults to 21', () => {
    expect(WORKING_DAYS_PER_MONTH).toBe(21);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
