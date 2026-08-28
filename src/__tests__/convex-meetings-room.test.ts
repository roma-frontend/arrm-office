// Meeting room logic from convex/meetings.ts

function roomNameForEvent(eventId: string): string {
  return `evt_${eventId}`;
}

function videoUrlForRoom(roomName: string): string {
  return `/meetings/${roomName}`;
}

// Room booking validation
interface RoomBooking {
  roomId: string;
  startTime: number;
  endTime: number;
}

function validateBookingOverlap(existing: RoomBooking[], newBooking: RoomBooking): boolean {
  for (const booking of existing) {
    if (booking.roomId !== newBooking.roomId) continue;
    // Overlap: start < existing.end AND end > existing.start
    if (newBooking.startTime < booking.endTime && newBooking.endTime > booking.startTime) {
      return false;
    }
  }
  return true;
}

// Duration formatting
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Meeting status transitions
const MEETING_STATUS_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: ['scheduled'],
};

function canMeetingTransition(from: string, to: string): boolean {
  return MEETING_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('Room name generation', () => {
  it('generates room name from event id', () => {
    expect(roomNameForEvent('abc123')).toBe('evt_abc123');
  });

  it('generates join URL from room name', () => {
    expect(videoUrlForRoom('evt_abc123')).toBe('/meetings/evt_abc123');
  });

  it('round-trips event → room → URL', () => {
    const eventId = 'test_event_42';
    const url = videoUrlForRoom(roomNameForEvent(eventId));
    expect(url).toBe(`/meetings/evt_${eventId}`);
  });
});

describe('Room booking overlap detection', () => {
  const base = Date.UTC(2026, 5, 15, 10, 0, 0);
  const HOUR = 3_600_000;

  it('allows non-overlapping bookings in same room', () => {
    const existing: RoomBooking[] = [{ roomId: 'r1', startTime: base, endTime: base + HOUR }];
    const newBooking: RoomBooking = {
      roomId: 'r1',
      startTime: base + HOUR,
      endTime: base + 2 * HOUR,
    };
    expect(validateBookingOverlap(existing, newBooking)).toBe(true);
  });

  it('rejects overlapping bookings in same room', () => {
    const existing: RoomBooking[] = [{ roomId: 'r1', startTime: base, endTime: base + HOUR }];
    const newBooking: RoomBooking = {
      roomId: 'r1',
      startTime: base + 30 * 60_000,
      endTime: base + 90 * 60_000,
    };
    expect(validateBookingOverlap(existing, newBooking)).toBe(false);
  });

  it('allows same time in different rooms', () => {
    const existing: RoomBooking[] = [{ roomId: 'r1', startTime: base, endTime: base + HOUR }];
    const newBooking: RoomBooking = { roomId: 'r2', startTime: base, endTime: base + HOUR };
    expect(validateBookingOverlap(existing, newBooking)).toBe(true);
  });

  it('allows exact adjacent bookings', () => {
    const existing: RoomBooking[] = [{ roomId: 'r1', startTime: base, endTime: base + HOUR }];
    const newBooking: RoomBooking = {
      roomId: 'r1',
      startTime: base + HOUR,
      endTime: base + 2 * HOUR,
    };
    expect(validateBookingOverlap(existing, newBooking)).toBe(true);
  });

  it('allows booking when no existing bookings', () => {
    expect(
      validateBookingOverlap([], { roomId: 'r1', startTime: base, endTime: base + HOUR }),
    ).toBe(true);
  });
});

describe('Duration formatting', () => {
  it('formats minutes only', () => {
    expect(formatDuration(30)).toBe('30min');
  });

  it('formats hours only', () => {
    expect(formatDuration(60)).toBe('1h');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30min');
  });

  it('formats 0 minutes', () => {
    expect(formatDuration(0)).toBe('0min');
  });

  it('formats multi-hour', () => {
    expect(formatDuration(180)).toBe('3h');
  });
});

describe('Meeting status transitions', () => {
  it('scheduled → in_progress', () => {
    expect(canMeetingTransition('scheduled', 'in_progress')).toBe(true);
  });

  it('scheduled → cancelled', () => {
    expect(canMeetingTransition('scheduled', 'cancelled')).toBe(true);
  });

  it('in_progress → completed', () => {
    expect(canMeetingTransition('in_progress', 'completed')).toBe(true);
  });

  it('completed cannot transition', () => {
    expect(canMeetingTransition('completed', 'scheduled')).toBe(false);
  });

  it('cancelled can reschedule', () => {
    expect(canMeetingTransition('cancelled', 'scheduled')).toBe(true);
  });

  it('cannot skip from scheduled to completed', () => {
    expect(canMeetingTransition('scheduled', 'completed')).toBe(false);
  });
});
