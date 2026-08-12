/**
 * Tests for PayrollDashboard — the payroll dashboard.
 *
 * Mocks: convex/react (useQuery keyed by ref name with args recording),
 * next/navigation (useRouter with replace, useSearchParams with a mutable
 * param map, Link → anchor), react-i18next with a tMode flag, theme, auth
 * store (mutable user), selected-org hook, generated api, UI primitives
 * (Card/Badge/Button/StatsCard), dynamic-imports chart stubs (invoking
 * label/formatter/legend props), lucide icons keyed by name, and the four
 * children (PayrollUpcomingBanner, PayrollCalendar, PayslipViewer,
 * CreatePayrollRunDialog) as stubs.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

let tMode: 'fallback' | 'empty' = 'fallback';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (tMode === 'empty') return '';
      return typeof fallback === 'string' ? fallback : key;
    },
  }),
}));

let mockTheme: string = 'light';
jest.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ resolvedTheme: mockTheme }),
}));

let mockUser: any = { id: 'u1', role: 'admin', organizationId: 'org-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

let mockSelectedOrg: string | null = null;
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

let mockParam: string | null = null;
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'new' ? mockParam : null) }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let queryResults: Record<string, unknown> = {};
let queryCalls: Record<string, unknown[]> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args?: unknown) => {
    const name = ref?._name ?? '';
    queryCalls[name] = [...(queryCalls[name] ?? []), args];
    // Mirror real Convex semantics: 'skip' yields no result.
    return args === 'skip' ? undefined : queryResults[name];
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    payroll: {
      queries: {
        getDashboardStats: { _name: 'getDashboardStats' },
        getPayrollRuns: { _name: 'getPayrollRuns' },
      },
    },
  },
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/dashboard/StatsCard', () => ({
  StatsCard: ({ title, value, color }: any) => (
    <div data-testid="stats-card" data-color={color}>
      {title}: {value}
    </div>
  ),
}));

jest.mock('lucide-react', () => {
  const names = [
    'DollarSign',
    'TrendingUp',
    'Users',
    'Clock',
    'CheckCircle',
    'AlertCircle',
    'ArrowRight',
    'FileText',
    'Settings',
  ];
  const out: Record<string, (props: any) => React.ReactElement> = {};
  names.forEach((n) => {
    out[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  });
  return out;
});

// ── Chart mocks: invoke label / formatter / legend props so branches run ───
jest.mock('@/lib/dynamic-imports', () => {
  const MockResponsiveContainer = ({ children, ...props }: any) => (
    <div data-testid="responsive-container" {...props}>
      {children}
    </div>
  );
  const MockBarChart = ({ data, ...props }: any) => (
    <div data-testid="bar-chart" data-chart={JSON.stringify(data)} {...props} />
  );
  const MockPieChart = ({ children }: any) => <div data-testid="pie-chart">{children}</div>;
  const MockBar = () => <div data-testid="bar" />;
  const MockPie = ({ data, label, children }: any) => {
    // Cover the `entry.percent ?? 0` nullish side both ways.
    label?.({ name: 'Gross', percent: 0.25 });
    label?.({ name: 'Net' });
    return (
      <div data-testid="pie" data-chart={JSON.stringify(data)}>
        {children}
      </div>
    );
  };
  const MockCell = (props: any) => <div data-testid="cell" {...props} />;
  const MockXAxis = () => <div data-testid="x-axis" />;
  const MockYAxis = () => <div data-testid="y-axis" />;
  const MockCartesianGrid = () => <div data-testid="grid" />;
  const MockTooltip = ({ contentStyle, formatter }: any) => {
    formatter?.(42, 'value');
    return (
      <div data-testid="tooltip" data-bg={contentStyle?.backgroundColor}>
        tooltip
      </div>
    );
  };
  const MockLegend = ({ formatter }: any) => {
    formatter?.('Total Gross');
    return <div data-testid="legend">legend</div>;
  };
  return {
    ResponsiveContainer: MockResponsiveContainer,
    BarChart: MockBarChart,
    Bar: MockBar,
    XAxis: MockXAxis,
    YAxis: MockYAxis,
    CartesianGrid: MockCartesianGrid,
    Tooltip: MockTooltip,
    PieChart: MockPieChart,
    Pie: MockPie,
    Cell: MockCell,
    Legend: MockLegend,
  };
});

let dialogProps: any = null;
jest.mock('@/components/payroll/PayrollRunDialogs', () => ({
  CreatePayrollRunDialog: (props: any) => {
    dialogProps = props;
    return props.open ? <div data-testid="new-run-dialog">dialog</div> : null;
  },
}));

jest.mock('@/components/payroll/PayrollUpcomingBanner', () => ({
  __esModule: true,
  default: () => <div data-testid="upcoming-banner">banner</div>,
}));

jest.mock('@/components/payroll/PayrollCalendar', () => ({
  __esModule: true,
  default: () => <div data-testid="payroll-calendar">calendar</div>,
}));

jest.mock('@/components/payroll/PayslipViewer', () => ({
  __esModule: true,
  default: () => <div data-testid="payslip-viewer">payslips</div>,
}));

import PayrollDashboard from '@/components/payroll/PayrollDashboard';

const STATS: any = {
  totalGross: 5000000,
  totalNet: 4200000,
  totalDeductions: 800000,
  pendingRuns: 2,
  paidRuns: 3,
};

const RUNS: any[] = [
  {
    _id: 'r1',
    period: 'July 2026',
    status: 'paid',
    totalGross: 1000000,
    totalNet: 850000,
    recordCount: 12,
  },
  {
    _id: 'r2',
    period: 'June 2026',
    status: 'approved',
    totalGross: 900000,
    totalNet: 760000,
    recordCount: 12,
  },
  {
    _id: 'r3',
    period: 'May 2026',
    status: 'calculated',
    totalGross: 950000,
    totalNet: 810000,
    recordCount: 11,
  },
  {
    _id: 'r4',
    period: 'April 2026',
    status: 'draft',
    totalGross: 800000,
    totalNet: 680000,
    recordCount: 10,
  },
  {
    _id: 'r5',
    period: 'March 2026',
    status: 'cancelled',
    totalGross: 0,
    totalNet: 0,
    recordCount: 9,
  },
  {
    _id: 'r6',
    period: 'February 2026',
    status: 'mystery',
    totalGross: 700000,
    totalNet: 600000,
    recordCount: 8,
  },
];

describe('PayrollDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tMode = 'fallback';
    mockTheme = 'light';
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    mockSelectedOrg = null;
    mockParam = null;
    queryResults = {
      getDashboardStats: STATS,
      getPayrollRuns: RUNS,
    };
    queryCalls = {};
    dialogProps = null;
  });

  const lastArgs = (name: string) => {
    const calls = queryCalls[name] ?? [];
    return calls[calls.length - 1];
  };

  // ── Org gate ─────────────────────────────────────────────────────────────

  it('shows the select-organization card and skips queries without an org', () => {
    mockUser = { id: 'u1', role: 'admin' };
    render(<PayrollDashboard />);
    expect(screen.getByText('common.selectOrganization')).toBeInTheDocument();
    expect(lastArgs('getDashboardStats')).toBe('skip');
    expect(lastArgs('getPayrollRuns')).toBe('skip');
  });

  // ── Onboarding (no data, admin) ──────────────────────────────────────────

  it('shows the get-started onboarding card for admins without data', () => {
    queryResults.getDashboardStats = {
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      pendingRuns: 0,
      paidRuns: 0,
    };
    queryResults.getPayrollRuns = [];
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.getStartedTitle')).toBeInTheDocument();
    expect(screen.getByText('payroll.configureSettings')).toBeInTheDocument();
    expect(screen.getByText('payroll.setSalaries')).toBeInTheDocument();
    expect(screen.getByText('payroll.createFirstRun')).toBeInTheDocument();
    // Settings link points to the payroll settings page.
    expect(screen.getByText('payroll.configureSettings').closest('a')?.getAttribute('href')).toBe(
      '/payroll/settings',
    );
    expect(screen.getByText('payroll.setSalaries').closest('a')?.getAttribute('href')).toBe(
      '/employees',
    );
  });

  it('hides the onboarding card when there is payroll data', () => {
    render(<PayrollDashboard />);
    expect(screen.queryByText('payroll.getStartedTitle')).not.toBeInTheDocument();
    expect(screen.getByText('payroll.newRun')).toBeInTheDocument();
  });

  // ── hasAnyData branches ──────────────────────────────────────────────────

  it('shows the dashboard when only pending runs are non-zero', () => {
    queryResults.getDashboardStats = {
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      pendingRuns: 1,
      paidRuns: 0,
    };
    queryResults.getPayrollRuns = [];
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.newRun')).toBeInTheDocument();
    expect(screen.getByText('payroll.fundOverview')).toBeInTheDocument();
  });

  it('shows the dashboard when only paid runs are non-zero', () => {
    queryResults.getDashboardStats = {
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      pendingRuns: 0,
      paidRuns: 1,
    };
    queryResults.getPayrollRuns = [];
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.newRun')).toBeInTheDocument();
  });

  it('shows the dashboard when recent runs exist even with zero stats', () => {
    queryResults.getDashboardStats = {
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      pendingRuns: 0,
      paidRuns: 0,
    };
    queryResults.getPayrollRuns = [{ _id: 'x', period: 'X', status: 'draft', recordCount: 1 }];
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.newRun')).toBeInTheDocument();
  });

  // ── Header & stats ───────────────────────────────────────────────────────

  it('renders the sticky header with title and New Payroll Run button', () => {
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.title')).toBeInTheDocument();
    expect(screen.getByText('payroll.subtitle')).toBeInTheDocument();
    expect(screen.getByText('payroll.newRun')).toBeInTheDocument();
  });

  it('renders the four stat cards with formatted currency', () => {
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.totalPayroll: AMD 5,000,000')).toBeInTheDocument();
    expect(screen.getByText('payroll.totalNet: AMD 4,200,000')).toBeInTheDocument();
    expect(screen.getByText('payroll.pendingAmount: 2')).toBeInTheDocument();
    expect(screen.getByText('payroll.paidAmount: 3')).toBeInTheDocument();
    expect(screen.getAllByTestId('stats-card').length).toBe(4);
  });

  it('defaults the stats to zero when the query is pending', () => {
    queryResults.getDashboardStats = undefined;
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.totalPayroll: AMD 0')).toBeInTheDocument();
    expect(screen.getByText('payroll.pendingAmount: 0')).toBeInTheDocument();
  });

  it('passes the organization id to the queries', () => {
    render(<PayrollDashboard />);
    expect(lastArgs('getDashboardStats')).toEqual({ organizationId: 'org-1' });
    expect(lastArgs('getPayrollRuns')).toEqual({ organizationId: 'org-1' });
  });

  it('prefers the selected organization over the user organization', () => {
    mockSelectedOrg = 'org-2';
    render(<PayrollDashboard />);
    expect(lastArgs('getDashboardStats')).toEqual({ organizationId: 'org-2' });
  });

  // ── Charts ───────────────────────────────────────────────────────────────

  it('renders bar and pie charts with the three fund metrics', () => {
    const { container } = render(<PayrollDashboard />);
    const barChart = container.querySelector('[data-testid="bar-chart"]')!;
    const chart = barChart.getAttribute('data-chart') ?? '';
    expect(chart).toContain('payroll.totalGross');
    expect(chart).toContain('payroll.totalNet');
    expect(chart).toContain('payroll.totalDeductions');

    const pie = container.querySelector('[data-testid="pie"]')!;
    expect(pie.getAttribute('data-chart')).toContain('payroll.totalNet');
    // One cell per fund metric, cycling through the palette.
    expect(container.querySelectorAll('[data-testid="cell"]').length).toBe(3);
  });

  it('uses dark tooltip colors when the theme is dark', () => {
    mockTheme = 'dark';
    render(<PayrollDashboard />);
    const tooltips = screen.getAllByTestId('tooltip');
    expect(tooltips.length).toBe(2);
    tooltips.forEach((el) => expect(el.getAttribute('data-bg')).toBe('#0f172a'));
  });

  it('uses light tooltip colors in light mode', () => {
    render(<PayrollDashboard />);
    screen.getAllByTestId('tooltip').forEach((el) => {
      expect(el.getAttribute('data-bg')).toBe('#ffffff');
    });
  });

  // ── Recent runs ──────────────────────────────────────────────────────────

  it('renders recent runs with status badges and links', () => {
    const { container } = render(<PayrollDashboard />);
    expect(screen.getByText('July 2026')).toBeInTheDocument();
    expect(screen.getAllByText('12 payroll.employees').length).toBeGreaterThan(0);
    expect(screen.getByText('AMD 1,000,000')).toBeInTheDocument();
    expect(screen.getByText('AMD 850,000')).toBeInTheDocument();

    const badges = screen.getAllByTestId('badge');
    expect(badges.find((b) => b.textContent === 'payroll.paid')?.getAttribute('data-variant')).toBe(
      'success',
    );
    expect(
      badges.find((b) => b.textContent === 'payroll.calculated')?.getAttribute('data-variant'),
    ).toBe('warning');
    expect(
      badges.find((b) => b.textContent === 'payroll.draft')?.getAttribute('data-variant'),
    ).toBe('secondary');

    // Run detail link (the arrow icon) and view-details link.
    expect(container.querySelector('a[href="/payroll/r1"]')).not.toBeNull();
    expect(screen.getByText('payroll.viewDetails').closest('a')?.getAttribute('href')).toBe(
      '/payroll/runs',
    );
  });

  it('renders a destructive badge for cancelled runs', () => {
    queryResults.getPayrollRuns = [
      { _id: 'rc', period: 'Cancel run', status: 'cancelled', recordCount: 1 },
    ];
    render(<PayrollDashboard />);
    expect(
      screen
        .getAllByTestId('badge')
        .find((b) => b.textContent === 'payroll.cancelled')
        ?.getAttribute('data-variant'),
    ).toBe('destructive');
  });

  it('falls back to a secondary badge for unknown statuses', () => {
    queryResults.getPayrollRuns = [
      { _id: 'rx', period: 'Odd run', status: 'mystery', recordCount: 1 },
    ];
    render(<PayrollDashboard />);
    expect(
      screen
        .getAllByTestId('badge')
        .find((b) => b.textContent === 'payroll.mystery')
        ?.getAttribute('data-variant'),
    ).toBe('secondary');
  });

  it('limits the recent runs list to five entries', () => {
    render(<PayrollDashboard />);
    expect(screen.getByText('July 2026')).toBeInTheDocument();
    expect(screen.queryByText('February 2026')).not.toBeInTheDocument();
  });

  it('shows the no-runs empty state', () => {
    queryResults.getPayrollRuns = [];
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.noRuns')).toBeInTheDocument();
  });

  // ── Roles ────────────────────────────────────────────────────────────────

  it('shows the payroll calendar for non-employees', () => {
    render(<PayrollDashboard />);
    expect(screen.getByTestId('payroll-calendar')).toBeInTheDocument();
    expect(screen.queryByTestId('payslip-viewer')).not.toBeInTheDocument();
  });

  it('shows the payslip self-service for employees and hides management UI', () => {
    mockUser = { id: 'u1', role: 'employee', organizationId: 'org-1' };
    render(<PayrollDashboard />);
    expect(screen.getByTestId('payslip-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('payroll-calendar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upcoming-banner')).not.toBeInTheDocument();
    expect(screen.queryByText('payroll.recentRuns')).not.toBeInTheDocument();
    expect(screen.queryByText('payroll.newRun')).not.toBeInTheDocument();
    expect(lastArgs('getDashboardStats')).toBe('skip');
  });

  it('shows the driver role the payslip viewer too', () => {
    mockUser = { id: 'u1', role: 'driver', organizationId: 'org-1' };
    render(<PayrollDashboard />);
    expect(screen.getByTestId('payslip-viewer')).toBeInTheDocument();
  });

  it('hides the New Run button and onboarding for supervisors but keeps the list', () => {
    mockUser = { id: 'u1', role: 'supervisor', organizationId: 'org-1' };
    render(<PayrollDashboard />);
    expect(screen.getByText('payroll.recentRuns')).toBeInTheDocument();
    expect(screen.queryByText('payroll.newRun')).not.toBeInTheDocument();
  });

  // ── Upcoming banner & dialog ─────────────────────────────────────────────

  it('renders the upcoming banner when data exists', () => {
    render(<PayrollDashboard />);
    expect(screen.getByTestId('upcoming-banner')).toBeInTheDocument();
  });

  it('opens the new-run dialog from the header button', () => {
    render(<PayrollDashboard />);
    expect(screen.queryByTestId('new-run-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('payroll.newRun'));
    expect(screen.getByTestId('new-run-dialog')).toBeInTheDocument();
    expect(dialogProps.organizationId).toBe('org-1');

    act(() => dialogProps.onOpenChange(false));
    expect(screen.queryByTestId('new-run-dialog')).not.toBeInTheDocument();
  });

  it('opens the new-run dialog from the onboarding create-first-run button', () => {
    queryResults.getDashboardStats = {
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      pendingRuns: 0,
      paidRuns: 0,
    };
    queryResults.getPayrollRuns = [];
    render(<PayrollDashboard />);
    fireEvent.click(screen.getByText('payroll.createFirstRun'));
    expect(screen.getByTestId('new-run-dialog')).toBeInTheDocument();
  });

  it('opens the dialog and cleans the query param when new=true', async () => {
    mockParam = 'true';
    render(<PayrollDashboard />);
    await waitFor(() => expect(screen.getByTestId('new-run-dialog')).toBeInTheDocument());
    // The 'new' param is stripped from the URL (pathname is environment-dependent).
    expect(mockReplace).toHaveBeenCalled();
    expect(mockReplace.mock.calls[0][0]).not.toContain('new');
  });

  it('does not open the dialog when the new param is not true', async () => {
    mockParam = 'false';
    render(<PayrollDashboard />);
    await waitFor(() => expect(screen.queryByTestId('new-run-dialog')).not.toBeInTheDocument());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── English fallback literals (t returns '') ─────────────────────────────

  it('renders the English get-started description fallback', () => {
    tMode = 'empty';
    queryResults.getDashboardStats = {
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      pendingRuns: 0,
      paidRuns: 0,
    };
    queryResults.getPayrollRuns = [];
    render(<PayrollDashboard />);
    expect(
      screen.getByText(
        'Configure tax country and currency, set salaries on each employee, then create your first payroll run.',
      ),
    ).toBeInTheDocument();
  });
});
