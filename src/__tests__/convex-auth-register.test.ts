/**
 * Unit tests for convex/auth_module/main.ts — the unified registration flow.
 *
 * Pins the contract that registering into an *existing* organization does NOT
 * bind the new account to that org immediately. Instead a pending
 * `organizationInvites` record is created (exactly like the select-organization
 * join flow), and the user only joins the org once an admin approves the
 * request (approveJoinRequest patches organizationId + isApproved).
 *
 * Auto-approved paths (first member of the org, invite-token link) keep their
 * existing behaviour: organizationId is set and no invite is created.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Id } from '../../convex/_generated/dataModel';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
  SUPERADMIN_EMAIL: 'superadmin@test.local',
}));

jest.mock('bcryptjs', () => ({
  hashSync: jest.fn(() => '$2a$12$fakehash'),
  compareSync: jest.fn(() => true),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn(async () => ({
    paidLeaveBalance: 24,
    sickLeaveBalance: 10,
    familyLeaveBalance: 5,
    dayOffBalance: 6,
    maternityLeaveBalance: 0,
    studyLeaveBalance: 5,
  })),
}));

jest.mock('../../convex/lib/orgUnits', () => ({
  resolveOrgUnitsByName: jest.fn(async () => ({})),
}));

jest.mock('../../convex/lib/travelAllowance', () => ({
  resolveTravelAllowanceForOrg: jest.fn(async () => 20000),
}));

jest.mock('../../convex/superadmin/accessTokens', () => ({
  checkTempAccessStillValid: jest.fn(async () => ({ valid: true })),
}));

jest.mock('../../src/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn(), info: jest.fn() },
}));

// ── Module load ───────────────────────────────────────────────────────────────
let authModule: any;
let mockNotify: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;

const ORG_ID = 'org-1' as Id<'organizations'>;
const ACTIVE_ORG = {
  _id: ORG_ID,
  name: 'Acme Inc',
  slug: 'acme',
  plan: 'professional',
  isActive: true,
  employeeLimit: 50,
  createdAt: 1000,
  updatedAt: 1000,
};
const EXISTING_ADMINS = [
  {
    _id: 'admin-1' as Id<'users'>,
    name: 'Admin',
    email: 'admin@acme.am',
    role: 'admin',
    organizationId: ORG_ID,
  },
];

interface QueryResultConfig {
  /** Per-lookup ordered results for the `users` table (consumed in order). */
  usersProbe?: unknown[][];
  /** Static per-table results for any other table. */
  tables?: Record<string, unknown[]>;
}

/**
 * Build a Convex-like db mock. `withIndex`/`filter` callbacks run so the
 * predicate lines are covered. Terminal lookups on `users` consume
 * `usersProbe` in call order (falling back to the last entry), which lets the
 * register flow answer the by_email uniqueness check, the by_org member count
 * and the by_org_role admin list differently.
 */
function makeCtx(config: QueryResultConfig = {}) {
  const { usersProbe = [], tables = {} } = config;
  const current: { table: string } = { table: '' };
  let usersIdx = 0;

  const q: any = {
    eq: (..._a: unknown[]) => q,
    field: (..._a: unknown[]) => q,
    and: (..._a: unknown[]) => q,
    gte: (..._a: unknown[]) => q,
    lte: (..._a: unknown[]) => q,
    neq: (..._a: unknown[]) => q,
    or: (..._a: unknown[]) => q,
  };

  const pickUsers = () => {
    const probe = usersProbe[Math.min(usersIdx, usersProbe.length - 1)];
    usersIdx += 1;
    return probe ?? [];
  };

  const chain: any = {
    withIndex: (_n: string, cb?: (qb: any) => unknown) => {
      if (typeof cb === 'function') cb(q);
      return chain;
    },
    filter: (cb?: (qb: any) => unknown) => {
      if (typeof cb === 'function') cb(q);
      return chain;
    },
    order: () => chain,
    take: async () => (current.table === 'users' ? pickUsers() : (tables[current.table] ?? [])),
    first: async () => (current.table === 'users' ? pickUsers() : (tables[current.table] ?? []))[0],
    unique: async () =>
      (current.table === 'users' ? pickUsers() : (tables[current.table] ?? []))[0] ?? null,
    paginate: async () => {
      const page = current.table === 'users' ? pickUsers() : (tables[current.table] ?? []);
      return { page, continueCursor: '', isDone: true };
    },
  };

  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      query: (table: string) => {
        current.table = table;
        return chain;
      },
    },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.isolateModules(() => {
    mockNotify = jest.requireMock('../../convex/lib/notify').notify;
    mockGet = jest.fn();
    mockInsert = jest.fn((table: string) => {
      // Emulate Convex assigning fresh ids per insert.
      if (table === 'users') return Promise.resolve('new-user-id' as Id<'users'>);
      return Promise.resolve('new-invite-id' as Id<'organizationInvites'>);
    });
    mockPatch = jest.fn();
    authModule = require('../../convex/auth_module/main');
  });
});

const REGISTER_ARGS = {
  name: 'Anna',
  email: 'anna@acme.am',
  password: 'SuperSecret123!',
  phone: '+374000000',
  organizationId: ORG_ID,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('auth.register — pending approval unifies with join-request flow', () => {
  it('does NOT bind organizationId and creates a pending invite for a new user joining an existing org', async () => {
    mockGet.mockResolvedValue(ACTIVE_ORG);
    // users lookups in call order:
    //   1. by_email uniqueness   → empty
    //   2. by_org member count   → existing admin (not first member)
    //   3. by_org_role admin list → existing admin
    const ctx = makeCtx({ usersProbe: [[], EXISTING_ADMINS, EXISTING_ADMINS] });

    const result = await authModule.register.handler(ctx, REGISTER_ARGS);

    expect(result.needsApproval).toBe(true);
    expect(result.organizationId).toBeUndefined();

    // User created WITHOUT organizationId — pending accounts are not employees.
    const userInsert = mockInsert.mock.calls.find((c: unknown[]) => c[0] === 'users');
    expect(userInsert).toBeDefined();
    expect(userInsert![1].organizationId).toBeUndefined();
    expect(userInsert![1].isApproved).toBe(false);
    expect(userInsert![1].isActive).toBe(true);

    // A pending invite was created (the unified join-request record).
    const inviteInsert = mockInsert.mock.calls.find(
      (c: unknown[]) => c[0] === 'organizationInvites',
    );
    expect(inviteInsert).toBeDefined();
    expect(inviteInsert![1]).toMatchObject({
      organizationId: ORG_ID,
      requestedByEmail: 'anna@acme.am',
      requestedByName: 'Anna',
      status: 'pending',
      userId: 'new-user-id',
    });

    // Org admins were notified about the join request.
    // notify(ctx, payload) — the payload is the SECOND argument.
    expect(mockNotify).toHaveBeenCalled();
    const notifyPayload = mockNotify.mock.calls[0]![1];
    expect(notifyPayload.type).toBe('join_request');
    expect(notifyPayload.route).toBe('/join-requests');
    expect(notifyPayload.relatedId).toBe('new-invite-id');
  });

  it('keeps auto-approval for the FIRST member of an org (bootstrap admin)', async () => {
    mockGet.mockResolvedValue(ACTIVE_ORG);
    // by_email → empty; by_org member count → empty (first member).
    const ctx = makeCtx({ usersProbe: [[], []] });

    const result = await authModule.register.handler(ctx, REGISTER_ARGS);

    expect(result.needsApproval).toBe(false);
    expect(result.role).toBe('admin');
    expect(result.organizationId).toBe(ORG_ID);

    const userInsert = mockInsert.mock.calls.find((c: unknown[]) => c[0] === 'users');
    expect(userInsert![1].organizationId).toBe(ORG_ID);
    expect(userInsert![1].isApproved).toBe(true);

    // No invite, no admin notification for auto-approved first member.
    expect(mockInsert.mock.calls.some((c: unknown[]) => c[0] === 'organizationInvites')).toBe(
      false,
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('keeps auto-approval for invite-token registrations and marks the invite used', async () => {
    const INVITE_ID = 'inv-1' as Id<'organizationInvites'>;
    const invite = {
      _id: INVITE_ID,
      organizationId: ORG_ID,
      requestedByEmail: 'anna@acme.am',
      status: 'pending',
      inviteToken: 'tok123',
    };
    mockGet.mockResolvedValue(ACTIVE_ORG);
    // by_email → empty; by_org member count → existing admin (not first member).
    const ctx = makeCtx({
      usersProbe: [[], EXISTING_ADMINS],
      tables: { organizationInvites: [invite] },
    });

    const result = await authModule.register.handler(ctx, {
      ...REGISTER_ARGS,
      inviteToken: 'tok123',
    });

    expect(result.needsApproval).toBe(false);
    expect(result.organizationId).toBe(ORG_ID);

    const userInsert = mockInsert.mock.calls.find((c: unknown[]) => c[0] === 'users');
    expect(userInsert![1].organizationId).toBe(ORG_ID);
    expect(userInsert![1].isApproved).toBe(true);

    // Invite marked approved; no new invite created; no join_request notification.
    expect(mockPatch).toHaveBeenCalledWith(
      INVITE_ID,
      expect.objectContaining({ status: 'approved' }),
    );
    expect(mockInsert.mock.calls.some((c: unknown[]) => c[0] === 'organizationInvites')).toBe(
      false,
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('does not create a duplicate invite when one is already pending for the same org', async () => {
    mockGet.mockResolvedValue(ACTIVE_ORG);
    const ctx = makeCtx({
      usersProbe: [[], EXISTING_ADMINS],
      tables: {
        // Pending invite already exists for this email+org → no new one inserted.
        organizationInvites: [
          {
            _id: 'inv-exists' as Id<'organizationInvites'>,
            organizationId: ORG_ID,
            requestedByEmail: 'anna@acme.am',
            status: 'pending',
          },
        ],
      },
    });

    await authModule.register.handler(ctx, REGISTER_ARGS);

    // The user is created (pending), but NO second invite is inserted.
    expect(mockInsert.mock.calls.some((c: unknown[]) => c[0] === 'users')).toBe(true);
    const invitesInserted = mockInsert.mock.calls.filter(
      (c: unknown[]) => c[0] === 'organizationInvites',
    );
    expect(invitesInserted).toHaveLength(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('enforces the employee limit for auto-approved invite-token registrations', async () => {
    const invite = {
      _id: 'inv-1' as Id<'organizationInvites'>,
      organizationId: ORG_ID,
      requestedByEmail: 'anna@acme.am',
      status: 'pending',
      inviteToken: 'tok123',
    };
    mockGet.mockResolvedValue({ ...ACTIVE_ORG, employeeLimit: 1 });
    // Member count already at the limit (1) → invite-token join must fail.
    const ctx = makeCtx({
      usersProbe: [[], EXISTING_ADMINS],
      tables: { organizationInvites: [invite] },
    });

    await expect(
      authModule.register.handler(ctx, { ...REGISTER_ARGS, inviteToken: 'tok123' }),
    ).rejects.toThrow(/employee limit/i);
  });
});
