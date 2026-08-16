/**
 * Tests for session intelligence — listActiveSessions now enriches each row
 * with the user's most recent login attempt: device (parsed user agent), IP,
 * location and last activity time.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/limits', () => ({ DEFAULT_LIST_CAP: 2000 }));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

let sessions: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;

const superadmin = { _id: 'user-super', name: 'Root', email: 'root@x.com', role: 'superadmin' };

function makeCtx(tableRows: Record<string, unknown[]> = {}) {
  const chain = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = { eq: (f: string, v: unknown) => (eqs.push([f, v]), q), gte: () => q };
          cb(q);
        }
        return c;
      },
      filter: () => c,
      order: () => c,
      take: async () =>
        (tableRows[table] ?? []).filter((row) =>
          eqs.every(([field, value]) => (row as Record<string, unknown>)[field] === value),
        ),
      first: async () =>
        (tableRows[table] ?? []).filter((row) =>
          eqs.every(([field, value]) => (row as Record<string, unknown>)[field] === value),
        )[0] ?? null,
    };
    return c;
  };
  return {
    db: { get: mockGet, query: (table: string) => chain(table) },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockGet = jest.fn(async () => null);
    sessions = require('../../convex/superadmin/sessions');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(superadmin);
  mockGet.mockResolvedValue(null);
});

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

const activeUser = {
  _id: 'user-1',
  name: 'Alice',
  email: 'alice@x.com',
  role: 'employee',
  organizationId: 'org-1',
  sessionToken: 'tok-1',
  sessionExpiry: NOW + HOUR,
  lastLoginAt: NOW - 2 * 60 * 1000,
};

describe('listActiveSessions (session intelligence)', () => {
  it('enriches each session with device, IP, location and last activity', async () => {
    const ctx = makeCtx({
      users: [activeUser],
      loginAttempts: [
        {
          _id: 'attempt-1',
          userId: 'user-1',
          email: 'alice@x.com',
          success: true,
          method: 'password',
          ip: '203.0.113.7',
          country: 'Armenia',
          city: 'Yerevan',
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
          createdAt: NOW - 60 * 1000,
        },
      ],
    });

    const result = await sessions.listActiveSessions.handler(ctx, {});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userId: 'user-1',
      device: 'Chrome · Windows',
      ip: '203.0.113.7',
      location: 'Yerevan, Armenia',
      lastActiveAt: NOW - 60 * 1000,
    });
  });

  it('falls back to lastLoginAt when no login attempt is recorded', async () => {
    const ctx = makeCtx({ users: [activeUser], loginAttempts: [] });
    const result = await sessions.listActiveSessions.handler(ctx, {});
    expect(result[0]).toMatchObject({
      device: null,
      ip: null,
      location: null,
      lastActiveAt: NOW - 2 * 60 * 1000,
    });
  });

  it('never leaks the session token and rejects non-superadmins', async () => {
    const ctx = makeCtx({ users: [activeUser] });
    const result = await sessions.listActiveSessions.handler(ctx, {});
    expect(JSON.stringify(result)).not.toContain('tok-1');

    mockGetAuthCaller.mockResolvedValue({ ...superadmin, role: 'admin' });
    await expect(sessions.listActiveSessions.handler(ctx, {})).rejects.toThrow(/Only superadmins/);
  });
});
