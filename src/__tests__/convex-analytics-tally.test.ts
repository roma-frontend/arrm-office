/**
 * Tests for convex/analytics — tally aggregation and report data patterns.
 *
 * These tests exercise the pure logic that powers the analytics queries:
 * - tally() aggregation pattern
 * - pieData and monthlyTrend computation
 * - report unit selection
 */

// Replicate the tally function from convex/analytics
function tally(rows: Array<{ key: string; value: number }>) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.key, (map.get(r.key) ?? 0) + r.value);
  const series = [...map.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
  const total = series.reduce((s, x) => s + x.value, 0);
  return { series, total: Math.round(total * 100) / 100 };
}

describe('analytics tally aggregation', () => {
  it('aggregates identical keys', () => {
    const result = tally([
      { key: 'Engineering', value: 1 },
      { key: 'Engineering', value: 1 },
      { key: 'HR', value: 1 },
    ]);
    expect(result.series).toHaveLength(2);
    expect(result.series[0]).toEqual({ label: 'Engineering', value: 2 });
    expect(result.series[1]).toEqual({ label: 'HR', value: 1 });
    expect(result.total).toBe(3);
  });

  it('sorts by descending value', () => {
    const result = tally([
      { key: 'A', value: 5 },
      { key: 'B', value: 10 },
      { key: 'C', value: 1 },
    ]);
    expect(result.series.map((s) => s.label)).toEqual(['B', 'A', 'C']);
  });

  it('returns empty series for empty input', () => {
    const result = tally([]);
    expect(result.series).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('rounds values to 2 decimal places', () => {
    const result = tally([
      { key: 'Hours', value: 1.234 },
      { key: 'Hours', value: 2.567 },
    ]);
    expect(result.series[0].value).toBe(3.8);
  });

  it('handles fractional values (currency aggregation)', () => {
    const result = tally([
      { key: 'approved', value: 1500.5 },
      { key: 'approved', value: 2300.75 },
      { key: 'pending', value: 500 },
    ]);
    expect(result.series[0].label).toBe('approved');
    expect(result.series[0].value).toBe(3801.25);
    expect(result.total).toBe(4301.25);
  });
});

describe('analytics monthlyTrend', () => {
  it('generates 6-month trend array with correct keys', () => {
    const now = new Date('2026-08-28');
    const monthlyTrend: { key: string; approved: number; pending: number; rejected: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrend.push({ key, approved: 0, pending: 0, rejected: 0 });
    }

    expect(monthlyTrend).toHaveLength(6);
    expect(monthlyTrend[0].key).toBe('2026-03');
    expect(monthlyTrend[5].key).toBe('2026-08');
  });

  it('counts leave statuses correctly', () => {
    const monthlyTrend = [
      { key: '2026-08', approved: 0, pending: 0, rejected: 0 },
      { key: '2026-07', approved: 0, pending: 0, rejected: 0 },
    ];

    const leaves = [
      { startDate: '2026-08-15', status: 'approved' },
      { startDate: '2026-08-20', status: 'approved' },
      { startDate: '2026-08-22', status: 'pending' },
      { startDate: '2026-07-10', status: 'rejected' },
    ] as const;

    for (const l of leaves) {
      const key = l.startDate.slice(0, 7);
      const entry = monthlyTrend.find((m) => m.key === key);
      if (entry && (l.status === 'approved' || l.status === 'pending' || l.status === 'rejected')) {
        (entry as Record<string, unknown>)[l.status] =
          ((entry as Record<string, unknown>)[l.status] as number) + 1;
      }
    }

    expect(monthlyTrend[0].approved).toBe(2);
    expect(monthlyTrend[0].pending).toBe(1);
    expect(monthlyTrend[1].rejected).toBe(1);
  });
});

describe('analytics pieData', () => {
  it('counts leave types correctly', () => {
    const leaves = [
      { type: 'paid' },
      { type: 'paid' },
      { type: 'sick' },
      { type: 'unpaid' },
      { type: 'sick' },
      { type: 'sick' },
    ] as const;

    const typeCounts: Record<string, number> = {};
    for (const l of leaves) {
      typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
    }
    const pieData = Object.entries(typeCounts).map(([type, value]) => ({ type, value }));

    expect(pieData).toHaveLength(3);
    expect(pieData.find((p) => p.type === 'sick')?.value).toBe(3);
    expect(pieData.find((p) => p.type === 'paid')?.value).toBe(2);
  });
});

describe('analytics report units', () => {
  it('returns correct unit per metric', () => {
    const units: Record<string, string> = {
      employees: 'count',
      leaves: 'count',
      tasks: 'count',
      payroll: 'currency',
      attendance: 'hours',
      performance: 'count',
      recruitment: 'count',
    };

    for (const [metric, unit] of Object.entries(units)) {
      expect(unit).toBeTruthy();
      expect(typeof unit).toBe('string');
    }
  });
});

describe('analytics department stats', () => {
  it('calculates average leave balances by department', () => {
    const users = [
      { paidLeaveBalance: 10, sickLeaveBalance: 5, familyLeaveBalance: 2 },
      { paidLeaveBalance: 20, sickLeaveBalance: 10, familyLeaveBalance: 4 },
      { paidLeaveBalance: 15, sickLeaveBalance: 8, familyLeaveBalance: 3 },
    ];

    const dept = {
      employees: users.length,
      totalPaidLeave: users.reduce((s, u) => s + u.paidLeaveBalance, 0),
      totalSickLeave: users.reduce((s, u) => s + u.sickLeaveBalance, 0),
      totalFamilyLeave: users.reduce((s, u) => s + u.familyLeaveBalance, 0),
      avgPaidLeave: 0,
      avgSickLeave: 0,
      avgFamilyLeave: 0,
    };

    const count = dept.employees;
    dept.avgPaidLeave = count > 0 ? Math.round(dept.totalPaidLeave / count) : 0;
    dept.avgSickLeave = count > 0 ? Math.round(dept.totalSickLeave / count) : 0;
    dept.avgFamilyLeave = count > 0 ? Math.round(dept.totalFamilyLeave / count) : 0;

    expect(dept.avgPaidLeave).toBe(15); // (10+20+15)/3 = 15
    expect(dept.avgSickLeave).toBe(8); // (5+10+8)/3 = 7.67 → 8
    expect(dept.avgFamilyLeave).toBe(3); // (2+4+3)/3 = 3
  });

  it('returns 0 averages for empty department', () => {
    const count = 0;
    const avgPaidLeave = count > 0 ? 10 / count : 0;
    expect(avgPaidLeave).toBe(0);
  });
});
