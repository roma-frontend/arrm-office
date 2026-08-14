export interface PayrollRecord {
  grossSalary: number;
  netSalary: number;
  baseSalary: number;
  period: string;
  status: string;
  createdAt: number;
  bonuses?: number;
  overtimePay?: number;
  notes?: string;
  deductions?: {
    total?: number;
    incomeTax?: number;
    socialSecurity?: number;
  };
  user?: {
    name?: string;
    email?: string;
  };
}

export function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(timestamp: number, lang = 'en'): string {
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'hy' ? 'hy-AM' : 'en-US';
  return new Date(timestamp).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(timestamp: number, lang = 'en'): string {
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'hy' ? 'hy-AM' : 'en-US';
  return new Date(timestamp).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'text-(--text-3) bg-(--surface-2)',
    calculated: 'text-(--brand-text) bg-(--brand-quiet)',
    approved: 'text-(--success-text) bg-(--success-quiet)',
    paid: 'text-(--success-text) bg-(--success-quiet)',
    cancelled: 'text-(--danger-text) bg-(--danger-quiet)',
  };
  return colors[status] || 'text-(--text-3) bg-(--surface-2)';
}

export function calculateEffectiveTaxRate(gross: number, deductions: number): number {
  if (gross === 0) return 0;
  return Math.round((deductions / gross) * 10000) / 100;
}

export function getPayrollSummary(records: PayrollRecord[]) {
  const totalGross = records.reduce((sum, r) => sum + r.grossSalary, 0);
  const totalNet = records.reduce((sum, r) => sum + r.netSalary, 0);
  const totalDeductions = records.reduce((sum, r) => sum + (r.deductions?.total || 0), 0);
  const averageSalary = records.length > 0 ? totalNet / records.length : 0;
  const highestSalary = records.length > 0 ? Math.max(...records.map((r) => r.netSalary)) : 0;
  const lowestSalary = records.length > 0 ? Math.min(...records.map((r) => r.netSalary)) : 0;

  return {
    totalGross,
    totalNet,
    totalDeductions,
    averageSalary,
    highestSalary,
    lowestSalary,
    employeeCount: records.length,
  };
}

export function filterPayrollRuns(
  runs: PayrollRecord[],
  filters: {
    status?: string;
    period?: string;
    search?: string;
  },
) {
  let filtered = [...runs];

  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter((r) => r.status === filters.status);
  }

  if (filters.period) {
    filtered = filtered.filter((r) => r.period === filters.period);
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.period.toLowerCase().includes(searchLower) ||
        r.notes?.toLowerCase().includes(searchLower),
    );
  }

  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function exportToCSV(records: PayrollRecord[]): string {
  const headers = [
    'Employee',
    'Email',
    'Period',
    'Base Salary',
    'Gross Salary',
    'Net Salary',
    'Bonuses',
    'Overtime Pay',
    'Income Tax',
    'Social Security',
    'Total Deductions',
    'Status',
    'Created At',
  ];

  const rows = records.map((r) => [
    r.user?.name || 'Unknown',
    r.user?.email || '',
    r.period,
    r.baseSalary.toString(),
    r.grossSalary.toString(),
    r.netSalary.toString(),
    (r.bonuses || 0).toString(),
    (r.overtimePay || 0).toString(),
    (r.deductions?.incomeTax || 0).toString(),
    (r.deductions?.socialSecurity || 0).toString(),
    (r.deductions?.total || 0).toString(),
    r.status,
    formatDate(r.createdAt),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return csvContent;
}

export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
