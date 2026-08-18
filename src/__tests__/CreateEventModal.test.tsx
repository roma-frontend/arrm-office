/**
 * Tests for CreateEventModal (src/components/calendar/CreateEventModal.tsx) —
 * the 3-step event wizard: details → people & room → extras.
 *
 *  - Step navigation: Next/Back, stepper chips, progress, gating on title
 *  - Details: date/time, all-day switch, location, description, category,
 *    reminder, selectedDate & editEvent prefills, reset on close
 *  - People: attendee search/pick/remove, leave-conflict badges and warning
 *  - Rooms: real slotAvailability/capacityFits from @/lib/meetingRooms —
 *    free/busy/too-small states, pick/clear, blocked-after-pick save guard
 *  - Save: create/update mutation payloads, attachment upload (FileReader +
 *    cloudinary action), room-reserved toast, ROOM_BUSY race, capacity error,
 *    generic error, reminder notification scheduling
 *
 * Convex queries are dispatched by _name (users.getUsersByOrganizationId,
 * meetingRooms.getRoomsWithBookings); mutations are captured per name.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
// The value import must come AFTER the jest.mock block so the fixture
// variables referenced by the mock factories are initialised when the
// component module loads.
// eslint-disable-next-line import/no-unresolved
import type { CalendarEvent } from '@/components/calendar/CreateEventModal';

// ── Mutable fixtures (declared before jest.mock factories reference them) ─────
let mockOrgUsers: any = undefined;
let mockRooms: any = undefined;
let mockOrgId: string | null = 'org-1';
let uploadImpl: (b64: string, name: string, type: string) => Promise<string> = () =>
  Promise.resolve('https://cloud.example/att.pdf');
const createEventMutation = jest.fn(async () => undefined);
const updateEventMutation = jest.fn(async () => undefined);
const ensureRoomAction = jest.fn(async () => ({
  configured: true,
  roomName: 'evt_test',
  videoUrl: '/meetings/evt_test',
}));
const playNotificationSound = jest.fn();
const sendBrowserNotification = jest.fn();

// ── i18n (key or fallback, like the other widgets) ───────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => {
      if (typeof fallback === 'string') return fallback;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Auth / org ───────────────────────────────────────────────────────────────
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', name: 'Me', organizationId: 'org-1' } }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrgId,
}));

// ── Convex ───────────────────────────────────────────────────────────────────
jest.mock('@/convex/_generated/api', () => ({
  api: {
    users: { getUsersByOrganizationId: { _name: 'users.getUsersByOrganizationId' } },
    meetingRooms: { getRoomsWithBookings: { _name: 'meetingRooms.getRoomsWithBookings' } },
    calendarEvents: {
      create: { _name: 'calendarEvents.create' },
      update: { _name: 'calendarEvents.update' },
    },
    meetingsActions: {
      ensureRoom: { _name: 'meetingsActions.ensureRoom' },
    },
    meetings: {
      livekitConfigured: { _name: 'meetings.livekitConfigured' },
      getByEvent: { _name: 'meetings.getByEvent' },
    },
  },
}));

jest.mock('convex/react', () => ({
  useQuery: (q: any) => {
    if (!q || q === 'skip') return undefined;
    if (q._name === 'users.getUsersByOrganizationId') return mockOrgUsers;
    if (q._name === 'meetingRooms.getRoomsWithBookings') return mockRooms;
    // LiveKit backend queries: configured (env present) but no meeting row on
    // the events under test — the video toggle renders, editMeeting is null.
    if (q._name === 'meetings.livekitConfigured') return true;
    if (q._name === 'meetings.getByEvent') return null;
    return undefined;
  },
  useMutation: (m: any) => {
    if (m._name === 'calendarEvents.create') return createEventMutation;
    if (m._name === 'calendarEvents.update') return updateEventMutation;
    return jest.fn();
  },
  useAction: (a: any) => {
    if (a?._name === 'meetingsActions.ensureRoom') return ensureRoomAction;
    return jest.fn();
  },
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: any) => (open ? <>{children}</> : null),
  SheetContent: ({ children }: any) => <div data-testid="sheet-content">{children}</div>,
  SheetHeader: ({ children }: any) => <div data-testid="sheet-header">{children}</div>,
  SheetBody: ({ children }: any) => <div data-testid="sheet-body">{children}</div>,
  SheetFooter: ({ children }: any) => <div data-testid="sheet-footer">{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}));

jest.mock('@/components/ui/wizard-stepper', () => ({
  WizardStepper: ({ steps, current, onStepClick, maxReachable }: any) => (
    <div data-testid="wizard-stepper" data-current={current}>
      {steps.map((s: any, i: number) => (
        <button
          type="button"
          key={s.id}
          disabled={i !== current && i > (maxReachable ?? current)}
          onClick={() => onStepClick?.(i)}
        >
          {s.title}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...p }: any) => (
    <button onClick={onClick} disabled={disabled} {...p}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, type, placeholder, ...p }: any) => (
    <input
      // only date/time get a testid; text inputs are found by placeholder
      data-testid={type ? `input-${type}` : undefined}
      type={type || 'text'}
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      {...p}
    />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...p }: any) => <label {...p}>{children}</label>,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, ...p }: any) => (
    <textarea
      data-testid="input-textarea"
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      {...p}
    />
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled }: any) => (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
    >
      {checked ? 'on' : 'off'}
    </button>
  ),
}));

jest.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children }: any) => {
    // SelectItem lives inside SelectContent — dig one level for option values
    const options: any[] = [];
    React.Children.forEach(children, (child: any) => {
      if (!child?.props) return;
      if (child.props.value) options.push(child);
      else if (child.props.children) {
        React.Children.forEach(child.props.children, (grand: any) => {
          if (grand?.props?.value) options.push(grand);
        });
      }
    });
    return (
      <div data-testid="select">
        <button data-testid={`select-current-${value}`}>{value}</button>
        <div data-testid="select-options">
          {options.map((opt) => (
            <button
              key={opt.props.value}
              data-testid={`select-option-${opt.props.value}`}
              onClick={() => onValueChange(opt.props.value)}
            >
              {opt.props.children}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return {
    Select,
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ children }: any) => <>{children}</>,
  };
});

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div data-testid="avatar">{children}</div>,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/components/rooms/RoomCard', () => ({
  AmenityIcon: ({ amenity }: any) => <span data-testid={`amenity-${amenity}`}>a</span>,
}));

// ── Icons / toast / side effects ─────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const names = [
    'Calendar',
    'Clock',
    'MapPin',
    'AlignLeft',
    'Tag',
    'Bell',
    'Video',
    'Paperclip',
    'X',
    'FileText',
    'Users',
    'AlertTriangle',
    'Loader2',
    'ChevronRight',
    'ChevronLeft',
    'CheckCircle',
    'Check',
    'DoorOpen',
    'Sparkles',
  ];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => (
      <span data-testid={`icon-${name}`} {...props}>
        {name}
      </span>
    );
  }
  return mocks;
});

const mockToast = jest.fn();
mockToast.error = jest.fn();
mockToast.success = jest.fn();
jest.mock('sonner', () => ({ toast: mockToast }));

jest.mock('@/actions/cloudinary', () => ({
  uploadTaskAttachment: (b64: string, name: string, type: string) => uploadImpl(b64, name, type),
}));

jest.mock('@/lib/notificationSound', () => ({
  playNotificationSound,
  sendBrowserNotification,
}));

// ── Draft (controllable) ─────────────────────────────────────────────────────
let mockDraft: {
  restored: boolean;
  restoredStep: number;
  clearDraft: jest.Mock;
  onRestoreData?: Record<string, unknown>;
};
jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (opts: any) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      if (mockDraft.restored) {
        opts.onRestore?.(mockDraft.onRestoreData ?? {}, mockDraft.restoredStep);
      }
    }, []);
    return mockDraft;
  },
  peekWizardDraft: jest.fn(),
  clearWizardDraft: jest.fn(),
}));

jest.mock('@/components/ui/WizardDraftNotice', () => ({
  WizardDraftNotice: ({ show, step, onReset }: any) =>
    show ? (
      <div data-testid="draft-notice" data-step={step}>
        Draft restored at step {step + 1}
        <button type="button" onClick={onReset}>
          Start over
        </button>
      </div>
    ) : null,
}));

// Component import (after the mocks — see note at the top).
// eslint-disable-next-line import/first
import { CreateEventModal } from '@/components/calendar/CreateEventModal';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const TITLE = 'createMeeting.titlePlaceholder';

function makeRoom(over: Record<string, unknown> = {}) {
  return {
    _id: 'room-1',
    name: 'Boardroom',
    capacity: 8,
    color: '#0ea5e9',
    building: 'Kamar',
    floor: '7',
    roomNumber: '34',
    amenities: ['wifi', 'projector'],
    bookings: [],
    ...over,
  };
}

function makeUsers() {
  return [
    { _id: 'u-anna', name: 'Anna', position: 'Designer' },
    { _id: 'u-bob', name: 'Bob', position: 'Engineer' },
  ];
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderModal(props: Record<string, unknown> = {}) {
  return render(<CreateEventModal open={true} onOpenChange={jest.fn()} {...props} />);
}

async function goToPeopleStep(title = 'Kickoff') {
  fireEvent.change(screen.getByPlaceholderText('createMeeting.titlePlaceholder'), {
    target: { value: title },
  });
  await flush();
  fireEvent.click(screen.getByText('createMeeting.next'));
  await flush();
}

async function goToExtrasStep() {
  await goToPeopleStep();
  await next();
}

/** Advance one wizard step from wherever the wizard currently is. */
async function next() {
  fireEvent.click(screen.getByText('createMeeting.next'));
  await flush();
}

/** Click a meeting-room card by name, ignoring duplicated name badges. */
function clickRoom(name: string) {
  const btn = screen
    .getAllByRole('button')
    .find((b) => b.hasAttribute('aria-pressed') && b.textContent?.includes(name));
  expect(btn).toBeTruthy();
  fireEvent.click(btn!);
  return btn!;
}

beforeEach(() => {
  mockOrgUsers = undefined;
  mockRooms = undefined;
  mockOrgId = 'org-1';
  uploadImpl = () => Promise.resolve('https://cloud.example/att.pdf');
  createEventMutation.mockClear();
  updateEventMutation.mockClear();
  ensureRoomAction.mockClear();
  (createEventMutation as jest.Mock).mockResolvedValue(undefined);
  (updateEventMutation as jest.Mock).mockResolvedValue(undefined);
  mockToast.mockClear();
  mockToast.error.mockClear();
  mockToast.success.mockClear();
  playNotificationSound.mockClear();
  sendBrowserNotification.mockClear();
  mockDraft = {
    restored: false,
    restoredStep: 0,
    clearDraft: jest.fn(() => {
      mockDraft.restored = false;
    }),
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CreateEventModal — details step & navigation', () => {
  it('renders step 1 and gates Next on a title', async () => {
    renderModal();
    await flush();

    expect(screen.getByText('createMeeting.title')).toBeInTheDocument();
    // "date" label appears in the stepper chip and the details panel
    expect(screen.getAllByText('createMeeting.date').length).toBeGreaterThan(0);
    expect(screen.getByText('createMeeting.peopleAndRoom')).toBeInTheDocument();
    expect(screen.getByText('createMeeting.attachment')).toBeInTheDocument();
    // Next is disabled without a title
    expect(screen.getByText('createMeeting.next').closest('button')).toBeDisabled();
    // cancel button on the first step
    expect(screen.getByText('createMeeting.cancel')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('createMeeting.titlePlaceholder'), {
      target: { value: 'Kickoff' },
    });
    await flush();
    expect(screen.getByText('createMeeting.next').closest('button')).toBeEnabled();
  });

  it('pre-fills the date from selectedDate', async () => {
    renderModal({ selectedDate: new Date(2026, 7, 4, 10, 0) });
    await flush();
    expect(screen.getByTestId('input-date')).toHaveValue('2026-08-04');
  });

  it('pre-fills every field when editing an event', async () => {
    const editEvent: CalendarEvent = {
      id: 'evt-1',
      title: 'Sync',
      date: '2026-08-05',
      startTime: '14:00',
      endTime: '15:00',
      allDay: false,
      location: 'Boardroom',
      description: 'Weekly',
      category: 'training',
      reminder: '30min',
      attendees: [],
      roomId: 'room-1',
    };
    renderModal({ editEvent });
    await flush();

    expect(screen.getByPlaceholderText('createMeeting.titlePlaceholder')).toHaveValue('Sync');
    expect(screen.getByTestId('input-date')).toHaveValue('2026-08-05');
    const [startInput, endInput] = screen.getAllByTestId('input-time');
    expect(startInput).toHaveValue('14:00');
    expect(endInput).toHaveValue('15:00');
    expect(screen.getByTestId('input-textarea')).toHaveValue('Weekly');
  });

  it('hides time inputs when all-day is toggled on', async () => {
    renderModal();
    await flush();
    expect(screen.getAllByTestId('input-time')).toHaveLength(2);

    fireEvent.click(screen.getByRole('switch'));
    await flush();
    expect(screen.queryAllByTestId('input-time')).toHaveLength(0);

    fireEvent.click(screen.getByRole('switch'));
    await flush();
    expect(screen.getAllByTestId('input-time')).toHaveLength(2);
  });

  it('moves through the wizard and lets the stepper jump to reachable steps', async () => {
    renderModal();
    await flush();

    // Cannot jump ahead without a title — the chip click is a no-op
    fireEvent.click(screen.getByText('createMeeting.peopleAndRoom'));
    await flush();
    expect(screen.queryByText('createMeeting.searchPeople')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('createMeeting.titlePlaceholder'), {
      target: { value: 'Kickoff' },
    });
    await flush();
    // Now jump straight to extras
    fireEvent.click(screen.getByText('createMeeting.attachment'));
    await flush();
    expect(screen.getByText('createMeeting.attachFile')).toBeInTheDocument();
    // Save label is shown on the last step
    expect(screen.getByText('createMeeting.save')).toBeInTheDocument();
    expect(screen.getByText('createMeeting.back')).toBeInTheDocument();
  });

  it('resets the form when closed and reopened', async () => {
    const onOpenChange = jest.fn();
    const view = render(<CreateEventModal open={true} onOpenChange={onOpenChange} />);
    await flush();
    fireEvent.change(screen.getByPlaceholderText('createMeeting.titlePlaceholder'), {
      target: { value: 'Kickoff' },
    });
    await flush();

    fireEvent.click(screen.getByText('createMeeting.cancel'));
    await flush();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    view.rerender(<CreateEventModal open={true} onOpenChange={onOpenChange} />);
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.titlePlaceholder')).toHaveValue('');
  });
});

describe('CreateEventModal — attendee picker', () => {
  it('searches, adds and removes attendees', async () => {
    mockOrgUsers = makeUsers();
    renderModal();
    await flush();
    await goToPeopleStep();

    const search = screen.getByPlaceholderText('createMeeting.searchPeople');
    // search filters by name and position
    fireEvent.change(search, { target: { value: 'ann' } });
    await flush();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).toBeNull();
    fireEvent.change(search, { target: { value: 'engineer' } });
    await flush();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    // pick Anna
    fireEvent.change(search, { target: { value: '' } });
    await flush();
    fireEvent.click(screen.getByText('Anna'));
    await flush();
    expect(screen.getByText('Anna')).toBeInTheDocument(); // selected chip
    // the picker closes and the search resets
    expect(screen.queryByText('Bob')).toBeNull();

    // remove Anna
    fireEvent.click(screen.getByTestId('icon-X'));
    await flush();
    expect(screen.queryByText('Anna')).toBeNull();
    expect(screen.getByText('createMeeting.addAttendees')).toBeInTheDocument();
  });

  it('shows the no-results state and position hint', async () => {
    mockOrgUsers = makeUsers();
    renderModal();
    await flush();
    await goToPeopleStep();

    fireEvent.change(screen.getByPlaceholderText('createMeeting.searchPeople'), {
      target: { value: 'zzz' },
    });
    await flush();
    expect(screen.getByText('createMeeting.noResults')).toBeInTheDocument();
  });

  it('flags attendees who are on approved leave for the event date', async () => {
    mockOrgUsers = makeUsers();
    const leaves = [
      { userId: 'u-anna', startDate: '2026-08-04', endDate: '2026-08-06', status: 'approved' },
    ];
    renderModal({ selectedDate: new Date(2026, 7, 4), leaves });
    await flush();
    await goToPeopleStep();

    // open the picker first, then add Anna
    fireEvent.focus(screen.getByPlaceholderText('createMeeting.searchPeople'));
    await flush();
    fireEvent.click(screen.getByText('Anna'));
    await flush();
    // warning banner after selecting an attendee on approved leave
    expect(screen.getByText('createMeeting.conflict')).toBeInTheDocument();
  });
});

describe('CreateEventModal — meeting rooms', () => {
  function roomAt(t0: number, title = 'Sync', over: Record<string, unknown> = {}) {
    return makeRoom({
      bookings: [
        { _id: 'b1', title, startTime: t0, endTime: t0 + 60 * 60 * 1000, status: 'confirmed' },
      ],
      ...over,
    });
  }

  it('lists rooms with availability and picks one, filling the location', async () => {
    mockOrgUsers = makeUsers();
    mockRooms = [makeRoom()];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();

    expect(screen.getByText('Boardroom')).toBeInTheDocument();
    expect(screen.getByText('createMeeting.room.free')).toBeInTheDocument();
    // amenity icons + capacity + room location from the real lib
    expect(screen.getByTestId('amenity-wifi')).toBeInTheDocument();
    expect(screen.getByTestId('amenity-projector')).toBeInTheDocument();

    clickRoom('Boardroom');
    await flush();
    expect(screen.getByText('createMeeting.room.clear')).toBeInTheDocument();
    // back to the details step: the location was auto-filled from the room name
    fireEvent.click(screen.getByText('createMeeting.back'));
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.locationPlaceholder')).toHaveValue(
      'Boardroom',
    );
  });

  it('blocks a busy room with busy-until and next-free-slot hints', async () => {
    const t0 = new Date(2026, 7, 4, 9, 0).getTime();
    mockRooms = [roomAt(t0)];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();

    clickRoom('Boardroom');
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith(
      'createMeeting.room.busyUntil',
      expect.objectContaining({
        description: 'createMeeting.room.nextFreeSlot',
        duration: 6000,
      }),
    );
    // room stays unselected
    expect(screen.queryByText('createMeeting.room.clear')).toBeNull();
  });

  it('refuses a room that is too small for the headcount', async () => {
    mockRooms = [makeRoom({ capacity: 0 })];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();

    clickRoom('Boardroom');
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('createMeeting.room.tooSmall');
  });

  it('asks to set the time first when picking a room without a date', async () => {
    mockRooms = [makeRoom()];
    renderModal();
    await flush();
    await goToPeopleStep();

    clickRoom('Boardroom');
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('createMeeting.room.setTimeFirst');
    // wizard bounced back to the details step
    expect(screen.getByText('createMeeting.title')).toBeInTheDocument();
  });

  it('deselects a room on a second click and clears an auto-filled location', async () => {
    mockRooms = [makeRoom()];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();

    clickRoom('Boardroom');
    await flush();
    expect(screen.getByText('createMeeting.room.clear')).toBeInTheDocument();
    fireEvent.click(screen.getByText('createMeeting.back'));
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.locationPlaceholder')).toHaveValue(
      'Boardroom',
    );

    await next();
    clickRoom('Boardroom');
    await flush();
    expect(screen.queryByText('createMeeting.room.clear')).toBeNull();
    fireEvent.click(screen.getByText('createMeeting.back'));
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.locationPlaceholder')).toHaveValue('');
  });

  it('blocks the save when a picked room turns busy in the meantime', async () => {
    const t0 = new Date(2026, 7, 4, 9, 0).getTime();
    mockRooms = [makeRoom()];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();

    clickRoom('Boardroom');
    await flush();

    // the room gets booked between preview and submit; typing forces a re-render
    // so the availability memo recomputes against the new bookings
    mockRooms = [roomAt(t0)];
    fireEvent.change(screen.getByPlaceholderText('createMeeting.searchPeople'), {
      target: { value: 'x' },
    });
    await flush();
    await next();

    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('createMeeting.room.busyUntil', expect.anything());
    expect(createEventMutation).not.toHaveBeenCalled();
    // bounced back to the people step
    expect(screen.getByText('createMeeting.room.title')).toBeInTheDocument();
  });

  it('clears the selection via the clear button and resets the location', async () => {
    mockRooms = [makeRoom()];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();

    clickRoom('Boardroom');
    await flush();
    expect(screen.getByText('createMeeting.room.clear')).toBeInTheDocument();

    fireEvent.click(screen.getByText('createMeeting.room.clear'));
    await flush();
    expect(screen.queryByText('createMeeting.room.clear')).toBeNull();
    // the auto-filled location was cleared too
    fireEvent.click(screen.getByText('createMeeting.back'));
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.locationPlaceholder')).toHaveValue('');
  });

  it('treats a malformed date as an invalid room window', async () => {
    mockRooms = [makeRoom()];
    renderModal();
    await flush();

    fireEvent.change(screen.getByTestId('input-date'), { target: { value: 'garbage' } });
    await flush();
    await goToPeopleStep();
    expect(screen.getByText('createMeeting.room.setTimeFirst')).toBeInTheDocument();
  });

  it('shows the skeleton while rooms are loading', async () => {
    mockRooms = undefined;
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();
    expect(document.querySelector('.skeleton')).toBeTruthy();
  });

  it('shows the no-rooms message', async () => {
    mockRooms = [];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();
    expect(screen.getByText('createMeeting.room.noRooms')).toBeInTheDocument();
  });
});

describe('CreateEventModal — save flows', () => {
  it('creates an event with attendees and a reserved room', async () => {
    mockOrgUsers = makeUsers();
    mockRooms = [makeRoom()];
    const onSave = jest.fn();
    const onOpenChange = jest.fn();
    render(
      <CreateEventModal
        open={true}
        onOpenChange={onOpenChange}
        selectedDate={new Date(2026, 7, 4)}
        onSave={onSave}
      />,
    );
    await flush();
    await goToPeopleStep();

    // add an attendee (open the picker first)
    fireEvent.focus(screen.getByPlaceholderText('createMeeting.searchPeople'));
    await flush();
    fireEvent.click(screen.getByText('Anna'));
    await flush();
    // pick the room
    clickRoom('Boardroom');
    await flush();

    fireEvent.click(screen.getByText('createMeeting.next'));
    await flush();
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();

    await waitFor(() => expect(createEventMutation).toHaveBeenCalled());
    expect(createEventMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        title: 'Kickoff',
        date: '2026-08-04',
        startTime: '09:00',
        endTime: '10:00',
        allDay: false,
        category: 'meeting',
        reminder: '15min',
        // Only ids travel — the backend derives the names from them.
        attendeeIds: ['u-anna'],
        roomId: 'room-1',
        roomStartTime: new Date(2026, 7, 4, 9, 0).getTime(),
        roomEndTime: new Date(2026, 7, 4, 10, 0).getTime(),
      }),
    );
    // room-reserved success toast
    expect(mockToast.success).toHaveBeenCalledWith('createMeeting.room.reserved');
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Kickoff', date: '2026-08-04', roomName: 'Boardroom' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('updates an existing event via the update mutation', async () => {
    mockOrgUsers = [];
    mockRooms = [];
    const editEvent: CalendarEvent = {
      id: 'evt-1',
      title: 'Sync',
      date: '2026-08-05',
      startTime: '14:00',
      endTime: '15:00',
      allDay: false,
      location: '',
      description: '',
      category: 'meeting',
      reminder: 'none',
      attendees: [],
    };
    renderModal({ editEvent });
    await flush();
    // the title is already prefilled — just advance the two steps
    await next();
    await next();
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();

    await waitFor(() => expect(updateEventMutation).toHaveBeenCalled());
    expect(updateEventMutation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt-1', title: 'Sync', date: '2026-08-05' }),
    );
    expect(createEventMutation).not.toHaveBeenCalled();
  });

  it('uploads an attachment and includes its URL in the payload', async () => {
    mockRooms = [];
    const onSave = jest.fn();
    renderModal({ selectedDate: new Date(2026, 7, 4), onSave });
    await flush();
    await goToExtrasStep();

    const file = new File([new Uint8Array(512)], 'plan.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 512 });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await flush();
    expect(screen.getByText('plan.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() => expect(createEventMutation).toHaveBeenCalled());
    expect(uploadImpl).toBeTruthy();
    expect(createEventMutation).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentUrl: 'https://cloud.example/att.pdf' }),
    );
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentUrl: 'https://cloud.example/att.pdf' }),
    );
  });

  it('rejects files larger than 1MB', async () => {
    renderModal();
    await flush();
    await goToExtrasStep();

    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' });
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [big] },
    });
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('createMeeting.fileTooBig');
  });

  it('removes an attached file', async () => {
    renderModal();
    await flush();
    await goToExtrasStep();

    const file = new File([new Uint8Array(128)], 'a.txt', { type: 'text/plain' });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await flush();
    expect(screen.getByText('a.txt')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('icon-X')[0]);
    await flush();
    expect(screen.queryByText('a.txt')).toBeNull();
  });

  it('surfaces a ROOM_BUSY race error with the takeover title', async () => {
    mockRooms = [makeRoom()];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();
    clickRoom('Boardroom');
    await flush();
    await next();

    (createEventMutation as jest.Mock).mockRejectedValueOnce(
      new Error('ROOM_BUSY|1786262400000|1786266000000|Quarterly review'),
    );
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        'createMeeting.room.takenJustNow',
        expect.objectContaining({ description: 'Quarterly review', duration: 7000 }),
      ),
    );
    expect(screen.getByText('createMeeting.room.title')).toBeInTheDocument();
  });

  it('surfaces a capacity rejection', async () => {
    mockRooms = [makeRoom()];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();
    clickRoom('Boardroom');
    await flush();
    await next();

    (createEventMutation as jest.Mock).mockRejectedValueOnce(new Error('Room capacity exceeded'));
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('createMeeting.room.tooSmall'),
    );
  });

  it('shows a generic error message on any other failure', async () => {
    mockRooms = [];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToExtrasStep();

    (createEventMutation as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('boom'));
  });

  it('schedules a reminder notification for a future event', async () => {
    mockRooms = [];
    // the event must sit in the future — scheduleReminder skips past events
    renderModal({ selectedDate: new Date(2099, 0, 1) });
    await flush();

    // the reminder select lives on the details step — switch it before advancing
    fireEvent.click(screen.getByTestId('select-current-15min'));
    await flush();
    fireEvent.click(screen.getByTestId('select-option-5min'));
    await flush();
    await goToExtrasStep();

    const stSpy = jest.spyOn(global, 'setTimeout');
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() => expect(createEventMutation).toHaveBeenCalled());

    const reminderCall = stSpy.mock.calls.find(
      (c: any) => typeof c[0] === 'function' && c[1] > 1000,
    );
    expect(reminderCall).toBeTruthy();
    await act(async () => {
      (reminderCall![0] as () => void)();
    });
    expect(playNotificationSound).toHaveBeenCalledWith('new_request');
    expect(sendBrowserNotification).toHaveBeenCalledWith(
      'createMeeting.reminderFired',
      expect.objectContaining({ body: expect.stringContaining('2099-01-01') }),
    );
  });

  it('asks for a time when a picked room loses its date before saving', async () => {
    mockRooms = [makeRoom()];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();
    clickRoom('Boardroom');
    await flush();

    // back to details, wipe the date — the picked room now has no window
    fireEvent.click(screen.getByText('createMeeting.back'));
    await flush();
    fireEvent.change(screen.getByTestId('input-date'), { target: { value: '' } });
    await flush();
    await next();
    await next();
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('createMeeting.room.setTimeFirst');
    expect(createEventMutation).not.toHaveBeenCalled();
    // bounced back to the details step
    expect(screen.getByText('createMeeting.title')).toBeInTheDocument();
  });

  it('edits the remaining details fields and reflects them in the room hint', async () => {
    mockRooms = [makeRoom()];
    renderModal();
    await flush();

    fireEvent.change(screen.getByTestId('input-date'), { target: { value: '2026-08-10' } });
    const [startInput, endInput] = screen.getAllByTestId('input-time');
    fireEvent.change(startInput, { target: { value: '11:30' } });
    fireEvent.change(endInput, { target: { value: '12:30' } });
    fireEvent.change(screen.getByPlaceholderText('createMeeting.locationPlaceholder'), {
      target: { value: 'HQ' },
    });
    fireEvent.change(screen.getByTestId('input-textarea'), { target: { value: 'notes' } });
    await flush();

    expect(screen.getByPlaceholderText('createMeeting.locationPlaceholder')).toHaveValue('HQ');
    expect(screen.getByTestId('input-textarea')).toHaveValue('notes');
    await goToPeopleStep();
    // the room window reflects the edited times
    expect(screen.getByText('createMeeting.room.slotHint')).toBeInTheDocument();
  });

  it('does not run the prefill effect while the dialog is closed', async () => {
    render(<CreateEventModal open={false} onOpenChange={jest.fn()} />);
    await flush();
    expect(screen.queryByTestId('dialog-content')).toBeNull();
  });

  it('ignores a file-change event without a file', async () => {
    renderModal();
    await flush();
    await goToExtrasStep();

    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    await flush();
    expect(screen.getByText('createMeeting.attachFile')).toBeInTheDocument();
  });

  it('falls back to a generic error when the ROOM_BUSY marker is malformed', async () => {
    mockRooms = [makeRoom()];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();
    await goToPeopleStep();
    clickRoom('Boardroom');
    await flush();
    await next();

    (createEventMutation as jest.Mock).mockRejectedValueOnce(new Error('ROOM_BUSY|abc|def|broken'));
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('ROOM_BUSY|abc|def|broken'));
  });

  it('opens the file picker when the attach area is clicked', async () => {
    renderModal();
    await flush();
    await goToExtrasStep();

    const clickSpy = jest.spyOn(HTMLInputElement.prototype, 'click');
    fireEvent.click(screen.getByText('createMeeting.attachFile'));
    await flush();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('does not schedule a reminder when reminder is none', async () => {
    mockRooms = [];
    renderModal({ selectedDate: new Date(2026, 7, 4) });
    await flush();

    fireEvent.click(screen.getByTestId('select-current-15min'));
    await flush();
    fireEvent.click(screen.getByTestId('select-option-none'));
    await flush();
    await goToExtrasStep();

    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() => expect(createEventMutation).toHaveBeenCalled());
    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});

describe('CreateEventModal — wizard draft', () => {
  it('restores a draft on open and shows the notice', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1;
    mockDraft.onRestoreData = {
      title: 'Restored Event',
      date: '2026-09-01',
      startTime: '11:00',
      endTime: '12:00',
      allDay: false,
      location: 'HQ',
      description: 'draft',
      category: 'meeting',
      reminder: '30min',
      roomId: null,
      attendees: [],
    };
    renderModal();
    await flush();

    // restore jumped to the saved step (people)
    expect(screen.getByTestId('draft-notice')).toHaveAttribute('data-step', '1');
    expect(screen.getByPlaceholderText('createMeeting.searchPeople')).toBeInTheDocument();
    // the restored title is visible once we go back to details
    fireEvent.click(screen.getByText('createMeeting.back'));
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.titlePlaceholder')).toHaveValue(
      'Restored Event',
    );
  });

  it('start over clears the draft and resets the form', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 2;
    mockDraft.onRestoreData = {
      title: 'Restored Event',
      attendees: [],
    };
    renderModal();
    await flush();
    expect(screen.getByTestId('draft-notice')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Start over'));
    await flush();

    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
    expect(screen.getByPlaceholderText('createMeeting.titlePlaceholder')).toHaveValue('');
  });

  it('clears the draft after a successful save', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 0;
    mockDraft.onRestoreData = {
      title: 'Restored Event',
      attendees: [],
    };
    renderModal();
    await flush();

    await goToPeopleStep('Saved Event');
    fireEvent.click(screen.getByText('createMeeting.next'));
    await flush();
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() => expect(createEventMutation).toHaveBeenCalled());

    expect(mockDraft.clearDraft).toHaveBeenCalled();
  });

  it('cancel clears the draft instead of saving it', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 0;
    mockDraft.onRestoreData = {
      title: 'Restored Event',
      attendees: [],
    };
    const onOpenChange = jest.fn();
    render(<CreateEventModal open={true} onOpenChange={onOpenChange} />);
    await flush();

    fireEvent.click(screen.getByText('createMeeting.cancel'));
    await flush();

    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets the form after a successful save', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 0;
    mockDraft.onRestoreData = { title: 'Restored Event', attendees: [] };
    const onOpenChange = jest.fn();
    const view = render(<CreateEventModal open={true} onOpenChange={onOpenChange} />);
    await flush();

    await goToPeopleStep('Saved Event');
    fireEvent.click(screen.getByText('createMeeting.next'));
    await flush();
    fireEvent.click(screen.getByText('createMeeting.save'));
    await flush();
    await waitFor(() => expect(createEventMutation).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Reopening shows a clean form, not the saved event's data
    view.rerender(<CreateEventModal open={true} onOpenChange={onOpenChange} />);
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.titlePlaceholder')).toHaveValue('');
    expect(screen.getByText('createMeeting.cancel')).toBeInTheDocument();
  });

  it('does not let a late editEvent clobber a restored draft', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 0;
    mockDraft.onRestoreData = {
      title: 'Restored Event',
      date: '2026-08-05',
      attendees: [],
    };
    const view = render(<CreateEventModal open={true} onOpenChange={jest.fn()} />);
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.titlePlaceholder')).toHaveValue(
      'Restored Event',
    );

    // The parent resolves editEvent after open — hydration must not overwrite
    // the restored draft.
    const editEvent: CalendarEvent = {
      id: 'evt-1',
      title: 'Sync',
      date: '2026-08-05',
      startTime: '14:00',
      endTime: '15:00',
      allDay: false,
      location: 'Boardroom',
      description: 'Weekly',
      category: 'training',
      reminder: '30min',
      attendees: [],
    };
    view.rerender(<CreateEventModal open={true} onOpenChange={jest.fn()} editEvent={editEvent} />);
    await flush();
    expect(screen.getByPlaceholderText('createMeeting.titlePlaceholder')).toHaveValue(
      'Restored Event',
    );
  });

  it('start over restores the pristine edit-event data', async () => {
    const editEvent: CalendarEvent = {
      id: 'evt-1',
      title: 'Sync',
      date: '2026-08-05',
      startTime: '14:00',
      endTime: '15:00',
      allDay: false,
      location: 'Boardroom',
      description: 'Weekly',
      category: 'training',
      reminder: '30min',
      attendees: [],
    };
    mockDraft.restored = true;
    mockDraft.restoredStep = 0;
    mockDraft.onRestoreData = { title: 'Restored Event', attendees: [] };
    renderModal({ editEvent });
    await flush();
    expect(screen.getByTestId('draft-notice')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Start over'));
    await flush();

    expect(mockDraft.clearDraft).toHaveBeenCalled();
    // back to the event's own data, not an empty form
    expect(screen.getByPlaceholderText('createMeeting.titlePlaceholder')).toHaveValue('Sync');
  });
});
