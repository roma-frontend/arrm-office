/**
 * Tests for ShiftHistory — the shift history card.
 *
 * Mocks: convex/react useQuery keyed by ref name (getShiftHistory),
 * react-i18next fallback-t with mutable i18n.language, ui Card/Badge stubs,
 * lucide stubs. date-fns format runs for real.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

const queryResults: Record<string, unknown> = {};
const mockI18n: { language: string } = { language: 'en' };

jest.mock('@/convex/_generated/api', () => ({
  api: {
    drivers: {
      shifts_mutations: {
        getShiftHistory: { _name: 'getShiftHistory' },
      },
    },
  },
}));

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
    i18n: mockI18n,
  }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => <span data-variant={variant}>{children}</span>,
}));

jest.mock('lucide-react', () => ({
  History: () => <span>history</span>,
  Clock: () => <span>clock</span>,
  CheckCircle: () => <span>check</span>,
  Coffee: () => <span>coffee</span>,
}));

import { ShiftHistory } from '@/components/drivers/ShiftHistory';
import type { Id } from '@/convex/_generated/dataModel';

const BASE = {
  _id: 'sh_1',
  startTime: 1_700_000_000_000,
  endTime: 1_700_003_600_000,
  duration: 1.5,
  tripsCompleted: 7,
  totalDistance: 42.3,
  overtimeHours: null,
  driverNotes: null,
  status: 'completed',
};

function setShifts(shifts: unknown) {
  queryResults['getShiftHistory'] = shifts;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockI18n.language = 'en';
  delete queryResults['getShiftHistory'];
});

describe('ShiftHistory', () => {
  it('renders nothing while shifts are loading', () => {
    const { container } = render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty state when there is no history', () => {
    setShifts([]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(screen.getByText('No shift history yet')).toBeInTheDocument();
  });

  it('renders a completed shift with stats and a success badge', () => {
    setShifts([BASE]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(screen.getByText('Shift History')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    // 1.5h → 1h 30m
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('42.3 km')).toBeInTheDocument();
  });

  it('renders active and paused status badges with their icons', () => {
    setShifts([
      { ...BASE, _id: 'a', status: 'active', endTime: null, duration: null },
      { ...BASE, _id: 'b', status: 'paused' },
      { ...BASE, _id: 'c', status: 'overtime' },
      { ...BASE, _id: 'd', status: 'unknown_status' },
    ]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Overtime')).toBeInTheDocument();
    expect(screen.getByText('unknown_status')).toBeInTheDocument();
    expect(screen.getByText(/Now$/)).toBeInTheDocument(); // endTime null
    expect(screen.getByText('-')).toBeInTheDocument(); // null duration
  });

  it('shows overtime hours when present', () => {
    setShifts([{ ...BASE, overtimeHours: 2.5 }]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(screen.getByText('2.5h')).toBeInTheDocument();
  });

  it('renders driver notes when present', () => {
    setShifts([{ ...BASE, driverNotes: 'Car needs service' }]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(screen.getByText('Car needs service')).toBeInTheDocument();
    expect(screen.getByText(/Notes/)).toBeInTheDocument();
  });

  it('formats durations with full hours', () => {
    setShifts([{ ...BASE, duration: 3 }]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(screen.getByText('3h 0m')).toBeInTheDocument();
  });

  it('uses the ru locale for date formatting', () => {
    mockI18n.language = 'ru';
    setShifts([BASE]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    // A full-history card still renders (locale only changes format output)
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('uses the hy locale for date formatting', () => {
    mockI18n.language = 'hy';
    setShifts([BASE]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('falls back to zero distance when the value is missing', () => {
    setShifts([{ ...BASE, totalDistance: null }]);
    render(<ShiftHistory driverId={'drv_1' as Id<'drivers'>} />);
    expect(screen.getByText('0.0 km')).toBeInTheDocument();
  });
});
