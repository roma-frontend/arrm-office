/**
 * Tests for DriverBookingPage — the passenger-facing driver booking page.
 *
 * Sub-sections are stubbed to marker components so we assert composition and
 * prop wiring without re-testing the sections themselves.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant }: any) => (
    <button type="button" onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/drivers/layout/DriversPageHeader', () => ({
  DriversPageHeader: ({ title, subtitle, actions }: any) => (
    <header data-testid="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <div data-testid="header-actions">{actions}</div>
    </header>
  ),
}));

jest.mock('@/components/drivers/layout/PassengerStatsGrid', () => ({
  PassengerStatsGrid: () => <div data-testid="stats-grid" />,
}));

jest.mock('@/components/drivers/sections/AvailableDriversSection', () => ({
  AvailableDriversSection: (props: any) => (
    <div data-testid="available-section" data-drivers={String(props.drivers.length)}>
      Available({props.searchQuery})
    </div>
  ),
}));

jest.mock('@/components/drivers/sections/MyRequestsSection', () => ({
  MyRequestsSection: (props: any) => (
    <div data-testid="requests-section" data-active={String(props.activeRequests.length)}>
      Requests
    </div>
  ),
}));

import { DriverBookingPage } from '@/components/drivers/sections/DriverBookingPage';

const PROPS = {
  drivers: [
    {
      _id: 'd1',
      userName: 'John',
      rating: 4.5,
      totalTrips: 10,
      vehicleInfo: { model: 'Toyota', capacity: 4, plateNumber: '01' },
    },
  ],
  activeRequests: [{ _id: 'r1', status: 'pending' }],
  historyRequests: [],
  recurringTrips: [],
  favoriteIds: new Set<string>(),
  stats: { availableDrivers: 1, pendingRequests: 1, totalTrips: 10 },
  searchQuery: 'john',
  capacityFilter: 4,
  sortBy: 'rating' as const,
  onSearchChange: jest.fn(),
  onCapacityChange: jest.fn(),
  onSortChange: jest.fn(),
  onBook: jest.fn(),
  onCalendar: jest.fn(),
  onToggleFavorite: jest.fn(),
  onRequestDriver: jest.fn(),
  onViewRequestDetails: jest.fn(),
  onRateRequest: jest.fn(),
  onEditRequest: jest.fn(),
  onDeleteRequest: jest.fn(),
  onCancelRequest: jest.fn(),
  onToggleRecurring: jest.fn(),
  onDeleteRecurring: jest.fn(),
  onRegisterAsDriver: jest.fn(),
  canRegisterDrivers: true,
};

describe('DriverBookingPage', () => {
  it('renders header, stats, drivers and requests sections', () => {
    render(<DriverBookingPage {...PROPS} />);
    expect(screen.getByText('Driver Booking')).toBeInTheDocument();
    expect(
      screen.getByText('Book a driver for your business trips and transfers'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('stats-grid')).toBeInTheDocument();
    expect(screen.getByTestId('available-section')).toHaveAttribute('data-drivers', '1');
    expect(screen.getByTestId('requests-section')).toHaveAttribute('data-active', '1');
  });

  it('shows both action buttons when registration is allowed', () => {
    render(<DriverBookingPage {...PROPS} />);
    expect(screen.getByRole('button', { name: 'Register as Driver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Driver' })).toBeInTheDocument();
  });

  it('hides the register button when registration is not allowed', () => {
    render(<DriverBookingPage {...PROPS} canRegisterDrivers={false} />);
    expect(screen.queryByRole('button', { name: 'Register as Driver' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Driver' })).toBeInTheDocument();
  });

  it('wires the request-driver button to the callback', () => {
    render(<DriverBookingPage {...PROPS} />);
    screen.getByRole('button', { name: 'Request Driver' }).click();
    expect(PROPS.onRequestDriver).toHaveBeenCalled();
  });

  it('wires the register-as-driver button to the callback', () => {
    render(<DriverBookingPage {...PROPS} />);
    screen.getByRole('button', { name: 'Register as Driver' }).click();
    expect(PROPS.onRegisterAsDriver).toHaveBeenCalled();
  });

  it('passes search state down to the available section', () => {
    render(<DriverBookingPage {...PROPS} />);
    expect(screen.getByText('Available(john)')).toBeInTheDocument();
  });
});
