/**
 * Tests for the per-employee travel allowance in `convex/users/mutations.ts`.
 *
 * The allowance used to be re-derived from the organization policy on *every*
 * call to `updateUser`, so an HR-set amount was silently wiped by the next
 * unrelated edit (a phone number, a supervisor change). These tests pin the
 * three cases the mutation now distinguishes:
 *
 *   - a number  → override this employee, persist it as `travelAllowanceOverride`
 *   - null      → drop the override, fall back to the organization policy
 *   - omitted   → leave an existing override alone
 *
 * `convex/lib/travelAllowance.ts` is deliberately NOT mocked: the policy lookup
 * reads `salarySettings` through `ctx.db`, and running the real resolution is
 * the only way these tests can catch a regression in the override precedence.
 *
 * Pattern: convex-users-admin.test.ts — mock `_generated/server` and the libs
 * with side effects, then require the module inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({ getAuthCaller: jest.fn() }));

jest.mock('../../convex/lib/rbac', () => ({
  requireUser: jest.fn(),
  requireOrgAdmin: jest.fn(),
  requireRole: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadminEmail: jest.fn(() => false),
  SUPERADMIN_EMAIL: 'boss@superadmin.example',
}));

jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn() }));
jest.mock('../../convex/lib/userProfile', () => ({ patchProfile: jest.fn() }));
jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../convex/lib/orgUnits', () => ({
  resolveDepartmentByName: jest.fn().mockResolvedValue({}),
  resolvePositionByTitle: jest.fn().mockResolvedValue({}),
}));

// ── Module under test ────────────────────────────────────────────────────────
const ORG = 'org-1';
const ADMIN_ID = 'user_admin';
const USER_ID = 'user_1';

type Handler = (ctx: any, args: any) => Promise<unknown>;
let updateUser: Handler;
let createUser: Handler;

beforeEach(() => {
  jest.clearAllMocks();
  const rbac = jest.requireMock('../../convex/lib/rbac') as any;
  rbac.requireUser.mockResolvedValue({
    _id: ADMIN_ID,
    email: 'hr@example.com',
    role: 'admin',
    organizationId: ORG,
  });
  rbac.requireOrgAdmin.mockResolvedValue(undefined);

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/users/mutations');
    updateUser = mod.updateUser.handler;
    createUser = mod.createUser.handler;
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    name: 'Anna',
    email: 'anna@example.com',
    role: 'employee',
    employeeType: 'staff',
    organizationId: ORG,
    isActive: true,
    isApproved: true,
    travelAllowance: 20000,
    ...overrides,
  };
}

/**
 * `first()` is answered per table so the real `getTravelAllowancePolicy` sees a
 * policy while the `userProfiles` lookup sees nothing (the mirror write is not
 * what these tests are about).
 */
function makeCtx(opts: { policy?: unknown; user?: Record<string, unknown> } = {}) {
  const rows: Record<string, unknown> = {
    salarySettings:
      opts.policy === undefined ? null : { organizationId: ORG, travelAllowance: opts.policy },
    userProfiles: null,
  };
  const get = jest.fn().mockResolvedValue(opts.user ?? userDoc());
  const patch = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn().mockResolvedValue('new_id');
  const q: any = { eq: () => q, and: () => q, neq: () => q, field: () => q };
  const query = jest.fn((table: string) => {
    const first = jest.fn().mockResolvedValue(rows[table] ?? null);
    const take = jest.fn().mockResolvedValue([]);
    const withIndex = jest.fn((_name: string, cb?: (b: any) => unknown) => {
      if (typeof cb === 'function') cb(q);
      return { first, take, order: () => ({ first, take }) };
    });
    return { withIndex, first, take, order: () => ({ first, take }) };
  });
  return { ctx: { db: { get, patch, insert, query, delete: jest.fn() } }, get, patch, insert };
}

const ENABLED_POLICY = { enabled: true, staffAmount: 20000, contractorAmount: 12000 };

/**
 * `createUser` ctx: unlike `updateUser` it reads the organization doc (for the
 * employee limit) and schedules probation, so `db.get` must answer for the org
 * and a scheduler has to exist.
 */
function makeCreateCtx(opts: { policy?: unknown } = {}) {
  const rows: Record<string, unknown> = {
    salarySettings:
      opts.policy === undefined ? null : { organizationId: ORG, travelAllowance: opts.policy },
    userProfiles: null,
  };
  // Only the org doc is fetched by id here; the email-uniqueness check goes
  // through `query`, not `get`.
  const get = jest.fn().mockResolvedValue({ _id: ORG, employeeLimit: 100 });
  const patch = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn().mockResolvedValue('new_user_id');
  const q: any = { eq: () => q, and: () => q, neq: () => q, field: () => q };
  const query = jest.fn((table: string) => {
    const first = jest.fn().mockResolvedValue(rows[table] ?? null);
    const take = jest.fn().mockResolvedValue([]);
    const unique = jest.fn().mockResolvedValue(null); // email not taken
    const withIndex = jest.fn((_name: string, cb?: (b: any) => unknown) => {
      if (typeof cb === 'function') cb(q);
      return { first, take, unique, order: () => ({ first, take }) };
    });
    return { withIndex, first, take, unique, order: () => ({ first, take }) };
  });
  return {
    ctx: {
      db: { get, patch, insert, query, delete: jest.fn() },
      scheduler: { runAfter: jest.fn().mockResolvedValue(undefined) },
    },
    insert,
  };
}

/** The doc handed to `db.insert('users', …)`. */
function insertedUser(insert: jest.Mock) {
  const call = insert.mock.calls.find(([table]) => table === 'users');
  if (!call) throw new Error('users doc was never inserted');
  return call[1] as Record<string, unknown>;
}

const NEW_HIRE = {
  adminId: ADMIN_ID,
  name: 'Boris',
  email: 'boris@example.com',
  passwordHash: 'temp',
  role: 'employee',
  employeeType: 'staff',
  organizationId: ORG,
};

function patchedUser(patch: jest.Mock) {
  const call = patch.mock.calls.find(([id]) => id === USER_ID);
  if (!call) throw new Error('users doc was never patched');
  return call[1] as Record<string, unknown>;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('updateUser travel allowance', () => {
  it('stores an HR-set amount as an override and as the effective value', async () => {
    const { ctx, patch } = makeCtx({ policy: ENABLED_POLICY });

    await updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, travelAllowance: 35000 });

    expect(patchedUser(patch)).toMatchObject({
      travelAllowance: 35000,
      travelAllowanceOverride: 35000,
    });
  });

  it('keeps an existing override when the allowance is not part of the edit', async () => {
    const { ctx, patch } = makeCtx({
      policy: ENABLED_POLICY,
      user: userDoc({ travelAllowance: 35000, travelAllowanceOverride: 35000 }),
    });

    // The edit HR actually makes most often: something unrelated.
    await updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, phone: '+37411223344' });

    expect(patchedUser(patch)).toMatchObject({
      phone: '+37411223344',
      travelAllowance: 35000,
      travelAllowanceOverride: 35000,
    });
  });

  it('null clears the override and returns the employee to the org policy', async () => {
    const { ctx, patch } = makeCtx({
      policy: ENABLED_POLICY,
      user: userDoc({ travelAllowance: 35000, travelAllowanceOverride: 35000 }),
    });

    await updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, travelAllowance: null });

    const written = patchedUser(patch);
    expect(written.travelAllowance).toBe(20000);
    expect(written.travelAllowanceOverride).toBeUndefined();
  });

  it('follows the policy amount for the new employee type when there is no override', async () => {
    const { ctx, patch } = makeCtx({ policy: ENABLED_POLICY });

    await updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, employeeType: 'contractor' });

    expect(patchedUser(patch)).toMatchObject({ travelAllowance: 12000 });
  });

  it('does not let a policy change override an individually agreed amount', async () => {
    const { ctx, patch } = makeCtx({
      policy: { enabled: true, staffAmount: 5000, contractorAmount: 5000 },
      user: userDoc({ travelAllowance: 35000, travelAllowanceOverride: 35000 }),
    });

    await updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, employeeType: 'contractor' });

    expect(patchedUser(patch)).toMatchObject({ travelAllowance: 35000 });
  });

  it('pays an override even when the organization pays no allowance at all', async () => {
    const { ctx, patch } = makeCtx({ policy: undefined });

    await updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, travelAllowance: 7000 });

    expect(patchedUser(patch)).toMatchObject({
      travelAllowance: 7000,
      travelAllowanceOverride: 7000,
    });
  });

  it('accepts 0 as a deliberate override rather than treating it as "unset"', async () => {
    const { ctx, patch } = makeCtx({ policy: ENABLED_POLICY });

    await updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, travelAllowance: 0 });

    expect(patchedUser(patch)).toMatchObject({
      travelAllowance: 0,
      travelAllowanceOverride: 0,
    });
  });

  it('refuses a negative amount with a message that survives production', async () => {
    const { ctx, patch } = makeCtx({ policy: ENABLED_POLICY });

    await expect(
      updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, travelAllowance: -1 }),
    ).rejects.toMatchObject({
      data: { code: 'INVALID_TRAVEL_ALLOWANCE' },
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it('records the allowance in the audit trail even though it is not a plain field', async () => {
    const { ctx, insert } = makeCtx({ policy: ENABLED_POLICY });

    await updateUser(ctx, { adminId: ADMIN_ID, userId: USER_ID, travelAllowance: 35000 });

    const audit = insert.mock.calls.find(([table]) => table === 'auditLogs');
    expect(audit).toBeDefined();
    const details = JSON.parse((audit![1] as any).details);
    expect(details.updatedFields).toContain('travelAllowance');
  });
});

describe('createUser travel allowance', () => {
  it('follows the organization policy when no amount is given', async () => {
    const { ctx, insert } = makeCreateCtx({ policy: ENABLED_POLICY });

    await createUser(ctx, NEW_HIRE);

    const written = insertedUser(insert);
    expect(written.travelAllowance).toBe(20000);
    // No deviation was agreed, so nothing must pin this hire away from the policy.
    expect(written.travelAllowanceOverride).toBeUndefined();
  });

  it('uses the contractor amount for a contractor hire', async () => {
    const { ctx, insert } = makeCreateCtx({ policy: ENABLED_POLICY });

    await createUser(ctx, { ...NEW_HIRE, employeeType: 'contractor' });

    expect(insertedUser(insert)).toMatchObject({ travelAllowance: 12000 });
  });

  it('stores an amount agreed at hiring time as an override', async () => {
    const { ctx, insert } = makeCreateCtx({ policy: ENABLED_POLICY });

    await createUser(ctx, { ...NEW_HIRE, travelAllowance: 35000 });

    // The override is what makes the amount survive later unrelated edits —
    // without it the next `updateUser` would reset the hire to the policy.
    expect(insertedUser(insert)).toMatchObject({
      travelAllowance: 35000,
      travelAllowanceOverride: 35000,
    });
  });

  it('treats null as "follow the policy" so the wizard can always send the field', async () => {
    const { ctx, insert } = makeCreateCtx({ policy: ENABLED_POLICY });

    await createUser(ctx, { ...NEW_HIRE, travelAllowance: null });

    const written = insertedUser(insert);
    expect(written.travelAllowance).toBe(20000);
    expect(written.travelAllowanceOverride).toBeUndefined();
  });

  it('pays an agreed amount even when the organization pays no allowance', async () => {
    const { ctx, insert } = makeCreateCtx({ policy: undefined });

    await createUser(ctx, { ...NEW_HIRE, travelAllowance: 7000 });

    expect(insertedUser(insert)).toMatchObject({
      travelAllowance: 7000,
      travelAllowanceOverride: 7000,
    });
  });

  it('accepts 0 as a deliberate amount rather than treating it as "unset"', async () => {
    const { ctx, insert } = makeCreateCtx({ policy: ENABLED_POLICY });

    await createUser(ctx, { ...NEW_HIRE, travelAllowance: 0 });

    expect(insertedUser(insert)).toMatchObject({
      travelAllowance: 0,
      travelAllowanceOverride: 0,
    });
  });

  it('refuses a negative amount with a message that survives production', async () => {
    const { ctx, insert } = makeCreateCtx({ policy: ENABLED_POLICY });

    await expect(createUser(ctx, { ...NEW_HIRE, travelAllowance: -1 })).rejects.toMatchObject({
      data: { code: 'INVALID_TRAVEL_ALLOWANCE' },
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
