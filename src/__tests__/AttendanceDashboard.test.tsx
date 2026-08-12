/**
 * Tests for AttendanceDashboard — personal monthly attendance overview.
 *
 * Mocks: convex/react queries keyed by ref name, auth store, i18next (direct
 * import), UI primitives (Card/Badge/ShieldLoader), cssMotion, lucide icons.
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

let mockUser: any = { id: 'u1', role: 'employee', organizationId: 'o1' };
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

jest.mock('@/convex/_generated/api', () => ({
  api: {
    timeTracking: {
      getMonthlyStats: { _name: 'getMonthlyStats' },
      getUserHistory: { _name: 'getUserHistory' },
    },
  },
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, style }: any) => (
    <div data-testid="card" className={className} style={style}>
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

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Calendar: Icon,
    Clock: Icon,
    AlertTriangle: Icon,
    Award: Icon,
    Target: Icon,
  };
});

import AttendanceDashboard from '@/components/attendance/AttendanceDashboard';

const MONTHLY = {
  totalDays: 18,
  totalWorkedHours: 144,
  punctualityRate: 92,
  totalOvertimeHours: 3,
  lateDays: 2,
  earlyLeaveDays: 1,
};

const HISTORY = [
  {
    _id: 'h1',
    date: '2026-02-05',
    checkInTime: Date.UTC(2026, 1, 5, 9, 0, 0),
    checkOutTime: Date.UTC(2026, 1, 5, 18, 0, 0),
    totalWorkedMinutes: 540,
    status: 'checked_out',
    isLate: false,
    isEarlyLeave: false,
    overtimeMinutes: 0,
  },
  {
    _id: 'h2',
    date: '2026-02-04',
    checkInTime: Date.UTC(2026, 1, 4, 9, 30, 0),
    checkOutTime: Date.UTC(2026, 1, 4, 17, 0, 0),
    totalWorkedMinutes: 450,
    status: 'checked_out',
    isLate: true,
    isEarlyLeave: true,
    overtimeMinutes: 30,
  },
  {
    _id: 'h3',
    date: '2026-02-03',
    checkInTime: Date.UTC(2026, 1, 3, 9, 0, 0),
    checkOutTime: undefined,
    status: 'checked_in',
    isLate: false,
    isEarlyLeave: false,
    overtimeMinutes: 0,
  },
  {
    _id: 'h4',
    date: '2026-02-02',
    checkInTime: 0,
    checkOutTime: 0,
    status: 'checked_out',
    isLate: false,
    isEarlyLeave: false,
    overtimeMinutes: 0,
  },
];

describe('AttendanceDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'employee', organizationId: 'o1' };
    mockI18nLang = 'en';
    queryResults = { getMonthlyStats: MONTHLY, getUserHistory: HISTORY };
  });

  it('shows the loader while stats load', () => {
    queryResults = {};
    render(<AttendanceDashboard />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('skips queries when the user has no id and falls back to the loader', () => {
    mockUser = null;
    render(<AttendanceDashboard />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('renders the four monthly stat cards', () => {
    render(<AttendanceDashboard />);
    expect(screen.getByText('attendance.monthlyAttendance')).toBeInTheDocument();
    expect(screen.getByText('attendanceExtra.daysWorked')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('attendanceExtra.totalHours')).toBeInTheDocument();
    expect(screen.getByText('144time.h')).toBeInTheDocument();
    expect(screen.getByText('attendanceExtra.punctuality')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('attendanceExtra.overtime')).toBeInTheDocument();
    expect(screen.getByText('3time.h')).toBeInTheDocument();
  });

  it('renders the issues alert with late and early leave counts', () => {
    render(<AttendanceDashboard />);
    expect(screen.getByText('attendanceIssues.title')).toBeInTheDocument();
    expect(screen.getByText(/2 attendanceIssues.lateArrivals/)).toBeInTheDocument();
    expect(screen.getByText(/1 attendanceIssues.earlyLeaves/)).toBeInTheDocument();
  });

  it('hides the issues alert when there are no issues', () => {
    queryResults.getMonthlyStats = { ...MONTHLY, lateDays: 0, earlyLeaveDays: 0 };
    render(<AttendanceDashboard />);
    expect(screen.queryByText('attendanceIssues.title')).toBeNull();
  });

  it('shows only the late arrivals line when only lateDays is set', () => {
    queryResults.getMonthlyStats = { ...MONTHLY, earlyLeaveDays: 0 };
    render(<AttendanceDashboard />);
    expect(screen.getByText(/2 attendanceIssues.lateArrivals/)).toBeInTheDocument();
    expect(screen.queryByText(/attendanceIssues.earlyLeaves/)).toBeNull();
  });

  it('shows only the early leaves line when only earlyLeaveDays is set', () => {
    queryResults.getMonthlyStats = { ...MONTHLY, lateDays: 0 };
    render(<AttendanceDashboard />);
    expect(screen.queryByText(/attendanceIssues.lateArrivals/)).toBeNull();
    expect(screen.getByText(/1 attendanceIssues.earlyLeaves/)).toBeInTheDocument();
  });

  it('shows the empty state when there is no history', () => {
    queryResults.getUserHistory = [];
    render(<AttendanceDashboard />);
    expect(screen.getByText('attendanceIssues.noRecordsYet')).toBeInTheDocument();
  });

  it('renders history records with dates, times and badges', () => {
    render(<AttendanceDashboard />);
    expect(screen.getByText('attendance.recentAttendance')).toBeInTheDocument();
    // h1: checked_out + worked minutes → duration badge
    expect(
      screen.getByText('9attendanceExtra.hoursShort 0attendanceExtra.minutesShort'),
    ).toBeInTheDocument();
    // h2: late + early leave → badges
    expect(screen.getAllByText('statuses.late').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('attendanceIssues.early').length).toBeGreaterThanOrEqual(1);
    // h2: overtime badge
    expect(
      screen.getByText(/^\+0attendanceExtra\.hoursShort attendanceExtra\.overtimeShort$/),
    ).toBeInTheDocument();
    // h3: checked_in → in-progress badge
    expect(screen.getByText('taskStatus.inProgress')).toBeInTheDocument();
  });

  it('renders formatted dates with the enUS locale', () => {
    render(<AttendanceDashboard />);
    const expected = format(new Date('2026-02-05'), 'MMMM dd, yyyy', { locale: enUS });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders dates and times in the ru locale', () => {
    mockI18nLang = 'ru';
    render(<AttendanceDashboard />);
    const expected = format(new Date('2026-02-05'), 'MMMM dd, yyyy', { locale: ru });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders dates and times in the hy locale', () => {
    mockI18nLang = 'hy';
    render(<AttendanceDashboard />);
    const expected = format(new Date('2026-02-05'), 'MMMM dd, yyyy', { locale: hy });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('falls back to enUS when i18next has no language set', () => {
    mockI18nLang = '';
    render(<AttendanceDashboard />);
    const expected = format(new Date('2026-02-05'), 'MMMM dd, yyyy', { locale: enUS });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders em dashes when a record has no check-in/check-out times', () => {
    render(<AttendanceDashboard />);
    // h4 has checkInTime 0 and checkOutTime 0 → '— → —' on its line.
    expect(screen.getByText(/^— → —$/)).toBeInTheDocument();
  });
});
