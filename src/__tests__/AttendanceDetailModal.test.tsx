/**
 * Tests for AttendanceDetailModal — attendance day-detail modal.
 *
 * Mocks: convex/react queries keyed by ref name, useHydrated, i18n, cssMotion,
 * next/image, UI primitives (Badge/Button/ShieldLoader), date-format. The real
 * react-dom createPortal is kept — jsdom provides document.body and RTL queries
 * it by default (portal content lives in document.body).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

const mockI18n = { language: 'en' };
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
    i18n: mockI18n,
  }),
}));

let mockHydrated = true;
jest.mock('@/hooks/useHydrated', () => ({
  useHydrated: () => mockHydrated,
}));

let queryResults: Record<string, unknown> = {};
const queryCalls: { name: string; args: unknown }[] = [];
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args?: unknown) => {
    queryCalls.push({ name: ref?._name ?? '', args });
    return queryResults[ref?._name ?? ''];
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    timeTracking: {
      getMonthlyStats: { _name: 'getMonthlyStats' },
      getRecentAttendance: { _name: 'getRecentAttendance' },
    },
  },
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const formatTimeMock = jest.fn(() => '09:05:07');
jest.mock('@/lib/date-format', () => ({
  formatTime: (...args: unknown[]) => formatTimeMock(...args),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: any) => <img src={src} alt={alt} data-testid="avatar-image" />,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    X: Icon,
    Clock: Icon,
    LogIn: Icon,
    LogOut: Icon,
    AlertTriangle: Icon,
    CheckCircle: Icon,
    Calendar: Icon,
    Timer: Icon,
    TrendingUp: Icon,
    User: Icon,
    Building2: Icon,
  };
});

import { AttendanceDetailModal } from '@/components/attendance/AttendanceDetailModal';

const USER = {
  name: 'Anna Smith',
  email: 'anna@profix.am',
  department: 'IT',
  position: 'Developer',
  role: 'employee',
  supervisorName: 'John Doe',
};

const RECORD: any = {
  _id: 'r1',
  userId: 'u1',
  date: '2026-02-05',
  checkInTime: Date.UTC(2026, 1, 5, 9, 5, 7),
  checkOutTime: Date.UTC(2026, 1, 5, 18, 2, 0),
  totalWorkedMinutes: 540, // 9h of 9h → 100%
  status: 'checked_out',
  isLate: false,
  overtimeMinutes: 30,
  user: USER,
};

const MONTHLY = { totalDays: 18, punctualityRate: 92, lateDays: 2 };

const RECENT = [
  {
    _id: 'a1',
    date: '2026-02-04',
    checkInTime: 100,
    checkOutTime: 200,
    status: 'checked_out',
    isLate: false,
  },
  {
    _id: 'a2',
    date: '2026-02-03',
    checkInTime: 100,
    checkOutTime: 300,
    status: 'checked_in',
    isLate: true,
  },
  { _id: 'a3', date: '2026-02-02', checkInTime: 100, status: 'checked_in', isLate: false },
  { _id: 'a4', date: '2026-02-01', checkInTime: 0, status: 'absent', isLate: false },
];

const onClose = jest.fn();

const renderModal = (props: { record?: any; open?: boolean } = {}) =>
  render(
    <AttendanceDetailModal
      record={props.record !== undefined ? props.record : RECORD}
      open={props.open ?? true}
      onClose={onClose}
    />,
  );

describe('AttendanceDetailModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryCalls.length = 0;
    formatTimeMock.mockClear();
    mockHydrated = true;
    mockI18n.language = 'en';
    queryResults = { getMonthlyStats: MONTHLY, getRecentAttendance: RECENT };
  });

  it('renders nothing when record is null', () => {
    renderModal({ record: null });
    expect(screen.queryByText('Anna Smith')).toBeNull();
    expect(screen.queryByText('attendance.thisMonth')).toBeNull();
    // Both queries must be skipped ('skip') before the early return.
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'getMonthlyStats', args: 'skip' }),
        expect.objectContaining({ name: 'getRecentAttendance', args: 'skip' }),
      ]),
    );
  });

  it('shows the loader while monthly stats load', () => {
    queryResults = {};
    renderModal();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('renders nothing before hydration', () => {
    mockHydrated = false;
    renderModal();
    expect(screen.queryByText('Anna Smith')).toBeNull();
  });

  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByText('Anna Smith')).toBeNull();
  });

  it('renders user name, position and close button', () => {
    renderModal();
    expect(screen.getByText('Anna Smith')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('falls back to unknown user and role when name/position missing', () => {
    renderModal({ record: { ...RECORD, user: { role: 'manager' } } });
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('manager')).toBeInTheDocument();
  });

  it('falls back to Employee when neither position nor role exists', () => {
    renderModal({ record: { ...RECORD, user: {} } });
    expect(screen.getByText('Employee')).toBeInTheDocument();
  });

  it('shows initials when no avatar is set', () => {
    renderModal();
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('shows the avatar image when avatarUrl is present', () => {
    renderModal({ record: { ...RECORD, user: { ...USER, avatarUrl: '/avatar.png' } } });
    expect(screen.getByTestId('avatar-image')).toHaveAttribute('src', '/avatar.png');
  });

  it('uses an empty alt when the avatar has no name', () => {
    renderModal({ record: { ...RECORD, user: { avatarUrl: '/avatar.png' } } });
    expect(screen.getByTestId('avatar-image')).toHaveAttribute('alt', '');
  });

  it('renders the localized date', () => {
    renderModal();
    const expected = new Date('2026-02-05').toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders the checked_in status badge', () => {
    renderModal({
      record: { ...RECORD, status: 'checked_in', checkOutTime: undefined, isEarlyLeave: false },
    });
    expect(screen.getByText('common.active')).toBeInTheDocument();
  });

  it('renders the checked_out status badge', () => {
    renderModal();
    expect(screen.getByText('common.done')).toBeInTheDocument();
  });

  it('renders the absent status badge', () => {
    renderModal({
      record: {
        ...RECORD,
        status: 'absent',
        checkInTime: 0,
        checkOutTime: undefined,
        totalWorkedMinutes: undefined,
      },
    });
    expect(screen.getByText('statuses.absent')).toBeInTheDocument();
  });

  it('shows check-in and check-out times', () => {
    renderModal();
    expect(screen.getAllByText('09:05:07').length).toBeGreaterThanOrEqual(2);
  });

  it('shows em dashes when both times are missing', () => {
    renderModal({
      record: { ...RECORD, checkInTime: 0, checkOutTime: 0, status: 'checked_in' },
    });
    expect(screen.getAllByText('—').length).toBe(2);
  });

  it('shows late minutes when the employee was late', () => {
    renderModal({ record: { ...RECORD, isLate: true, lateMinutes: 15 } });
    expect(screen.getByText('attendance.lateBy')).toBeInTheDocument();
  });

  it('shows on-time when not late', () => {
    renderModal();
    expect(screen.getByText('attendance.onTime')).toBeInTheDocument();
  });

  it('shows early leave message', () => {
    renderModal({ record: { ...RECORD, isEarlyLeave: true, earlyLeaveMinutes: 45 } });
    expect(screen.getByText('attendance.earlyLeave')).toBeInTheDocument();
  });

  it('shows full-day message when checked out on time', () => {
    renderModal();
    expect(screen.getByText('attendance.fullDay')).toBeInTheDocument();
  });

  it('shows still-working for a checked-in employee without checkout', () => {
    renderModal({
      record: { ...RECORD, status: 'checked_in', checkOutTime: undefined, isEarlyLeave: false },
    });
    expect(screen.getByText('attendance.stillWorking')).toBeInTheDocument();
  });

  it('renders worked hours, duration and overtime', () => {
    renderModal();
    expect(screen.getByText('attendance.worked')).toBeInTheDocument();
    expect(screen.getByText('9.0h / 9h')).toBeInTheDocument();
    expect(screen.getByText('+0h 30m attendanceExtra.overtime')).toBeInTheDocument();
  });

  it('skips the worked block when totalWorkedMinutes is missing', () => {
    renderModal({ record: { ...RECORD, totalWorkedMinutes: undefined } });
    expect(screen.queryByText('attendance.worked')).toBeNull();
    expect(screen.queryByText(/h \/ 9h/)).toBeNull();
  });

  it('hides overtime when not present', () => {
    renderModal({ record: { ...RECORD, overtimeMinutes: undefined } });
    expect(screen.queryByText(/attendanceExtra\.overtime/)).toBeNull();
  });

  it('colors the progress bar green at 100% completion', () => {
    renderModal(); // 9h of 9h → 100
    expect(document.querySelector('.h-full.bg-green-500')).toBeTruthy();
  });

  it('colors the progress bar blue between 70 and 100', () => {
    renderModal({ record: { ...RECORD, totalWorkedMinutes: 420 } }); // 7h → 77.8
    expect(document.querySelector('.h-full.bg-blue-500')).toBeTruthy();
  });

  it('colors the progress bar orange below 70', () => {
    renderModal({ record: { ...RECORD, totalWorkedMinutes: 300 } }); // 5h → 55.6
    expect(document.querySelector('.h-full.bg-orange-500')).toBeTruthy();
  });

  it('renders department and supervisor chips', () => {
    renderModal();
    expect(screen.getByText('IT common.department')).toBeInTheDocument();
    expect(screen.getByText(/Supervisor:/)).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('omits chips when department/supervisor are missing', () => {
    renderModal({ record: { ...RECORD, user: { name: 'Anna Smith' } } });
    expect(screen.queryByText(/Supervisor:/)).toBeNull();
  });

  it('renders monthly stats', () => {
    renderModal();
    expect(screen.getByText('attendance.thisMonth')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('omits monthly stats when the query is empty', () => {
    queryResults.getMonthlyStats = null;
    renderModal();
    expect(screen.queryByText('attendance.thisMonth')).toBeNull();
  });

  it('renders the last-7-days section with all badge variants', () => {
    renderModal();
    expect(screen.getByText('attendance.last7Days')).toBeInTheDocument();
    // a1: checked_out + not late → ✓
    expect(screen.getByText('✓')).toBeInTheDocument();
    // a2: late (and checked_in) → late + active badges
    expect(screen.getAllByText('statuses.late').length).toBeGreaterThanOrEqual(1);
    // a2 + a3: checked_in → active badges
    expect(screen.getAllByText('statuses.active').length).toBeGreaterThanOrEqual(2);
  });

  it('omits the last-7-days section when empty', () => {
    queryResults.getRecentAttendance = [];
    renderModal();
    expect(screen.queryByText('attendance.last7Days')).toBeNull();
  });

  it('closes when the close button is clicked', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', () => {
    renderModal();
    const backdrop = document.querySelector('.bg-black\\/60') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders with the ru locale', () => {
    mockI18n.language = 'ru';
    renderModal();
    expect(screen.getByText('Anna Smith')).toBeInTheDocument();
    // formatTime receives the resolved language so the locale formatting runs.
    expect(formatTimeMock).toHaveBeenCalledWith(expect.any(Number), 'ru', expect.any(Object));
  });

  it('renders with the hy locale', () => {
    mockI18n.language = 'hy';
    renderModal();
    expect(screen.getByText('Anna Smith')).toBeInTheDocument();
    expect(formatTimeMock).toHaveBeenCalledWith(expect.any(Number), 'hy', expect.any(Object));
  });
});
