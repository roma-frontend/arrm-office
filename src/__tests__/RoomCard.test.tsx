/**
 * Tests for RoomCard and AmenityIcon — meeting room card rendering.
 *
 * Covers: room name/location display, amenity icons, capacity, active/inactive
 * state, booking display, action callbacks, keyboard navigation.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoomCard, AmenityIcon } from '@/components/rooms/RoomCard';
import type { RoomWithBookings } from '@/components/rooms/types';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'rooms.capacityPeople') return `${opts?.count} people`;
      if (key === 'rooms.archived') return 'Archived';
      if (key === 'rooms.book') return 'Book';
      if (key === 'rooms.details.open') return 'Details';
      if (key === 'rooms.manageRoom') return 'Manage room';
      if (key === 'rooms.editRoom') return 'Edit';
      if (key === 'rooms.archive') return 'Archive';
      if (key === 'rooms.restore') return 'Restore';
      if (key === 'rooms.deleteRoom') return 'Delete';
      if (key === 'rooms.status.free') return 'Free';
      if (key === 'rooms.status.occupied') return 'Occupied';
      if (key === 'rooms.status.archived') return 'Archived';
      if (key === 'rooms.statusDetail.freeAllDay') return 'Free all day';
      if (key?.startsWith('rooms.amenity.')) return key.split('.').pop()!;
      return key;
    },
  }),
}));

// Mock the status indicator module
jest.mock('@/components/rooms/RoomStatusIndicator', () => ({
  RoomStatusDot: ({ status }: { status: string }) => <span data-testid={`status-dot-${status}`} />,
  RoomStatusPill: ({ status, label }: { status: string; label: string }) => (
    <span data-testid={`status-pill-${status}`}>{label}</span>
  ),
  useRoomStatusText: () => (info: { status: string }) => ({
    label: info.status,
    detail: 'Free all day',
  }),
}));

// Mock RoomDayTimeline
jest.mock('@/components/rooms/RoomDayTimeline', () => ({
  RoomDayTimeline: () => <div data-testid="day-timeline" />,
}));

// Mock cn
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

// Mock meetingRooms
jest.mock('@/lib/meetingRooms', () => ({
  DEFAULT_ROOM_COLOR: '#0ea5e9',
  formatRoomLocation: (
    room: { building?: string; floor?: string; roomNumber?: string },
    t: (key: string) => string,
  ) => {
    if (room.building) return `${room.building}, Floor ${room.floor ?? ''}`;
    return '';
  },
  resolveRoomStatus: (bookings: unknown[], now: number, opts?: { isActive?: boolean }) => ({
    status: opts?.isActive === false ? 'archived' : 'free',
    current: null,
    next: null,
    busyUntil: null,
    freeUntil: null,
    minutesLeft: null,
    minutesUntilNext: null,
  }),
}));

// Mock lucide-react icons to avoid SVG issues
jest.mock('lucide-react', () => {
  const identity = ({ className, ...props }: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'icon', className, ...props });
  return new Proxy(
    {},
    {
      get: () => identity,
    },
  );
});

function makeRoom(overrides: Partial<RoomWithBookings> = {}): RoomWithBookings {
  return {
    _id: 'room-1',
    organizationId: 'org-1',
    name: 'Conference Room A',
    capacity: 8,
    amenities: ['projector', 'tv', 'whiteboard', 'videoConference'],
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bookings: [],
    ...overrides,
  };
}

describe('AmenityIcon', () => {
  it('renders an icon for known amenity keys', () => {
    const { container } = render(<AmenityIcon amenity="projector" />);
    expect(container.querySelector('[data-testid="icon"]')).toBeInTheDocument();
  });

  it('renders null for unknown amenity key', () => {
    const { container } = render(<AmenityIcon amenity="unknownAmenity" />);
    expect(container.innerHTML).toBe('');
  });

  it('passes className through', () => {
    const { container } = render(<AmenityIcon amenity="tv" className="h-4 w-4" />);
    const icon = container.querySelector('[data-testid="icon"]');
    expect(icon?.className).toContain('h-4 w-4');
  });
});

describe('RoomCard', () => {
  const defaultProps = {
    room: makeRoom(),
    now: Date.now(),
    canManage: false,
    onOpen: jest.fn(),
    onBook: jest.fn(),
    onEdit: jest.fn(),
    onToggleActive: jest.fn(),
    onDelete: jest.fn(),
    formatTime: (ms: number) => new Date(ms).toLocaleTimeString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders room name', () => {
    render(<RoomCard {...defaultProps} />);
    expect(screen.getByText('Conference Room A')).toBeInTheDocument();
  });

  it('renders capacity', () => {
    render(<RoomCard {...defaultProps} />);
    expect(screen.getByText('8 people')).toBeInTheDocument();
  });

  it('renders Book button', () => {
    render(<RoomCard {...defaultProps} />);
    expect(screen.getByText('Book')).toBeInTheDocument();
  });

  it('renders Details button', () => {
    render(<RoomCard {...defaultProps} />);
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('renders archived badge for inactive room', () => {
    render(<RoomCard {...defaultProps} room={makeRoom({ isActive: false })} />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('does NOT render archived badge for active room', () => {
    render(<RoomCard {...defaultProps} />);
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('calls onOpen when card is clicked', () => {
    render(<RoomCard {...defaultProps} />);
    const card = screen.getByRole('button', { name: /Conference Room A/i });
    fireEvent.click(card);
    expect(defaultProps.onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onBook when Book button is clicked', () => {
    render(<RoomCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Book'));
    expect(defaultProps.onBook).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen when Details button is clicked', () => {
    render(<RoomCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Details'));
    expect(defaultProps.onOpen).toHaveBeenCalledTimes(1);
  });

  it('Book button is disabled for inactive rooms', () => {
    render(<RoomCard {...defaultProps} room={makeRoom({ isActive: false })} />);
    const bookBtn = screen.getByText('Book').closest('button');
    expect(bookBtn).toBeDisabled();
  });

  it('renders manage menu when canManage is true', () => {
    render(<RoomCard {...defaultProps} canManage={true} />);
    expect(screen.getByLabelText('Manage room')).toBeInTheDocument();
  });

  it('does NOT render manage menu when canManage is false', () => {
    render(<RoomCard {...defaultProps} canManage={false} />);
    expect(screen.queryByLabelText('Manage room')).not.toBeInTheDocument();
  });

  it('renders day timeline', () => {
    render(<RoomCard {...defaultProps} />);
    expect(screen.getByTestId('day-timeline')).toBeInTheDocument();
  });

  it('supports keyboard navigation (Enter)', () => {
    render(<RoomCard {...defaultProps} />);
    const card = screen.getByRole('button', { name: /Conference Room A/i });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(defaultProps.onOpen).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard navigation (Space)', () => {
    render(<RoomCard {...defaultProps} />);
    const card = screen.getByRole('button', { name: /Conference Room A/i });
    fireEvent.keyDown(card, { key: ' ' });
    expect(defaultProps.onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders room location when building is set', () => {
    const room = makeRoom({ building: 'HQ', floor: '3', roomNumber: 'A101' });
    render(<RoomCard {...defaultProps} room={room} />);
    expect(screen.getByText(/HQ, Floor 3/)).toBeInTheDocument();
  });

  it('renders status detail line', () => {
    render(<RoomCard {...defaultProps} />);
    expect(screen.getByText('Free all day')).toBeInTheDocument();
  });
});
