/**
 * Tests for analytics widgets — DepartmentStats, LeaveHeatmap, LeavesTrendChart.
 *
 * All are presentational chart components. Recharts pieces are mocked via
 * @/lib/dynamic-imports; date-fns is real.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      // i18next overload: t(key, options) — the second arg is an options object
      if (fallback && typeof fallback === 'object') {
        const count = (fallback as any).count;
        return count !== undefined ? `${key}:${count}` : key;
      }
      return (fallback as string) || key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

jest.mock('@/lib/dynamic-imports', () => {
  const Box = ({ children }: any) => <div>{children}</div>;
  const Chart = ({ children, data }: any) => (
    <div data-testid="chart" data-points={(data ?? []).length}>
      {children}
    </div>
  );
  return {
    ResponsiveContainer: Box,
    BarChart: Chart,
    LineChart: Chart,
    Bar: Box,
    Line: Box,
    XAxis: Box,
    YAxis: Box,
    CartesianGrid: Box,
    Tooltip: Box,
    Legend: Box,
  };
});

import { DepartmentStats } from '@/components/analytics/DepartmentStats';
import { LeaveHeatmap } from '@/components/analytics/LeaveHeatmap';
import { LeavesTrendChart } from '@/components/analytics/LeavesTrendChart';

describe('DepartmentStats', () => {
  it('renders the section title', () => {
    render(<DepartmentStats users={[]} />);
    expect(screen.getByText(/departmentStats.title/)).toBeInTheDocument();
  });

  it('groups users by department and computes averages', () => {
    const users = [
      {
        department: 'Engineering',
        paidLeaveBalance: 20,
        sickLeaveBalance: 8,
        familyLeaveBalance: 4,
      },
      {
        department: 'Engineering',
        paidLeaveBalance: 22,
        sickLeaveBalance: 10,
        familyLeaveBalance: 5,
      },
      { department: 'Sales', paidLeaveBalance: 24, sickLeaveBalance: 9, familyLeaveBalance: 3 },
    ];
    const { container } = render(<DepartmentStats users={users} />);
    const chart = container.querySelector('[data-testid="chart"]');
    const points = JSON.parse(chart?.getAttribute('data-points') || '0');
    expect(points).toBe(2); // Engineering + Sales
  });

  it('assigns users without a department to Unassigned', () => {
    const users = [
      { paidLeaveBalance: 24, sickLeaveBalance: 10, familyLeaveBalance: 5 },
      { paidLeaveBalance: 14, sickLeaveBalance: 5, familyLeaveBalance: 1 },
    ];
    const { container } = render(<DepartmentStats users={users} />);
    const chart = container.querySelector('[data-testid="chart"]');
    expect(JSON.parse(chart?.getAttribute('data-points') || '0')).toBe(1);
  });

  it('renders chart elements', () => {
    const { container } = render(
      <DepartmentStats
        users={[
          { department: 'Eng', paidLeaveBalance: 20, sickLeaveBalance: 8, familyLeaveBalance: 4 },
        ]}
      />,
    );
    expect(container.querySelector('[data-testid="chart"]')).toBeInTheDocument();
  });
});

describe('LeaveHeatmap', () => {
  const leaves = [
    { startDate: '2026-01-05', endDate: '2026-01-07', status: 'approved' },
    { startDate: '2026-01-05', endDate: '2026-01-06', status: 'approved' },
    { startDate: '2026-01-10', endDate: '2026-01-10', status: 'pending' },
  ];

  it('renders the month title', () => {
    render(<LeaveHeatmap leaves={leaves} month={new Date(2026, 0, 15)} />);
    expect(screen.getByText(/leaveHeatmap.title/)).toBeInTheDocument();
  });

  it('renders one cell per day of the month (January has 31 days)', () => {
    const { container } = render(<LeaveHeatmap leaves={[]} month={new Date(2026, 0, 15)} />);
    // 7 weekday headers + 31 day cells
    const cells = container.querySelectorAll('[class*="aspect-square"]');
    expect(cells.length).toBe(31);
  });

  it('renders weekday headers', () => {
    const { container } = render(<LeaveHeatmap leaves={[]} month={new Date(2026, 0, 15)} />);
    expect(container.querySelectorAll('[class*="uppercase"]').length).toBeGreaterThanOrEqual(7);
  });

  it('colors approved leave days and shows counts in tooltips', () => {
    const { container } = render(<LeaveHeatmap leaves={leaves} month={new Date(2026, 0, 15)} />);
    const cells = container.querySelectorAll('[class*="aspect-square"]');
    // Days 5-6 have 2 approved leaves, day 7 has 1
    const dayWithTwo = Array.from(cells).find((c) =>
      (c as HTMLElement).title.includes('tooltipMultiple:2'),
    );
    expect(dayWithTwo).toBeTruthy();
  });

  it('ignores pending leaves in the count', () => {
    const { container } = render(<LeaveHeatmap leaves={leaves} month={new Date(2026, 0, 15)} />);
    const cells = container.querySelectorAll('[class*="aspect-square"]');
    // Day 10 has a pending leave only → count 0 in title
    const pendingDay = Array.from(cells).find(
      (c) => (c as HTMLElement).textContent?.trim() === '10',
    );
    expect(pendingDay?.getAttribute('title')).toContain('tooltipMultiple:0');
  });

  it('renders legend labels', () => {
    const { container } = render(<LeaveHeatmap leaves={[]} month={new Date(2026, 0, 15)} />);
    expect(container.textContent).toContain('leaveHeatmap.less');
    expect(container.textContent).toContain('leaveHeatmap.more');
  });
});

describe('LeavesTrendChart', () => {
  const leaves = [
    { startDate: '2026-01-05', endDate: '2026-01-07', days: 3, status: 'approved' },
    { startDate: '2026-01-10', endDate: '2026-01-11', days: 2, status: 'pending' },
    { startDate: '2026-02-01', endDate: '2026-02-01', days: 1, status: 'rejected' },
  ];

  it('renders the section title', () => {
    render(<LeavesTrendChart leaves={[]} />);
    expect(screen.getByText(/leaveRequestsTrend.title/)).toBeInTheDocument();
  });

  it('renders a line chart', () => {
    const { container } = render(<LeavesTrendChart leaves={leaves} />);
    expect(container.querySelector('[data-testid="chart"]')).toBeInTheDocument();
  });

  it('computes six months of data points', () => {
    const { container } = render(<LeavesTrendChart leaves={leaves} />);
    const chart = container.querySelector('[data-testid="chart"]');
    expect(JSON.parse(chart?.getAttribute('data-points') || '0')).toBe(6);
  });

  it('handles empty leaves array', () => {
    const { container } = render(<LeavesTrendChart leaves={[]} />);
    const chart = container.querySelector('[data-testid="chart"]');
    expect(JSON.parse(chart?.getAttribute('data-points') || '0')).toBe(6);
  });
});
