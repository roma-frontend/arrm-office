/**
 * Tests for CalendarClient — the org calendar aggregating leaves, driver
 * bookings, Google events, custom events and room bookings into one month grid.
 *
 * Covers: month navigation, day cells with event pills, the selected-day side
 * panel, single/double-click behaviour, scope switching, event deletion,
 * booking guards on past dates, and the empty states.
 *
 * Mocks: convex/react (useQuery/useMutation keyed by query _name), the generated
 * api, auth store, selected org, hydration/main-ref/scroll-lock hooks, cssMotion,
 * UI primitives, lucide icons, sonner, logger, and every modal as a stub.
 */
import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// This suite renders a large calendar grid and routinely exceeds the default
// 5s per-test timeout when the full suite runs in parallel — bump it.
jest.setTimeout(30000);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) =>
      fallback && typeof fallback === 'object' ? (fallback.defaultValue ?? key) : fallback || key,
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
let mutationImpl: ((...args: any[]) => Promise<unknown>) | null = null;
let mockUser: any = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
let mockSelectedOrg: string | null = 'org-1';

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      return mutationImpl ? mutationImpl(...args) : Promise.resolve();
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    leaves: {
      getLeavesForOrganization: { _name: 'getLeavesForOrganization' },
      getAllLeaves: { _name: 'getAllLeaves' },
    },
    drivers: {
      queries: {
        getOrgDriverSchedules: { _name: 'getOrgDriverSchedules' },
      },
    },
    calendarEvents: {
      getByOrganization: { _name: 'getByOrganization' },
      getMyAccessState: { _name: 'getMyAccessState' },
      listPendingCalendarAccessRequests: { _name: 'listPendingCalendarAccessRequests' },
      requestCalendarAccess: { _name: 'requestCalendarAccess' },
      respondToCalendarAccess: { _name: 'respondToCalendarAccess' },
      remove: { _name: 'remove' },
    },
    events: {
      getCompanyEvents: { _name: 'getCompanyEvents' },
    },
    meetingRooms: {
      listBookings: { _name: 'listBookings' },
      listRooms: { _name: 'listRooms' },
    },
    users: {
      getUsersByOrganizationId: { _name: 'getUsersByOrganizationId' },
    },
    overtime: {
      getOvertimeForDateRange: { _name: 'getOvertimeForDateRange' },
    },
  },
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
  // useDraftResume reads the user id through this selector — without it the
  // draft prompts crash the calendar before it can render.
  useAuthUser: () => mockUser,
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

jest.mock('@/hooks/useHydrated', () => ({
  useHydrated: () => true,
}));

jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: { scrollTo: jest.fn() } }),
}));

jest.mock('@/hooks/useScrollLock', () => ({
  useScrollLock: jest.fn(),
}));

jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  const Elem =
    (tag: string) =>
    ({ children, ...props }: any) =>
      ReactMod.createElement(tag, props, children);
  return {
    motion: { div: Elem('div'), h3: Elem('h3') },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      className={className}
      {...props}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, onClick }: any) => (
    <div data-testid="card" className={className} onClick={onClick}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => (
    <span className={className} data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select
      aria-label="calendar-person-select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span>{children}</span>,
  AvatarFallback: ({ children, style }: any) => <span style={style}>{children}</span>,
}));

jest.mock('@/components/ui/context-menu', () => {
  const ReactMod = require('react');
  return {
    ContextMenu: ({ children }: any) => <>{children}</>,
    ContextMenuTrigger: ({ children }: any) => <>{children}</>,
    ContextMenuContent: ({ children }: any) => <div data-testid="context-content">{children}</div>,
    ContextMenuItem: ({ children, onSelect, disabled }: any) => (
      <button disabled={disabled} onClick={() => onSelect?.()}>
        {children}
      </button>
    ),
    ContextMenuSeparator: () => <hr />,
  };
});

// Modal stubs — keep the calendar surface testable without their internals.
// Each stub exposes interaction buttons that call the real callbacks so the
// close/booking wiring in CalendarClient gets exercised.
jest.mock('@/components/leaves/LeaveRequestModal', () => ({
  LeaveRequestModal: ({ open, onClose, onOpenChange }: any) =>
    open ? (
      <div data-testid="leave-modal">
        <button
          data-testid="close-leave-modal"
          onClick={() => (onClose ?? onOpenChange)?.(false)}
        />
      </div>
    ) : null,
}));
jest.mock('@/components/calendar/DriverRequestModal', () => ({
  DriverRequestModal: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="driver-modal">
        <button data-testid="close-driver-modal" onClick={() => onOpenChange?.(false)} />
      </div>
    ) : null,
}));
jest.mock('@/components/calendar/CreateEventModal', () => ({
  CreateEventModal: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="create-event-modal">
        <button data-testid="close-create-modal" onClick={() => onOpenChange?.(false)} />
      </div>
    ) : null,
}));
jest.mock('@/components/calendar/DayDetailsModal', () => ({
  DayDetailsModal: ({ open, onClose, onOpenRoom }: any) =>
    open ? (
      <div data-testid="day-details-modal">
        <button data-testid="close-day-details" onClick={() => onClose?.()} />
        <button data-testid="day-details-open-room" onClick={() => onOpenRoom?.('room-1')} />
      </div>
    ) : null,
}));
jest.mock('@/components/calendar/EventTimelineModal', () => ({
  EventTimelineModal: ({ input, onClose }: any) =>
    input ? (
      <div data-testid="timeline-modal">
        <button data-testid="close-timeline" onClick={() => onClose?.()} />
      </div>
    ) : null,
}));
jest.mock('@/components/calendar/CalendarScopeSwitcher', () => ({
  CalendarScopeSwitcher: ({ value, onChange, counts }: any) => (
    <div data-testid="scope-switcher">
      <button onClick={() => onChange('mine')} data-active={value === 'mine'}>
        mine ({counts?.mine})
      </button>
      <button onClick={() => onChange('team')} data-active={value === 'team'}>
        team ({counts?.team})
      </button>
    </div>
  ),
}));
jest.mock('@/components/rooms/RoomAvailabilityStrip', () => ({
  RoomAvailabilityStrip: () => <div data-testid="room-strip" />,
}));
jest.mock('@/components/rooms/RoomBookingModal', () => ({
  RoomBookingModal: ({ open, onClose }: any) =>
    open ? (
      <div data-testid="room-booking-modal">
        <button data-testid="close-room-booking" onClick={() => onClose?.()} />
      </div>
    ) : null,
}));
jest.mock('@/components/rooms/RoomDetailsModal', () => ({
  RoomDetailsModal: ({ open, onClose, onBook }: any) =>
    open ? (
      <div data-testid="room-details-modal">
        <button data-testid="close-room-details" onClick={() => onClose?.()} />
        <button
          data-testid="room-details-book"
          onClick={() => onBook?.({ _id: 'room-1' }, new Date())}
        />
      </div>
    ) : null,
}));

jest.mock('lucide-react', () => {
  const mkIcon = (name: string) => (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  return {
    ChevronLeft: mkIcon('ChevronLeft'),
    ChevronRight: mkIcon('ChevronRight'),
    CalendarDays: mkIcon('CalendarDays'),
    Clock: mkIcon('Clock'),
    CheckCircle: mkIcon('CheckCircle'),
    XCircle: mkIcon('XCircle'),
    Users: mkIcon('Users'),
    Plus: mkIcon('Plus'),
    ExternalLink: mkIcon('ExternalLink'),
    Car: mkIcon('Car'),
    CalendarPlus: mkIcon('CalendarPlus'),
    ClipboardCopy: mkIcon('ClipboardCopy'),
    Trash2: mkIcon('Trash2'),
    Eye: mkIcon('Eye'),
    DoorOpen: mkIcon('DoorOpen'),
    Building2: mkIcon('Building2'),
    Video: mkIcon('Video'),
    Maximize2: mkIcon('Maximize2'),
    Minimize2: mkIcon('Minimize2'),
  };
});

import CalendarClient from '@/components/calendar/CalendarClient';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const today = new Date();
const todayStr = ymd(today);
const todayNoon = new Date(today);
todayNoon.setHours(12, 0, 0, 0);

const LEAVES = [
  {
    _id: 'leave-1',
    userId: 'user-1',
    userName: 'Anna Petrova',
    userDepartment: 'Engineering',
    type: 'paid',
    startDate: todayStr,
    endDate: todayStr,
    days: 1,
    reason: 'Medical',
    comment: 'Doctor appointment',
    status: 'approved',
  },
];

const EMPTY_QUERIES = {
  getLeavesForOrganization: [],
  getOrgDriverSchedules: [],
  getByOrganization: [],
  getCompanyEvents: [],
  listBookings: [],
  listRooms: [],
  getMyAccessState: { organization: 'approved', people: [] },
  listPendingCalendarAccessRequests: [],
  getOvertimeForDateRange: [],
  getUsersByOrganizationId: [
    { _id: 'user-1', name: 'Current User' },
    { _id: 'user-2', name: 'Maya Chen', department: 'Finance' },
  ],
};

const NO_GOOGLE_FETCH = () =>
  jest.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, events: [] }) });

const DRIVER_EVENTS = [
  {
    _id: 'drv-1',
    driverId: 'drv-user-1',
    driverName: 'Karen Movsisyan',
    driverUserId: 'user-1',
    userId: 'user-1',
    driverVehicle: { model: 'Toyota', plateNumber: '01-A-234', capacity: 4 },
    bookedByName: 'Anna Petrova',
    startTime: todayNoon.getTime(),
    endTime: todayNoon.getTime() + 60 * 60 * 1000,
    type: 'trip',
    status: 'scheduled',
    tripInfo: { from: 'Office', to: 'Airport', purpose: 'Pickup', passengerCount: 1 },
  },
];

const GOOGLE_EVENTS = [
  {
    id: 'g-1',
    title: 'Team sync',
    description: 'Weekly',
    startDate: todayStr,
    endDate: todayStr,
    startTime: new Date(todayNoon.getTime() - 3600_000).toISOString(),
    endTime: todayNoon.toISOString(),
    allDay: false,
    location: 'Room A',
    htmlLink: 'https://calendar.google.com/event',
  },
];

const CUSTOM_EVENTS = [
  {
    _id: 'evt-1',
    title: 'Birthday party',
    date: todayStr,
    startTime: '15:00',
    endTime: '17:00',
    allDay: false,
    location: 'Cafe',
    description: 'Happy birthday!',
    category: 'social',
    createdBy: 'user-1',
    attendees: ['user-1'],
    createdAt: 1_750_000_000_000,
  },
];

const COMPANY_EVENTS = [
  {
    _id: 'ce-1',
    name: 'All hands',
    description: 'Quarterly town hall',
    startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
    endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
    eventType: 'meeting',
    requiredDepartments: [],
    requiredEmployeeIds: [],
  },
];

const ROOMS = [
  {
    _id: 'room-1',
    organizationId: 'org-1',
    name: 'Conference A',
    capacity: 10,
    amenities: ['projector'],
    color: '#0ea5e9',
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
  },
];

const ROOM_BOOKINGS = [
  {
    _id: 'bk-1',
    organizationId: 'org-1',
    roomId: 'room-1',
    title: 'Board meeting',
    startTime: todayNoon.getTime(),
    endTime: todayNoon.getTime() + 60 * 60 * 1000,
    organizerId: 'user-1',
    organizerName: 'Anna Petrova',
    attendeeIds: ['user-1'],
    attendeeNames: ['Anna Petrova'],
    status: 'confirmed',
    roomName: 'Conference A',
    roomColor: '#0ea5e9',
    createdAt: 0,
  },
];

describe('CalendarClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    mutationImpl = null;
    // Scope choices persist to localStorage; reset so every test starts on the
    // admin default ('team') instead of inheriting a previous test's scope.
    window.localStorage.clear();
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
    mockSelectedOrg = 'org-1';
    queryResults = {
      getLeavesForOrganization: LEAVES,
      getOrgDriverSchedules: DRIVER_EVENTS,
      getByOrganization: CUSTOM_EVENTS,
      getCompanyEvents: [],
      listBookings: ROOM_BOOKINGS,
      listRooms: ROOMS,
      getMyAccessState: { organization: 'approved', people: [] },
      listPendingCalendarAccessRequests: [],
      getOvertimeForDateRange: [],
      getUsersByOrganizationId: EMPTY_QUERIES.getUsersByOrganizationId,
    };
    // The component fetches Google events on mount.
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ connected: true, events: GOOGLE_EVENTS }),
    });
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('renders the header, month navigation and day grid', () => {
    render(<CalendarClient />);
    expect(screen.getByText('buttons.today')).toBeInTheDocument();
    expect(screen.getByText('calendar.newLeave')).toBeInTheDocument();
    expect(screen.getByText('createMeeting.title')).toBeInTheDocument();
    expect(screen.getByTestId('scope-switcher')).toBeInTheDocument();
    // 6 weeks × 7 days grid
    expect(document.querySelectorAll('button').length).toBeGreaterThan(20);
  });

  it('navigates to the previous and next month', () => {
    render(<CalendarClient />);
    const current = new Date();
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    const nextLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
      next,
    );

    fireEvent.click(screen.getByTestId('icon-ChevronRight'));
    expect(screen.getByText(nextLabel, { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('icon-ChevronLeft'));
    const currentLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
      current,
    );
    expect(screen.getByText(currentLabel, { exact: false })).toBeInTheDocument();
  });

  it('returns to today with the today button', () => {
    render(<CalendarClient />);
    fireEvent.click(screen.getByTestId('icon-ChevronRight'));
    fireEvent.click(screen.getByText('buttons.today'));
    const currentLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
      new Date(),
    );
    expect(screen.getByText(currentLabel, { exact: false })).toBeInTheDocument();
  });

  it('shows leaves, drivers, google, custom and room bookings on the selected day', async () => {
    render(<CalendarClient />);
    // Side panel lists the selected day's entries (selectedDay defaults to today).
    expect(screen.getAllByText('Anna Petrova').length).toBeGreaterThan(0);
    expect(screen.getByText('Karen Movsisyan')).toBeInTheDocument();
    expect(screen.getAllByText('Birthday party').length).toBeGreaterThan(0);
    expect(screen.getByText('Board meeting')).toBeInTheDocument();
    // Google events arrive over fetch after mount.
    await waitFor(() => {
      expect(screen.getAllByText('Team sync').length).toBeGreaterThan(0);
    });
  });

  it('shows the empty state when nothing is booked on the selected day', () => {
    queryResults = {
      getLeavesForOrganization: [],
      getOrgDriverSchedules: [],
      getByOrganization: [],
      getCompanyEvents: [],
      listBookings: [],
      listRooms: [],
      getMyAccessState: { organization: 'approved', people: [] },
      listPendingCalendarAccessRequests: [],
      getOvertimeForDateRange: [],
      getUsersByOrganizationId: [],
    };
    render(<CalendarClient />);
    expect(screen.getByText('calendarScope.team.emptyDay')).toBeInTheDocument();
  });

  it('opens the leave request modal from the header button', () => {
    render(<CalendarClient />);
    fireEvent.click(screen.getByText('calendar.newLeave'));
    expect(screen.getByTestId('leave-modal')).toBeInTheDocument();
  });

  it('opens the create-event modal from the header button', () => {
    render(<CalendarClient />);
    fireEvent.click(screen.getByText('createMeeting.title'));
    expect(screen.getByTestId('create-event-modal')).toBeInTheDocument();
  });

  it('double-clicking a leave opens its timeline', async () => {
    render(<CalendarClient />);
    // The side-panel leave row carries a hint title; it is the clickable one.
    const row = document.querySelector('[title="eventTimeline.hints.doubleClick"]') as HTMLElement;
    fireEvent.doubleClick(row);
    await waitFor(() => {
      expect(screen.getByTestId('timeline-modal')).toBeInTheDocument();
    });
  });

  it('deletes a custom event and confirms with a toast', async () => {
    render(<CalendarClient />);
    fireEvent.click(screen.getByTestId('icon-Trash2'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'remove', args: [{ id: 'evt-1' }] }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('createMeeting.deleted');
  });

  it('switches between personal and team scope', () => {
    render(<CalendarClient />);
    // Admin defaults to 'team'; the switcher carries live scope counts.
    const mineButton = screen.getByText(/^mine \(/);
    const teamButton = screen.getByText(/^team \(/);
    expect(teamButton.getAttribute('data-active')).toBe('true');
    fireEvent.click(mineButton);
    expect(mineButton.getAttribute('data-active')).toBe('true');
    fireEvent.click(teamButton);
    expect(teamButton.getAttribute('data-active')).toBe('true');
  });

  it('requests approval instead of opening the organization calendar without access', async () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'employee' };
    queryResults = {
      ...queryResults,
      getMyAccessState: { organization: 'none', people: [] },
    };
    render(<CalendarClient />);

    expect(screen.queryByText(/^team \(/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('calendar-person-select')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Request organization calendar'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          {
            name: 'requestCalendarAccess',
            args: [{ organizationId: 'org-1', scope: 'organization' }],
          },
        ]),
      );
    });
    expect(screen.getByText('My calendar')).toBeInTheDocument();
  });

  it('hides shared controls while the CEO request is pending', () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'employee' };
    queryResults = {
      ...queryResults,
      getMyAccessState: { organization: 'pending', people: [] },
    };
    render(<CalendarClient />);

    expect(screen.queryByText(/^team \(/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('calendar-person-select')).not.toBeInTheDocument();
    expect(screen.getByText('Awaiting CEO approval')).toBeDisabled();
  });

  it('filters the CEO-approved organization calendar by employee', async () => {
    queryResults = {
      ...queryResults,
      getMyAccessState: { organization: 'approved', people: [] },
    };
    render(<CalendarClient />);

    fireEvent.change(screen.getByLabelText('calendar-person-select'), {
      target: { value: 'user-2' },
    });

    expect(screen.getByLabelText('calendar-person-select')).toHaveValue('user-2');
    expect(mutationCalls.some((call) => call.name === 'requestCalendarAccess')).toBe(false);
  });

  it('shows the room availability strip and room legend', () => {
    render(<CalendarClient />);
    expect(screen.getByTestId('room-strip')).toBeInTheDocument();
    expect(screen.getByText('rooms.calendar.legend')).toBeInTheDocument();
  });

  it('renders the google calendar legend when connected', async () => {
    render(<CalendarClient />);
    await waitFor(() => {
      expect(screen.getAllByText('Google Calendar').length).toBeGreaterThan(0);
    });
  });

  it('shows company events on the selected day', () => {
    queryResults = { ...queryResults, getCompanyEvents: COMPANY_EVENTS };
    render(<CalendarClient />);
    expect(screen.getAllByText('All hands').length).toBeGreaterThan(0);
  });

  it('opens the leave detail modal when clicking a leave row', async () => {
    render(<CalendarClient />);
    const row = document.querySelector('[title="eventTimeline.hints.doubleClick"]') as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByText('leave.approved')).toBeInTheDocument();
    });
    // The modal body also renders the leave reason label for the comment.
    expect(screen.getByText('Reason')).toBeInTheDocument();
    // Clicking the panel stops propagation; clicking the backdrop closes it.
    fireEvent.click(document.querySelector('.modal-panel-in') as HTMLElement);
    fireEvent.click(document.querySelector('.modal-backdrop-in') as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByText('leave.approved')).not.toBeInTheDocument();
    });
  });

  it('opens the driver detail modal when clicking a driver row', async () => {
    render(<CalendarClient />);
    const rows = Array.from(document.querySelectorAll('[title="eventTimeline.hints.doubleClick"]'));
    const row = rows.find((r) => r.textContent?.includes('Karen Movsisyan')) as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getAllByText('Toyota').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Pickup').length).toBeGreaterThan(0);
    // The driver modal closes through its backdrop too.
    fireEvent.click(document.querySelector('.modal-backdrop-in') as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByText('Toyota')).not.toBeInTheDocument();
    });
  });

  it('opens the google event detail modal when clicking a google row', async () => {
    render(<CalendarClient />);
    await waitFor(() => {
      expect(screen.getAllByText('Team sync').length).toBeGreaterThan(0);
    });
    const rows = Array.from(document.querySelectorAll('[title="eventTimeline.hints.doubleClick"]'));
    const row = rows.find((r) => r.textContent?.includes('Team sync')) as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByText('Weekly')).toBeInTheDocument();
    });
    expect(screen.getByText('Room A')).toBeInTheDocument();
    // The close button dismisses the google detail modal.
    fireEvent.click(screen.getAllByTestId('icon-XCircle').at(-1) as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByText('Weekly')).not.toBeInTheDocument();
    });
  });

  it('opens the create-event modal in edit mode from a custom row click', async () => {
    render(<CalendarClient />);
    const rows = Array.from(document.querySelectorAll('[title="eventTimeline.hints.doubleClick"]'));
    const row = rows.find((r) => r.textContent?.includes('Birthday party')) as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByTestId('create-event-modal')).toBeInTheDocument();
    });
  });

  it('opens the room details modal from a booking row', () => {
    render(<CalendarClient />);
    fireEvent.click(document.querySelector('[title="rooms.calendar.openRoom"]') as HTMLElement);
    expect(screen.getByTestId('room-details-modal')).toBeInTheDocument();
  });

  it('shows an error toast when deleting an event fails', async () => {
    mutationImpl = async () => {
      throw new Error('boom');
    };
    render(<CalendarClient />);
    fireEvent.click(screen.getByTestId('icon-Trash2'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('rooms.errors.generic');
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('tolerates a failed google calendar fetch', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network'));
    render(<CalendarClient />);
    await waitFor(() => {
      expect(screen.getByText('calendar.newLeave')).toBeInTheDocument();
    });
  });

  it('refuses to book a past date with an error toast', async () => {
    render(<CalendarClient />);
    fireEvent.click(screen.getByTestId('icon-ChevronLeft'));
    const cells = Array.from(document.querySelectorAll('button'));
    const emptyCell = cells.find((b) => /^\d+$/.test(b.textContent?.trim() ?? ''));
    expect(emptyCell).toBeTruthy();
    fireEvent.doubleClick(emptyCell as HTMLElement);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You can only book today or future dates');
    });
  });

  it('reveals hidden shared events from the personal view', () => {
    queryResults = {
      ...queryResults,
      getLeavesForOrganization: [
        ...LEAVES,
        { ...LEAVES[0], _id: 'leave-2', userId: 'user-2', userName: 'Bob Smith' },
      ],
    };
    render(<CalendarClient />);
    fireEvent.click(screen.getByText(/^mine \(/));
    expect(screen.getByText('calendarScope.hiddenOnDay')).toBeInTheDocument();
    fireEvent.click(screen.getByText('calendarScope.showShared'));
    expect(screen.getByText(/^team \(/).getAttribute('data-active')).toBe('true');
  });

  it('opens the create-event modal when double-clicking an empty future day', async () => {
    render(<CalendarClient />);
    // Jump two months so every grid cell is strictly future (see above).
    fireEvent.click(screen.getByTestId('icon-ChevronRight'));
    fireEvent.click(screen.getByTestId('icon-ChevronRight'));
    const cells = Array.from(document.querySelectorAll('button'));
    const emptyCell = cells.find((b) => /^\d+$/.test(b.textContent?.trim() ?? ''));
    expect(emptyCell).toBeTruthy();
    fireEvent.doubleClick(emptyCell as HTMLElement);
    await waitFor(() => {
      expect(screen.getByTestId('create-event-modal')).toBeInTheDocument();
    });
  });

  it('opens the leave timeline when double-clicking a day holding a single leave', async () => {
    (global as any).fetch = NO_GOOGLE_FETCH();
    queryResults = { ...EMPTY_QUERIES, getLeavesForOrganization: LEAVES };
    render(<CalendarClient />);
    const cell = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Anna'),
    ) as HTMLElement;
    fireEvent.doubleClick(cell);
    await waitFor(() => {
      expect(screen.getByTestId('timeline-modal')).toBeInTheDocument();
    });
  });

  it('opens the driver timeline when double-clicking a day holding a single booking', async () => {
    (global as any).fetch = NO_GOOGLE_FETCH();
    queryResults = { ...EMPTY_QUERIES, getOrgDriverSchedules: DRIVER_EVENTS };
    render(<CalendarClient />);
    const cell = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Karen'),
    ) as HTMLElement;
    fireEvent.doubleClick(cell);
    await waitFor(() => {
      expect(screen.getByTestId('timeline-modal')).toBeInTheDocument();
    });
  });

  it('opens the custom timeline when double-clicking a day holding a single custom event', async () => {
    (global as any).fetch = NO_GOOGLE_FETCH();
    queryResults = { ...EMPTY_QUERIES, getByOrganization: CUSTOM_EVENTS };
    render(<CalendarClient />);
    const cell = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Birthday'),
    ) as HTMLElement;
    fireEvent.doubleClick(cell);
    await waitFor(() => {
      expect(screen.getByTestId('timeline-modal')).toBeInTheDocument();
    });
  });

  it('opens the company timeline when double-clicking a day holding a single company event', async () => {
    (global as any).fetch = NO_GOOGLE_FETCH();
    queryResults = { ...EMPTY_QUERIES, getCompanyEvents: COMPANY_EVENTS };
    render(<CalendarClient />);
    const cell = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('All hands'),
    ) as HTMLElement;
    fireEvent.doubleClick(cell);
    await waitFor(() => {
      expect(screen.getByTestId('timeline-modal')).toBeInTheDocument();
    });
  });

  it('opens the booking modals from the day context menu on a future day', async () => {
    render(<CalendarClient />);
    // Two months ahead: every grid cell is strictly in the future no matter the
    // current date, so no context item is disabled (a single-month jump could
    // leave the month's trailing days past near a month boundary).
    fireEvent.click(screen.getByTestId('icon-ChevronRight'));
    fireEvent.click(screen.getByTestId('icon-ChevronRight'));

    fireEvent.click(screen.getAllByText('createMeeting.contextMenu.newEvent')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('create-event-modal')).toBeInTheDocument();
    });

    // Each context action fires inside a setTimeout, so wait for the modal.
    fireEvent.click(screen.getAllByText('createMeeting.contextMenu.newLeave')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('leave-modal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('createMeeting.contextMenu.bookDriver')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('driver-modal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('rooms.bookRoom')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('room-booking-modal')).toBeInTheDocument();
    });
  }, 15_000);

  it('opens the room details with the keyboard', () => {
    render(<CalendarClient />);
    const row = document.querySelector('[title="rooms.calendar.openRoom"]') as HTMLElement;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByTestId('room-details-modal')).toBeInTheDocument();
  });

  it('labels a google event without a start time as all-day', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        connected: true,
        events: [
          {
            ...GOOGLE_EVENTS[0],
            id: 'g-2',
            title: 'All-day retreat',
            startTime: undefined,
            endTime: undefined,
          },
        ],
      }),
    });
    render(<CalendarClient />);
    await waitFor(() => {
      expect(screen.getAllByText('All day').length).toBeGreaterThan(0);
    });
  });

  it('cancels the pending single-click when a double-click arrives', async () => {
    render(<CalendarClient />);
    const row = document.querySelector('[title="eventTimeline.hints.doubleClick"]') as HTMLElement;
    fireEvent.click(row); // schedules the single-click action (leave detail)
    fireEvent.doubleClick(row); // cancels it and opens the timeline instead
    await waitFor(() => {
      expect(screen.getByTestId('timeline-modal')).toBeInTheDocument();
    });
    // The pending single-click timer was cancelled: the leave modal never opens.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByTestId('leave-modal')).not.toBeInTheDocument();
  });

  it('opens the day details from the day context menu', () => {
    render(<CalendarClient />);
    fireEvent.click(screen.getAllByText('createMeeting.contextMenu.viewDay')[0]);
    expect(screen.getByTestId('day-details-modal')).toBeInTheDocument();
  });

  it('opens the day details when double-clicking a day with several entries', async () => {
    render(<CalendarClient />);
    const cell = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Anna'),
    ) as HTMLElement;
    fireEvent.doubleClick(cell);
    await waitFor(() => {
      expect(screen.getByTestId('day-details-modal')).toBeInTheDocument();
    });
  });

  it('opens day details when clicking a company event row', async () => {
    queryResults = { ...queryResults, getCompanyEvents: COMPANY_EVENTS };
    render(<CalendarClient />);
    const rows = Array.from(document.querySelectorAll('[title="eventTimeline.hints.doubleClick"]'));
    const row = rows.find((r) => r.textContent?.includes('All hands')) as HTMLElement;
    fireEvent.click(row);
    // Generous timeout: the single-click → day-details path waits out the
    // double-click detection timer, which can be slow under parallel CI load.
    await waitFor(
      () => {
        expect(screen.getByTestId('day-details-modal')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('closes every dialog through its close callback', () => {
    render(<CalendarClient />);

    // Leave modal (header button) → close.
    fireEvent.click(screen.getByText('calendar.newLeave'));
    fireEvent.click(screen.getByTestId('close-leave-modal'));
    expect(screen.queryByTestId('leave-modal')).not.toBeInTheDocument();

    // Create-event modal → close (also clears the edit target).
    fireEvent.click(screen.getByText('createMeeting.title'));
    fireEvent.click(screen.getByTestId('close-create-modal'));
    expect(screen.queryByTestId('create-event-modal')).not.toBeInTheDocument();

    // Room details → close, re-open from the booking row, then book (hands off
    // to the booking modal). Done before viewDay below because that context
    // action moves selectedDay to another cell, hiding today's booking row.
    fireEvent.click(document.querySelector('[title="rooms.calendar.openRoom"]') as HTMLElement);
    expect(screen.getByTestId('room-details-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-room-details'));
    expect(screen.queryByTestId('room-details-modal')).not.toBeInTheDocument();
    fireEvent.click(document.querySelector('[title="rooms.calendar.openRoom"]') as HTMLElement);
    fireEvent.click(screen.getByTestId('room-details-book'));
    expect(screen.getByTestId('room-booking-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-room-booking'));
    expect(screen.queryByTestId('room-booking-modal')).not.toBeInTheDocument();

    // Timeline → close (selectedDay is still today here).
    const row = document.querySelector('[title="eventTimeline.hints.doubleClick"]') as HTMLElement;
    fireEvent.doubleClick(row);
    expect(screen.getByTestId('timeline-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-timeline'));
    expect(screen.queryByTestId('timeline-modal')).not.toBeInTheDocument();

    // Day details → close; its room shortcut also opens the room details.
    // (viewDay moves selectedDay to another cell, so run it last.)
    fireEvent.click(screen.getAllByText('createMeeting.contextMenu.viewDay')[0]);
    expect(screen.getByTestId('day-details-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-day-details'));
    expect(screen.queryByTestId('day-details-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText('createMeeting.contextMenu.viewDay')[0]);
    fireEvent.click(screen.getByTestId('day-details-open-room'));
    expect(screen.getByTestId('room-details-modal')).toBeInTheDocument();
  });

  it('renders a pending leave and opens its detail modal', async () => {
    queryResults = {
      ...queryResults,
      getLeavesForOrganization: [
        ...LEAVES,
        {
          ...LEAVES[0],
          _id: 'leave-3',
          userId: 'user-2',
          userName: 'Bob Smith',
          status: 'pending',
        },
      ],
    };
    render(<CalendarClient />);
    // Pending rows render the amber clock icon in their status badge.
    expect(screen.getAllByTestId('icon-Clock').length).toBeGreaterThan(0);
    const rows = Array.from(document.querySelectorAll('[title="eventTimeline.hints.doubleClick"]'));
    const row = rows.find((r) => r.textContent?.includes('Bob Smith')) as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByText('leave.pending')).toBeInTheDocument();
    });
  });
});
