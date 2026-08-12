/**
 * Tests for ResponseTimeSLA — admin SLA response-time metrics dashboard.
 *
 * Mocks: convex/react queries keyed by ref name, ThemeProvider, i18n,
 * UI primitives (Card/Badge/Progress), recharts via @/lib/dynamic-imports,
 * lucide icons. The chart mocks invoke tickFormatter/labelFormatter so the
 * locale-formatting branches execute.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

const mockI18n = { language: 'en' };
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
    i18n: mockI18n,
  }),
}));

let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    sla: {
      getSLAStats: { _name: 'getSLAStats' },
      getSLATrend: { _name: 'getSLATrend' },
      getPendingWithSLA: { _name: 'getPendingWithSLA' },
    },
  },
}));

let mockTheme = 'light';
jest.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ resolvedTheme: mockTheme }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value, ...props }: any) => (
    <div data-testid="progress" data-value={value} {...props} />
  ),
}));

jest.mock('@/lib/dynamic-imports', () => {
  const Box = ({ children }: any) => <div>{children}</div>;
  // Invoke tick/label formatters so the locale-formatting branches execute.
  const Axis = ({ tickFormatter }: any) => {
    if (tickFormatter) tickFormatter('2026-01-15');
    return null;
  };
  const Chart = ({ children, data }: any) => (
    <div data-testid="chart" data-points={(data ?? []).length}>
      {children}
    </div>
  );
  return {
    ResponsiveContainer: Box,
    LineChart: Chart,
    BarChart: Chart,
    Bar: Box,
    Line: Box,
    XAxis: Axis,
    YAxis: Box,
    CartesianGrid: Box,
    Tooltip: ({ labelFormatter }: any) => {
      if (labelFormatter) labelFormatter('2026-01-15');
      return null;
    },
    Legend: Box,
  };
});

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Clock: Icon,
    TrendingUp: Icon,
    AlertTriangle: Icon,
    CheckCircle2: Icon,
    XCircle: Icon,
    Activity: Icon,
  };
});

import ResponseTimeSLA from '@/components/admin/ResponseTimeSLA';

const STATS = {
  complianceRate: 95,
  avgResponseTime: 12,
  targetResponseTime: 24,
  avgSLAScore: 78,
  onTime: 20,
  breached: 5,
  criticalCount: 2,
  warningCount: 3,
  pending: 4,
  total: 25,
};

const TREND = [
  { date: '2026-01-01', avgResponseTime: 8, complianceRate: 96, onTime: 22, breached: 1 },
  { date: '2026-01-02', avgResponseTime: 14, complianceRate: 90, onTime: 18, breached: 3 },
];

const pending = (sla: Record<string, unknown>) => ({
  _id: 'p-1',
  userName: 'Anna Smith',
  type: 'leave',
  startDate: '2026-02-01',
  endDate: '2026-02-03',
  days: 3,
  sla,
});

describe('ResponseTimeSLA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockI18n.language = 'en';
    mockTheme = 'light';
    queryResults = { getSLAStats: STATS, getSLATrend: TREND, getPendingWithSLA: [] };
  });

  it('shows skeleton cards while stats load', () => {
    queryResults = {
      getSLAStats: undefined,
      getSLATrend: undefined,
      getPendingWithSLA: undefined,
    };
    const { container } = render(<ResponseTimeSLA />);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(4);
    expect(container.querySelectorAll('[data-testid="card"]').length).toBe(4);
  });

  it('renders compliance rate with success color when >= 95', () => {
    queryResults.getSLAStats = { ...STATS, complianceRate: 95 };
    render(<ResponseTimeSLA />);
    expect(screen.getByText('responseSLA.compliance')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('95%').className).toContain('text-success');
  });

  it('uses warning color for compliance between 80 and 95', () => {
    queryResults.getSLAStats = { ...STATS, complianceRate: 88 };
    render(<ResponseTimeSLA />);
    expect(screen.getByText('88%').className).toContain('text-warning');
  });

  it('uses destructive color for compliance below 80', () => {
    queryResults.getSLAStats = { ...STATS, complianceRate: 70 };
    render(<ResponseTimeSLA />);
    expect(screen.getByText('70%').className).toContain('text-destructive');
  });

  it('renders average response time and target progress', () => {
    render(<ResponseTimeSLA />);
    expect(screen.getByText('12h')).toBeInTheDocument();
    expect(screen.getByText('responseSLA.target')).toBeInTheDocument();
    const progresses = screen.getAllByTestId('progress');
    // 12 / 24 * 100 = 50
    expect(Number(progresses[1]?.getAttribute('data-value'))).toBeCloseTo(50);
  });

  it('renders SLA score and on-time/breached counts', () => {
    render(<ResponseTimeSLA />);
    expect(screen.getByText('78/100')).toBeInTheDocument();
    expect(screen.getByText('responseSLA.onTimeBreachedShort')).toBeInTheDocument();
  });

  it('renders critical and warning alert counts', () => {
    render(<ResponseTimeSLA />);
    expect(screen.getByText('responseSLA.activeAlerts')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides both trend charts when trend is empty', () => {
    queryResults.getSLATrend = [];
    render(<ResponseTimeSLA />);
    expect(screen.queryByText('responseSLA.performanceTrend')).toBeNull();
    expect(screen.queryByText('responseSLA.slaStatusDistribution')).toBeNull();
  });

  it('renders both trend charts when trend has data', () => {
    render(<ResponseTimeSLA />);
    expect(screen.getByText('responseSLA.performanceTrend')).toBeInTheDocument();
    expect(screen.getByText('responseSLA.slaStatusDistribution')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart').length).toBe(2);
  });

  it('hides the pending requests card when empty', () => {
    render(<ResponseTimeSLA />);
    expect(screen.queryByText('responseSLA.pendingRequests')).toBeNull();
  });

  it('renders a normal pending request with remaining hours', () => {
    queryResults.getPendingWithSLA = [
      pending({
        status: 'normal',
        elapsedHours: 2,
        targetHours: 24,
        remainingHours: 22,
        progressPercent: 8,
      }),
    ];
    render(<ResponseTimeSLA />);
    expect(screen.getByText('responseSLA.pendingRequests')).toBeInTheDocument();
    expect(screen.getByText('Anna Smith')).toBeInTheDocument();
    expect(screen.getByText('leave')).toBeInTheDocument();
    expect(screen.getByText('responseSLA.remaining')).toBeInTheDocument();
    expect(screen.getByText('responseSLA.normal')).toBeInTheDocument();
  });

  it('renders warning/critical/breached statuses and overdue label', () => {
    queryResults.getPendingWithSLA = [
      pending({
        status: 'warning',
        elapsedHours: 20,
        targetHours: 24,
        remainingHours: 4,
        progressPercent: 83,
      }),
      pending({
        status: 'critical',
        elapsedHours: 23,
        targetHours: 24,
        remainingHours: 1,
        progressPercent: 95,
      }),
      pending({
        status: 'breached',
        elapsedHours: 30,
        targetHours: 24,
        remainingHours: -6,
        progressPercent: 125,
      }),
    ];
    render(<ResponseTimeSLA />);
    // Alerts card also renders warning/critical labels.
    expect(screen.getAllByText('responseSLA.warning').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('responseSLA.critical').length).toBeGreaterThanOrEqual(2);
    // Breached badge + the breached summary card title.
    expect(screen.getAllByText('responseSLA.breached').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('responseSLA.overdueBy')).toBeInTheDocument();
  });

  it('renders summary stats when total > 0', () => {
    render(<ResponseTimeSLA />);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('80% responseSLA.ofTotal')).toBeInTheDocument();
  });

  it('shows zeroed percentages when total is 0', () => {
    queryResults.getSLAStats = { ...STATS, total: 0 };
    render(<ResponseTimeSLA />);
    expect(screen.getAllByText('0% responseSLA.ofTotal').length).toBe(3);
  });

  it('renders with the ru locale', () => {
    mockI18n.language = 'ru';
    render(<ResponseTimeSLA />);
    expect(screen.getByText('12h')).toBeInTheDocument();
  });

  it('renders with the hy locale', () => {
    mockI18n.language = 'hy';
    render(<ResponseTimeSLA />);
    expect(screen.getByText('12h')).toBeInTheDocument();
  });

  it('uses dark theme chart colors', () => {
    mockTheme = 'dark';
    render(<ResponseTimeSLA />);
    expect(screen.getByText('12h')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart').length).toBe(2);
  });
});
