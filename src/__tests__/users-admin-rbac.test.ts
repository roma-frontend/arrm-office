/**
 * Tests for convex/users/admin.ts.
 *
 * Four exports there were public with no caller check: seedAdmin (an
 * account-creation backdoor), upgradeSuperadminRole, autoUnsuspendExpired and
 * logAudit. Those are now internal*, which is a compile-time guarantee rather
 * than something to assert at runtime — a test can only confirm they are no
 * longer exported as public functions.
 *
 * migrateFaceToAvatar has to stay public because the settings page fires it on
 * mount for admins, so its new admin check and org scoping are covered here.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const PUBLIC_KINDS = ['mutation', 'query', 'action'] as const;

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args, kind: 'mutation' }),
  query: ({ handler, args }: any) => ({ handler, args, kind: 'query' }),
  action: ({ handler, args }: any) => ({ handler, args, kind: 'action' }),
  internalMutation: ({ handler, args }: any) => ({ handler, args, kind: 'internalMutation' }),
  internalQuery: ({ handler, args }: any) => ({ handler, args, kind: 'internalQuery' }),
  internalAction: ({ handler, args }: any) => ({ handler, args, kind: 'internalAction' }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
  SUPERADMIN_EMAIL: 'boot@example.com',
}));

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const ADMIN_ID = 'user_admin';

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mod: Record<string, any>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockIsSuperadmin.mockReturnValue(false);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../convex/users/admin');
  });
});

function makeCtx(users: Record<string, any>[], caller: Record<string, any> | null) {
  const chain: any = {
    withIndex: jest.fn(() => chain),
    order: jest.fn(() => chain),
    take: jest.fn(async () => users),
    first: jest.fn(async () => users[0] ?? null),
    unique: jest.fn(async () => users[0] ?? null),
  };
  return {
    db: {
      get: jest.fn(async (id: string) => (caller && id === caller._id ? caller : null)),
      query: jest.fn(() => chain),
      patch: jest.fn(async () => undefined),
      insert: jest.fn(async () => 'row_1'),
    },
  } as any;
}

describe('operator-only user mutations are not publicly reachable', () => {
  it.each(['seedAdmin', 'upgradeSuperadminRole', 'autoUnsuspendExpired', 'logAudit'])(
    '%s is registered as an internal function',
    (name) => {
      expect(PUBLIC_KINDS).not.toContain(mod[name].kind);
      expect(mod[name].kind).toBe('internalMutation');
    },
  );
});

describe('migrateFaceToAvatar', () => {
  const withFace = (id: string, org: string) => ({
    _id: id,
    organizationId: org,
    faceImageUrl: `https://cdn/${id}.jpg`,
  });

  it('rejects an unauthenticated caller', async () => {
    const ctx = makeCtx([], null);

    await expect(mod.migrateFaceToAvatar.handler(ctx, {})).rejects.toThrow(/Not authenticated/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('rejects a non-admin caller', async () => {
    const caller = { _id: ADMIN_ID, role: 'employee', organizationId: ORG_A };
    mockGetAuthCaller.mockResolvedValue(caller);
    const ctx = makeCtx([withFace('u1', ORG_A)], caller);

    await expect(mod.migrateFaceToAvatar.handler(ctx, {})).rejects.toThrow(/Only org admins/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('backfills only the admin’s own organization', async () => {
    const caller = { _id: ADMIN_ID, role: 'admin', organizationId: ORG_A };
    mockGetAuthCaller.mockResolvedValue(caller);
    const ctx = makeCtx([withFace('u1', ORG_A), withFace('u2', ORG_B)], caller);

    await expect(mod.migrateFaceToAvatar.handler(ctx, {})).resolves.toEqual({ migrated: 1 });
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
    expect(ctx.db.patch).toHaveBeenCalledWith('u1', { avatarUrl: 'https://cdn/u1.jpg' });
  });

  it('lets a superadmin backfill across organizations', async () => {
    const caller = { _id: ADMIN_ID, role: 'superadmin', organizationId: undefined };
    mockGetAuthCaller.mockResolvedValue(caller);
    mockIsSuperadmin.mockReturnValue(true);
    const ctx = makeCtx([withFace('u1', ORG_A), withFace('u2', ORG_B)], caller);

    await expect(mod.migrateFaceToAvatar.handler(ctx, {})).resolves.toEqual({ migrated: 2 });
  });

  it('skips users who already have an avatar', async () => {
    const caller = { _id: ADMIN_ID, role: 'admin', organizationId: ORG_A };
    mockGetAuthCaller.mockResolvedValue(caller);
    const ctx = makeCtx(
      [{ ...withFace('u1', ORG_A), avatarUrl: 'https://cdn/existing.jpg' }],
      caller,
    );

    await expect(mod.migrateFaceToAvatar.handler(ctx, {})).resolves.toEqual({ migrated: 0 });
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
