/**
 * Tests for calendarScope.ts — ownership rules behind the "my calendar" vs
 * "shared calendar" switch, plus scope persistence.
 */
import {
  CALENDAR_SCOPE_STORAGE_KEY,
  defaultScopeForRole,
  filterForScope,
  isCalendarScope,
  isMyCustomEvent,
  isMyDriverEvent,
  isMyGoogleEvent,
  isMyLeave,
  isMyRoomBooking,
  readStoredScope,
  storeScope,
} from '@/lib/calendarScope';

const viewer = { id: 'user-1', name: 'Anna Petrosyan' };

describe('isMyLeave', () => {
  it('matches the requester by id', () => {
    expect(isMyLeave({ userId: 'user-1' }, viewer)).toBe(true);
  });

  it('falls back to a case-insensitive name match', () => {
    expect(isMyLeave({ userName: '  anna petrosyan ' }, viewer)).toBe(true);
  });

  it('rejects other people', () => {
    expect(isMyLeave({ userId: 'user-2', userName: 'Bob' }, viewer)).toBe(false);
  });

  it('does not treat missing ids as a match', () => {
    expect(isMyLeave({}, { id: '', name: undefined })).toBe(false);
  });
});

describe('isMyDriverEvent', () => {
  it('matches the person who booked the trip', () => {
    expect(isMyDriverEvent({ userId: 'user-1', driverUserId: 'user-9' }, viewer)).toBe(true);
  });

  it('matches the assigned driver', () => {
    expect(isMyDriverEvent({ userId: 'user-9', driverUserId: 'user-1' }, viewer)).toBe(true);
  });

  it('matches by booker or driver name when ids are absent', () => {
    expect(isMyDriverEvent({ bookedByName: 'Anna Petrosyan' }, viewer)).toBe(true);
    expect(isMyDriverEvent({ driverName: 'ANNA PETROSYAN' }, viewer)).toBe(true);
  });

  it('ignores unrelated bookings', () => {
    expect(isMyDriverEvent({ userId: 'user-2', driverName: 'Karen' }, viewer)).toBe(false);
  });
});

describe('isMyCustomEvent', () => {
  it('matches the organizer', () => {
    expect(isMyCustomEvent({ createdBy: 'user-1' }, viewer)).toBe(true);
  });

  it('matches an attendee by name', () => {
    expect(
      isMyCustomEvent({ createdBy: 'user-2', attendees: ['Bob', 'Anna Petrosyan'] }, viewer),
    ).toBe(true);
  });

  it('ignores events the viewer is not part of', () => {
    expect(isMyCustomEvent({ createdBy: 'user-2', attendees: ['Bob'] }, viewer)).toBe(false);
  });

  it('tolerates a missing attendee list', () => {
    expect(isMyCustomEvent({}, viewer)).toBe(false);
  });
});

describe('isMyGoogleEvent', () => {
  it('always belongs to the viewer (own connected account)', () => {
    expect(isMyGoogleEvent()).toBe(true);
  });
});

describe('isMyRoomBooking', () => {
  it('matches the organizer by id', () => {
    expect(isMyRoomBooking({ organizerId: 'user-1' }, viewer)).toBe(true);
  });

  it('matches an invited person by id', () => {
    expect(isMyRoomBooking({ organizerId: 'user-9', attendeeIds: ['user-1'] }, viewer)).toBe(true);
  });

  it('matches by name when ids are missing', () => {
    expect(isMyRoomBooking({ organizerName: 'Anna Petrosyan' }, viewer)).toBe(true);
    expect(isMyRoomBooking({ attendeeNames: ['Bob', 'anna petrosyan'] }, viewer)).toBe(true);
  });

  it('ignores meetings the viewer is not part of', () => {
    expect(
      isMyRoomBooking(
        { organizerId: 'user-9', attendeeIds: ['user-8'], attendeeNames: ['Bob'] },
        viewer,
      ),
    ).toBe(false);
  });
});

describe('filterForScope', () => {
  const leaves = [{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }];

  it('returns everything in the team scope', () => {
    expect(filterForScope(leaves, 'team', (l) => isMyLeave(l, viewer))).toHaveLength(3);
  });

  it('keeps only owned entries in the personal scope', () => {
    expect(filterForScope(leaves, 'mine', (l) => isMyLeave(l, viewer))).toEqual([
      { userId: 'user-1' },
    ]);
  });

  it('does not mutate the source array', () => {
    const source = [...leaves];
    filterForScope(source, 'mine', (l) => isMyLeave(l, viewer));
    expect(source).toEqual(leaves);
  });
});

describe('defaultScopeForRole', () => {
  it.each(['admin', 'supervisor', 'superadmin'])('starts %s on the shared calendar', (role) => {
    expect(defaultScopeForRole(role)).toBe('team');
  });

  it.each(['employee', 'driver', undefined, 'unknown'])(
    'starts %s on the personal calendar',
    (role) => {
      expect(defaultScopeForRole(role)).toBe('mine');
    },
  );
});

describe('isCalendarScope', () => {
  it('accepts known scopes', () => {
    expect(isCalendarScope('mine')).toBe(true);
    expect(isCalendarScope('team')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCalendarScope('everyone')).toBe(false);
    expect(isCalendarScope(null)).toBe(false);
    expect(isCalendarScope(2)).toBe(false);
  });
});

describe('scope persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a stored scope', () => {
    storeScope('team');
    expect(window.localStorage.getItem(CALENDAR_SCOPE_STORAGE_KEY)).toBe('team');
    expect(readStoredScope()).toBe('team');
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredScope()).toBeNull();
  });

  it('ignores a corrupted stored value', () => {
    window.localStorage.setItem(CALENDAR_SCOPE_STORAGE_KEY, 'garbage');
    expect(readStoredScope()).toBeNull();
  });

  it('survives storage that throws (private mode)', () => {
    const getItem = jest.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = jest.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readStoredScope()).toBeNull();
    expect(() => storeScope('mine')).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
