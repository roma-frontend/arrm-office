/**
 * Tests for ActivityFeed — recent-activity dashboard widget backed by the
 * audit log.
 *
 * Mocks: convex/react useQuery keyed by ref name (honest 'skip' semantics),
 * auth store (mutable user role), react-i18next (fallback-string t),
 * @/lib/cssMotion, next/link, UI primitives (Card/Badge/Button/ShieldLoader),
 * lucide icons, and the generated convex api.
 * Date.now() is real — timestamps are built relative to it in each test.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

let mockUser: any = { id: 'u1', role: 'admin', organizationId: 'o1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  // Honest 'skip' semantics: a skipped query resolves to undefined, which is
  // what the real Convex client does when the args are 'skip'.
  useQuery: (ref: { _name?: string }, args?: unknown) =>
    args === 'skip' ? undefined : queryResults[ref?._name ?? ''],
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    users: {
      queries: {
        getAuditLogs: { _name: 'getAuditLogs' },
      },
    },
  },
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  // asChild is a Radix marker prop, not a DOM attribute — strip it
  Button: ({ children, asChild, ...props }: any) => <button {...props}>{children}</button>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Bell: Icon,
    ArrowRight: Icon,
    Clock: Icon,
    ListChecks: Icon,
    UserPlus: Icon,
    CheckCircle2: Icon,
    XCircle: Icon,
    FileText: Icon,
    DollarSign: Icon,
    Target: Icon,
    Truck: Icon,
    Plane: Icon,
  };
});

import ActivityFeed from '@/components/dashboard/ActivityFeed';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const log = (overrides: Record<string, unknown> = {}) => ({
  _id: 'l1',
  _creationTime: Date.now(),
  action: 'task_created',
  details: JSON.stringify({ title: 'Write docs', taskId: 't1' }),
  user: { name: 'John Doe' },
  ...overrides,
});

describe('ActivityFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'o1' };
    queryResults = {};
  });

  // ── Loading & access ───────────────────────────────────────────────────

  it('shows the loader while the audit log query is pending', () => {
    render(<ActivityFeed />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('skips the query for non-privileged roles and shows the loader', () => {
    mockUser = { id: 'u1', role: 'employee', organizationId: 'o1' };
    render(<ActivityFeed />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('shows the loader when the user has no id', () => {
    mockUser = { id: null, role: 'admin', organizationId: 'o1' };
    render(<ActivityFeed />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  // ── Empty state ─────────────────────────────────────────────────────────

  it('shows the empty state when there is no activity', () => {
    queryResults.getAuditLogs = [];
    render(<ActivityFeed />);
    expect(screen.getByText('No recent activity')).toBeInTheDocument();
    expect(
      screen.getByText('Activity will appear here as team members perform actions'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
  });

  // ── Rendering activities ────────────────────────────────────────────────

  it('renders the activity title, user name and description', () => {
    queryResults.getAuditLogs = [
      log({ details: JSON.stringify({ title: 'Write docs', taskId: 't1' }) }),
    ];
    render(<ActivityFeed />);
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('Write docs')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    // description = JSON.stringify(details).slice(0, 100)
    expect(screen.getByText('{"title":"Write docs","taskId":"t1"}')).toBeInTheDocument();
  });

  it('falls back to the unknown-user label when the actor has no name', () => {
    // ?? only kicks in for null/undefined — an empty string is kept as-is.
    queryResults.getAuditLogs = [log({ user: {} })];
    render(<ActivityFeed />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('omits the user name when the actor is null', () => {
    queryResults.getAuditLogs = [log({ user: null })];
    render(<ActivityFeed />);
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Write docs')).toBeInTheDocument();
  });

  it('skips malformed logs whose details cannot be parsed', () => {
    queryResults.getAuditLogs = [
      log({ _id: 'good', details: JSON.stringify({ title: 'Good one' }) }),
      log({ _id: 'bad', details: '{not valid json' }),
    ];
    render(<ActivityFeed />);
    expect(screen.getByText('Good one')).toBeInTheDocument();
    expect(screen.queryByText('{not valid json')).not.toBeInTheDocument();
  });

  // ── Action mapping & routes ─────────────────────────────────────────────

  it('maps task actions to the task detail route', () => {
    queryResults.getAuditLogs = [
      log({ action: 'task_created', details: JSON.stringify({ title: 'T', taskId: 't1' }) }),
    ];
    const { container } = render(<ActivityFeed />);
    expect(container.querySelector('a[href="/tasks/t1"]')).not.toBeNull();
  });

  it('maps unknown actions to the unknown config', () => {
    queryResults.getAuditLogs = [log({ action: 'something_new', details: '{}' })];
    render(<ActivityFeed />);
    // formatAction returns 'unknown'; the title falls back to the mapped name
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('normalizes task_deleted to the task_status_updated action', () => {
    queryResults.getAuditLogs = [
      log({
        action: 'task_deleted',
        details: JSON.stringify({ title: 'Deleted', taskId: 't9' }),
      }),
    ];
    const { container } = render(<ActivityFeed />);
    expect(container.querySelector('a[href="/tasks/t9"]')).not.toBeNull();
  });

  it('routes leave actions to /leaves and payroll actions to /payroll', () => {
    queryResults.getAuditLogs = [
      log({ _id: 'lv', action: 'leave_approved', details: '{}' }),
      log({ _id: 'pr', action: 'payroll_paid', details: '{}' }),
    ];
    const { container } = render(<ActivityFeed />);
    expect(container.querySelector('a[href="/leaves"]')).not.toBeNull();
    expect(container.querySelector('a[href="/payroll"]')).not.toBeNull();
  });

  it('leaves non-task/leave/payroll activities without a route link', () => {
    queryResults.getAuditLogs = [log({ action: 'employee_added', details: '{}' })];
    const { container } = render(<ActivityFeed showViewAll={false} />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('falls back to a title derived from the action when details have none', () => {
    queryResults.getAuditLogs = [log({ action: 'goal_created', details: '{}' })];
    render(<ActivityFeed />);
    expect(screen.getByText('goal created')).toBeInTheDocument();
  });

  it('treats a missing details field as an empty object', () => {
    queryResults.getAuditLogs = [log({ action: 'goal_created', details: undefined })];
    render(<ActivityFeed />);
    // title falls back to the action string, description is JSON.stringify({}) == '{}'
    expect(screen.getByText('goal created')).toBeInTheDocument();
    expect(screen.getByText('{}')).toBeInTheDocument();
  });

  it('uses the description verbatim when details parse to a string', () => {
    // JSON.parse('"…"') yields a string — the description branch checks the type.
    queryResults.getAuditLogs = [log({ details: '"plain text note"' })];
    render(<ActivityFeed />);
    expect(screen.getByText('plain text note')).toBeInTheDocument();
  });

  it('prefers createdAt over _creationTime for the timestamp', () => {
    const createdAt = Date.now() - 2 * MINUTE;
    queryResults.getAuditLogs = [log({ _creationTime: Date.now(), createdAt })];
    render(<ActivityFeed />);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });

  it('shows a Critical badge for rejected leaves', () => {
    queryResults.getAuditLogs = [log({ _id: 'r', action: 'leave_rejected', details: '{}' })];
    render(<ActivityFeed />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
    const badge = screen.getByTestId('badge');
    expect(badge.getAttribute('data-variant')).toBe('destructive');
  });

  it('does not show the Critical badge for non-error activities', () => {
    queryResults.getAuditLogs = [log()];
    render(<ActivityFeed />);
    expect(screen.queryByText('Critical')).not.toBeInTheDocument();
  });

  // ── timeAgo formatting ──────────────────────────────────────────────────

  it('formats timestamps as "Just now" within the first minute', () => {
    queryResults.getAuditLogs = [log({ _creationTime: Date.now() - 30 * 1000 })];
    render(<ActivityFeed />);
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('formats timestamps as minutes ago', () => {
    queryResults.getAuditLogs = [log({ _creationTime: Date.now() - 5 * MINUTE })];
    render(<ActivityFeed />);
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('formats timestamps as hours ago', () => {
    queryResults.getAuditLogs = [log({ _creationTime: Date.now() - 3 * HOUR })];
    render(<ActivityFeed />);
    expect(screen.getByText('3h ago')).toBeInTheDocument();
  });

  it('formats timestamps as days ago', () => {
    queryResults.getAuditLogs = [log({ _creationTime: Date.now() - 5 * DAY })];
    render(<ActivityFeed />);
    expect(screen.getByText('5d ago')).toBeInTheDocument();
  });

  it('falls back to the locale date string beyond 30 days', () => {
    const ts = Date.now() - 40 * DAY;
    const expected = new Date(ts).toLocaleDateString();
    queryResults.getAuditLogs = [log({ _creationTime: ts })];
    render(<ActivityFeed />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  // ── Sorting, limit, count badge ─────────────────────────────────────────

  it('sorts activities by timestamp descending', () => {
    queryResults.getAuditLogs = [
      log({
        _id: 'old',
        details: JSON.stringify({ title: 'Old' }),
        _creationTime: Date.now() - DAY,
      }),
      log({ _id: 'new', details: JSON.stringify({ title: 'New' }), _creationTime: Date.now() }),
    ];
    const { container } = render(<ActivityFeed />);
    // span.line-clamp-1 selects the title spans only (descriptions are <p>)
    const titles = Array.from(container.querySelectorAll('span.line-clamp-1')).map(
      (el) => el.textContent,
    );
    expect(titles[0]).toBe('New');
    expect(titles[1]).toBe('Old');
  });

  it('respects the limit prop', () => {
    // The limit keeps the NEWEST entries — A and B must be the newest two.
    const now = Date.now();
    queryResults.getAuditLogs = [
      log({ _id: 'a', details: JSON.stringify({ title: 'A' }), _creationTime: now }),
      log({ _id: 'b', details: JSON.stringify({ title: 'B' }), _creationTime: now - DAY }),
      log({ _id: 'c', details: JSON.stringify({ title: 'C' }), _creationTime: now - 2 * DAY }),
    ];
    render(<ActivityFeed limit={2} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText('C')).not.toBeInTheDocument();
  });

  it('shows the count badge when there is activity', () => {
    queryResults.getAuditLogs = [log(), log({ _id: 'l2' })];
    render(<ActivityFeed />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // ── View-all link ───────────────────────────────────────────────────────

  it('shows the view-all link for admins', () => {
    queryResults.getAuditLogs = [];
    render(<ActivityFeed />);
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/audit');
  });

  it('hides the view-all link when showViewAll is false', () => {
    queryResults.getAuditLogs = [];
    render(<ActivityFeed showViewAll={false} />);
    expect(screen.queryByRole('link', { name: 'View all' })).not.toBeInTheDocument();
  });

  it('hides the view-all link for non-admin roles', () => {
    mockUser = { id: 'u1', role: 'employee', organizationId: 'o1' };
    queryResults.getAuditLogs = [];
    render(<ActivityFeed />);
    expect(screen.queryByRole('link', { name: 'View all' })).not.toBeInTheDocument();
  });
});
