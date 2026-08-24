/**
 * Tests for RoomFormModal helper functions and logic.
 *
 * Covers: toFormState conversion, EMPTY_FORM defaults, form validation
 * (name required, capacity range, open hours), amenity toggle.
 */

// ── Extracted logic from RoomFormModal ───────────────────────────────────────

const DEFAULT_ROOM_COLOR = '#0ea5e9';

const EMPTY_FORM = {
  name: '',
  description: '',
  building: '',
  floor: '',
  roomNumber: '',
  capacity: '6',
  amenities: [] as string[],
  color: DEFAULT_ROOM_COLOR,
  photoUrl: '',
  openFrom: '08:00',
  openTo: '20:00',
};

interface RoomDoc {
  _id: string;
  name: string;
  description?: string;
  building?: string;
  floor?: string;
  roomNumber?: string;
  capacity: number;
  amenities: string[];
  color?: string;
  photoUrl?: string;
  isActive: boolean;
  openFrom?: string;
  openTo?: string;
}

function toFormState(room: RoomDoc) {
  return {
    name: room.name,
    description: room.description ?? '',
    building: room.building ?? '',
    floor: room.floor ?? '',
    roomNumber: room.roomNumber ?? '',
    capacity: String(room.capacity),
    amenities: [...room.amenities],
    color: room.color ?? DEFAULT_ROOM_COLOR,
    photoUrl: room.photoUrl ?? '',
    openFrom: room.openFrom ?? '08:00',
    openTo: room.openTo ?? '20:00',
  };
}

function validateForm(name: string, capacity: string, openFrom: string, openTo: string): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push('Name is required');
  const capacityNumber = Number(capacity);
  if (!Number.isInteger(capacityNumber) || capacityNumber < 1 || capacityNumber > 1000) {
    errors.push('Capacity must be between 1 and 1000');
  }
  if (openFrom && openTo && openFrom >= openTo) {
    errors.push('Open hours are invalid');
  }
  return errors;
}

function toggleAmenity(amenities: string[], amenity: string): string[] {
  return amenities.includes(amenity)
    ? amenities.filter((a) => a !== amenity)
    : [...amenities, amenity];
}

// ── toFormState ─────────────────────────────────────────────────────────────

describe('toFormState', () => {
  const baseRoom: RoomDoc = {
    _id: 'room-1',
    name: 'Conference Room A',
    capacity: 10,
    amenities: ['projector', 'tv'],
    isActive: true,
  };

  it('maps name correctly', () => {
    expect(toFormState(baseRoom).name).toBe('Conference Room A');
  });

  it('maps capacity as string', () => {
    expect(toFormState(baseRoom).capacity).toBe('10');
  });

  it('copies amenities as new array', () => {
    const room = { ...baseRoom, amenities: ['projector'] };
    const form = toFormState(room);
    expect(form.amenities).toEqual(['projector']);
    // Should be a copy, not the same reference
    form.amenities.push('tv');
    expect(room.amenities).toEqual(['projector']);
  });

  it('defaults description to empty', () => {
    expect(toFormState(baseRoom).description).toBe('');
  });

  it('uses room description when present', () => {
    const room = { ...baseRoom, description: 'A great room' };
    expect(toFormState(room).description).toBe('A great room');
  });

  it('defaults building/floor/roomNumber to empty', () => {
    const form = toFormState(baseRoom);
    expect(form.building).toBe('');
    expect(form.floor).toBe('');
    expect(form.roomNumber).toBe('');
  });

  it('uses building/floor/roomNumber when present', () => {
    const room = { ...baseRoom, building: 'HQ', floor: '3', roomNumber: 'A101' };
    const form = toFormState(room);
    expect(form.building).toBe('HQ');
    expect(form.floor).toBe('3');
    expect(form.roomNumber).toBe('A101');
  });

  it('defaults color to DEFAULT_ROOM_COLOR', () => {
    expect(toFormState(baseRoom).color).toBe(DEFAULT_ROOM_COLOR);
  });

  it('uses room color when present', () => {
    const room = { ...baseRoom, color: '#ff0000' };
    expect(toFormState(room).color).toBe('#ff0000');
  });

  it('defaults openFrom/openTo', () => {
    const form = toFormState(baseRoom);
    expect(form.openFrom).toBe('08:00');
    expect(form.openTo).toBe('20:00');
  });

  it('uses room openFrom/openTo when present', () => {
    const room = { ...baseRoom, openFrom: '09:00', openTo: '18:00' };
    const form = toFormState(room);
    expect(form.openFrom).toBe('09:00');
    expect(form.openTo).toBe('18:00');
  });

  it('defaults photoUrl to empty', () => {
    expect(toFormState(baseRoom).photoUrl).toBe('');
  });

  it('uses room photoUrl when present', () => {
    const room = { ...baseRoom, photoUrl: 'https://example.com/photo.jpg' };
    expect(toFormState(room).photoUrl).toBe('https://example.com/photo.jpg');
  });
});

// ── EMPTY_FORM ──────────────────────────────────────────────────────────────

describe('EMPTY_FORM', () => {
  it('has empty name', () => {
    expect(EMPTY_FORM.name).toBe('');
  });

  it('has capacity of 6', () => {
    expect(EMPTY_FORM.capacity).toBe('6');
  });

  it('has empty amenities', () => {
    expect(EMPTY_FORM.amenities).toEqual([]);
  });

  it('has default color', () => {
    expect(EMPTY_FORM.color).toBe(DEFAULT_ROOM_COLOR);
  });

  it('has 08:00-20:00 hours', () => {
    expect(EMPTY_FORM.openFrom).toBe('08:00');
    expect(EMPTY_FORM.openTo).toBe('20:00');
  });
});

// ── Form validation ─────────────────────────────────────────────────────────

describe('Form validation', () => {
  it('returns no errors for valid form', () => {
    expect(validateForm('Room A', '6', '08:00', '20:00')).toEqual([]);
  });

  it('requires name', () => {
    const errors = validateForm('', '6', '08:00', '20:00');
    expect(errors).toContain('Name is required');
  });

  it('rejects whitespace-only name', () => {
    const errors = validateForm('   ', '6', '08:00', '20:00');
    expect(errors).toContain('Name is required');
  });

  it('rejects capacity < 1', () => {
    const errors = validateForm('Room A', '0', '08:00', '20:00');
    expect(errors).toContain('Capacity must be between 1 and 1000');
  });

  it('rejects capacity > 1000', () => {
    const errors = validateForm('Room A', '1001', '08:00', '20:00');
    expect(errors).toContain('Capacity must be between 1 and 1000');
  });

  it('rejects non-integer capacity', () => {
    const errors = validateForm('Room A', 'abc', '08:00', '20:00');
    expect(errors).toContain('Capacity must be between 1 and 1000');
  });

  it('accepts capacity 1', () => {
    const errors = validateForm('Room A', '1', '08:00', '20:00');
    expect(errors).not.toContain('Capacity must be between 1 and 1000');
  });

  it('accepts capacity 1000', () => {
    const errors = validateForm('Room A', '1000', '08:00', '20:00');
    expect(errors).not.toContain('Capacity must be between 1 and 1000');
  });

  it('rejects openFrom >= openTo', () => {
    const errors = validateForm('Room A', '6', '20:00', '08:00');
    expect(errors).toContain('Open hours are invalid');
  });

  it('rejects openFrom == openTo', () => {
    const errors = validateForm('Room A', '6', '08:00', '08:00');
    expect(errors).toContain('Open hours are invalid');
  });

  it('accepts openFrom < openTo', () => {
    const errors = validateForm('Room A', '6', '08:00', '20:00');
    expect(errors).not.toContain('Open hours are invalid');
  });

  it('allows empty openFrom/openTo', () => {
    const errors = validateForm('Room A', '6', '', '');
    expect(errors).not.toContain('Open hours are invalid');
  });

  it('returns multiple errors at once', () => {
    const errors = validateForm('', '0', '', '');
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Amenity toggle ──────────────────────────────────────────────────────────

describe('toggleAmenity', () => {
  it('adds amenity when not present', () => {
    const result = toggleAmenity([], 'projector');
    expect(result).toEqual(['projector']);
  });

  it('removes amenity when present', () => {
    const result = toggleAmenity(['projector', 'tv'], 'projector');
    expect(result).toEqual(['tv']);
  });

  it('does not mutate original array', () => {
    const original = ['projector'];
    const result = toggleAmenity(original, 'tv');
    expect(original).toEqual(['projector']);
    expect(result).toEqual(['projector', 'tv']);
  });

  it('toggles twice returns to original', () => {
    const original = ['projector', 'tv'];
    const toggled = toggleAmenity(original, 'tv');
    const restored = toggleAmenity(toggled, 'tv');
    expect(restored).toEqual(original);
  });
});
