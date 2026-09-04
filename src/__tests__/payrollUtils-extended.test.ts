/**
 * Extended tests for src/lib/payrollUtils.ts — covering functions that existing
 * tests don't fully exercise.
 */

import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getStatusColor,
  calculateEffectiveTaxRate,
  getPayrollSummary,
  filterPayrollRuns,
  exportToCSV,
} from '@/lib/payrollUtils';

describe('payrollUtils (extended)', () => {
  describe('formatCurrency', () => {
    it('formats AMD by default', () => {
      const result = formatCurrency(150000);
      expect(result).toContain('150');
    });

    it('formats USD', () => {
      const result = formatCurrency(1000, 'USD');
      expect(result).toContain('1');
    });

    it('formats EUR', () => {
      const result = formatCurrency(500, 'EUR');
      expect(result).toContain('5');
    });

    it('formats zero', () => {
      const result = formatCurrency(0);
      expect(result).toBeDefined();
    });

    it('formats negative values', () => {
      const result = formatCurrency(-1000);
      expect(result).toContain('1');
    });

    it('formats large numbers', () => {
      const result = formatCurrency(1000000000);
      expect(result).toBeDefined();
    });
  });

  describe('formatDate', () => {
    const timestamp = new Date(2025, 0, 15).getTime();

    it('formats in English by default', () => {
      const result = formatDate(timestamp);
      expect(result).toContain('2025');
      expect(result).toContain('Jan');
    });

    it('formats in Russian', () => {
      const result = formatDate(timestamp, 'ru');
      expect(result).toContain('2025');
    });

    it('formats in Armenian', () => {
      const result = formatDate(timestamp, 'hy');
      expect(result).toContain('2025');
    });

    it('handles unknown language as English', () => {
      const result = formatDate(timestamp, 'de');
      expect(result).toContain('2025');
    });
  });

  describe('formatDateTime', () => {
    const timestamp = new Date(2025, 0, 15, 14, 30).getTime();

    it('formats date and time in English', () => {
      const result = formatDateTime(timestamp);
      expect(result).toContain('2025');
    });

    it('formats in Russian', () => {
      const result = formatDateTime(timestamp, 'ru');
      expect(result).toContain('2025');
    });

    it('formats in Armenian', () => {
      const result = formatDateTime(timestamp, 'hy');
      expect(result).toContain('2025');
    });
  });

  describe('getStatusColor', () => {
    it('returns color for draft', () => {
      expect(getStatusColor('draft')).toContain('text');
    });

    it('returns color for calculated', () => {
      expect(getStatusColor('calculated')).toContain('text');
    });

    it('returns color for approved', () => {
      expect(getStatusColor('approved')).toContain('text');
    });

    it('returns color for paid', () => {
      expect(getStatusColor('paid')).toContain('text');
    });

    it('returns color for cancelled', () => {
      expect(getStatusColor('cancelled')).toContain('text');
    });

    it('returns default for unknown status', () => {
      expect(getStatusColor('unknown')).toContain('text');
    });

    it('returns default for empty string', () => {
      expect(getStatusColor('')).toContain('text');
    });
  });

  describe('calculateEffectiveTaxRate', () => {
    it('calculates correct tax rate', () => {
      expect(calculateEffectiveTaxRate(100000, 20000)).toBe(20);
    });

    it('returns 0 when gross is 0', () => {
      expect(calculateEffectiveTaxRate(0, 0)).toBe(0);
    });

    it('returns 0 for zero deductions', () => {
      expect(calculateEffectiveTaxRate(100000, 0)).toBe(0);
    });

    it('handles 100% tax rate', () => {
      expect(calculateEffectiveTaxRate(1000, 1000)).toBe(100);
    });

    it('rounds to 2 decimal places', () => {
      const result = calculateEffectiveTaxRate(300, 100);
      expect(result).toBe(33.33);
    });
  });

  describe('getPayrollSummary', () => {
    it('returns correct summary for multiple records', () => {
      const records = [
        {
          grossSalary: 100000,
          netSalary: 80000,
          baseSalary: 90000,
          period: '2025-01',
          status: 'paid',
          createdAt: 1,
          deductions: { total: 20000 },
        },
        {
          grossSalary: 120000,
          netSalary: 96000,
          baseSalary: 110000,
          period: '2025-02',
          status: 'paid',
          createdAt: 2,
          deductions: { total: 24000 },
        },
      ];
      const summary = getPayrollSummary(records);
      expect(summary.totalGross).toBe(220000);
      expect(summary.totalNet).toBe(176000);
      expect(summary.totalDeductions).toBe(44000);
      expect(summary.averageSalary).toBe(88000);
      expect(summary.highestSalary).toBe(96000);
      expect(summary.lowestSalary).toBe(80000);
      expect(summary.employeeCount).toBe(2);
    });

    it('returns zeros for empty records', () => {
      const summary = getPayrollSummary([]);
      expect(summary.totalGross).toBe(0);
      expect(summary.totalNet).toBe(0);
      expect(summary.averageSalary).toBe(0);
      expect(summary.highestSalary).toBe(0);
      expect(summary.lowestSalary).toBe(0);
      expect(summary.employeeCount).toBe(0);
    });

    it('handles records without deductions', () => {
      const records = [
        {
          grossSalary: 100000,
          netSalary: 80000,
          baseSalary: 90000,
          period: '2025-01',
          status: 'paid',
          createdAt: 1,
        },
      ];
      const summary = getPayrollSummary(records);
      expect(summary.totalDeductions).toBe(0);
    });
  });

  describe('filterPayrollRuns', () => {
    const runs = [
      {
        grossSalary: 100000,
        netSalary: 80000,
        baseSalary: 90000,
        period: '2025-01',
        status: 'paid',
        createdAt: 3,
        notes: 'January payroll',
      },
      {
        grossSalary: 120000,
        netSalary: 96000,
        baseSalary: 110000,
        period: '2025-02',
        status: 'approved',
        createdAt: 2,
        notes: 'February bonus',
      },
      {
        grossSalary: 110000,
        netSalary: 88000,
        baseSalary: 100000,
        period: '2025-02',
        status: 'draft',
        createdAt: 1,
        notes: 'March draft',
      },
    ];

    it('returns all when no filters', () => {
      const result = filterPayrollRuns(runs, {});
      expect(result).toHaveLength(3);
    });

    it('filters by status', () => {
      const result = filterPayrollRuns(runs, { status: 'paid' });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('paid');
    });

    it('status "all" returns all records', () => {
      const result = filterPayrollRuns(runs, { status: 'all' });
      expect(result).toHaveLength(3);
    });

    it('filters by period', () => {
      const result = filterPayrollRuns(runs, { period: '2025-02' });
      expect(result).toHaveLength(2);
    });

    it('filters by search term in period', () => {
      const result = filterPayrollRuns(runs, { search: '2025-01' });
      expect(result).toHaveLength(1);
    });

    it('filters by search term in notes', () => {
      const result = filterPayrollRuns(runs, { search: 'bonus' });
      expect(result).toHaveLength(1);
    });

    it('search is case-insensitive', () => {
      const result = filterPayrollRuns(runs, { search: 'BONUS' });
      expect(result).toHaveLength(1);
    });

    it('sorts by createdAt descending', () => {
      const result = filterPayrollRuns(runs, {});
      expect(result[0].createdAt).toBe(3);
      expect(result[1].createdAt).toBe(2);
      expect(result[2].createdAt).toBe(1);
    });
  });

  describe('exportToCSV', () => {
    it('generates CSV header', () => {
      const csv = exportToCSV([]);
      expect(csv).toContain('Employee');
      expect(csv).toContain('Period');
      expect(csv).toContain('Gross Salary');
    });

    it('generates CSV with data', () => {
      const records = [
        {
          grossSalary: 100000,
          netSalary: 80000,
          baseSalary: 90000,
          period: '2025-01',
          status: 'paid',
          createdAt: Date.now(),
          user: { name: 'John', email: 'john@test.com' },
        },
      ];
      const csv = exportToCSV(records);
      expect(csv).toContain('John');
      expect(csv).toContain('john@test.com');
    });

    it('handles records without user info', () => {
      const records = [
        {
          grossSalary: 100000,
          netSalary: 80000,
          baseSalary: 90000,
          period: '2025-01',
          status: 'paid',
          createdAt: Date.now(),
        },
      ];
      const csv = exportToCSV(records);
      expect(csv).toContain('Unknown');
    });

    it('handles records with optional fields', () => {
      const records = [
        {
          grossSalary: 100000,
          netSalary: 80000,
          baseSalary: 90000,
          period: '2025-01',
          status: 'paid',
          createdAt: Date.now(),
          bonuses: 5000,
          overtimePay: 2000,
          deductions: { incomeTax: 10000, socialSecurity: 5000, total: 20000 },
        },
      ];
      const csv = exportToCSV(records);
      expect(csv).toContain('5000');
      expect(csv).toContain('10000');
    });
  });
});
