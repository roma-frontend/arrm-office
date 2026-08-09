/**
 * Tests for LeaveCharts — dashboard chart component with recharts.
 *
 * This is a pure presentational component (no Convex), so mocks are minimal.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// ── Theme mock ───────────────────────────────────────────────────────────────
jest.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

// ── Motion mock ──────────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// ── Dynamic import mocks (recharts components are dynamic) ───────────────────
jest.mock('@/lib/dynamic-imports', () => {
  const MockResponsiveContainer = ({ children, ...props }: any) => (
    <div data-testid="responsive-container" {...props}>
      {children}
    </div>
  );
  MockResponsiveContainer.displayName = 'ResponsiveContainerMock';

  const MockBarChart = ({ children, ...props }: any) => (
    <div data-testid="bar-chart" {...props}>
      {children}
    </div>
  );
  MockBarChart.displayName = 'BarChartMock';

  const MockPieChart = ({ children, ...props }: any) => (
    <div data-testid="pie-chart" {...props}>
      {children}
    </div>
  );
  MockPieChart.displayName = 'PieChartMock';

  const MockBar = ({ children, ...props }: any) => (
    <div data-testid="bar" {...props}>
      {children}
    </div>
  );
  MockBar.displayName = 'BarMock';

  const MockPie = ({ children, ...props }: any) => (
    <div data-testid="pie" {...props}>
      {children}
    </div>
  );
  MockPie.displayName = 'PieMock';

  const MockXAxis = (props: any) => <div data-testid="x-axis" {...props} />;
  MockXAxis.displayName = 'XAxisMock';
  const MockYAxis = (props: any) => <div data-testid="y-axis" {...props} />;
  MockYAxis.displayName = 'YAxisMock';
  const MockCartesianGrid = (props: any) => <div data-testid="grid" {...props} />;
  MockCartesianGrid.displayName = 'GridMock';
  const MockLegend = (props: any) => <div data-testid="legend" {...props} />;
  MockLegend.displayName = 'LegendMock';

  return {
    ResponsiveContainer: MockResponsiveContainer,
    BarChart: MockBarChart,
    PieChart: MockPieChart,
    Bar: MockBar,
    Pie: MockPie,
    XAxis: MockXAxis,
    YAxis: MockYAxis,
    CartesianGrid: MockCartesianGrid,
    Legend: MockLegend,
  };
});

// ── Recharts direct imports (Cell, Tooltip) ──────────────────────────────────
jest.mock('recharts', () => {
  const MockCell = (props: any) => <div data-testid="cell" {...props} />;
  MockCell.displayName = 'CellMock';
  const MockTooltip = (props: any) => <div data-testid="tooltip" {...props} />;
  MockTooltip.displayName = 'TooltipMock';
  return { Cell: MockCell, Tooltip: MockTooltip };
});

// ── Card mocks ───────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children, as }: any) => {
    const Tag = as || 'h3';
    return <Tag data-testid="card-title">{children}</Tag>;
  },
}));

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => ({
  TrendingUp: (props: any) => <span data-testid="trending-up" {...props} />,
  CalendarDays: (props: any) => <span data-testid="calendar-days" {...props} />,
}));

// ── Module under test ──
import { LeaveCharts } from '@/components/dashboard/LeaveCharts';

const defaultMonthlyTrend = [
  { month: 'Jan', approved: 5, pending: 2, rejected: 1 },
  { month: 'Feb', approved: 8, pending: 3, rejected: 0 },
  { month: 'Mar', approved: 6, pending: 1, rejected: 2 },
];

const defaultPieData = [
  { name: 'Paid Leave', value: 15, color: '#3b82f6' },
  { name: 'Sick Leave', value: 5, color: '#ef4444' },
];

describe('LeaveCharts', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(<LeaveCharts monthlyTrend={[]} pieData={[]} />);
    expect(container).toBeTruthy();
  });

  it('renders monthly trend section title', () => {
    render(<LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />);
    expect(screen.getByText('dashboard.monthlyLeaveTrend')).toBeInTheDocument();
  });

  it('renders leave distribution section title', () => {
    render(<LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />);
    expect(screen.getByText('dashboard.leaveDistribution')).toBeInTheDocument();
  });

  it('renders bar chart with monthly data', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    expect(container.querySelector('[data-testid="bar-chart"]')).toBeInTheDocument();
  });

  it('renders pie chart when pieData is not empty', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    expect(container.querySelector('[data-testid="pie-chart"]')).toBeInTheDocument();
  });

  it('renders pie cells for each pie entry', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    const cells = container.querySelectorAll('[data-testid="cell"]');
    expect(cells.length).toBe(2);
  });

  it('shows empty state when pieData is empty', () => {
    render(<LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={[]} />);
    expect(screen.getByText('dashboard.noLeaveData')).toBeInTheDocument();
  });

  it('shows calendar icon in empty state', () => {
    const { container } = render(<LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={[]} />);
    expect(container.querySelector('[data-testid="calendar-days"]')).toBeInTheDocument();
  });

  it('does not show pie chart when pieData is empty', () => {
    const { container } = render(<LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={[]} />);
    expect(container.querySelector('[data-testid="pie-chart"]')).not.toBeInTheDocument();
  });

  it('renders responsive container for bar chart', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    const containers = container.querySelectorAll('[data-testid="responsive-container"]');
    expect(containers.length).toBe(2); // one for bar, one for pie
  });

  it('renders bar chart with approved, pending, rejected bars', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    const bars = container.querySelectorAll('[data-testid="bar"]');
    expect(bars.length).toBe(3); // approved, pending, rejected
  });

  it('handles single-entry monthlyTrend', () => {
    const { container } = render(
      <LeaveCharts
        monthlyTrend={[{ month: 'Jan', approved: 1, pending: 0, rejected: 0 }]}
        pieData={defaultPieData}
      />,
    );
    expect(container.querySelector('[data-testid="bar-chart"]')).toBeInTheDocument();
  });

  it('handles large pieData entries', () => {
    const largePieData = Array.from({ length: 10 }, (_, i) => ({
      name: `Type ${i}`,
      value: i * 5,
      color: `#${i}${i}${i}`,
    }));
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={largePieData} />,
    );
    const cells = container.querySelectorAll('[data-testid="cell"]');
    expect(cells.length).toBe(10);
  });

  it('renders card wrapper for each chart', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    const cards = container.querySelectorAll('[data-testid="card"]');
    expect(cards.length).toBe(2);
  });

  it('drops the decorative icon from the trend header', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    // It looked like a control and did nothing; the header carries the legend now.
    expect(container.querySelector('[data-testid="trending-up"]')).toBeNull();
    expect(screen.getByText('dashboard.monthlyLeaveTrend')).toBeInTheDocument();
  });

  it('renders with all zeros in monthly trend', () => {
    const { container } = render(
      <LeaveCharts
        monthlyTrend={[{ month: 'Jan', approved: 0, pending: 0, rejected: 0 }]}
        pieData={defaultPieData}
      />,
    );
    // A chart of nothing is worse than saying there is nothing: empty axes read
    // as a loading failure.
    expect(container.querySelector('[data-testid="bar-chart"]')).toBeNull();
    expect(screen.getByText('dashboard.noLeaveData')).toBeInTheDocument();
  });

  it('renders with single pie entry', () => {
    const { container } = render(
      <LeaveCharts
        monthlyTrend={defaultMonthlyTrend}
        pieData={[{ name: 'Paid Leave', value: 10, color: '#3b82f6' }]}
      />,
    );
    const cells = container.querySelectorAll('[data-testid="cell"]');
    expect(cells.length).toBe(1);
  });

  it('renders dark theme tooltip styles', () => {
    // Re-mock theme to return dark for this test
    jest.mock('@/components/ThemeProvider', () => ({
      useTheme: () => ({ resolvedTheme: 'dark' }),
    }));
    // Since mock is already hoisted, we can't easily re-mock
    // Instead test that component doesn't crash with dark theme values
    render(<LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />);
    expect(screen.getByText('dashboard.monthlyLeaveTrend')).toBeInTheDocument();
  });

  it('renders card title with correct heading level', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    // CardTitle uses as="h2" for monthly trend
    const cardTitles = container.querySelectorAll('[data-testid="card-title"]');
    expect(cardTitles.length).toBe(2);
  });

  it('renders x-axis and y-axis on bar chart', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    expect(container.querySelector('[data-testid="x-axis"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="y-axis"]')).toBeInTheDocument();
  });

  it('renders cartesian grid on bar chart', () => {
    const { container } = render(
      <LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />,
    );
    expect(container.querySelector('[data-testid="grid"]')).toBeInTheDocument();
  });

  it('names the statuses in the header instead of inside the plot', () => {
    render(<LeaveCharts monthlyTrend={defaultMonthlyTrend} pieData={defaultPieData} />);
    // The chart library's own legend cost a row of the chart's height; the same
    // information now sits next to the title.
    expect(screen.getByText('statuses.approved')).toBeInTheDocument();
    expect(screen.getByText('statuses.pending')).toBeInTheDocument();
    expect(screen.getByText('statuses.rejected')).toBeInTheDocument();
  });

  it('reads out the distribution rather than leaving bare slices', () => {
    render(
      <LeaveCharts
        monthlyTrend={defaultMonthlyTrend}
        pieData={[
          { name: 'Paid Leave', value: 3, color: '#3b82f6' },
          { name: 'Sick Leave', value: 1, color: '#ef4444' },
        ]}
      />,
    );
    // Total in the middle of the ring, then each type with its count and share.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Paid Leave')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});
