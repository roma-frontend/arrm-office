/**
 * Tests for DriverCard — the driver card with book/calendar/favorite actions.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, size, variant, ...props }: any) => (
    <button type="button" onClick={onClick} data-size={size} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: any) => (
    <div data-testid="avatar" className={className}>
      {children}
    </div>
  ),
  AvatarImage: ({ src }: any) => <img data-testid="avatar-img" src={src} alt="" />,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
}));

jest.mock('lucide-react', () => {
  const names = ['Car', 'Users', 'MapPin', 'Star', 'Calendar', 'Heart'];
  const out: Record<string, (props: any) => React.ReactElement> = {};
  names.forEach((n) => {
    out[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  });
  return out;
});

import { DriverCard } from '@/components/drivers/cards/DriverCard';

const DRIVER = {
  _id: 'd1',
  userName: 'John Driver',
  userPosition: 'Fleet Manager',
  rating: 4.7,
  totalTrips: 23,
  isOnShift: true,
  vehicleInfo: { model: 'Toyota Camry', capacity: 4, plateNumber: '01-AA-234' },
};

describe('DriverCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders driver info, rating, vehicle and trip count', () => {
    render(
      <DriverCard
        driver={DRIVER as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.getByText('John Driver')).toBeInTheDocument();
    expect(screen.getByText('Fleet Manager')).toBeInTheDocument();
    expect(screen.getByText('4.7')).toBeInTheDocument();
    expect(screen.getByText('(23 trips)')).toBeInTheDocument();
    expect(screen.getByText('Toyota Camry')).toBeInTheDocument();
    expect(screen.getByText('4 seats')).toBeInTheDocument();
    expect(screen.getByText('01-AA-234')).toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument(); // initials fallback
  });

  it('renders the avatar image when provided', () => {
    render(
      <DriverCard
        driver={{ ...DRIVER, userAvatar: 'https://example.com/d.png' } as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.getByTestId('avatar-img').getAttribute('src')).toBe('https://example.com/d.png');
  });

  it('shows the on-shift indicator dot', () => {
    const { container } = render(
      <DriverCard
        driver={DRIVER as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(container.querySelector('.drivers-dot-pulse')).not.toBeNull();
  });

  it('omits the shift dot when not on shift', () => {
    const { container } = render(
      <DriverCard
        driver={{ ...DRIVER, isOnShift: false } as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(container.querySelector('.drivers-dot-pulse')).toBeNull();
  });

  it('calls onBook with the driver id', () => {
    const onBook = jest.fn();
    render(
      <DriverCard
        driver={DRIVER as never}
        isFavorite={false}
        onBook={onBook}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(onBook).toHaveBeenCalledWith('d1');
  });

  it('calls onCalendar via the calendar button', () => {
    const onCalendar = jest.fn();
    render(
      <DriverCard
        driver={DRIVER as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={onCalendar}
        onToggleFavorite={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('driver-calendar-button'));
    expect(onCalendar).toHaveBeenCalledWith('d1');
  });

  it('calls onToggleFavorite', () => {
    const onToggle = jest.fn();
    render(
      <DriverCard
        driver={DRIVER as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('icon-Heart').closest('button')!);
    expect(onToggle).toHaveBeenCalledWith('d1');
  });

  it('renders the favorite heart in filled state', () => {
    const { container } = render(
      <DriverCard
        driver={DRIVER as never}
        isFavorite
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(container.querySelector('[class*="fill-red-500"]')).not.toBeNull();
  });

  it('renders the favorite heart in outline state', () => {
    const { container } = render(
      <DriverCard
        driver={DRIVER as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(container.querySelector('[class*="fill-red-500"]')).toBeNull();
  });

  it('omits the position line when absent', () => {
    render(
      <DriverCard
        driver={{ ...DRIVER, userPosition: undefined } as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.queryByText('Fleet Manager')).not.toBeInTheDocument();
  });

  it('falls back to a question-mark initial without a user name', () => {
    render(
      <DriverCard
        driver={{ ...DRIVER, userName: undefined } as never}
        isFavorite={false}
        onBook={jest.fn()}
        onCalendar={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
