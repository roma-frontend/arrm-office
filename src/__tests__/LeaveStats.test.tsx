/**
 * Tests for LeaveStats — personal leave statistics + burnout prevention.
 *
 * Mocks: convex/react useQuery keyed by ref name, i18next (mutable language
 * getter), react-i18next (fallback-string t), UI primitives
 * (Card/Badge/Progress/ShieldLoader), lucide icons, and the generated api.
 * date-fns format + locales are left real so date assertions are TZ-robust
 * (expected strings computed with the same format call).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
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
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    analytics: {
      getUserAnalytics: { _name: 'getUserAnalytics' },
    },
    users: {
      queries: {
        getUserById: { _name: 'getUserById' },
      },
    },
  },
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

jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value, className }: any) => (
    <div data-testid="progress" data-value={value} className={className} />
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { AlertTriangle: Icon, CheckCircle: Icon, TrendingUp: Icon, Award: Icon };
});

import LeaveStats from '@/components/dashboard/LeaveStats';
import type { Id } from '../../convex/_generated/dataModel';

const USER_ID = 'u1' as Id<'users'>;

// ── Fixtures ────────────────────────────────────────────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

const makeAnalytics = (overrides: Record<string, unknown> = {}) => ({
  balances: { paid: 15, sick: 5, family: 3 },
  userLeaves: [
    {
      startDate: daysAgo(400),
      endDate: daysAgo(380),
      status: 'approved',
      days: 14,
    },
  ],
  ...overrides,
});

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  _id: USER_ID,
  name: 'Anna',
  role: 'employee',
  ...overrides,
});

describe('LeaveStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockI18nLang = 'en';
    queryResults = {};
  });

  // ── Loading states ──────────────────────────────────────────────────────

  it('shows the loader while analytics load', () => {
    render(<LeaveStats userId={USER_ID} />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('shows the loader while the user record loads', () => {
    queryResults.getUserAnalytics = makeAnalytics();
    render(<LeaveStats userId={USER_ID} />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('shows the loader when analytics have no balances', () => {
    queryResults.getUserAnalytics = makeAnalytics({ balances: null });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  // ── Personal stats card ─────────────────────────────────────────────────

  it('renders usage, balances, total balance, count and avg duration', () => {
    const currentYear = new Date().getFullYear();
    queryResults.getUserAnalytics = makeAnalytics({
      balances: { paid: 15, sick: 5, family: 3 },
      userLeaves: [
        {
          startDate: `${currentYear}-01-10`,
          endDate: `${currentYear}-01-14`,
          status: 'approved',
          days: 5,
        },
        {
          startDate: `${currentYear}-02-01`,
          endDate: `${currentYear}-02-03`,
          status: 'approved',
          days: 3,
        },
        // pending leaves are excluded from usage
        {
          startDate: `${currentYear}-03-01`,
          endDate: `${currentYear}-03-10`,
          status: 'pending',
          days: 9,
        },
        // other years are excluded
        { startDate: '2020-05-01', endDate: '2020-05-05', status: 'approved', days: 4 },
      ],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    expect(screen.getByText('leaveStats.personalStats', { exact: false })).toBeInTheDocument();
    // 8 days used of 20 → 40%
    expect(screen.getByText('8 / 20')).toBeInTheDocument();
    expect(screen.getByText('40% leaveStats.ofAnnualLimit')).toBeInTheDocument();
    expect(screen.getByTestId('progress').getAttribute('data-value')).toBe('40');
    // balances
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('23 leaveStats.days')).toBeInTheDocument();
    // count + avg duration
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('4.0 leaveStats.days')).toBeInTheDocument();
  });

  it('renders avg duration as 0 when there are no leaves this year', () => {
    const currentYear = new Date().getFullYear();
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [
        {
          startDate: `${currentYear}-01-01`,
          endDate: `${currentYear}-01-03`,
          status: 'pending',
          days: 2,
        },
      ],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);
    expect(screen.getByText('0 leaveStats.days')).toBeInTheDocument();
    expect(screen.getByText('0 / 20')).toBeInTheDocument();
    expect(screen.getByText('0% leaveStats.ofAnnualLimit')).toBeInTheDocument();
  });

  it('treats a leave with missing days as zero days', () => {
    const currentYear = new Date().getFullYear();
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [
        {
          startDate: `${currentYear}-01-10`,
          endDate: `${currentYear}-01-14`,
          status: 'approved',
          days: undefined,
        },
      ],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);
    // 0 days used → 0% usage, avg duration 0
    expect(screen.getByText('0 / 20')).toBeInTheDocument();
    expect(screen.getByText('0% leaveStats.ofAnnualLimit')).toBeInTheDocument();
  });

  // ── Burnout levels ──────────────────────────────────────────────────────

  it('flags low risk with a green card and all-good message', () => {
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(30), endDate: daysAgo(25), status: 'approved', days: 5 }],
    });
    queryResults.getUserById = makeUser();
    const { container } = render(<LeaveStats userId={USER_ID} />);

    expect(screen.getByText('leaveStats.allGood')).toBeInTheDocument();
    expect(container.querySelector('[class*="border-green-500"]')).not.toBeNull();
    const badges = screen.getAllByTestId('badge');
    expect(
      badges.some((b) => b.textContent === 'leaveStats.burnoutRisk: leaveStats.risk.low'),
    ).toBe(true);
  });

  it('flags medium risk with a yellow card but still all-good', () => {
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [
        { startDate: daysAgo(160), endDate: daysAgo(150), status: 'approved', days: 10 },
      ],
    });
    queryResults.getUserById = makeUser();
    const { container } = render(<LeaveStats userId={USER_ID} />);

    expect(screen.getByText('leaveStats.allGood')).toBeInTheDocument();
    expect(container.querySelector('[class*="border-yellow-500"]')).not.toBeNull();
    expect(screen.queryByText('leaveStats.notOnLeave')).not.toBeInTheDocument();
  });

  it('flags high risk with an orange card and burnout warning', () => {
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [
        { startDate: daysAgo(210), endDate: daysAgo(200), status: 'approved', days: 14 },
      ],
    });
    queryResults.getUserById = makeUser();
    const { container } = render(<LeaveStats userId={USER_ID} />);

    expect(screen.getByText('leaveStats.notOnLeave')).toBeInTheDocument();
    expect(container.querySelector('[class*="border-orange-500"]')).not.toBeNull();
    const badges = screen.getAllByTestId('badge');
    expect(
      badges.some((b) => b.textContent === 'leaveStats.burnoutRisk: leaveStats.risk.high'),
    ).toBe(true);
    expect(badges.some((b) => b.getAttribute('data-variant') === 'destructive')).toBe(true);
  });

  it('flags critical risk with a red card and destructive badge', () => {
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [
        { startDate: daysAgo(260), endDate: daysAgo(250), status: 'approved', days: 20 },
      ],
    });
    queryResults.getUserById = makeUser();
    const { container } = render(<LeaveStats userId={USER_ID} />);

    expect(screen.getByText('leaveStats.notOnLeave')).toBeInTheDocument();
    expect(container.querySelector('[class*="border-red-500"]')).not.toBeNull();
    const badges = screen.getAllByTestId('badge');
    expect(
      badges.some((b) => b.textContent === 'leaveStats.burnoutRisk: leaveStats.risk.critical'),
    ).toBe(true);
  });

  it('shows "never" and low badge when the user has no approved leaves', () => {
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(10), endDate: daysAgo(8), status: 'pending', days: 2 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    expect(screen.getByText('leaveStats.allGood')).toBeInTheDocument();
    expect(screen.getByText(/leaveStats.lastLeave: leaveStats.never/)).toBeInTheDocument();
  });

  it('renders the last-leave date with the date-fns locale', () => {
    const endDate = daysAgo(25);
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(30), endDate, status: 'approved', days: 5 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    const expected = format(new Date(endDate), 'd MMM yyyy', { locale: enUS });
    expect(
      screen.getByText((content) => content.startsWith(`leaveStats.lastLeave: ${expected}`)),
    ).toBeInTheDocument();
  });

  it('renders the recommend-leave date with the locale date string', () => {
    const endDate = daysAgo(200);
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(210), endDate, status: 'approved', days: 14 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    const next = new Date(new Date(endDate).getTime() + 180 * DAY);
    const expected = next.toLocaleDateString('en-US');
    expect(screen.getByText(`leaveStats.recommendLeave: ${expected}`)).toBeInTheDocument();
  });

  it('formats the recommend-leave date in Russian', () => {
    mockI18nLang = 'ru';
    const endDate = daysAgo(200);
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(210), endDate, status: 'approved', days: 14 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    const next = new Date(new Date(endDate).getTime() + 180 * DAY);
    const expected = next.toLocaleDateString('ru-RU');
    expect(screen.getByText(`leaveStats.recommendLeave: ${expected}`)).toBeInTheDocument();
  });

  it('formats the recommend-leave date in Armenian', () => {
    mockI18nLang = 'hy';
    const endDate = daysAgo(200);
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(210), endDate, status: 'approved', days: 14 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    const next = new Date(new Date(endDate).getTime() + 180 * DAY);
    const expected = next.toLocaleDateString('hy-AM');
    expect(screen.getByText(`leaveStats.recommendLeave: ${expected}`)).toBeInTheDocument();
  });

  // ── Locales ─────────────────────────────────────────────────────────────

  it('formats dates in Russian when i18next language is ru', () => {
    mockI18nLang = 'ru';
    const endDate = daysAgo(25);
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(30), endDate, status: 'approved', days: 5 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    const expected = format(new Date(endDate), 'd MMM yyyy', { locale: ru });
    expect(
      screen.getByText((content) => content.startsWith(`leaveStats.lastLeave: ${expected}`)),
    ).toBeInTheDocument();
  });

  it('formats dates in Armenian when i18next language is hy', () => {
    mockI18nLang = 'hy';
    const endDate = daysAgo(25);
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(30), endDate, status: 'approved', days: 5 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    const expected = format(new Date(endDate), 'd MMM yyyy', { locale: hy });
    expect(
      screen.getByText((content) => content.startsWith(`leaveStats.lastLeave: ${expected}`)),
    ).toBeInTheDocument();
  });

  it('falls back to English locale for unknown languages', () => {
    mockI18nLang = 'fr';
    const endDate = daysAgo(25);
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(30), endDate, status: 'approved', days: 5 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    const expected = format(new Date(endDate), 'd MMM yyyy', { locale: enUS });
    expect(
      screen.getByText((content) => content.startsWith(`leaveStats.lastLeave: ${expected}`)),
    ).toBeInTheDocument();
  });

  it('falls back to English locale when i18next language is empty', () => {
    mockI18nLang = '';
    const endDate = daysAgo(25);
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(30), endDate, status: 'approved', days: 5 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    const expected = format(new Date(endDate), 'd MMM yyyy', { locale: enUS });
    expect(
      screen.getByText((content) => content.startsWith(`leaveStats.lastLeave: ${expected}`)),
    ).toBeInTheDocument();
  });

  // ── Memoization ─────────────────────────────────────────────────────────

  it('rerenders when the userId prop changes', () => {
    queryResults.getUserAnalytics = makeAnalytics();
    queryResults.getUserById = makeUser();
    const { rerender } = render(<LeaveStats userId={USER_ID} />);
    rerender(<LeaveStats userId={'u2' as Id<'users'>} />);
    // still renders the stats card after the prop change
    expect(screen.getByText('leaveStats.personalStats', { exact: false })).toBeInTheDocument();
  });

  // ── Misc ────────────────────────────────────────────────────────────────

  it('shows the days-ago suffix in the all-good card', () => {
    queryResults.getUserAnalytics = makeAnalytics({
      userLeaves: [{ startDate: daysAgo(30), endDate: daysAgo(25), status: 'approved', days: 5 }],
    });
    queryResults.getUserById = makeUser();
    render(<LeaveStats userId={USER_ID} />);

    expect(screen.getByText(/leaveStats.lastLeave:/)).toBeInTheDocument();
    expect(screen.getByText(/25 leaveStats.daysAgo/)).toBeInTheDocument();
  });
});
