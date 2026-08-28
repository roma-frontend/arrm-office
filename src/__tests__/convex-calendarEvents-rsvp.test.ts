// Calendar event logic from convex/calendarEvents.ts

const RSVP_RESPONSES = ['needs_action', 'accepted', 'tentative', 'declined'] as const;
type RsvpResponse = (typeof RSVP_RESPONSES)[number];

function epochToDateStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function epochToTimeStr(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isUsableGrant(grant: {
  isActive: boolean;
  accessLevel: string;
  status: string;
  expiresAt?: number;
}): boolean {
  return (
    grant.isActive &&
    grant.accessLevel !== 'none' &&
    grant.status !== 'pending' &&
    grant.status !== 'rejected' &&
    (!grant.expiresAt || grant.expiresAt > Date.now())
  );
}

// RSVP aggregation
function aggregateRsvp(responses: RsvpResponse[]): {
  accepted: number;
  tentative: number;
  declined: number;
  needsAction: number;
  responseRate: number;
} {
  const accepted = responses.filter((r) => r === 'accepted').length;
  const tentative = responses.filter((r) => r === 'tentative').length;
  const declined = responses.filter((r) => r === 'declined').length;
  const needsAction = responses.filter((r) => r === 'needs_action').length;
  const total = responses.length;
  const responded = total - needsAction;
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
  return { accepted, tentative, declined, needsAction, responseRate };
}

// Event status transitions
const EVENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['published', 'cancelled'],
  published: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function canEventTransition(from: string, to: string): boolean {
  return EVENT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// Room window validation
function validateRoomWindow(args: {
  roomStartTime?: number;
  roomEndTime?: number;
}): { start: number; end: number } | null {
  if (args.roomStartTime === undefined || args.roomEndTime === undefined) return null;
  if (args.roomEndTime <= args.roomStartTime) return null;
  return { start: args.roomStartTime, end: args.roomEndTime };
}

describe('RSVP_RESPONSES', () => {
  it('has 4 response types', () => {
    expect(RSVP_RESPONSES).toHaveLength(4);
  });

  it('contains expected values', () => {
    expect(RSVP_RESPONSES).toContain('needs_action');
    expect(RSVP_RESPONSES).toContain('accepted');
    expect(RSVP_RESPONSES).toContain('tentative');
    expect(RSVP_RESPONSES).toContain('declined');
  });
});

describe('epochToDateStr', () => {
  it('formats date in local timezone', () => {
    // Use local timezone to avoid env-dependent failures
    const d = new Date(2026, 5, 15, 12, 0, 0); // June 15 local
    const result = epochToDateStr(d.getTime());
    expect(result).toMatch(/^2026-06-15$/);
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 10, 0, 0);
    const result = epochToDateStr(d.getTime());
    expect(result).toMatch(/^2026-01-05$/);
  });

  it('returns yyyy-MM-dd format', () => {
    const result = epochToDateStr(Date.now());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('epochToTimeStr', () => {
  it('formats time in local timezone', () => {
    const d = new Date(2026, 5, 15, 14, 30, 0);
    const result = epochToTimeStr(d.getTime());
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('pads single-digit hours and minutes', () => {
    const d = new Date(2026, 5, 15, 9, 5, 0);
    const result = epochToTimeStr(d.getTime());
    expect(result).toBe('09:05');
  });

  it('returns HH:mm format', () => {
    const result = epochToTimeStr(Date.now());
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('isUsableGrant', () => {
  const now = Date.now();

  it('returns true for active grant with full access', () => {
    expect(isUsableGrant({ isActive: true, accessLevel: 'full', status: 'approved' })).toBe(true);
  });

  it('returns false for inactive grant', () => {
    expect(isUsableGrant({ isActive: false, accessLevel: 'full', status: 'approved' })).toBe(false);
  });

  it('returns false for "none" access level', () => {
    expect(isUsableGrant({ isActive: true, accessLevel: 'none', status: 'approved' })).toBe(false);
  });

  it('returns false for pending status', () => {
    expect(isUsableGrant({ isActive: true, accessLevel: 'full', status: 'pending' })).toBe(false);
  });

  it('returns false for rejected status', () => {
    expect(isUsableGrant({ isActive: true, accessLevel: 'full', status: 'rejected' })).toBe(false);
  });

  it('returns false for expired grant', () => {
    expect(
      isUsableGrant({
        isActive: true,
        accessLevel: 'full',
        status: 'approved',
        expiresAt: now - 1000,
      }),
    ).toBe(false);
  });

  it('returns true for grant with future expiry', () => {
    expect(
      isUsableGrant({
        isActive: true,
        accessLevel: 'full',
        status: 'approved',
        expiresAt: now + 10000,
      }),
    ).toBe(true);
  });

  it('returns true for grant without expiry', () => {
    expect(isUsableGrant({ isActive: true, accessLevel: 'full', status: 'approved' })).toBe(true);
  });
});

describe('RSVP aggregation', () => {
  it('counts all response types', () => {
    const responses: RsvpResponse[] = [
      'accepted',
      'accepted',
      'tentative',
      'declined',
      'needs_action',
    ];
    const result = aggregateRsvp(responses);
    expect(result.accepted).toBe(2);
    expect(result.tentative).toBe(1);
    expect(result.declined).toBe(1);
    expect(result.needsAction).toBe(1);
  });

  it('calculates response rate', () => {
    const responses: RsvpResponse[] = ['accepted', 'declined', 'needs_action', 'needs_action'];
    expect(aggregateRsvp(responses).responseRate).toBe(50);
  });

  it('100% response rate when all responded', () => {
    const responses: RsvpResponse[] = ['accepted', 'tentative', 'declined'];
    expect(aggregateRsvp(responses).responseRate).toBe(100);
  });

  it('0% for empty array', () => {
    expect(aggregateRsvp([]).responseRate).toBe(0);
  });
});

describe('Event status transitions', () => {
  it('draft → published', () => {
    expect(canEventTransition('draft', 'published')).toBe(true);
  });

  it('published → in_progress', () => {
    expect(canEventTransition('published', 'in_progress')).toBe(true);
  });

  it('in_progress → completed', () => {
    expect(canEventTransition('in_progress', 'completed')).toBe(true);
  });

  it('completed cannot transition', () => {
    expect(canEventTransition('completed', 'draft')).toBe(false);
  });

  it('cancelled cannot transition', () => {
    expect(canEventTransition('cancelled', 'published')).toBe(false);
  });

  it('any status can be cancelled (except completed/cancelled)', () => {
    expect(canEventTransition('draft', 'cancelled')).toBe(true);
    expect(canEventTransition('published', 'cancelled')).toBe(true);
    expect(canEventTransition('in_progress', 'cancelled')).toBe(true);
  });
});

describe('Room window validation', () => {
  it('returns valid window', () => {
    const result = validateRoomWindow({ roomStartTime: 100, roomEndTime: 200 });
    expect(result).toEqual({ start: 100, end: 200 });
  });

  it('returns null for missing times', () => {
    expect(validateRoomWindow({})).toBeNull();
    expect(validateRoomWindow({ roomStartTime: 100 })).toBeNull();
  });

  it('returns null for end <= start', () => {
    expect(validateRoomWindow({ roomStartTime: 200, roomEndTime: 100 })).toBeNull();
    expect(validateRoomWindow({ roomStartTime: 100, roomEndTime: 100 })).toBeNull();
  });
});
