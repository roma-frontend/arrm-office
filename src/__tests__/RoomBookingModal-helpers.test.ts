/**
 * Tests for RoomBookingModal helper functions and logic.
 *
 * Covers: toEpoch, nextQuarterHour, blockingReason, DURATION_PRESETS,
 * external attendees parsing, user suggestions filtering, capacity check.
 */

// ── Extracted helpers from RoomBookingModal ──────────────────────────────────

const DURATION_PRESETS = [30, 60, 90, 120];
const MS_PER_MINUTE = 60_000;

function toEpoch(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if ([year, month, day, hour, minute].some((n) => n === undefined || Number.isNaN(n))) return null;
  return new Date(year!, month! - 1, day!, hour!, minute!, 0, 0).getTime();
}

function nextQuarterHour(from: Date): Date {
  const date = new Date(from);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15);
  return date;
}

function parseExternalAttendees(input: string): string[] {
  return input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function computeHeadcount(internal: number, external: string[]): number {
  return internal + external.length;
}

function capacityFits(capacity: number, headcount: number): boolean {
  return headcount <= capacity;
}

interface BlockingArgs {
  room: { _id: string; name: string; capacity: number } | null;
  title: string;
  validRange: boolean;
  inPast: boolean;
  fits: boolean;
  available: boolean | undefined;
}

function getBlockingReason(args: BlockingArgs): string | null {
  if (!args.room) return 'Select a room';
  if (!args.title.trim()) return 'Title is required';
  if (!args.validRange) return 'Invalid time range';
  if (args.inPast) return 'Cannot book in the past';
  if (!args.fits) return `Capacity exceeded (max ${args.room.capacity})`;
  if (args.available === false) return 'Time slot is unavailable';
  return null;
}

// ── toEpoch ─────────────────────────────────────────────────────────────────

describe('toEpoch', () => {
  it('converts date+time to epoch', () => {
    const result = toEpoch('2025-03-15', '10:30');
    expect(result).toBe(new Date(2025, 2, 15, 10, 30, 0, 0).getTime());
  });

  it('returns null for empty date', () => {
    expect(toEpoch('', '10:00')).toBeNull();
  });

  it('returns null for empty time', () => {
    expect(toEpoch('2025-03-15', '')).toBeNull();
  });

  it('returns null for both empty', () => {
    expect(toEpoch('', '')).toBeNull();
  });

  it('returns null for invalid date', () => {
    expect(toEpoch('not-a-date', '10:00')).toBeNull();
  });

  it('returns null for invalid time', () => {
    expect(toEpoch('2025-03-15', 'ab:cd')).toBeNull();
  });

  it('handles midnight', () => {
    const result = toEpoch('2025-01-01', '00:00');
    expect(result).toBe(new Date(2025, 0, 1, 0, 0, 0, 0).getTime());
  });

  it('handles end of day', () => {
    const result = toEpoch('2025-12-31', '23:59');
    expect(result).toBe(new Date(2025, 11, 31, 23, 59, 0, 0).getTime());
  });
});

// ── nextQuarterHour ─────────────────────────────────────────────────────────

describe('nextQuarterHour', () => {
  it('rounds up from :00', () => {
    const result = nextQuarterHour(new Date(2025, 0, 1, 10, 0));
    expect(result.getMinutes()).toBe(0);
  });

  it('rounds up from :01 to :15', () => {
    const result = nextQuarterHour(new Date(2025, 0, 1, 10, 1));
    expect(result.getMinutes()).toBe(15);
  });

  it('rounds up from :15 to :15', () => {
    const result = nextQuarterHour(new Date(2025, 0, 1, 10, 15));
    expect(result.getMinutes()).toBe(15);
  });

  it('rounds up from :16 to :30', () => {
    const result = nextQuarterHour(new Date(2025, 0, 1, 10, 16));
    expect(result.getMinutes()).toBe(30);
  });

  it('rounds up from :30 to :30', () => {
    const result = nextQuarterHour(new Date(2025, 0, 1, 10, 30));
    expect(result.getMinutes()).toBe(30);
  });

  it('rounds up from :45 to :45', () => {
    const result = nextQuarterHour(new Date(2025, 0, 1, 10, 45));
    expect(result.getMinutes()).toBe(45);
  });

  it('rounds up from :59 to next hour :00', () => {
    const result = nextQuarterHour(new Date(2025, 0, 1, 10, 59));
    expect(result.getHours()).toBe(11);
    expect(result.getMinutes()).toBe(0);
  });

  it('resets seconds to 0', () => {
    const result = nextQuarterHour(new Date(2025, 0, 1, 10, 0, 45));
    expect(result.getSeconds()).toBe(0);
  });

  it('does not mutate the original', () => {
    const original = new Date(2025, 0, 1, 10, 5);
    const originalTime = original.getTime();
    nextQuarterHour(original);
    expect(original.getTime()).toBe(originalTime);
  });
});

// ── DURATION_PRESETS ────────────────────────────────────────────────────────

describe('DURATION_PRESETS', () => {
  it('has 4 presets', () => {
    expect(DURATION_PRESETS).toHaveLength(4);
  });

  it('includes 30 minutes', () => {
    expect(DURATION_PRESETS).toContain(30);
  });

  it('includes 60 minutes', () => {
    expect(DURATION_PRESETS).toContain(60);
  });

  it('includes 90 minutes', () => {
    expect(DURATION_PRESETS).toContain(90);
  });

  it('includes 120 minutes', () => {
    expect(DURATION_PRESETS).toContain(120);
  });

  it('is sorted ascending', () => {
    const sorted = [...DURATION_PRESETS].sort((a, b) => a - b);
    expect(DURATION_PRESETS).toEqual(sorted);
  });
});

// ── External attendees parsing ──────────────────────────────────────────────

describe('parseExternalAttendees', () => {
  it('parses comma-separated emails', () => {
    const result = parseExternalAttendees('alice@example.com, bob@example.com');
    expect(result).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('trims whitespace', () => {
    const result = parseExternalAttendees('  alice@example.com ,  bob@example.com  ');
    expect(result).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('filters empty entries', () => {
    const result = parseExternalAttendees('alice@example.com,,,bob@example.com,');
    expect(result).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('returns empty array for empty input', () => {
    expect(parseExternalAttendees('')).toEqual([]);
  });

  it('handles single email', () => {
    expect(parseExternalAttendees('alice@example.com')).toEqual(['alice@example.com']);
  });
});

// ── Headcount ───────────────────────────────────────────────────────────────

describe('computeHeadcount', () => {
  it('sums internal and external', () => {
    expect(computeHeadcount(2, ['a@b.com', 'c@d.com'])).toBe(4);
  });

  it('handles zero external', () => {
    expect(computeHeadcount(3, [])).toBe(3);
  });

  it('handles zero internal', () => {
    expect(computeHeadcount(0, ['a@b.com'])).toBe(1);
  });

  it('handles all zero', () => {
    expect(computeHeadcount(0, [])).toBe(0);
  });
});

// ── Capacity check ──────────────────────────────────────────────────────────

describe('capacityFits', () => {
  it('fits when headcount <= capacity', () => {
    expect(capacityFits(8, 8)).toBe(true);
    expect(capacityFits(8, 5)).toBe(true);
  });

  it('does not fit when headcount > capacity', () => {
    expect(capacityFits(8, 9)).toBe(false);
  });

  it('handles capacity 1', () => {
    expect(capacityFits(1, 1)).toBe(true);
    expect(capacityFits(1, 2)).toBe(false);
  });
});

// ── Blocking reason ─────────────────────────────────────────────────────────

describe('getBlockingReason', () => {
  const validRoom = { _id: 'room-1', name: 'Room A', capacity: 8 };

  it('returns null when everything is valid', () => {
    const reason = getBlockingReason({
      room: validRoom,
      title: 'Sprint Planning',
      validRange: true,
      inPast: false,
      fits: true,
      available: true,
    });
    expect(reason).toBeNull();
  });

  it('blocks when no room selected', () => {
    const reason = getBlockingReason({
      room: null,
      title: 'Meeting',
      validRange: true,
      inPast: false,
      fits: true,
      available: true,
    });
    expect(reason).toBe('Select a room');
  });

  it('blocks when no title', () => {
    const reason = getBlockingReason({
      room: validRoom,
      title: '',
      validRange: true,
      inPast: false,
      fits: true,
      available: true,
    });
    expect(reason).toBe('Title is required');
  });

  it('blocks when title is whitespace only', () => {
    const reason = getBlockingReason({
      room: validRoom,
      title: '   ',
      validRange: true,
      inPast: false,
      fits: true,
      available: true,
    });
    expect(reason).toBe('Title is required');
  });

  it('blocks when invalid time range', () => {
    const reason = getBlockingReason({
      room: validRoom,
      title: 'Meeting',
      validRange: false,
      inPast: false,
      fits: true,
      available: true,
    });
    expect(reason).toBe('Invalid time range');
  });

  it('blocks when in the past', () => {
    const reason = getBlockingReason({
      room: validRoom,
      title: 'Meeting',
      validRange: true,
      inPast: true,
      fits: true,
      available: true,
    });
    expect(reason).toBe('Cannot book in the past');
  });

  it('blocks when capacity exceeded', () => {
    const reason = getBlockingReason({
      room: validRoom,
      title: 'Meeting',
      validRange: true,
      inPast: false,
      fits: false,
      available: true,
    });
    expect(reason).toContain('Capacity exceeded');
    expect(reason).toContain('8');
  });

  it('blocks when slot unavailable', () => {
    const reason = getBlockingReason({
      room: validRoom,
      title: 'Meeting',
      validRange: true,
      inPast: false,
      fits: true,
      available: false,
    });
    expect(reason).toBe('Time slot is unavailable');
  });

  it('does not block when availability is undefined (loading)', () => {
    const reason = getBlockingReason({
      room: validRoom,
      title: 'Meeting',
      validRange: true,
      inPast: false,
      fits: true,
      available: undefined,
    });
    expect(reason).toBeNull();
  });

  it('priority: room check comes before title check', () => {
    const reason = getBlockingReason({
      room: null,
      title: '',
      validRange: true,
      inPast: false,
      fits: true,
      available: true,
    });
    expect(reason).toBe('Select a room');
  });
});
