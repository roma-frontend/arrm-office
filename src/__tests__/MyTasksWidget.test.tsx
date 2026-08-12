/**
 * Tests for MyTasksWidget — dashboard widget listing the current user's tasks.
 *
 * Mocks: convex/react useQuery keyed by ref name (honest 'skip' semantics),
 * i18next (mutable language getter), react-i18next (interpolating t),
 * next/link, UI primitives (Card/Badge/Button), lucide icons, generated api.
 * localizedTaskTitle + date-fns run real so the title/due-in logic is exercised.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { formatDistanceToNowStrict } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Interpolates {{placeholders}} from the options object, then falls back.
    t: (key: string, fallback?: unknown, opts?: Record<string, unknown>) => {
      let out = typeof fallback === 'string' ? fallback : key;
      if (opts && typeof opts === 'object') {
        for (const [k, v] of Object.entries(opts)) out = out.replace(`{{${k}}}`, String(v));
      }
      return out;
    },
  }),
}));

let mockI18nLang = 'en';
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    get language() {
      return mockI18nLang;
    },
  },
}));

let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  // Honest 'skip' semantics: a skipped query resolves to undefined.
  useQuery: (ref: { _name?: string }, args?: unknown) =>
    args === 'skip' ? undefined : queryResults[ref?._name ?? ''],
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    dashboard: {
      getMyTasks: { _name: 'getMyTasks' },
    },
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
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
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
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { ListChecks: Icon, Clock: Icon, AlertTriangle: Icon };
});

import { MyTasksWidget } from '@/components/dashboard/widgets/MyTasksWidget';

const DAY = 24 * 60 * 60 * 1000;

const task = (overrides: Record<string, unknown> = {}) => ({
  _id: 't1',
  title: 'Write report',
  priority: 'medium',
  deadline: Date.now() + 3 * DAY,
  ...overrides,
});

describe('MyTasksWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockI18nLang = 'en';
    queryResults = {};
  });

  // ── Loading & empty ─────────────────────────────────────────────────────

  it('shows skeletons while tasks load', () => {
    render(<MyTasksWidget userId="u1" />);
    // three pulsing skeleton rows
    expect(document.querySelectorAll('.animate-pulse').length).toBe(3);
  });

  it('skips the query when userId is empty and shows skeletons', () => {
    render(<MyTasksWidget userId="" />);
    expect(document.querySelectorAll('.animate-pulse').length).toBe(3);
  });

  it('shows the empty state when there are no tasks', () => {
    queryResults.getMyTasks = [];
    render(<MyTasksWidget userId="u1" />);
    expect(screen.getByText('No active tasks — you are all caught up!')).toBeInTheDocument();
  });

  // ── Rendering tasks ─────────────────────────────────────────────────────

  it('renders the header title and view-all link', () => {
    queryResults.getMyTasks = [task()];
    render(<MyTasksWidget userId="u1" />);
    expect(screen.getByText('My Tasks')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/tasks');
  });

  it('renders task titles via localizedTaskTitle', () => {
    queryResults.getMyTasks = [task({ title: 'Onboarding: review docs' })];
    render(<MyTasksWidget userId="u1" />);
    // legacy onboarding titles are prefixed through the translation key
    expect(screen.getByText(/Onboarding: /)).toBeInTheDocument();
  });

  it('shows overdue label and warning icon for past deadlines', () => {
    queryResults.getMyTasks = [task({ deadline: Date.now() - DAY })];
    render(<MyTasksWidget userId="u1" />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('shows the due-in time for future deadlines', () => {
    const deadline = Date.now() + 3 * DAY;
    queryResults.getMyTasks = [task({ deadline })];
    render(<MyTasksWidget userId="u1" />);
    const expected = formatDistanceToNowStrict(new Date(deadline), { locale: enUS });
    expect(screen.getByText(`Due in ${expected}`)).toBeInTheDocument();
  });

  it('omits the deadline line when there is no deadline', () => {
    queryResults.getMyTasks = [task({ deadline: undefined })];
    render(<MyTasksWidget userId="u1" />);
    expect(screen.queryByText(/Due in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it('formats the due-in time in Russian', () => {
    mockI18nLang = 'ru';
    const deadline = Date.now() + 3 * DAY;
    queryResults.getMyTasks = [task({ deadline })];
    render(<MyTasksWidget userId="u1" />);
    const expected = formatDistanceToNowStrict(new Date(deadline), { locale: ru });
    expect(screen.getByText(`Due in ${expected}`)).toBeInTheDocument();
  });

  it('formats the due-in time in Armenian', () => {
    mockI18nLang = 'hy';
    const deadline = Date.now() + 3 * DAY;
    queryResults.getMyTasks = [task({ deadline })];
    render(<MyTasksWidget userId="u1" />);
    const expected = formatDistanceToNowStrict(new Date(deadline), { locale: hy });
    expect(screen.getByText(`Due in ${expected}`)).toBeInTheDocument();
  });

  it('falls back to English when i18next has no language', () => {
    mockI18nLang = '';
    const deadline = Date.now() + 3 * DAY;
    queryResults.getMyTasks = [task({ deadline })];
    render(<MyTasksWidget userId="u1" />);
    const expected = formatDistanceToNowStrict(new Date(deadline), { locale: enUS });
    expect(screen.getByText(`Due in ${expected}`)).toBeInTheDocument();
  });

  // ── Priority badges ─────────────────────────────────────────────────────

  it('maps urgent priority to the destructive badge', () => {
    queryResults.getMyTasks = [task({ priority: 'urgent' })];
    render(<MyTasksWidget userId="u1" />);
    const badge = screen.getByTestId('badge');
    expect(badge.getAttribute('data-variant')).toBe('destructive');
    expect(badge.textContent).toBe('urgent');
  });

  it('maps high priority to the warning badge', () => {
    queryResults.getMyTasks = [task({ priority: 'high' })];
    render(<MyTasksWidget userId="u1" />);
    expect(screen.getByTestId('badge').getAttribute('data-variant')).toBe('warning');
  });

  it('maps low and medium priorities to the secondary badge', () => {
    queryResults.getMyTasks = [task({ priority: 'low' }), task({ _id: 't2', priority: 'medium' })];
    render(<MyTasksWidget userId="u1" />);
    const badges = screen.getAllByTestId('badge');
    expect(badges.every((b) => b.getAttribute('data-variant') === 'secondary')).toBe(true);
  });

  // ── Slicing & view-all ──────────────────────────────────────────────────

  it('slices the task list to 5 and shows the view-all count button', () => {
    const many = Array.from({ length: 7 }, (_, i) => task({ _id: `t${i}` }));
    queryResults.getMyTasks = many;
    render(<MyTasksWidget userId="u1" />);
    expect(screen.getAllByTestId('badge').length).toBe(5);
    expect(screen.getByText('View all 7 tasks')).toBeInTheDocument();
  });

  it('does not show the view-all count button at or below 5 tasks', () => {
    queryResults.getMyTasks = [task(), task({ _id: 't2' })];
    render(<MyTasksWidget userId="u1" />);
    // the header link stays, but the count button does not appear
    expect(screen.queryByText(/View all \d+ tasks/)).not.toBeInTheDocument();
  });
});
