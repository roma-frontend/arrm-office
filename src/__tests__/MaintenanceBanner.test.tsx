/**
 * Tests for MaintenanceBanner — maintenance countdown banner.
 *
 * Mocks: convex/react useQuery, useNow, auth store, i18n. Fake timers control
 * the countdown interval.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

let mockMaintenance: any = null;
jest.mock('convex/react', () => ({
  useQuery: () => mockMaintenance,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: { admin: { getMaintenanceMode: { _name: 'getMaintenanceMode' } } },
}));

let mockNow = Date.now();
jest.mock('@/hooks/useNow', () => ({
  useNow: () => mockNow,
}));

let mockUser: any = { id: 'u1', organizationId: 'org-1', role: 'superadmin' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Clock: Icon, X: Icon };
});

import { MaintenanceBanner } from '@/components/MaintenanceBanner';

const BASE_MAINTENANCE = {
  isActive: true,
  startTime: 0,
  endTime: 0,
  estimatedDuration: null,
  title: 'Scheduled maintenance',
  message: 'We will be back soon',
  icon: '🔧',
};

describe('MaintenanceBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    const base = Date.UTC(2026, 0, 1, 12, 0, 0);
    jest.setSystemTime(base);
    mockNow = base;
    mockUser = { id: 'u1', organizationId: 'org-1', role: 'superadmin' };
    mockMaintenance = { ...BASE_MAINTENANCE };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when maintenance is inactive', () => {
    mockMaintenance = { ...BASE_MAINTENANCE, isActive: false };
    const { container } = render(<MaintenanceBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when maintenance is loading (null)', () => {
    mockMaintenance = null;
    const { container } = render(<MaintenanceBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when user is an employee and maintenance has started', () => {
    mockUser = { id: 'u1', organizationId: 'org-1', role: 'employee' };
    mockMaintenance = {
      ...BASE_MAINTENANCE,
      startTime: Date.UTC(2026, 0, 1, 11, 0, 0),
      endTime: Date.UTC(2026, 0, 1, 13, 0, 0),
    };
    const { container } = render(<MaintenanceBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the countdown to start for a superadmin before maintenance begins', () => {
    mockMaintenance = {
      ...BASE_MAINTENANCE,
      startTime: mockNow + 90_000, // in 1m 30s
    };
    render(<MaintenanceBanner />);
    expect(screen.getByText(/Scheduled maintenance/)).toBeInTheDocument();
    expect(screen.getByText('1m 30s')).toBeInTheDocument();
  });

  it('updates the countdown each second', () => {
    mockMaintenance = { ...BASE_MAINTENANCE, startTime: mockNow + 90_000 };
    render(<MaintenanceBanner />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('1m 29s')).toBeInTheDocument();
  });

  it('shows countdown to end once maintenance has started', () => {
    mockMaintenance = {
      ...BASE_MAINTENANCE,
      startTime: mockNow - 60_000,
      estimatedDuration: '2 hours',
    };
    render(<MaintenanceBanner />);
    expect(screen.getByText('1h 59m')).toBeInTheDocument();
  });

  it('renders the formatted start time', () => {
    // Noon UTC — still Jan 1 even on extreme negative timezone offsets.
    mockMaintenance = {
      ...BASE_MAINTENANCE,
      startTime: Date.UTC(2026, 0, 1, 12, 0, 0),
    };
    const { container } = render(<MaintenanceBanner />);
    expect(container.textContent).toContain('Jan 1');
  });

  it('renders detail message and estimated duration', () => {
    mockMaintenance = {
      ...BASE_MAINTENANCE,
      startTime: mockNow + 60_000,
      estimatedDuration: '1 hour',
    };
    const { container } = render(<MaintenanceBanner />);
    expect(container.textContent).toContain('We will be back soon');
    expect(container.textContent).toContain('1 hour');
  });

  it('dismisses the banner when the close button is clicked', () => {
    mockMaintenance = { ...BASE_MAINTENANCE, startTime: mockNow + 60_000 };
    render(<MaintenanceBanner />);
    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismiss);
    expect(screen.queryByText(/Scheduled maintenance/)).not.toBeInTheDocument();
  });

  it('clears the countdown once the end time has passed', () => {
    mockMaintenance = {
      ...BASE_MAINTENANCE,
      startTime: mockNow - 3_600_000,
      endTime: mockNow - 60_000, // ended a minute ago
    };
    const { container } = render(<MaintenanceBanner />);
    expect(container.textContent).not.toMatch(/\d+m \d+s/);
  });
});
