/**
 * Tests for DayDetailsModal — the calendar day detail modal.
 *
 * Mocks: react-dom createPortal (renders inline), i18next (mutable language),
 * react-i18next (fallback t), cssMotion (div passthrough), UI primitives and
 * lucide icons. date-fns formats and the lib helpers (getInitials,
 * getLeaveTypeLabel, COMPANY_EVENT_ACCENTS) run for real; expected strings are
 * computed with the same date-fns calls so the assertions are TZ- and
 * locale-data-robust.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

jest.mock('react-dom', () => ({
  // Keep react-dom's real exports (RTL needs them) but render portals inline
  // so the modal content is directly queryable.
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

let mockLang: string | null = 'en';
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    get language() {
      return mockLang;
    },
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      // The only interpolated key used by the component: render the audience
      // so the departments/named/whole-company branches are behaviorally
      // distinguishable, not just covered.
      if (key === 'dayDetails.attendance' && fallback && 'audience' in fallback) {
        return `${key}: ${fallback.audience}`;
      }
      return typeof fallback === 'string' ? fallback : key;
    },
  }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className, style }: any) => (
    <span data-testid="badge" data-variant={variant} className={className} style={style}>
      {children}
    </span>
  ),
}));

jest.mock('lucide-react', () => {
  const names = [
    'CalendarDays',
    'Clock',
    'CheckCircle',
    'XCircle',
    'X',
    'MapPin',
    'Car',
    'CalendarPlus',
    'ExternalLink',
    'DoorOpen',
    'Building2',
  ];
  const out: Record<string, (props: any) => React.ReactElement> = {};
  names.forEach((n) => {
    out[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  });
  return out;
});

import { DayDetailsModal } from '@/components/calendar/DayDetailsModal';

// 2026-05-15 is a Friday.
const DATE = new Date(2026, 4, 15, 9, 0, 0);
const TS = DATE.getTime();

const COMPANY_EVENTS: any[] = [
  {
    _id: 'ce1',
    name: 'All Hands',
    description: 'Monthly sync',
    startDate: TS,
    endDate: TS + 3600_000,
    isAllDay: false,
    eventType: 'meeting',
    priority: 'high',
    requiredDepartments: ['Engineering', 'Design'],
    requiredEmployeeIds: [],
    creatorName: 'Boss',
  },
  {
    _id: 'ce2',
    name: 'Training Day',
    startDate: TS,
    endDate: TS,
    isAllDay: true,
    eventType: 'training',
    requiredDepartments: [],
    requiredEmployeeIds: ['u1', 'u2'],
    creatorName: 'HR',
  },
  {
    _id: 'ce3',
    name: 'Company Holiday',
    startDate: TS,
    endDate: TS,
    isAllDay: true,
    eventType: 'holiday',
    requiredDepartments: [],
    requiredEmployeeIds: [],
  },
  {
    _id: 'ce4',
    name: 'Mystery Event',
    startDate: TS,
    endDate: TS,
    isAllDay: true,
    eventType: 'unknown_type',
    requiredDepartments: [],
    requiredEmployeeIds: [],
  },
];

const LEAVES: any[] = [
  {
    _id: 'l1',
    userId: 'u1',
    userName: 'Alice Smith',
    userDepartment: 'Engineering',
    type: 'paid',
    startDate: '2026-05-15',
    endDate: '2026-05-15',
    days: 3,
    reason: 'Vacation',
    status: 'approved',
  },
  {
    _id: 'l2',
    userId: 'u2',
    type: 'sick',
    startDate: '2026-05-15',
    endDate: '2026-05-15',
    days: 1,
    status: 'rejected',
  },
  {
    _id: 'l3',
    userId: 'u3',
    userName: 'Bob Brown',
    type: 'unknown_type',
    startDate: '2026-05-15',
    endDate: '2026-05-15',
    days: 2,
    status: 'pending',
  },
  {
    _id: 'l4',
    userId: 'u4',
    userName: 'Carol',
    type: 'unpaid',
    startDate: '2026-05-15',
    endDate: '2026-05-15',
    days: 5,
    status: 'mystery',
  },
];

const CUSTOM: any[] = [
  {
    id: 'c1',
    title: 'Coffee Break',
    allDay: true,
    startTime: null,
    endTime: null,
    location: '',
    roomName: '',
    description: '',
    // Attendees is a newer field on the timeline event shape — present but
    // empty for these fixtures, like real events without a guest list.
    attendees: [],
  },
  {
    id: 'c2',
    title: 'Workshop',
    allDay: false,
    startTime: '10:00',
    endTime: '12:00',
    location: 'Room A',
    roomName: 'Boardroom',
    description: 'Hands-on session',
    attendees: [],
  },
];

const GOOGLE: any[] = [
  {
    id: 'g1',
    title: 'Team Sync',
    description: '',
    startDate: '2026-05-15',
    endDate: '2026-05-15',
    startTime: null,
    endTime: null,
    allDay: true,
    location: '',
    htmlLink: '',
  },
  {
    id: 'g2',
    title: 'Client Call',
    description: '',
    startDate: '2026-05-15',
    endDate: '2026-05-15',
    startTime: '14:00',
    endTime: '15:00',
    allDay: false,
    location: 'Office',
    htmlLink: 'https://cal.example/x',
  },
  {
    id: 'g3',
    title: 'Standup',
    description: '',
    startDate: '2026-05-15',
    endDate: '2026-05-15',
    startTime: null,
    endTime: null,
    allDay: false,
    location: '',
    htmlLink: '',
  },
];

const DRIVERS: any[] = [
  {
    _id: 'd1',
    driverId: 'd1',
    driverName: 'John Driver',
    startTime: TS,
    endTime: TS + 3600_000,
    type: 'trip',
    status: 'active',
    tripInfo: { from: 'Office', to: 'Airport', purpose: 'Pickup', passengerCount: 2 },
    driverVehicle: { model: 'Toyota Camry', plateNumber: '01-AA-234', capacity: 4 },
  },
  {
    _id: 'd2',
    driverId: 'd2',
    driverName: 'Sam Driver',
    startTime: TS,
    endTime: TS + 7200_000,
    type: 'blocked',
    status: 'off',
    reason: 'Day off',
  },
];

const ROOMS: any[] = [
  {
    _id: 'r1',
    roomId: 'rm1',
    title: 'Boardroom Booking',
    startTime: TS,
    endTime: TS + 1800_000,
    roomName: 'Boardroom',
    roomColor: '#ff0000',
    organizerName: 'Alice',
    attendeeNames: ['Bob', 'Carol'],
  },
  {
    _id: 'r2',
    roomId: 'rm2',
    title: 'Focus Time',
    startTime: TS,
    endTime: TS + 3600_000,
    roomName: 'Focus Room',
    attendeeNames: [],
  },
];

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    date: DATE,
    leaves: [],
    googleEvents: [],
    driverEvents: [],
    customEvents: [],
    roomBookings: [],
    companyEvents: [],
    onClose: jest.fn(),
    ...overrides,
  };
}

describe('DayDetailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLang = 'en';
  });

  const fmt = (d: Date, pattern: string, locale = enUS) => format(d, pattern, { locale });

  // ── Open/close and portal ───────────────────────────────────────────────

  it('renders nothing when closed', () => {
    const { container } = render(<DayDetailsModal {...makeProps({ open: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the header date in the active locale', () => {
    render(<DayDetailsModal {...makeProps({ leaves: LEAVES })} />);
    expect(screen.getByText(fmt(DATE, 'd'))).toBeInTheDocument();
    expect(screen.getByText(fmt(DATE, 'MMM'))).toBeInTheDocument();
    expect(screen.getByText(fmt(DATE, 'EEEE'))).toBeInTheDocument();
    expect(screen.getByText(fmt(DATE, 'd MMMM yyyy'))).toBeInTheDocument();
  });

  it('formats the header with the Russian locale', () => {
    mockLang = 'ru';
    render(<DayDetailsModal {...makeProps({ leaves: LEAVES })} />);
    expect(screen.getByText(fmt(DATE, 'EEEE', ru))).toBeInTheDocument();
    expect(screen.getByText(fmt(DATE, 'd MMMM yyyy', ru))).toBeInTheDocument();
  });

  it('formats the header with the Armenian locale', () => {
    mockLang = 'hy';
    render(<DayDetailsModal {...makeProps({ leaves: LEAVES })} />);
    expect(screen.getByText(fmt(DATE, 'EEEE', hy))).toBeInTheDocument();
  });

  it('falls back to English when the language is unknown', () => {
    mockLang = 'de';
    render(<DayDetailsModal {...makeProps({ leaves: LEAVES })} />);
    expect(screen.getByText(fmt(DATE, 'EEEE'))).toBeInTheDocument();
  });

  it('shows the today badge for the current date', () => {
    const now = new Date();
    render(<DayDetailsModal {...makeProps({ date: now, leaves: [] })} />);
    expect(screen.getByText('timePeriods.today')).toBeInTheDocument();
  });

  it('omits the today badge for other dates', () => {
    render(<DayDetailsModal {...makeProps()} />);
    expect(screen.queryByText('timePeriods.today')).not.toBeInTheDocument();
  });

  it('falls back to en locale and empty defaults when props are omitted', () => {
    mockLang = null;
    render(
      <DayDetailsModal
        open
        date={DATE}
        leaves={[]}
        googleEvents={[]}
        driverEvents={[]}
        customEvents={[]}
        roomBookings={undefined}
        companyEvents={undefined}
        onClose={jest.fn()}
      />,
    );
    // i18n.language is null → the `|| 'en'` fallback kicks in; undefined
    // roomBookings/companyEvents hit the `= []` defaults.
    expect(screen.getByText(fmt(DATE, 'EEEE'))).toBeInTheDocument();
    expect(screen.getByText('No events on this day')).toBeInTheDocument();
  });

  it('closes via the X button', () => {
    const props = makeProps();
    render(<DayDetailsModal {...props} />);
    fireEvent.click(screen.getByTestId('icon-X'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  // The panel is a slide-over now, not a hand-rolled centered modal. The old
  // version had no `role="dialog"`, no focus trap and no Escape handling — it
  // could only be dismissed with the mouse. Radix supplies all three, so what is
  // worth asserting changed with it.
  it('exposes dialog semantics', () => {
    render(<DayDetailsModal {...makeProps()} />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('data-side')).toBe('right');
  });

  it('closes on Escape', () => {
    const props = makeProps();
    render(<DayDetailsModal {...props} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state with event and leave count badges', () => {
    render(<DayDetailsModal {...makeProps()} />);
    expect(screen.getByText('No events on this day')).toBeInTheDocument();
    expect(screen.getByText('0 events')).toBeInTheDocument();
  });

  it('counts all event sources in the summary badge', () => {
    render(
      <DayDetailsModal
        {...makeProps({
          leaves: LEAVES,
          googleEvents: GOOGLE,
          driverEvents: DRIVERS,
          customEvents: CUSTOM,
          roomBookings: ROOMS,
          companyEvents: COMPANY_EVENTS,
        })}
      />,
    );
    // 4 leaves + 3 google + 2 drivers + 2 custom + 2 rooms + 4 company = 17.
    expect(screen.getByText('17 events')).toBeInTheDocument();
    expect(screen.getByText('4 leaves')).toBeInTheDocument();
  });

  // ── Company events ───────────────────────────────────────────────────────

  it('renders company events with priority, time range, attendance and link', () => {
    render(<DayDetailsModal {...makeProps({ companyEvents: COMPANY_EVENTS })} />);
    expect(screen.getByText('dayDetails.companyEvents')).toBeInTheDocument();
    expect(screen.getByText('All Hands')).toBeInTheDocument();
    expect(screen.getByText('priority.high')).toBeInTheDocument();
    expect(screen.getByText('event.types.meeting')).toBeInTheDocument();
    expect(
      screen.getByText(`${fmt(new Date(TS), 'HH:mm')} – ${fmt(new Date(TS + 3600_000), 'HH:mm')}`),
    ).toBeInTheDocument();
    // One attendance line per company event; ce1 joins its departments.
    expect(screen.getAllByText('dayDetails.attendance', { exact: false }).length).toBe(4);
    expect(screen.getByText(/Engineering, Design/)).toBeInTheDocument();
    expect(screen.getByText('Monthly sync')).toBeInTheDocument();
    const link = screen.getAllByText('dayDetails.openEvent')[0]?.closest('a');
    expect(link?.getAttribute('href')).toBe('/events/ce1');
  });

  it('exercises the open-link stopPropagation handler', () => {
    const onOpenTimeline = jest.fn();
    render(
      <DayDetailsModal {...makeProps({ companyEvents: [COMPANY_EVENTS[0]], onOpenTimeline })} />,
    );
    // Clicking the link runs the onClick stopPropagation handler; a single
    // click never triggers the row's onDoubleClick anyway, so this asserts
    // the click path is safe rather than behavioral propagation.
    fireEvent.click(screen.getAllByText('dayDetails.openEvent')[0]!);
    expect(onOpenTimeline).not.toHaveBeenCalled();
  });

  it('renders all-day company events with named-attendee and whole-company audiences', () => {
    render(<DayDetailsModal {...makeProps({ companyEvents: COMPANY_EVENTS })} />);
    // All-day label (createMeeting.allDay) appears for the all-day events.
    expect(screen.getAllByText('createMeeting.allDay').length).toBeGreaterThan(0);
    // ce2 → named attendees, ce3 → whole company.
    expect(screen.getByText(/Training Day/)).toBeInTheDocument();
    expect(screen.getByText(/Company Holiday/)).toBeInTheDocument();
  });

  it('falls back to the default accent for unknown event types', () => {
    const { container } = render(
      <DayDetailsModal {...makeProps({ companyEvents: [COMPANY_EVENTS[3]] })} />,
    );
    // React serializes #0d9488 to rgb(13, 148, 136).
    const accentBox = container.querySelector('[style*="rgb(13, 148, 136)"]');
    expect(accentBox).not.toBeNull();
  });

  it('opens the timeline on double-click when a handler is provided', () => {
    const onOpenTimeline = jest.fn();
    render(
      <DayDetailsModal {...makeProps({ companyEvents: [COMPANY_EVENTS[0]], onOpenTimeline })} />,
    );
    fireEvent.doubleClick(screen.getByText('All Hands'));
    expect(onOpenTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'company', data: expect.objectContaining({ id: 'ce1' }) }),
    );
  });

  it('does not attach timeline handlers when none is provided', () => {
    render(<DayDetailsModal {...makeProps({ companyEvents: [COMPANY_EVENTS[0]] })} />);
    const row = screen.getByText('All Hands').parentElement!.parentElement!;
    expect(row.getAttribute('title')).toBeNull();
  });

  // ── Leave requests ───────────────────────────────────────────────────────

  it('renders leave requests with initials, type, days and status', () => {
    render(<DayDetailsModal {...makeProps({ leaves: LEAVES })} />);
    expect(screen.getByText('Leave Requests')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('· 3 d')).toBeInTheDocument();
    expect(screen.getByText('"Vacation"')).toBeInTheDocument();
    expect(screen.getByText('leave.approved')).toBeInTheDocument();
    expect(screen.getByText('leave.rejected')).toBeInTheDocument();
    // l3 is pending; l4 has an unknown status that also falls back to pending.
    expect(screen.getAllByText('leave.pending').length).toBe(2);
  });

  it('falls back to Unknown for nameless leaves and pending for unknown statuses', () => {
    render(<DayDetailsModal {...makeProps({ leaves: [LEAVES[1], LEAVES[3]] })} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    // l4 has an unknown status → the badge falls back to pending.
    expect(screen.getAllByText('leave.pending').length).toBeGreaterThan(0);
  });

  // ── Custom events ────────────────────────────────────────────────────────

  it('renders custom events with all-day and timed variants', () => {
    render(<DayDetailsModal {...makeProps({ customEvents: CUSTOM })} />);
    expect(screen.getByText('Calendar Events')).toBeInTheDocument();
    expect(screen.getByText('Coffee Break')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.getByText('10:00 – 12:00')).toBeInTheDocument();
    expect(screen.getByText('Room A')).toBeInTheDocument();
    expect(screen.getByText('Boardroom')).toBeInTheDocument();
    expect(screen.getByText('Hands-on session')).toBeInTheDocument();
  });

  // ── Google events ────────────────────────────────────────────────────────

  it('renders google events with all three time variants', () => {
    render(<DayDetailsModal {...makeProps({ googleEvents: GOOGLE })} />);
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('Team Sync')).toBeInTheDocument();
    expect(screen.getByText('Client Call')).toBeInTheDocument();
    expect(screen.getByText('14:00 – 15:00')).toBeInTheDocument();
    expect(screen.getByText(fmt(new Date('2026-05-15'), 'MMM d'))).toBeInTheDocument();
    expect(screen.getByText('Office')).toBeInTheDocument();
    const gLink = screen.getByText('Open in Google Calendar').closest('a');
    expect(gLink?.getAttribute('href')).toBe('https://cal.example/x');
    expect(gLink?.getAttribute('target')).toBe('_blank');
  });

  // ── Driver events ────────────────────────────────────────────────────────

  it('renders driver events with trip info and vehicle', () => {
    render(<DayDetailsModal {...makeProps({ driverEvents: DRIVERS })} />);
    expect(screen.getByText('Driver Bookings')).toBeInTheDocument();
    expect(screen.getByText('John Driver')).toBeInTheDocument();
    expect(screen.getByText('trip')).toBeInTheDocument();
    expect(screen.getByText('blocked')).toBeInTheDocument();
    expect(
      screen.getByText(`${fmt(new Date(TS), 'HH:mm')} – ${fmt(new Date(TS + 3600_000), 'HH:mm')}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Office → Airport')).toBeInTheDocument();
    expect(screen.getByText('🚗 Toyota Camry · 01-AA-234')).toBeInTheDocument();
    // Sam has no trip/vehicle — only his name and times render.
    expect(screen.getByText('Sam Driver')).toBeInTheDocument();
  });

  // ── Room bookings ────────────────────────────────────────────────────────

  it('renders room bookings with colors, organizer and attendees', () => {
    const { container } = render(<DayDetailsModal {...makeProps({ roomBookings: ROOMS })} />);
    expect(screen.getByText('rooms.calendar.roomBookings')).toBeInTheDocument();
    expect(screen.getByText('Boardroom Booking')).toBeInTheDocument();
    expect(screen.getByText('Focus Time')).toBeInTheDocument();
    expect(screen.getByText(/· Alice$/)).toBeInTheDocument();
    expect(screen.getByText('Bob, Carol')).toBeInTheDocument();
    expect(screen.getByText('Boardroom')).toBeInTheDocument();
    expect(screen.getByText('Focus Room')).toBeInTheDocument();
    // Default room color is applied when roomColor is absent (React serializes
    // #0ea5e9 → rgb(14, 165, 233); #ff0000 → rgb(255, 0, 0)).
    expect(container.querySelector('[style*="rgb(14, 165, 233)"]')).not.toBeNull();
    expect(container.querySelector('[style*="rgb(255, 0, 0)"]')).not.toBeNull();
  });

  it('opens a room on click and via Enter/Space keys, passing the booking day', () => {
    const onOpenRoom = jest.fn();
    render(<DayDetailsModal {...makeProps({ roomBookings: ROOMS, onOpenRoom })} />);
    fireEvent.click(screen.getByText('Boardroom Booking'));
    expect(onOpenRoom).toHaveBeenCalledWith('rm1', '2026-05-15');

    fireEvent.keyDown(screen.getByText('Boardroom Booking'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByText('Boardroom Booking'), { key: ' ' });
    expect(onOpenRoom).toHaveBeenCalledTimes(3);
  });

  it('does not call onOpenRoom for non-Enter/Space keys', () => {
    const onOpenRoom = jest.fn();
    render(<DayDetailsModal {...makeProps({ roomBookings: ROOMS, onOpenRoom })} />);
    fireEvent.keyDown(screen.getByText('Boardroom Booking'), { key: 'Tab' });
    expect(onOpenRoom).not.toHaveBeenCalled();
  });
});
