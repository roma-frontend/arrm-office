import {
  calculateEffectiveTaxRate,
  getPayrollSummary,
  filterPayrollRuns,
  getStatusColor,
  formatCurrency,
  formatDate,
  formatDateTime,
  exportToCSV,
  downloadCSV,
} from '@/lib/payrollUtils';

describe('calculateEffectiveTaxRate', () => {
  it('calculates correct rate', () => {
    expect(calculateEffectiveTaxRate(100000, 20000)).toBe(20);
  });

  it('returns 0 for zero gross', () => {
    expect(calculateEffectiveTaxRate(0, 5000)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(calculateEffectiveTaxRate(100000, 12345)).toBe(12.35);
  });

  it('handles 100% tax rate', () => {
    expect(calculateEffectiveTaxRate(50000, 50000)).toBe(100);
  });
});

describe('getPayrollSummary', () => {
  const mockRecords = [
    { grossSalary: 100000, netSalary: 80000, deductions: { total: 20000 } },
    { grossSalary: 120000, netSalary: 96000, deductions: { total: 24000 } },
  ];

  it('calculates totals correctly', () => {
    const summary = getPayrollSummary(mockRecords);
    expect(summary.totalGross).toBe(220000);
    expect(summary.totalNet).toBe(176000);
    expect(summary.totalDeductions).toBe(44000);
  });

  it('calculates average salary correctly', () => {
    const summary = getPayrollSummary(mockRecords);
    expect(summary.averageSalary).toBe(88000);
  });

  it('finds highest and lowest salaries', () => {
    const summary = getPayrollSummary(mockRecords);
    expect(summary.highestSalary).toBe(96000);
    expect(summary.lowestSalary).toBe(80000);
  });

  it('counts employees correctly', () => {
    const summary = getPayrollSummary(mockRecords);
    expect(summary.employeeCount).toBe(2);
  });

  it('handles empty array', () => {
    const summary = getPayrollSummary([]);
    expect(summary.totalGross).toBe(0);
    expect(summary.totalNet).toBe(0);
    expect(summary.averageSalary).toBe(0);
    expect(summary.highestSalary).toBe(0);
    expect(summary.lowestSalary).toBe(0);
    expect(summary.employeeCount).toBe(0);
  });
});

describe('filterPayrollRuns', () => {
  const mockRuns = [
    { status: 'completed', period: '2024-01', notes: 'Acme Corp payroll', createdAt: 1000 },
    { status: 'pending', period: '2024-02', notes: 'Beta Inc payroll', createdAt: 2000 },
    { status: 'completed', period: '2024-03', notes: 'Gamma LLC payroll', createdAt: 3000 },
  ];

  it('filters by status', () => {
    const result = filterPayrollRuns(mockRuns, { status: 'completed' });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.status === 'completed')).toBe(true);
  });

  it('filters by period', () => {
    const result = filterPayrollRuns(mockRuns, { period: '2024-02' });
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2024-02');
  });

  it('filters by search text (case-insensitive)', () => {
    const result = filterPayrollRuns(mockRuns, { search: 'acme' });
    expect(result).toHaveLength(1);
    expect(result[0].notes).toContain('Acme');
  });

  it('combines multiple filters', () => {
    const result = filterPayrollRuns(mockRuns, { status: 'completed', search: 'gamma' });
    expect(result).toHaveLength(1);
    expect(result[0].notes).toContain('Gamma');
  });

  it('sorts by createdAt descending', () => {
    const result = filterPayrollRuns(mockRuns, {});
    expect(result[0].createdAt).toBe(3000);
    expect(result[result.length - 1].createdAt).toBe(1000);
  });

  it('returns all runs when no filters applied', () => {
    const result = filterPayrollRuns(mockRuns, {});
    expect(result).toHaveLength(3);
  });
});

describe('getStatusColor', () => {
  it('returns green for paid', () => {
    expect(getStatusColor('paid')).toContain('emerald');
  });

  it('returns blue for calculated', () => {
    expect(getStatusColor('calculated')).toContain('blue');
  });

  it('returns red for cancelled', () => {
    expect(getStatusColor('cancelled')).toContain('red');
  });

  it('returns gray for unknown status', () => {
    expect(getStatusColor('unknown')).toContain('gray');
  });
});

describe('formatCurrency', () => {
  it('formats with AMD by default', () => {
    const result = formatCurrency(100000);
    expect(result).toContain('100');
    expect(result).toContain('AMD');
  });

  it('formats with specified currency', () => {
    const result = formatCurrency(1000, 'USD');
    expect(result).toContain('$');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('has no fraction digits', () => {
    const result = formatCurrency(100.5);
    expect(result).not.toContain('.50');
  });
});

describe('formatDate', () => {
  it('formats timestamp to locale date', () => {
    const result = formatDate(1704067200000);
    expect(result).toMatch(/Jan|January|1\/1\/2024|01\/01\/2024/);
  });
});

describe('formatDateTime', () => {
  it('formats timestamp to locale date and time', () => {
    const result = formatDateTime(1704067200000);
    expect(result.length).toBeGreaterThan(formatDate(1704067200000).length);
  });

  it('handles Russian locale', () => {
    const result = formatDateTime(1704067200000, 'ru');
    expect(result).toBeDefined();
  });

  it('handles Armenian locale', () => {
    const result = formatDateTime(1704067200000, 'hy');
    expect(result).toBeDefined();
  });

  it('includes time component', () => {
    const dateResult = formatDate(1704067200000);
    const dateTimeResult = formatDateTime(1704067200000);
    expect(dateTimeResult).not.toBe(dateResult);
  });
});

describe('exportToCSV', () => {
  const mockRecords = [
    {
      user: { name: 'John Doe', email: 'john@example.com' },
      period: '2024-01',
      baseSalary: 100000,
      grossSalary: 120000,
      netSalary: 96000,
      bonuses: 20000,
      overtimePay: 5000,
      deductions: { incomeTax: 20000, socialSecurity: 5000, total: 25000 },
      status: 'paid',
      createdAt: 1704067200000,
    },
    {
      user: { name: 'Jane Smith', email: 'jane@example.com' },
      period: '2024-01',
      baseSalary: 150000,
      grossSalary: 180000,
      netSalary: 144000,
      bonuses: 30000,
      overtimePay: 0,
      deductions: { incomeTax: 30000, socialSecurity: 7500, total: 37500 },
      status: 'pending',
      createdAt: 1704067200000,
    },
  ];

  it('returns CSV string with headers', () => {
    const csv = exportToCSV(mockRecords);
    expect(csv).toContain('Employee,Email,Period,Base Salary,Gross Salary,Net Salary');
  });

  it('includes all record data in CSV', () => {
    const csv = exportToCSV(mockRecords);
    expect(csv).toContain('John Doe');
    expect(csv).toContain('Jane Smith');
    expect(csv).toContain('john@example.com');
    expect(csv).toContain('jane@example.com');
  });

  it('quotes cell values', () => {
    const csv = exportToCSV(mockRecords);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('"');
  });

  it('handles unknown user gracefully', () => {
    const records = [
      {
        period: '2024-01',
        baseSalary: 0,
        grossSalary: 0,
        netSalary: 0,
        deductions: { total: 0 },
        status: 'draft',
        createdAt: 1704067200000,
      },
    ];
    const csv = exportToCSV(records);
    expect(csv).toContain('Unknown');
  });

  it('handles empty records', () => {
    const csv = exportToCSV([]);
    expect(csv).toContain('Employee');
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1); // Only header
  });
});

describe('downloadCSV', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;

  beforeAll(() => {
    originalCreateObjectURL = global.URL.createObjectURL;
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterAll(() => {
    global.URL.createObjectURL = originalCreateObjectURL;
    delete (global.URL as any).revokeObjectURL;
  });

  it('creates an anchor element and appends it to body', () => {
    const anchor = document.createElement('a');
    const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValue(anchor);
    const clickSpy = jest.spyOn(anchor, 'click');

    downloadCSV('test,csv', 'test.csv');

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(anchor.getAttribute('href')).toBe('blob:mock-url');
    expect(anchor.getAttribute('download')).toBe('test.csv');
    expect(clickSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('handles empty CSV content', () => {
    expect(() => downloadCSV('', 'empty.csv')).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED EXPANSION (+20 tests)
// ════════════════════════════════════════════════════════════════════════════

describe('calculateEffectiveTaxRate - parameterized', () => {
  const cases = [
    [100000, 0, 0],
    [100000, 10000, 10],
    [100000, 25000, 25],
    [50000, 50000, 100],
    [0, 5000, 0],
    [100000, 12345, 12.35],
    [100000, 12346, 12.35],
    [1, 1, 100],
  ];
  test.each(cases)('gross=%s tax=%s -> %s%%', (gross, tax, expected) => {
    expect(calculateEffectiveTaxRate(gross as number, tax as number)).toBe(expected);
  });
});

describe('getPayrollSummary - parameterized', () => {
  it('handles single employee', () => {
    const summary = getPayrollSummary([
      { grossSalary: 50000, netSalary: 40000, deductions: { total: 10000 } },
    ]);
    expect(summary.employeeCount).toBe(1);
    expect(summary.totalGross).toBe(50000);
    expect(summary.averageSalary).toBe(40000);
  });
  it('handles many employees', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      grossSalary: (i + 1) * 50000,
      netSalary: (i + 1) * 40000,
      deductions: { total: (i + 1) * 10000 },
    }));
    const summary = getPayrollSummary(records);
    expect(summary.employeeCount).toBe(10);
    expect(summary.totalGross).toBe(50000 * 55);
    expect(summary.lowestSalary).toBe(40000);
    expect(summary.highestSalary).toBe(400000);
  });
});

describe('filterPayrollRuns - parameterized', () => {
  const runs = [
    { status: 'completed', period: '2024-01', notes: 'Alpha payroll', createdAt: 1 },
    { status: 'pending', period: '2024-02', notes: 'Beta payroll', createdAt: 2 },
    { status: 'completed', period: '2024-03', notes: 'Gamma payroll', createdAt: 3 },
  ];
  const filterCases = [
    [{ status: 'completed' }, 2],
    [{ status: 'pending' }, 1],
    [{ status: 'draft' }, 0],
    [{ period: '2024-02' }, 1],
    [{ search: 'alpha' }, 1],
    [{ search: 'payroll' }, 3],
  ];
  test.each(filterCases)('filter %j returns %s results', (filters, expected) => {
    expect(filterPayrollRuns(runs, filters)).toHaveLength(expected as number);
  });
});

describe('getStatusColor - parameterized', () => {
  const cases = [
    ['paid', 'emerald'],
    ['calculated', 'blue'],
    ['cancelled', 'red'],
    ['draft', 'gray'],
    ['approved', 'green'],
    ['unknown', 'gray'],
    ['pending', 'gray'],
    ['', 'gray'],
  ];
  test.each(cases)('status %s returns color containing %s', (status, colorHint) => {
    const result = getStatusColor(status);
    expect(result).toContain(colorHint);
  });
});

describe('formatCurrency - parameterized', () => {
  const cases = [0, 100, 1000, 100000, 999999];
  test.each(cases)('formats amount %s without throwing', (amount) => {
    const result = formatCurrency(amount);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});
