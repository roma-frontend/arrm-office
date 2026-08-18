/**
 * Tests for the LiveKit meeting DB layer — convex/meetings.ts.
 *
 * The LiveKit HTTP calls live in convex/meetingsActions.ts (Node runtime) and
 * are not unit-tested here; every write from those actions funnels through the
 * mutations below, so the contract that matters is: auth is enforced, the
 * meeting row + event link are created idempotently, and toggling video off
 * clears the link.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

let meetings: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;
let mockPatch: jest.Mock;
let mockInsert: jest.Mock;
let mockQuery: jest.Mock;
let mockUnique: jest.Mock;

const organizer = {
  _id: 'user-1',
  name: 'Anna',
  email: 'a@x.com',
  role: 'employee',
  organizationId: 'org-1',
};
const otherOrg = {
  _id: 'user-2',
  name: 'Bob',
  email: 'b@x.com',
  role: 'employee',
  organizationId: 'org-2',
};
const admin = {
  _id: 'user-3',
  name: 'Carl',
  email: 'c@x.com',
  role: 'admin',
  organizationId: 'org-1',
};
const superadmin = {
  _id: 'user-9',
  name: 'Root',
  email: 'root@x.com',
  role: 'superadmin',
  organizationId: 'org-1',
};

function event(over: Record<string, unknown> = {}) {
  return {
    _id: 'evt-1',
    organizationId: 'org-1',
    createdBy: 'user-1',
    title: 'Sync',
    date: '2026-08-20',
    startTime: '10:00',
    endTime: '11:00',
    allDay: false,
    category: 'meeting',
    reminder: '15min',
    createdAt: 1000,
    ...over,
  };
}

function meetingRow(over: Record<string, unknown> = {}) {
  return {
    _id: 'meet-1',
    eventId: 'evt-1',
    organizationId: 'org-1',
    roomName: 'evt_evt-1',
    hostUserId: 'user-1',
    mode: 'meeting',
    status: 'scheduled',
    createdAt: 1000,
    ...over,
  };
}

function makeCtx() {
  return {
    db: {
      get: mockGet,
      patch: mockPatch,
      insert: mockInsert,
      query: mockQuery,
    },
  };
}

beforeAll(async () => {
  meetings = await import('../../convex/meetings');
});

beforeEach(() => {
  mockGetAuthCaller = (jest.requireMock('../../convex/lib/getAuthCaller') as any).getAuthCaller;
  mockGetAuthCaller.mockReset();
  mockGet = jest.fn();
  mockPatch = jest.fn(async () => undefined);
  mockInsert = jest.fn(async () => 'meet-1');
  mockQuery = jest.fn();
  mockUnique = jest.fn();
  // `.first()` is used by the usage-counter lookups (billingUsageCounters) —
  // absent rows read as null so quota never fires in these tests.
  mockQuery.mockReturnValue({
    withIndex: () => ({ unique: mockUnique, first: jest.fn().mockResolvedValue(null) }),
  });
});

const registerArgs = {
  eventId: 'evt-1' as any,
  organizationId: 'org-1' as any,
  roomName: 'evt_evt-1',
  mode: 'meeting' as const,
};

describe('meetings.register', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(meetings.register.handler(makeCtx(), registerArgs)).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('rejects callers from a different organization', async () => {
    mockGetAuthCaller.mockResolvedValue(otherOrg);
    await expect(meetings.register.handler(makeCtx(), registerArgs)).rejects.toThrow(
      'Access denied: different organization',
    );
  });

  it('rejects a plain employee who is not the organizer', async () => {
    mockGetAuthCaller.mockResolvedValue(admin); // admin of org-1 but not the creator is allowed
    mockGetAuthCaller.mockResolvedValue({ ...organizer, _id: 'user-other' });
    mockGet.mockResolvedValue(event());
    await expect(meetings.register.handler(makeCtx(), registerArgs)).rejects.toThrow(
      'Only the organizer or an admin can attach video to this event',
    );
  });

  it('creates the meeting row and points the event at the join link', async () => {
    mockGetAuthCaller.mockResolvedValue(organizer);
    mockGet.mockResolvedValue(event());
    mockUnique.mockResolvedValue(null); // no existing meeting
    await meetings.register.handler(makeCtx(), registerArgs);

    expect(mockInsert).toHaveBeenCalledWith(
      'meetings',
      expect.objectContaining({
        eventId: 'evt-1',
        organizationId: 'org-1',
        roomName: 'evt_evt-1',
        hostUserId: 'user-1',
        mode: 'meeting',
        status: 'scheduled',
      }),
    );
    expect(mockPatch).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({
        videoUrl: '/meetings/evt_evt-1',
        videoProvider: 'livekit',
      }),
    );
  });

  it('is idempotent: re-register updates the mode, never forks the room', async () => {
    mockGetAuthCaller.mockResolvedValue(organizer);
    mockGet.mockResolvedValue(event({ videoUrl: '/meetings/evt_evt-1', videoProvider: 'livekit' }));
    mockUnique.mockResolvedValue(meetingRow());
    await meetings.register.handler(makeCtx(), {
      ...registerArgs,
      mode: 'webinar' as const,
    });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockPatch).toHaveBeenCalledWith('meet-1', expect.objectContaining({ mode: 'webinar' }));
    // The event keeps its original link — no fresh URL.
    expect(mockPatch).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ videoUrl: '/meetings/evt_evt-1' }),
    );
  });
});

describe('meetings.removeVideo', () => {
  it('clears the video fields when the toggle is switched off', async () => {
    mockGetAuthCaller.mockResolvedValue(organizer);
    mockGet.mockResolvedValue(event({ videoUrl: '/meetings/evt_evt-1', videoProvider: 'livekit' }));
    await meetings.removeVideo.handler(makeCtx(), { eventId: 'evt-1' as any });

    expect(mockPatch).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ videoUrl: undefined, videoProvider: undefined }),
    );
  });

  it('rejects a non-organizer employee', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...organizer, _id: 'user-other' });
    mockGet.mockResolvedValue(event());
    await expect(
      meetings.removeVideo.handler(makeCtx(), { eventId: 'evt-1' as any }),
    ).rejects.toThrow('Only the organizer or an admin can change this event');
  });
});

describe('meetings.setStatus', () => {
  it('updates the status for an org member', async () => {
    mockGetAuthCaller.mockResolvedValue(organizer);
    mockUnique.mockResolvedValue(meetingRow());
    await meetings.setStatus.handler(makeCtx(), {
      roomName: 'evt_evt-1',
      status: 'live' as const,
    });
    expect(mockPatch).toHaveBeenCalledWith('meet-1', expect.objectContaining({ status: 'live' }));
  });

  it('rejects a caller from another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(otherOrg);
    mockUnique.mockResolvedValue(meetingRow());
    await expect(
      meetings.setStatus.handler(makeCtx(), { roomName: 'evt_evt-1', status: 'live' as const }),
    ).rejects.toThrow('Access denied: different organization');
  });
});
