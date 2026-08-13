/**
 * Tests for RecentLeavesCard — recent leaves list with status badges.
 * Pure presentational component (no Convex).
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

// ── i18next direct mock (used in RecentLeavesCard for locale) ────────────────
jest.mock('i18next', () => ({
  language: 'en',
}));

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return { Clock: MockIcon, ArrowRight: MockIcon };
});

// ── CSS motion mock ──────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, variants, className }: any) => (
      <div className={className} data-testid="motion-div">
        {children}
      </div>
    ),
  },
}));

// ── Card mocks ───────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}));

// ── Badge mock ───────────────────────────────────────────────────────────────
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

// ── date-fns mock ────────────────────────────────────────────────────────────
jest.mock('date-fns', () => ({
  format: () => 'Jan 15',
}));

jest.mock('date-fns/locale', () => ({
  enUS: {},
  ru: {},
  hy: {},
}));

// ── Module under test ──
import { RecentLeavesCard } from '@/components/dashboard/RecentLeavesCard';
import type { LeaveEnriched } from '@/lib/convex-types';
import type { Id } from '../../convex/_generated/dataModel';

const mockLeave = (overrides: Partial<LeaveEnriched> = {}): LeaveEnriched => ({
  _id: `leave-${Math.random()}` as Id<'leaveRequests'>,
  _creationTime: Date.now(),
  userId: 'user-1' as Id<'users'>,
  organizationId: 'org-1' as Id<'organizations'>,
  userName: 'John Doe',
  startDate: '2024-01-10',
  endDate: '2024-01-15',
  status: 'approved' as const,
  leaveType: 'paid',
  ...overrides,
});

const defaultLeaves = [
  mockLeave({
    _id: 'leave-1' as Id<'leaveRequests'>,
    userName: 'John Doe',
    status: 'approved',
    startDate: '2024-01-10',
    endDate: '2024-01-15',
  }),
  mockLeave({
    _id: 'leave-2' as Id<'leaveRequests'>,
    userName: 'Jane Smith',
    status: 'pending',
    startDate: '2024-02-01',
    endDate: '2024-02-03',
  }),
  mockLeave({
    _id: 'leave-3' as Id<'leaveRequests'>,
    userName: 'Bob Wilson',
    status: 'rejected',
    startDate: '2024-03-05',
    endDate: '2024-03-07',
  }),
];

describe('RecentLeavesCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Basic rendering ────────────────────────────────────────────────────

  it('renders section title', () => {
    render(<RecentLeavesCard recentLeaves={defaultLeaves} />);
    expect(screen.getByText('dashboard.recentLeaves')).toBeInTheDocument();
  });

  it('renders leave items with user names', () => {
    render(<RecentLeavesCard recentLeaves={defaultLeaves} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
  });

  // ── Status badges ──────────────────────────────────────────────────────

  // Labels come from `statuses.*` keyed off the status directly. They used to be
  // picked by a three-branch ternary over `titles.leaveStatus.*` whose `else`
  // caught `cancel_requested` — so a cancellation request was labelled
  // "rejected". The mock resolves t(key, fallback) to the fallback, which is the
  // raw status string.
  it('renders approved badge for approved leaves', () => {
    render(<RecentLeavesCard recentLeaves={defaultLeaves} />);
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('renders pending badge for pending leaves', () => {
    render(<RecentLeavesCard recentLeaves={defaultLeaves} />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders rejected badge for rejected leaves', () => {
    render(<RecentLeavesCard recentLeaves={defaultLeaves} />);
    expect(screen.getByText('rejected')).toBeInTheDocument();
  });

  it('labels a cancellation request as such, not as rejected', () => {
    render(
      <RecentLeavesCard
        recentLeaves={
          [
            {
              ...defaultLeaves[0],
              _id: 'cancel-1',
              status: 'cancel_requested',
            },
          ] as never
        }
      />,
    );
    expect(screen.getByText('cancel_requested')).toBeInTheDocument();
    expect(screen.queryByText('rejected')).not.toBeInTheDocument();
  });

  it('renders badges with correct status variants', () => {
    render(<RecentLeavesCard recentLeaves={defaultLeaves} />);
    const badges = screen.getAllByTestId('badge');
    expect(badges.length).toBe(3);
    expect(badges[0].getAttribute('data-variant')).toBe('success');
    expect(badges[1].getAttribute('data-variant')).toBe('warning');
    expect(badges[2].getAttribute('data-variant')).toBe('destructive');
  });

  // ── Date formatting ────────────────────────────────────────────────────

  it('renders date range with formatted dates', () => {
    render(<RecentLeavesCard recentLeaves={defaultLeaves} />);
    // date-fns mock returns 'Jan 15' for all dates
    const dateElements = screen.getAllByText(/Jan 15/);
    expect(dateElements.length).toBeGreaterThanOrEqual(3);
  });

  // ── Empty state ────────────────────────────────────────────────────────

  it('shows empty state when no leaves', () => {
    render(<RecentLeavesCard recentLeaves={[]} />);
    expect(screen.getByText('dashboard.noRecentLeaves')).toBeInTheDocument();
  });

  it('shows clock icon in empty state', () => {
    const { container } = render(<RecentLeavesCard recentLeaves={[]} />);
    const icons = container.querySelectorAll('[data-testid="lucide-icon"]');
    expect(icons.length).toBeGreaterThan(0);
  });

  it('does not show leave items when empty', () => {
    render(<RecentLeavesCard recentLeaves={[]} />);
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  // ── Single leave ──────────────────────────────────────────────────────

  it('handles single leave', () => {
    const singleLeave = [
      mockLeave({ _id: 'leave-single' as Id<'leaveRequests'>, userName: 'Only One' }),
    ];
    render(<RecentLeavesCard recentLeaves={singleLeave} />);
    expect(screen.getByText('Only One')).toBeInTheDocument();
    expect(screen.getAllByTestId('badge').length).toBe(1);
  });

  // ── Invalid dates ──────────────────────────────────────────────────────

  it('handles leaves with missing dates gracefully', () => {
    const leavesWithNullDates = [
      mockLeave({
        _id: 'leave-bad' as Id<'leaveRequests'>,
        startDate: null as any,
        endDate: null as any,
      }),
    ];
    render(<RecentLeavesCard recentLeaves={leavesWithNullDates} />);
    // Should show '—' for dates (formatted as '— - —')
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });

  it('renders with empty string dates', () => {
    const leavesWithEmptyDates = [
      mockLeave({
        _id: 'leave-empty' as Id<'leaveRequests'>,
        startDate: '',
        endDate: '',
      }),
    ];
    render(<RecentLeavesCard recentLeaves={leavesWithEmptyDates} />);
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });
});
