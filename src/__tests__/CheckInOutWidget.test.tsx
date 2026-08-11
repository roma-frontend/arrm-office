/**
 * Tests for CheckInOutWidget — the attendance check-in/out tracker card.
 *
 * Covers: the loading skeleton, the not-checked-in state (check-in button +
 * warning message), the checked-in state (check-out button, late minutes,
 * worked duration + overtime), the checked-out state (see-you-tomorrow block,
 * early leave), the live clock, check-in/check-out success and error paths
 * (Error / non-Error), the no-user-id guard, and the ru/hy date locales.
 *
 * Mocks: react-i18next (mutable language), convex/react keyed by _name,
 * generated api, auth store (mutable user), sonner toast, UI primitives
 * (card/button/badge/ShieldLoader) and lucide icons. date-fns is real.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

// ── i18n ─────────────────────────────────────────────────────────────────────
let mockLanguage = 'en';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'object' ? key : (opts ?? key)),
    i18n: { language: mockLanguage },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockMutations: Record<string, jest.Mock> = {};
const mockQueries: Record<string, any> = {};
// When true, the query returns data even for the 'skip' arg so the defensive
// no-user-id branches inside the handlers can be exercised through the UI.
let mockForceQuery = false;
jest.mock('convex/react', () => ({
  useQuery: (q: any, args: any) =>
    q?._name === 'getTodayStatus'
      ? args === 'skip' && !mockForceQuery
        ? undefined
        : mockQueries.todayStatus
      : undefined,
  useMutation: (m: any) => {
    if (m?._name && !mockMutations[m._name]) mockMutations[m._name] = jest.fn();
    return mockMutations[m?._name] ?? jest.fn();
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    timeTracking: {
      getTodayStatus: { _name: 'getTodayStatus' },
      checkIn: { _name: 'checkIn' },
      checkOut: { _name: 'checkOut' },
    },
  },
}));

// ── Auth ─────────────────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = { id: 'u1', role: 'employee' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

// ── Toast ────────────────────────────────────────────────────────────────────
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({
  toast: mockToast,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, size, className, ...props }: any) => (
    <button
      data-testid="action-btn"
      onClick={onClick}
      disabled={disabled}
      className={className}
      {...props}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const names = ['Clock', 'LogIn', 'LogOut', 'TrendingUp', 'AlertCircle'];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

import { CheckInOutWidget } from '@/components/attendance/CheckInOutWidget';

describe('CheckInOutWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = 'en';
    mockUser = { id: 'u1', role: 'employee' };
    mockQueries.todayStatus = undefined;
    mockForceQuery = false;
    for (const key of Object.keys(mockMutations)) {
      mockMutations[key].mockReset().mockResolvedValue(undefined);
    }
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-05-15T10:30:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the loader while the status query is pending', () => {
    render(<CheckInOutWidget />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows the not-checked-in state with a check-in button and warning', async () => {
    mockQueries.todayStatus = null;
    render(<CheckInOutWidget />);
    expect(screen.getByText('attendance.timeTracker')).toBeInTheDocument();
    expect(screen.getByText('attendance.notCheckedIn')).toBeInTheDocument();
    expect(screen.getByText('attendance.offline')).toBeInTheDocument();
    expect(screen.getByText('ui.notCheckedInWarning')).toBeInTheDocument();
    expect(screen.getByText('attendance.checkIn')).toBeInTheDocument();
  });

  it('ticks the live clock every second', () => {
    mockQueries.todayStatus = null;
    render(<CheckInOutWidget />);
    const initial = format(new Date('2024-05-15T10:30:00'), 'HH:mm:ss', { locale: enUS });
    expect(screen.getByText(initial)).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const next = format(new Date('2024-05-15T10:30:01'), 'HH:mm:ss', { locale: enUS });
    expect(screen.getByText(next)).toBeInTheDocument();
  });

  it('shows the checked-in state with check-in time, late minutes and a check-out button', () => {
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: Date.parse('2024-05-15T09:00:00'),
      isLate: true,
      lateMinutes: 15,
      totalWorkedMinutes: 90,
      overtimeMinutes: 0,
    };
    render(<CheckInOutWidget />);
    expect(screen.getByText('attendance.atWork')).toBeInTheDocument();
    expect(screen.getByText('attendance.online')).toBeInTheDocument();
    const inTime = format(new Date('2024-05-15T09:00:00'), 'HH:mm:ss', { locale: enUS });
    expect(screen.getByText(inTime)).toBeInTheDocument();
    expect(screen.getByText('attendance.lateBy')).toBeInTheDocument();
    expect(screen.getByText('attendance.totalWorked')).toBeInTheDocument();
    // 90 minutes → "1h 30m".
    expect(
      screen.getByText('1attendanceExtra.hoursShort 30attendanceExtra.minutesShort'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('attendance.checkOut')).toHaveLength(2); // column + button
    expect(screen.queryByTestId('action-btn')).not.toBeNull();
  });

  it('shows overtime when the user has worked overtime', () => {
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: 1,
      totalWorkedMinutes: 480,
      overtimeMinutes: 30,
    };
    render(<CheckInOutWidget />);
    expect(screen.getByText(/attendanceExtra\.overtimeShort/)).toBeInTheDocument();
    expect(
      screen.getByText('8attendanceExtra.hoursShort 0attendanceExtra.minutesShort'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/0attendanceExtra\.minutesShort/).length).toBeGreaterThan(0);
  });

  it('does not show late or early messages when flags are absent', () => {
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: 1,
      totalWorkedMinutes: 60,
    };
    render(<CheckInOutWidget />);
    expect(screen.queryByText('attendance.lateBy')).toBeNull();
    expect(screen.queryByText('attendance.leftEarlyBy')).toBeNull();
  });

  it('shows the checked-out state with early leave and the see-you-tomorrow block', () => {
    mockQueries.todayStatus = {
      status: 'checked_out',
      checkInTime: Date.parse('2024-05-15T09:00:00'),
      checkOutTime: Date.parse('2024-05-15T17:30:00'),
      isEarlyLeave: true,
      earlyLeaveMinutes: 30,
      totalWorkedMinutes: 480,
    };
    render(<CheckInOutWidget />);
    expect(screen.getByText('attendance.finishedToday')).toBeInTheDocument();
    expect(screen.getByText('attendance.seeYouTomorrow')).toBeInTheDocument();
    const outTime = format(new Date('2024-05-15T17:30:00'), 'HH:mm:ss', { locale: enUS });
    expect(screen.getByText(outTime)).toBeInTheDocument();
    expect(screen.getByText('attendance.leftEarlyBy')).toBeInTheDocument();
    expect(screen.queryAllByText('attendance.offline').length).toBeGreaterThan(0);
  });

  it('shows a dash when there is no check-out time yet', () => {
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: 1,
      totalWorkedMinutes: 30,
    };
    render(<CheckInOutWidget />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('formats the check-in time with the Russian locale', () => {
    mockLanguage = 'ru';
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: Date.parse('2024-05-15T09:00:00'),
      totalWorkedMinutes: 60,
    };
    render(<CheckInOutWidget />);
    const inTime = format(new Date('2024-05-15T09:00:00'), 'HH:mm:ss', { locale: ru });
    expect(screen.getByText(inTime)).toBeInTheDocument();
  });

  it('formats the check-in time with the Armenian locale', () => {
    mockLanguage = 'hy';
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: Date.parse('2024-05-15T09:00:00'),
      totalWorkedMinutes: 60,
    };
    render(<CheckInOutWidget />);
    const inTime = format(new Date('2024-05-15T09:00:00'), 'HH:mm:ss', { locale: hy });
    expect(screen.getByText(inTime)).toBeInTheDocument();
  });

  it('checks in with the correct payload and toasts success', async () => {
    mockQueries.todayStatus = null;
    render(<CheckInOutWidget />);
    fireEvent.click(screen.getByText('attendance.checkIn'));
    await waitFor(() => expect(mockMutations.checkIn).toHaveBeenCalledWith({ userId: 'u1' }));
    expect(mockToast.success).toHaveBeenCalledWith('toasts.checkedInSuccess');
  });

  it('toasts the error message when check-in fails with an Error', async () => {
    mockMutations.checkIn.mockRejectedValue(new Error('checkin boom'));
    mockQueries.todayStatus = null;
    render(<CheckInOutWidget />);
    fireEvent.click(screen.getByText('attendance.checkIn'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('checkin boom'));
  });

  it('falls back to a generic message when check-in fails with a non-Error', async () => {
    mockMutations.checkIn.mockRejectedValue('boom');
    mockQueries.todayStatus = null;
    render(<CheckInOutWidget />);
    fireEvent.click(screen.getByText('attendance.checkIn'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('attendance.failedCheckIn'));
  });

  it('does nothing when checking in without a user id', async () => {
    mockUser = null;
    mockForceQuery = true;
    mockQueries.todayStatus = null;
    render(<CheckInOutWidget />);
    fireEvent.click(screen.getByText('attendance.checkIn'));
    expect(mockMutations.checkIn).not.toHaveBeenCalled();
  });

  it('checks out with the correct payload and toasts success', async () => {
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: 1,
      totalWorkedMinutes: 60,
    };
    render(<CheckInOutWidget />);
    fireEvent.click(screen.getAllByText('attendance.checkOut')[1]);
    await waitFor(() => expect(mockMutations.checkOut).toHaveBeenCalledWith({ userId: 'u1' }));
    expect(mockToast.success).toHaveBeenCalledWith('toasts.checkedOutSuccess');
  });

  it('toasts the error message when check-out fails', async () => {
    mockMutations.checkOut.mockRejectedValue(new Error('checkout boom'));
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: 1,
      totalWorkedMinutes: 60,
    };
    render(<CheckInOutWidget />);
    fireEvent.click(screen.getAllByText('attendance.checkOut')[1]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('checkout boom'));
  });

  it('falls back when check-out fails with a non-Error', async () => {
    mockMutations.checkOut.mockRejectedValue({ code: 42 });
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: 1,
      totalWorkedMinutes: 60,
    };
    render(<CheckInOutWidget />);
    fireEvent.click(screen.getAllByText('attendance.checkOut')[1]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('attendance.failedCheckOut'));
  });

  it('does nothing when checking out without a user id', async () => {
    mockUser = null;
    mockForceQuery = true;
    mockQueries.todayStatus = {
      status: 'checked_in',
      checkInTime: 1,
      totalWorkedMinutes: 60,
    };
    render(<CheckInOutWidget />);
    fireEvent.click(screen.getAllByText('attendance.checkOut')[1]);
    expect(mockMutations.checkOut).not.toHaveBeenCalled();
  });

  it('does not render action buttons in the checked-out state', () => {
    mockQueries.todayStatus = {
      status: 'checked_out',
      checkInTime: 1,
      checkOutTime: 2,
      totalWorkedMinutes: 480,
    };
    render(<CheckInOutWidget />);
    expect(screen.queryByTestId('action-btn')).toBeNull();
    expect(screen.getByText('attendance.seeYouTomorrow')).toBeInTheDocument();
  });
});
