/**
 * Tests for the superadmin temporary-password flow — convex/superadmin/
 * tempPasswords. Covers the RBAC guards, the one-time plaintext return, the
 * forced-change flag with its expiry window, session revocation and the
 * plaintext-free audit trail.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/auth', () => ({
  requireAuthUserOrThrow: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hashSync: jest.fn((pw: string) => `hashed:${pw}`),
}));

let tempPasswords: any;
let mockRequireAuth: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;

const superadmin = {
  _id: 'user-super',
  name: 'Root',
  email: 'root@x.com',
  role: 'superadmin',
  organizationId: 'org-1',
};
const admin = { _id: 'user-admin', name: 'Admin', email: 'a@a.com', role: 'admin' };
const employee = {
  _id: 'target-1',
  name: 'Anna',
  email: 'anna@x.com',
  role: 'employee',
  organizationId: 'org-1',
  passwordHash: 'old-hash',
  sessionToken: 'live-session-token',
  sessionExpiry: Date.now() + 60_000,
};

let mockCollect: jest.Mock;

function makeCtx(tableRows: Record<string, unknown[]> = {}) {
  const matches = (row: unknown, eqs: Array<[string, unknown]>) =>
    eqs.every(([field, value]) => (row as Record<string, unknown>)[field] === value);

  const chain = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = { eq: (field: string, value: unknown) => (eqs.push([field, value]), q) };
          cb(q);
        }
        return c;
      },
      take: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs)),
      collect: async () => mockCollect(),
    };
    return c;
  };

  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      query: (table: string) => chain(table),
    },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockRequireAuth = jest.requireMock('../../convex/lib/auth').requireAuthUserOrThrow;
    mockGet = jest.fn();
    mockInsert = jest.fn(async () => 'audit-1');
    mockPatch = jest.fn(async () => undefined);
    mockCollect = jest.fn(async () => []);
    tempPasswords = require('../../convex/superadmin/tempPasswords');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(superadmin);
  mockGet.mockImplementation(async (id: string) => (id === 'target-1' ? { ...employee } : null));
  mockInsert.mockResolvedValue('audit-1');
  mockCollect.mockResolvedValue([]);
});

describe('generateTempPassword', () => {
  it('produces XXXX-XXXX-XXXX from an unambiguous alphabet', () => {
    const pw = tempPasswords.generateTempPassword();
    expect(pw).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    // No ambiguous glyphs anywhere in the output
    expect(pw).not.toMatch(/[0O1lI]/);
  });

  it('is random across calls', () => {
    const seen = new Set(Array.from({ length: 50 }, () => tempPasswords.generateTempPassword()));
    expect(seen.size).toBeGreaterThan(45);
  });
});

describe('issueTempPassword', () => {
  it('rejects non-superadmins, self-targeting and superadmin targets', async () => {
    mockRequireAuth.mockResolvedValue(admin);
    await expect(
      tempPasswords.issueTempPassword.handler(makeCtx(), { userId: 'target-1' }),
    ).rejects.toThrow('Only superadmins');

    mockRequireAuth.mockResolvedValue(superadmin);
    await expect(
      tempPasswords.issueTempPassword.handler(makeCtx(), { userId: 'user-super' }),
    ).rejects.toThrow('yourself');

    mockGet.mockResolvedValue({ ...employee, role: 'superadmin' });
    await expect(
      tempPasswords.issueTempPassword.handler(makeCtx(), { userId: 'target-1' }),
    ).rejects.toThrow('superadmin account');
  });

  it('replaces the credential, flags forced change and kills sessions', async () => {
    const result = await tempPasswords.issueTempPassword.handler(makeCtx(), {
      userId: 'target-1',
      ttlHours: 24,
    });

    expect(result.password).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);

    // The stored hash is of the returned plaintext — bcrypt mocked as passthrough
    expect(mockPatch).toHaveBeenCalledWith(
      'target-1',
      expect.objectContaining({
        passwordHash: `hashed:${result.password}`,
        mustChangePassword: true,
        tempPasswordIssuedAt: expect.any(Number),
        tempPasswordExpiresAt: expect.any(Number),
        sessionToken: undefined,
        sessionExpiry: undefined,
        loginFailedAttempts: 0,
        resetPasswordToken: undefined,
      }),
    );

    // Expiry respects the requested window (~24h)
    const patched = mockPatch.mock.calls[0][1];
    expect(patched.tempPasswordExpiresAt - patched.tempPasswordIssuedAt).toBe(24 * 3600_000);
  });

  it('clamps the TTL into [1, 72] hours', async () => {
    await tempPasswords.issueTempPassword.handler(makeCtx(), { userId: 'target-1', ttlHours: 500 });
    let patched = mockPatch.mock.calls.at(-1)[1];
    expect((patched.tempPasswordExpiresAt - patched.tempPasswordIssuedAt) / 3600_000).toBe(72);

    await tempPasswords.issueTempPassword.handler(makeCtx(), { userId: 'target-1', ttlHours: 0 });
    patched = mockPatch.mock.calls.at(-1)[1];
    expect((patched.tempPasswordExpiresAt - patched.tempPasswordIssuedAt) / 3600_000).toBe(1);
  });

  it('audits without ever persisting or logging the plaintext', async () => {
    const result = await tempPasswords.issueTempPassword.handler(makeCtx(), {
      userId: 'target-1',
    });

    const auditCall = mockInsert.mock.calls.find(([table]) => table === 'auditLogs');
    expect(auditCall).toBeDefined();
    const [, auditDoc] = auditCall!;
    expect(auditDoc.action).toBe('TEMP_PASSWORD_ISSUED');
    expect(JSON.stringify(auditDoc)).not.toContain(result.password);
  });
});

describe('clearMustChangePassword', () => {
  it('clears the flag without touching the password hash', async () => {
    const target = {
      ...employee,
      mustChangePassword: true,
      passwordHash: 'temp-hash',
      tempPasswordExpiresAt: Date.now() + 1000,
    };
    mockGet.mockResolvedValue(target);

    const result = await tempPasswords.clearMustChangePassword.handler(makeCtx(), {
      userId: 'target-1',
    });
    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith(
      'target-1',
      expect.objectContaining({
        mustChangePassword: false,
        tempPasswordIssuedAt: undefined,
        tempPasswordExpiresAt: undefined,
      }),
    );
    // Password hash untouched by this action
    const patched = mockPatch.mock.calls[0][1];
    expect('passwordHash' in patched).toBe(false);
  });

  it('rejects non-superadmins', async () => {
    mockRequireAuth.mockResolvedValue(admin);
    await expect(
      tempPasswords.clearMustChangePassword.handler(makeCtx(), { userId: 'target-1' }),
    ).rejects.toThrow('Only superadmins');
  });
});

describe('listPendingTempPasswords', () => {
  it('returns [] for non-superadmins without touching the DB', async () => {
    mockRequireAuth.mockResolvedValue(admin);
    const result = await tempPasswords.listPendingTempPasswords.handler(makeCtx(), {});
    expect(result).toEqual([]);
  });

  it('maps flags to rows, skips soft-deleted and sorts expired first', async () => {
    const now = Date.now();
    const pending = [
      {
        _id: 'u-active',
        name: 'Active Sam',
        email: 'sam@x.com',
        organizationId: 'org-1',
        mustChangePassword: true,
        deletedAt: undefined,
        tempPasswordIssuedAt: now - 1000,
        tempPasswordExpiresAt: now + 100_000,
      },
      {
        _id: 'u-expired',
        name: 'Expired Mia',
        email: 'mia@x.com',
        organizationId: 'org-1',
        mustChangePassword: true,
        deletedAt: undefined,
        tempPasswordIssuedAt: now - 2000,
        tempPasswordExpiresAt: now - 1000, // already past the window
      },
      {
        _id: 'u-deleted',
        name: 'Deleted Ghost',
        email: 'ghost@x.com',
        mustChangePassword: true,
        deletedAt: now - 500, // soft-deleted — excluded
        tempPasswordIssuedAt: now,
        tempPasswordExpiresAt: now + 1000,
      },
    ];

    const result = await tempPasswords.listPendingTempPasswords.handler(
      makeCtx({ users: pending }),
      {},
    );

    expect(result.map((r: any) => r.userId)).toEqual(['u-expired', 'u-active']);
    expect(result[0].isExpired).toBe(true);
    expect(result[1].isExpired).toBe(false);
    expect(result.every((r: any) => typeof r.expiresAt === 'number')).toBe(true);
  });
});

describe('notifyTempPasswordLogin', () => {
  const target = { ...employee };

  beforeEach(() => {
    mockCollect.mockImplementation(async () => collectQueue.shift() ?? []);
  });

  let collectQueue: unknown[][];

  it('notifies active superadmins with a deep link and org admins without one', async () => {
    collectQueue = [
      [
        { _id: 'user-super', isActive: true }, // issuing superadmin → notified too
        { _id: 'super-2', isActive: true }, // another superadmin → notified
        { _id: 'super-3', isActive: false }, // inactive → skipped
      ],
      [
        { _id: 'admin-1', isActive: true }, // org admin → notified, no route
        { _id: 'admin-2', isActive: false }, // inactive → skipped
      ],
    ];

    await tempPasswords.notifyTempPasswordLogin(makeCtx(), {
      _id: 'target-1',
      name: target.name,
      email: target.email,
      organizationId: 'org-1',
    });

    const notifyRows = mockInsert.mock.calls.filter(([table]) => table === 'notifications');
    expect(notifyRows).toHaveLength(3);

    const [, superRow] = notifyRows.find(([, row]: any[]) => row.userId === 'super-2')!;
    expect(superRow.type).toBe('security_alert');
    expect(superRow.route).toBe('/superadmin/users/target-1');
    expect(JSON.parse(superRow.metadata)).toMatchObject({
      titleKey: 'notifications.titles.tempPasswordLogin',
      params: { name: target.name, email: target.email },
      targetUserId: 'target-1',
    });

    const [, adminRow] = notifyRows.find(([, row]: any[]) => row.userId === 'admin-1')!;
    expect(adminRow.route).toBeUndefined();
  });

  it('skips org fan-out when the user has no organization', async () => {
    collectQueue = [[]];
    await tempPasswords.notifyTempPasswordLogin(makeCtx(), {
      _id: 'target-1',
      name: target.name,
      email: target.email,
    });
    expect(mockInsert.mock.calls.filter(([table]) => table === 'notifications')).toHaveLength(0);
  });
});
