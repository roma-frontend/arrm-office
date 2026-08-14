/**
 * Tests for small driver-area components: DriversPageHeader, StatCard,
 * PassengerStatsGrid, DriverCalendarDialog and NoDriversEmptyState.
 *
 * Mocks: react-i18next (fallback t), ui primitives (card, button, dialog),
 * DriverCalendar, lucide icons. The real StatCard is exercised through
 * PassengerStatsGrid so both are covered from one render.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
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
  CardHeader: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className }: any) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          close
        </button>
        {children}
      </div>
    ) : null,
  SheetContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/drivers/DriverCalendar', () => ({
  DriverCalendar: ({ driverId, organizationId, role }: any) => (
    <div data-testid="driver-calendar">
      {String(driverId)}|{String(organizationId)}|{role ?? 'no-role'}
    </div>
  ),
}));

jest.mock('lucide-react', () => {
  const names = ['Car', 'Clock', 'CheckCircle', 'Plus'];
  const out: Record<string, (props: any) => React.ReactElement> = {};
  names.forEach((n) => {
    out[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  });
  return out;
});

import { DriversPageHeader } from '@/components/drivers/layout/DriversPageHeader';
import { StatCard } from '@/components/drivers/layout/StatCard';
import { PassengerStatsGrid } from '@/components/drivers/layout/PassengerStatsGrid';
import { DriverCalendarDialog } from '@/components/drivers/modals/DriverCalendarDialog';
import { NoDriversEmptyState } from '@/components/drivers/empty-states/NoDriversEmptyState';

describe('DriversPageHeader', () => {
  it('renders the title and subtitle', () => {
    render(<DriversPageHeader title="Drivers" subtitle="Manage the fleet" />);
    expect(screen.getByRole('heading', { name: 'Drivers' })).toBeInTheDocument();
    expect(screen.getByText('Manage the fleet')).toBeInTheDocument();
  });

  it('renders action buttons when provided', () => {
    render(
      <DriversPageHeader
        title="Drivers"
        subtitle="Fleet"
        actions={<button type="button">Add</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('omits the actions container when none are provided', () => {
    render(<DriversPageHeader title="Drivers" subtitle="Fleet" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PassengerStatsGrid + StatCard', () => {
  it('renders three stat cards with translated labels and values', () => {
    render(<PassengerStatsGrid availableDrivers={3} pendingRequests={5} totalTrips={42} />);
    // String fallbacks from the t mock.
    expect(screen.getByText('Available Drivers')).toBeInTheDocument();
    expect(screen.getByText('Pending Requests')).toBeInTheDocument();
    expect(screen.getByText('Total Trips')).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(3);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getAllByTestId('icon-Car').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('icon-Clock').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('icon-CheckCircle').length).toBeGreaterThan(0);
  });

  it('uses custom gradient and icon background colors', () => {
    const { container } = render(
      <PassengerStatsGrid availableDrivers={1} pendingRequests={0} totalTrips={0} />,
    );
    // Green gradient for the available-drivers card (first card); React keeps
    // colors inside gradient strings as-is (hex, not rgb).
    const greenGradient = container.querySelector('[style*="#22c55e"]');
    expect(greenGradient).not.toBeNull();
    const amberBg = container.querySelector('[style*="rgba(245, 158, 11, 0.1)"]');
    expect(amberBg).not.toBeNull();
  });
});

describe('StatCard (direct)', () => {
  it('applies default gradient and icon background colors', () => {
    const CarIcon = () => <span data-testid="icon-Car" />;
    // Rendering the bare StatCard without colors hits the default parameter
    // branches that PassengerStatsGrid never exercises (it passes explicit
    // gradients for every card).
    const { container } = render(<StatCard label="X" value={1} icon={CarIcon} />);
    // jsdom chokes on `#`+parentheses in one attribute selector, so match the
    // default color hex and the icon background separately.
    expect(container.querySelector('[style*="#6366f1"]')).not.toBeNull();
    expect(container.querySelector('[style*="rgba(99, 102, 241, 0.1)"]')).not.toBeNull();
    expect(screen.getByText('X')).toBeInTheDocument();
  });
});

describe('DriverCalendarDialog', () => {
  const orgId = 'org_1' as unknown as never;

  it('renders nothing when no driver is selected', () => {
    const { container } = render(
      <DriverCalendarDialog open onClose={jest.fn()} driverId={null} organizationId={orgId} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the calendar with driver id, org and role', () => {
    render(
      <DriverCalendarDialog
        open
        onClose={jest.fn()}
        driverId="d1"
        organizationId={orgId}
        role="admin"
      />,
    );
    expect(screen.getByTestId('driver-calendar')).toHaveTextContent('d1|org_1|admin');
    expect(screen.getByText('Driver Schedule')).toBeInTheDocument();
  });

  it('renders the calendar without a role', () => {
    render(<DriverCalendarDialog open onClose={jest.fn()} driverId="d2" organizationId={orgId} />);
    expect(screen.getByTestId('driver-calendar')).toHaveTextContent('d2|org_1|no-role');
  });

  it('closes via onOpenChange(false)', () => {
    const onClose = jest.fn();
    render(<DriverCalendarDialog open onClose={onClose} driverId="d1" organizationId={orgId} />);
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('NoDriversEmptyState', () => {
  it('renders translated defaults when no props are given', () => {
    render(<NoDriversEmptyState />);
    expect(screen.getByText('No Drivers Available')).toBeInTheDocument();
    expect(
      screen.getByText('There are no drivers available right now. Try again later.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('overrides title, description and action', () => {
    const onAction = jest.fn();
    render(
      <NoDriversEmptyState
        title="No cars"
        description="Check back soon"
        actionLabel="Add Driver"
        onAction={onAction}
      />,
    );
    expect(screen.getByText('No cars')).toBeInTheDocument();
    expect(screen.getByText('Check back soon')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Driver' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders the button without an action label', () => {
    render(<NoDriversEmptyState onAction={jest.fn()} />);
    // Falls back to the translated default action label.
    expect(screen.getByRole('button', { name: 'Request Driver' })).toBeInTheDocument();
  });
});
