/**
 * Tests for ReportingLineWidget — the dashboard reporting-line card.
 *
 * Mocks: convex/react useQuery (mutable result), react-i18next fallback-t,
 * ui card primitives, lucide icons. Avatar/PersonRow run for real.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

let mockData: unknown = undefined;

jest.mock('convex/react', () => ({
  useQuery: () => mockData,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/employees/EmployeeHoverCard', () => ({
  EmployeeHoverCard: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('lucide-react', () => {
  const names = ['Network', 'ChevronUp', 'Users'];
  const out: Record<string, (props: any) => React.ReactElement> = {};
  names.forEach((n) => {
    out[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  });
  return out;
});

import { ReportingLineWidget } from '@/components/dashboard/widgets/ReportingLineWidget';

const MANAGERS = [
  { _id: 'm1', name: 'Big Boss', position: 'CEO', department: 'Executive' },
  { _id: 'm2', name: 'Middle Manager', avatarUrl: 'https://example.com/m.png', position: 'VP Eng' },
];

const REPORTS = [
  { _id: 'r1', name: 'Junior Dev', position: 'Engineer', department: 'Engineering' },
  { _id: 'r2', name: 'QA Tester', department: 'Quality' },
  { _id: 'r3', name: 'Designer' },
];

describe('ReportingLineWidget', () => {
  beforeEach(() => {
    mockData = undefined;
  });

  it('shows skeletons while loading', () => {
    mockData = undefined;
    const { container } = render(<ReportingLineWidget />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('shows the empty state when the query returns null', () => {
    mockData = null;
    render(<ReportingLineWidget />);
    expect(screen.getByText('No reporting data available')).toBeInTheDocument();
  });

  it('renders managers and direct reports with initials avatars', () => {
    mockData = { managers: MANAGERS, directReports: REPORTS };
    render(<ReportingLineWidget />);
    expect(screen.getByText('Reporting Line')).toBeInTheDocument();
    expect(screen.getByText('Reports to')).toBeInTheDocument();
    expect(screen.getByText('Big Boss')).toBeInTheDocument();
    expect(screen.getByText('BB')).toBeInTheDocument(); // initials
    expect(screen.getByText('CEO')).toBeInTheDocument();
    expect(screen.getByText('Middle Manager')).toBeInTheDocument();
    // Avatar image for the manager with an avatarUrl.
    const img = screen.getByAltText('Middle Manager');
    expect(img.getAttribute('src')).toBe('https://example.com/m.png');
    expect(screen.getByText('Direct reports')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('Junior Dev')).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('QA Tester')).toBeInTheDocument();
    expect(screen.getByText('Quality')).toBeInTheDocument();
    expect(screen.getByText('Designer')).toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.getByText('QT')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('shows "No direct reports" when there are none', () => {
    mockData = { managers: MANAGERS, directReports: [] };
    render(<ReportingLineWidget />);
    expect(screen.getByText('No direct reports')).toBeInTheDocument();
    expect(screen.queryByText('(0)')).not.toBeInTheDocument();
  });

  it('shows the not-in-hierarchy message when both lists are empty', () => {
    mockData = { managers: [], directReports: [] };
    render(<ReportingLineWidget />);
    expect(screen.getByText('You are not linked in the org hierarchy yet')).toBeInTheDocument();
    expect(screen.queryByText('Reports to')).not.toBeInTheDocument();
  });

  it('omits position when a person has neither position nor department', () => {
    mockData = { managers: [{ _id: 'x1', name: 'Only Name' }], directReports: [] };
    render(<ReportingLineWidget />);
    expect(screen.getByText('Only Name')).toBeInTheDocument();
    expect(screen.getByText('ON')).toBeInTheDocument();
  });
});
