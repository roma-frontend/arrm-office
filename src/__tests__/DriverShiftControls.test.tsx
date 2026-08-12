/**
 * Tests for DriverShiftControls — shift start/pause/resume/end controls.
 *
 * Mocks: useNow (fixed timestamp), convex/react useQuery keyed by ref name
 * (getCurrentShift, getDriverById) + useMutation returning lazily-created
 * jest.fn()s, react-i18next fallback-t with mutable i18n.language, sonner
 * toast, ui primitives (Card/Badge/Button/Dialog/Input/Label/Textarea stubs),
 * lucide stubs. date-fns format runs for real.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const queryResults: Record<string, unknown> = {};
const mutationImpls: Record<string, jest.Mock> = {};
const mockNow = 1_700_000_000_000;
const mockI18n: { language: string } = { language: 'en' };

jest.mock('@/convex/_generated/api', () => ({
  api: {
    drivers: {
      requests_queries: { getCurrentShift: { _name: 'getCurrentShift' } },
      queries: { getDriverById: { _name: 'getDriverById' } },
      shifts_mutations: {
        startShift: { _name: 'startShift' },
        endShift: { _name: 'endShift' },
        pauseShift: { _name: 'pauseShift' },
        resumeShift: { _name: 'resumeShift' },
      },
    },
  },
}));

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    mutationImpls[name] = mutationImpls[name] ?? jest.fn();
    return mutationImpls[name];
  },
}));

jest.mock('@/hooks/useNow', () => ({ useNow: () => mockNow }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
    i18n: mockI18n,
  }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({ toast: mockToast }));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => <span data-variant={variant}>{children}</span>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className }: any) => (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

// Dialog is always "open" in the stub — content is present in the DOM.
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div data-testid="dialog">{children}</div>,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, min, max }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} min={min} max={max} />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, rows }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} />
  ),
}));

jest.mock('lucide-react', () => ({
  Clock: () => <span>clock</span>,
  Play: () => <span>play</span>,
  Square: () => <span>square</span>,
  Pause: () => <span>pause</span>,
  Coffee: () => <span>coffee</span>,
  MessageSquare: () => <span>message</span>,
}));

import { DriverShiftControls } from '@/components/drivers/DriverShiftControls';
import type { Id } from '@/convex/_generated/dataModel';

const DRIVER = {
  _id: 'drv_1',
  name: 'Driver A',
  workingHours: { startTime: '09:00', endTime: '17:00' },
};

const ACTIVE_SHIFT = {
  _id: 'sh_1',
  driverId: 'drv_1',
  status: 'active',
  startTime: mockNow - 3_600_000,
  endTime: null,
  tripsCompleted: 4,
  totalDistance: 12.5,
  totalDuration: 90,
};

const PAUSED_SHIFT = { ...ACTIVE_SHIFT, _id: 'sh_2', status: 'paused' };

const PROPS = {
  driverId: 'drv_1' as Id<'drivers'>,
  userId: 'user_1' as Id<'users'>,
  organizationId: 'org_1' as Id<'organizations'>,
};

function setShift(shift: unknown) {
  queryResults['getCurrentShift'] = shift;
}
function setDriver(driver: unknown) {
  queryResults['getDriverById'] = driver;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockI18n.language = 'en';
  delete queryResults['getCurrentShift'];
  delete queryResults['getDriverById'];
  Object.keys(mutationImpls).forEach((k) => delete mutationImpls[k]);
});

describe('DriverShiftControls', () => {
  it('renders nothing while the driver is loading', () => {
    setShift(ACTIVE_SHIFT);
    const { container } = render(<DriverShiftControls {...PROPS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a spinner while the current shift is loading', () => {
    setDriver(DRIVER);
    const { container } = render(<DriverShiftControls {...PROPS} />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('shows the off-shift state with a start button when no shift exists', () => {
    setDriver(DRIVER);
    setShift(null);
    render(<DriverShiftControls {...PROPS} />);
    expect(screen.getByText('No active shift')).toBeInTheDocument();
    expect(screen.getByText('Off Shift')).toBeInTheDocument();
    expect(screen.getByText('Start Shift')).toBeInTheDocument();
  });

  it('starts a shift with scheduled times from working hours', async () => {
    setDriver(DRIVER);
    setShift(null);
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Start Shift'));
    await waitFor(() => {
      expect(mutationImpls['startShift']).toHaveBeenCalledWith({
        driverId: 'drv_1',
        organizationId: 'org_1',
        scheduledStartTime: expect.any(Number),
        scheduledEndTime: expect.any(Number),
      });
    });
    expect(mockToast.success).toHaveBeenCalledWith('Shift started successfully!');
  });

  it('starts a shift without scheduled times when driver has no working hours', async () => {
    setDriver({ _id: 'drv_1', name: 'Driver A' });
    setShift(null);
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Start Shift'));
    await waitFor(() => {
      expect(mutationImpls['startShift']).toHaveBeenCalledWith({
        driverId: 'drv_1',
        organizationId: 'org_1',
        scheduledStartTime: undefined,
        scheduledEndTime: undefined,
      });
    });
  });

  it('toasts an error when starting a shift fails', async () => {
    setDriver(DRIVER);
    setShift(null);
    mutationImpls['startShift'] = jest.fn().mockRejectedValue(new Error('boom'));
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Start Shift'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('boom');
    });
  });

  it('falls back to the localized message when the error has no message', async () => {
    setDriver(DRIVER);
    setShift(null);
    mutationImpls['startShift'] = jest.fn().mockRejectedValue('string error');
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Start Shift'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to start shift');
    });
  });

  it('renders an active shift with duration, stats and controls', () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    // duration = now - startTime = 1h
    expect(screen.getByText('1h 0m')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // trips
    expect(screen.getByText('12.5 km')).toBeInTheDocument();
    expect(screen.getByText('90 min')).toBeInTheDocument();
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('renders a paused shift with resume control', () => {
    setDriver(DRIVER);
    setShift(PAUSED_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('computes duration from endTime when the shift has ended', () => {
    setDriver(DRIVER);
    setShift({ ...ACTIVE_SHIFT, endTime: mockNow - 2_400_000 });
    render(<DriverShiftControls {...PROPS} />);
    // endTime - startTime = 1200s = 20m
    expect(screen.getByText('0h 20m')).toBeInTheDocument();
  });

  it('pauses the shift and toasts success', async () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => {
      expect(mutationImpls['pauseShift']).toHaveBeenCalledWith({ driverId: 'drv_1' });
    });
    expect(mockToast.success).toHaveBeenCalledWith('Shift paused');
  });

  it('toasts an error when pausing fails', async () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    mutationImpls['pauseShift'] = jest.fn().mockRejectedValue(new Error('boom'));
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('boom');
    });
  });

  it('falls back to the localized message when pausing fails without an Error', async () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    mutationImpls['pauseShift'] = jest.fn().mockRejectedValue('string error');
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to pause shift');
    });
  });

  it('resumes the shift and toasts success', async () => {
    setDriver(DRIVER);
    setShift(PAUSED_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Resume'));
    await waitFor(() => {
      expect(mutationImpls['resumeShift']).toHaveBeenCalledWith({ driverId: 'drv_1' });
    });
    expect(mockToast.success).toHaveBeenCalledWith('Shift resumed');
  });

  it('toasts the error message when resuming fails', async () => {
    setDriver(DRIVER);
    setShift(PAUSED_SHIFT);
    mutationImpls['resumeShift'] = jest.fn().mockRejectedValue(new Error('resume boom'));
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Resume'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('resume boom');
    });
  });

  it('falls back to the localized message when resuming fails without an Error', async () => {
    setDriver(DRIVER);
    setShift(PAUSED_SHIFT);
    mutationImpls['resumeShift'] = jest.fn().mockRejectedValue('string error');
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getByText('Resume'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to resume shift');
    });
  });

  it('ends the shift with break time and notes from the modal', async () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    // First 'End Shift' is the card button (before the modal in the DOM)
    fireEvent.click(screen.getAllByText('End Shift')[0]);
    expect(screen.getByText('Complete your shift and submit final details')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '45' } });
    fireEvent.change(screen.getByPlaceholderText('Any notes about this shift...'), {
      target: { value: 'Traffic was heavy' },
    });
    // Last 'End Shift' is the modal confirm button (after the h2 title)
    fireEvent.click(screen.getAllByText('End Shift').pop()!);
    await waitFor(() => {
      expect(mutationImpls['endShift']).toHaveBeenCalledWith({
        driverId: 'drv_1',
        breakTime: 45,
        driverNotes: 'Traffic was heavy',
      });
    });
    expect(mockToast.success).toHaveBeenCalledWith('Shift ended successfully!');
  });

  it('ends the shift with empty optional fields', async () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getAllByText('End Shift')[0]);
    fireEvent.click(screen.getAllByText('End Shift').pop()!);
    await waitFor(() => {
      expect(mutationImpls['endShift']).toHaveBeenCalledWith({
        driverId: 'drv_1',
        breakTime: undefined,
        driverNotes: undefined,
      });
    });
  });

  it('toasts an error when ending a shift fails', async () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    mutationImpls['endShift'] = jest.fn().mockRejectedValue(new Error('boom'));
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getAllByText('End Shift')[0]);
    fireEvent.click(screen.getAllByText('End Shift').pop()!);
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('boom');
    });
  });

  it('falls back to the localized message when ending fails without an Error', async () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    mutationImpls['endShift'] = jest.fn().mockRejectedValue('string error');
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getAllByText('End Shift')[0]);
    fireEvent.click(screen.getAllByText('End Shift').pop()!);
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to end shift');
    });
  });

  it('cancels the end-shift modal', () => {
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    fireEvent.click(screen.getAllByText('End Shift')[0]);
    const cancel = screen.getByText('Cancel');
    fireEvent.click(cancel);
    expect(mutationImpls['endShift']).not.toHaveBeenCalled();
  });

  it('formats the start time with the date-fns locale for ru', () => {
    mockI18n.language = 'ru';
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('formats the start time with the date-fns locale for hy', () => {
    mockI18n.language = 'hy';
    setDriver(DRIVER);
    setShift(ACTIVE_SHIFT);
    render(<DriverShiftControls {...PROPS} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('falls back to zero for missing distance and duration stats', () => {
    setDriver(DRIVER);
    setShift({ ...ACTIVE_SHIFT, totalDistance: null, totalDuration: undefined });
    render(<DriverShiftControls {...PROPS} />);
    expect(screen.getByText('0.0 km')).toBeInTheDocument();
    expect(screen.getByText('0 min')).toBeInTheDocument();
  });
});
