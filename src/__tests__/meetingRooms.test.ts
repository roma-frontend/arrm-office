/**
 * Tests for meetingRooms.ts — live free/busy resolution, conflict detection,
 * slot suggestions and capacity rules.
 */
import {
  capacityFits,
  ENDING_SOON_MS,
  findConflicts,
  formatRoomLocation,
  isRoomFreeFor,
  overlaps,
  resolveRoomStatus,
  ROOM_STATUS_ACCENTS,
  slotAvailability,
  splitMinutes,
  suggestNextFreeSlot,
  utilizationPercent,
  type RoomBookingLite,
} from '@/lib/meetingRooms';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
/** Fixed clock: 2026-06-01 10:00 UTC. */
const NOW = Date.UTC(2026, 5, 1, 10, 0, 0);

function booking(
  id: string,
  startOffsetMin: number,
  durationMin: number,
  extra?: Partial<RoomBookingLite>,
): RoomBookingLite {
  return {
    _id: id,
    title: `Meeting ${id}`,
    startTime: NOW + startOffsetMin * MIN,
    endTime: NOW + (startOffsetMin + durationMin) * MIN,
    ...extra,
  };
}

describe('overlaps', () => {
  it('treats intervals as half-open', () => {
    expect(overlaps(0, 10, 10, 20)).toBe(false);
    expect(overlaps(10, 20, 0, 10)).toBe(false);
  });

  it('detects partial and full overlap', () => {
    expect(overlaps(0, 10, 5, 15)).toBe(true);
    expect(overlaps(0, 100, 40, 50)).toBe(true);
  });
});

describe('resolveRoomStatus', () => {
  it('reports a free room with no bookings', () => {
    const info = resolveRoomStatus([], NOW);
    expect(info.status).toBe('free');
    expect(info.current).toBeNull();
    expect(info.next).toBeNull();
    expect(info.freeUntil).toBeNull();
  });

  it('reports occupied during a meeting and when it frees up', () => {
    const info = resolveRoomStatus([booking('a', -30, 60)], NOW);
    expect(info.status).toBe('occupied');
    expect(info.current?._id).toBe('a');
    expect(info.busyUntil).toBe(NOW + 30 * MIN);
    expect(info.minutesLeft).toBe(30);
  });

  it('switches to endingSoon inside the last minutes', () => {
    const info = resolveRoomStatus([booking('a', -55, 60)], NOW);
    expect(info.status).toBe('endingSoon');
    expect(info.minutesLeft).toBe(5);
    expect(ENDING_SOON_MS).toBe(10 * MIN);
  });

  it('follows back-to-back meetings when computing busyUntil', () => {
    const info = resolveRoomStatus([booking('a', -30, 60), booking('b', 30, 60)], NOW);
    expect(info.busyUntil).toBe(NOW + 90 * MIN);
    expect(info.minutesLeft).toBe(90);
    expect(info.next).toBeNull();
  });

  it('does not chain across a real gap', () => {
    const info = resolveRoomStatus([booking('a', -30, 60), booking('b', 60, 30)], NOW);
    expect(info.busyUntil).toBe(NOW + 30 * MIN);
    expect(info.next?._id).toBe('b');
  });

  it('warns when the next meeting is about to start', () => {
    const info = resolveRoomStatus([booking('a', 10, 30)], NOW);
    expect(info.status).toBe('startingSoon');
    expect(info.minutesUntilNext).toBe(10);
    expect(info.freeUntil).toBe(NOW + 10 * MIN);
  });

  it('stays free when the next meeting is far away', () => {
    const info = resolveRoomStatus([booking('a', 120, 30)], NOW);
    expect(info.status).toBe('free');
    expect(info.next?._id).toBe('a');
    expect(info.minutesUntilNext).toBe(120);
  });

  it('ignores cancelled bookings', () => {
    const info = resolveRoomStatus([booking('a', -30, 60, { status: 'cancelled' })], NOW);
    expect(info.status).toBe('free');
  });

  it('reports archived rooms regardless of bookings', () => {
    const info = resolveRoomStatus([booking('a', -30, 60)], NOW, { isActive: false });
    expect(info.status).toBe('archived');
    expect(info.current).toBeNull();
    expect(ROOM_STATUS_ACCENTS.archived.pulse).toBe(false);
  });

  it('ignores meetings that already finished', () => {
    const info = resolveRoomStatus([booking('a', -180, 60)], NOW);
    expect(info.status).toBe('free');
    expect(info.current).toBeNull();
  });
});

describe('findConflicts / isRoomFreeFor', () => {
  const bookings = [booking('a', 0, 60), booking('b', 120, 60)];

  it('finds the clashing meeting', () => {
    const conflicts = findConflicts(bookings, NOW + 30 * MIN, NOW + 90 * MIN);
    expect(conflicts.map((c) => c._id)).toEqual(['a']);
  });

  it('allows a slot that starts exactly when another ends', () => {
    expect(isRoomFreeFor(bookings, NOW + 60 * MIN, NOW + 120 * MIN)).toBe(true);
  });

  it('can exclude the booking being edited', () => {
    expect(isRoomFreeFor(bookings, NOW, NOW + 60 * MIN, 'a')).toBe(true);
    expect(isRoomFreeFor(bookings, NOW, NOW + 60 * MIN)).toBe(false);
  });

  it('sorts conflicts chronologically', () => {
    const conflicts = findConflicts(bookings, NOW, NOW + 5 * HOUR);
    expect(conflicts.map((c) => c._id)).toEqual(['a', 'b']);
  });
});

describe('suggestNextFreeSlot', () => {
  it('returns the desired time when the room is free', () => {
    expect(suggestNextFreeSlot([], NOW, HOUR)).toBe(NOW);
  });

  it('suggests the end of the blocking meeting', () => {
    const slot = suggestNextFreeSlot([booking('a', 0, 60)], NOW, 30 * MIN);
    expect(slot).toBe(NOW + 60 * MIN);
  });

  it('skips a gap that is too small for the meeting', () => {
    const bookings = [booking('a', 0, 60), booking('b', 75, 60)];
    // The 15-minute gap at +60 cannot hold a 30-minute meeting.
    expect(suggestNextFreeSlot(bookings, NOW, 30 * MIN)).toBe(NOW + 135 * MIN);
  });

  it('uses a gap that is exactly big enough', () => {
    const bookings = [booking('a', 0, 60), booking('b', 90, 60)];
    expect(suggestNextFreeSlot(bookings, NOW, 30 * MIN)).toBe(NOW + 60 * MIN);
  });

  it('returns null when nothing fits in the search window', () => {
    const bookings = [booking('a', 0, 180)];
    expect(suggestNextFreeSlot(bookings, NOW, HOUR, 60 * MIN)).toBeNull();
  });

  it('rejects a non-positive duration', () => {
    expect(suggestNextFreeSlot([], NOW, 0)).toBeNull();
  });
});

describe('capacityFits', () => {
  it('counts the organizer', () => {
    expect(capacityFits(4, 3)).toBe(true);
    expect(capacityFits(4, 4)).toBe(false);
  });
});

describe('slotAvailability', () => {
  it('confirms a free slot', () => {
    const result = slotAvailability([booking('a', 120, 60)], NOW, NOW + 60 * MIN);
    expect(result).toEqual({
      available: true,
      conflicts: [],
      busyUntil: null,
      suggestion: null,
    });
  });

  it('reports when the room frees up, following back-to-back meetings', () => {
    const bookings = [booking('a', 0, 60), booking('b', 60, 30)];
    const result = slotAvailability(bookings, NOW + 30 * MIN, NOW + 90 * MIN);
    expect(result.available).toBe(false);
    expect(result.conflicts.map((c) => c._id)).toEqual(['a', 'b']);
    // Busy until the end of the chain (90 min), not the end of the first meeting.
    expect(result.busyUntil).toBe(NOW + 90 * MIN);
  });

  it('does not chain across a real gap', () => {
    const bookings = [booking('a', 0, 60), booking('b', 120, 60)];
    const result = slotAvailability(bookings, NOW + 30 * MIN, NOW + 45 * MIN);
    expect(result.busyUntil).toBe(NOW + 60 * MIN);
  });

  it('suggests the nearest slot of the same length', () => {
    const result = slotAvailability([booking('a', 0, 60)], NOW, NOW + 30 * MIN);
    expect(result.suggestion).toBe(NOW + 60 * MIN);
  });

  it('ignores the booking being edited', () => {
    const own = booking('own', 0, 60);
    expect(slotAvailability([own], NOW, NOW + 60 * MIN, 'own').available).toBe(true);
    expect(slotAvailability([own], NOW, NOW + 60 * MIN).available).toBe(false);
  });

  it('rejects an inverted range', () => {
    const result = slotAvailability([], NOW + 60 * MIN, NOW);
    expect(result.available).toBe(false);
    expect(result.busyUntil).toBeNull();
  });
});

describe('formatRoomLocation', () => {
  const translate = (key: string, options: Record<string, unknown>) =>
    key === 'rooms.locationParts.floor' ? `fl. ${options.value}` : `no. ${options.value}`;

  it('labels floor and room number instead of dumping bare digits', () => {
    expect(
      formatRoomLocation(
        { building: 'Kamar Business Center', floor: '7', roomNumber: '34' },
        translate,
      ),
    ).toBe('Kamar Business Center · fl. 7 · no. 34');
  });

  it('skips missing and blank parts', () => {
    expect(formatRoomLocation({ building: 'HQ', floor: '   ' }, translate)).toBe('HQ');
    expect(formatRoomLocation({ roomNumber: '12' }, translate)).toBe('no. 12');
  });

  it('returns an empty string when nothing is known', () => {
    expect(formatRoomLocation({}, translate)).toBe('');
  });
});

describe('splitMinutes', () => {
  it('splits into hours and minutes', () => {
    expect(splitMinutes(90)).toEqual({ hours: 1, minutes: 30 });
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitMinutes(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('utilizationPercent', () => {
  const dayStart = Date.UTC(2026, 5, 1, 9, 0, 0);
  const dayEnd = Date.UTC(2026, 5, 1, 18, 0, 0);

  it('returns 0 for an empty day', () => {
    expect(utilizationPercent([], dayStart, dayEnd)).toBe(0);
  });

  it('measures booked time against the working day', () => {
    const bookings = [
      { _id: 'a', title: 'a', startTime: dayStart, endTime: dayStart + 3 * HOUR },
      { _id: 'b', title: 'b', startTime: dayStart + 4 * HOUR, endTime: dayStart + 6 * HOUR },
    ];
    // 5 booked hours out of 9.
    expect(utilizationPercent(bookings, dayStart, dayEnd)).toBe(56);
  });

  it('clips bookings that spill outside the day', () => {
    const bookings = [
      { _id: 'a', title: 'a', startTime: dayStart - 5 * HOUR, endTime: dayStart + HOUR },
    ];
    expect(utilizationPercent(bookings, dayStart, dayEnd)).toBe(11);
  });

  it('guards against an invalid range', () => {
    expect(utilizationPercent([], dayEnd, dayStart)).toBe(0);
  });
});
