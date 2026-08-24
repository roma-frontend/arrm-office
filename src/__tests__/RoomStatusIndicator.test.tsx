/**
 * Tests for RoomStatusIndicator — status dots, pills, duration labels, status text.
 *
 * Covers: RoomStatusDot, RoomStatusPill, useDurationLabel, useRoomStatusText.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  RoomStatusDot,
  RoomStatusPill,
  useDurationLabel,
  useRoomStatusText,
} from '@/components/rooms/RoomStatusIndicator';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'rooms.status.free': 'Free',
        'rooms.status.occupied': 'Occupied',
        'rooms.status.startingSoon': 'Starting Soon',
        'rooms.status.endingSoon': 'Ending Soon',
        'rooms.status.archived': 'Archived',
        'rooms.statusDetail.freeAllDay': 'Free all day',
        'rooms.statusDetail.unavailable': 'Unavailable',
        'rooms.statusDetail.freeIn': `Free in ${opts?.duration} at ${opts?.time}`,
        'rooms.statusDetail.busyUntil': `Busy until ${opts?.time}`,
        'rooms.statusDetail.startsIn': `Starts in ${opts?.duration} at ${opts?.time}`,
        'rooms.statusDetail.freeUntil': `Free until ${opts?.time}`,
      };
      if (key === 'rooms.duration.hoursMinutes') return `${opts?.hours}h ${opts?.minutes}min`;
      if (key === 'rooms.duration.hours') return `${opts?.count}h`;
      if (key === 'rooms.duration.minutes') return `${opts?.count}min`;
      return map[key] ?? key;
    },
  }),
}));

// Mock lucide-react
jest.mock('lucide-react', () => {
  const identity = ({ className, ...props }: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'icon', className, ...props });
  return new Proxy({}, { get: () => identity });
});

// Helper: render a hook
function renderHookValue<T>(hook: () => T): T {
  let value!: T;
  function Consumer() {
    value = hook();
    return null;
  }
  render(<Consumer />);
  return value;
}

describe('RoomStatusDot', () => {
  it('renders a dot for "free" status', () => {
    const { container } = render(<RoomStatusDot status="free" />);
    expect(container.innerHTML).toContain('rounded-full');
  });

  it('renders a dot for "occupied" status', () => {
    const { container } = render(<RoomStatusDot status="occupied" />);
    expect(container.innerHTML).toContain('rounded-full');
  });

  it('renders a dot for "archived" status', () => {
    const { container } = render(<RoomStatusDot status="archived" />);
    expect(container.innerHTML).toContain('rounded-full');
  });

  it('applies sm size class', () => {
    const { container } = render(<RoomStatusDot status="free" size="sm" />);
    expect(container.innerHTML).toContain('h-2');
    expect(container.innerHTML).toContain('w-2');
  });

  it('applies lg size class', () => {
    const { container } = render(<RoomStatusDot status="free" size="lg" />);
    expect(container.innerHTML).toContain('h-3.5');
    expect(container.innerHTML).toContain('w-3.5');
  });

  it('applies md size by default', () => {
    const { container } = render(<RoomStatusDot status="free" />);
    expect(container.innerHTML).toContain('h-2.5');
    expect(container.innerHTML).toContain('w-2.5');
  });

  it('applies custom className', () => {
    const { container } = render(<RoomStatusDot status="free" className="my-custom" />);
    expect(container.innerHTML).toContain('my-custom');
  });

  it('includes ping animation for pulsing statuses', () => {
    const { container } = render(<RoomStatusDot status="free" />);
    expect(container.innerHTML).toContain('animate-ping');
  });
});

describe('RoomStatusPill', () => {
  it('renders status label text', () => {
    render(<RoomStatusPill status="free" label="Free" />);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('renders with custom className', () => {
    const { container } = render(<RoomStatusPill status="free" label="Free" className="extra" />);
    expect(container.innerHTML).toContain('extra');
  });

  it('renders for occupied status', () => {
    render(<RoomStatusPill status="occupied" label="Busy" />);
    expect(screen.getByText('Busy')).toBeInTheDocument();
  });
});

describe('useDurationLabel', () => {
  it('returns empty string for null', () => {
    const result = renderHookValue(() => useDurationLabel());
    expect(result(null)).toBe('');
  });

  it('formats hours and minutes', () => {
    const result = renderHookValue(() => useDurationLabel());
    expect(result(90)).toBe('1h 30min');
  });

  it('formats hours only', () => {
    const result = renderHookValue(() => useDurationLabel());
    expect(result(120)).toBe('2h');
  });

  it('formats minutes only', () => {
    const result = renderHookValue(() => useDurationLabel());
    expect(result(45)).toBe('45min');
  });
});

describe('useRoomStatusText', () => {
  const formatTime = (ms: number) => new Date(ms).toLocaleTimeString();

  it('returns status label for free room with no meetings', () => {
    const getStatusText = renderHookValue(() => useRoomStatusText());
    const info = {
      status: 'free' as const,
      current: null,
      next: null,
      busyUntil: null,
      freeUntil: null,
      minutesLeft: null,
      minutesUntilNext: null,
    };
    const { label } = getStatusText(info, formatTime);
    expect(label).toBe('Free');
  });

  it('returns Free all day detail for free room', () => {
    const getStatusText = renderHookValue(() => useRoomStatusText());
    const info = {
      status: 'free' as const,
      current: null,
      next: null,
      busyUntil: null,
      freeUntil: null,
      minutesLeft: null,
      minutesUntilNext: null,
    };
    const { detail } = getStatusText(info, formatTime);
    expect(detail).toBe('Free all day');
  });

  it('returns archived status for archived room', () => {
    const getStatusText = renderHookValue(() => useRoomStatusText());
    const info = {
      status: 'archived' as const,
      current: null,
      next: null,
      busyUntil: null,
      freeUntil: null,
      minutesLeft: null,
      minutesUntilNext: null,
    };
    const { label, detail } = getStatusText(info, formatTime);
    expect(label).toBe('Archived');
    expect(detail).toBe('Unavailable');
  });

  it('returns Occupied status for occupied room', () => {
    const getStatusText = renderHookValue(() => useRoomStatusText());
    const info = {
      status: 'occupied' as const,
      current: {
        _id: 'b1',
        title: 'Sprint Planning',
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
      },
      next: null,
      busyUntil: null,
      freeUntil: null,
      minutesLeft: 30,
      minutesUntilNext: null,
    };
    const { label } = getStatusText(info, formatTime);
    expect(label).toBe('Occupied');
  });
});
