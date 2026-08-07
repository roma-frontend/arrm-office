/**
 * Tests for convex/leaveSettings.ts — leave type configs, holidays and the
 * admin-only balance adjustments.
 *
 * Pattern: convex-leaves-rbac.test.ts — mock `_generated/server`, getAuthCaller,
 * lib/auth and lib/userProfile; require the module inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  patchProfile: jest.fn(),
}));

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockPatchProfile: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockPatchProfile = jest.requireMock('../../convex/lib/userProfile').patchProfile;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockPatchProfile.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/leaveSettings');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

const ORG_A = 'org-1';
const ORG_B = 'org-2';
const ADMIN_ID = 'user_admin';
const USER_ID = 'user_1';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver' = 'employee',
  org: string | undefined = ORG_A,
  id: string = USER_ID,
) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    name: 'Anna',
    email: 'anna@example.com',
    role: 'employee',
    organizationId: ORG_A,
    isActive: true,
    paidLeaveBalance: 24,
    ...overrides,
  };
}

function makeChain() {
  const take = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take });
  const filter = jest.fn().mockReturnValue({ take });
  const withIndex = jest.fn().mockReturnValue({ order, take, first, filter });
  return { root: { withIndex, order, take, first, filter }, withIndex, order, take, first, filter };
}

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('holiday_1');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const db = {
    get,
    insert,
    patch,
    delete: remove,
    query: jest.fn(() => makeChain().root),
  };
  return { ctx: { db }, get, insert, patch, remove, db };
}

describe('getLeaveTypeConfigs', () => {
  it('returns [] for unauthenticated or cross-org callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    expect(await handlers.getLeaveTypeConfigs(ctx, { organizationId: ORG_A })).toEqual([]);

    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    expect(await handlers.getLeaveTypeConfigs(ctx, { organizationId: ORG_A })).toEqual([]);
  });

  it('returns the org configs for a same-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, db } = makeCtx();
    const ch = makeChain();
    ch.take.mockResolvedValue([{ _id: 'c1', type: 'paid' }]);
    db.query.mockImplementation(() => ch.root);

    const result = await handlers.getLeaveTypeConfigs(ctx, { organizationId: ORG_A });

    expect(result).toHaveLength(1);
    expect(ch.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('lets a superadmin read any org', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx } = makeCtx();
    expect(await handlers.getLeaveTypeConfigs(ctx, { organizationId: ORG_B })).toEqual([]);
  });
});

describe('getDefaultLeaveTypeConfigs', () => {
  it('returns the default leave types', async () => {
    const result = (await handlers.getDefaultLeaveTypeConfigs({}, {})) as any[];
    expect(result.length).toBe(9);
    expect(result[0]).toEqual(expect.objectContaining({ type: 'paid', defaultDaysPerYear: 24 }));
  });
});

describe('upsertLeaveTypeConfig', () => {
  const args = {
    organizationId: ORG_A,
    type: 'paid' as const,
    isActive: true,
    defaultDaysPerYear: 24,
    requiresDocumentation: false,
    approvalChain: ['supervisor'],
    balanceEditable: true,
    color: '#2563eb',
    icon: '💰',
  };

  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.upsertLeaveTypeConfig(ctx, args)).rejects.toThrow('Not authenticated');
  });

  it('rejects non-admin callers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();
    await expect(handlers.upsertLeaveTypeConfig(ctx, args)).rejects.toThrow(
      'Only admins of this organization can configure leave types',
    );
  });

  it('rejects a negative day count', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx } = makeCtx();
    await expect(
      handlers.upsertLeaveTypeConfig(ctx, { ...args, defaultDaysPerYear: -1 }),
    ).rejects.toThrow('Default days per year must be a non-negative number');
  });

  it('patches an existing config', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, patch, insert, db } = makeCtx();
    const ch = makeChain();
    ch.first.mockResolvedValue({ _id: 'config_1' });
    db.query.mockImplementation(() => ch.root);

    await handlers.upsertLeaveTypeConfig(ctx, { ...args, defaultDaysPerYear: 30 });

    expect(patch).toHaveBeenCalledWith(
      'config_1',
      expect.objectContaining({ defaultDaysPerYear: 30, updatedAt: expect.any(Number) }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_type_config_updated' }),
    );
  });

  it('inserts a new config when none exists', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, insert, db } = makeCtx();
    const ch = makeChain();
    ch.first.mockResolvedValue(null);
    db.query.mockImplementation(() => ch.root);

    await handlers.upsertLeaveTypeConfig(ctx, args);

    expect(insert).toHaveBeenCalledWith(
      'leaveTypeConfigs',
      expect.objectContaining({
        type: 'paid',
        organizationId: ORG_A,
        createdAt: expect.any(Number),
      }),
    );
  });
});

describe('initializeDefaultLeaveTypes', () => {
  it('is idempotent — skips types that already exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, insert, db } = makeCtx();
    const ch = makeChain();
    ch.take.mockResolvedValue([
      { _id: 'c1', type: 'paid' },
      { _id: 'c2', type: 'sick' },
    ]);
    db.query.mockImplementation(() => ch.root);

    await handlers.initializeDefaultLeaveTypes(ctx, { organizationId: ORG_A });

    // 9 defaults minus the 2 already present
    expect(insert).toHaveBeenCalledTimes(7);
    expect(insert).toHaveBeenCalledWith(
      'leaveTypeConfigs',
      expect.objectContaining({ organizationId: ORG_A, type: 'unpaid' }),
    );
  });

  it('rejects non-admin callers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx } = makeCtx();
    await expect(
      handlers.initializeDefaultLeaveTypes(ctx, { organizationId: ORG_A }),
    ).rejects.toThrow('Only admins of this organization can initialize leave types');
  });
});

describe('holidays', () => {
  it('getHolidays returns [] for foreign orgs', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx } = makeCtx();
    expect(await handlers.getHolidays(ctx, { organizationId: ORG_A })).toEqual([]);
  });

  it('getHolidaysByDateRange filters by date', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, db } = makeCtx();
    const ch = makeChain();
    ch.take.mockResolvedValue([
      { _id: 'h1', date: '2026-05-01' },
      { _id: 'h2', date: '2026-12-25' },
    ]);
    db.query.mockImplementation(() => ch.root);

    const result = (await handlers.getHolidaysByDateRange(ctx, {
      organizationId: ORG_A,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
    })) as any[];

    expect(result.map((h) => h._id)).toEqual(['h1']);
  });

  it('createHoliday validates name and date', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx } = makeCtx();

    await expect(
      handlers.createHoliday(ctx, {
        organizationId: ORG_A,
        name: '  ',
        date: 'x',
        type: 'public',
        isRecurring: false,
      }),
    ).rejects.toThrow('Holiday name is required');
    await expect(
      handlers.createHoliday(ctx, {
        organizationId: ORG_A,
        name: 'X',
        date: '',
        type: 'public',
        isRecurring: false,
      }),
    ).rejects.toThrow('Holiday date is required');
  });

  it('createHoliday creates the holiday and audits', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, insert } = makeCtx();

    const id = await handlers.createHoliday(ctx, {
      organizationId: ORG_A,
      name: 'May Day',
      date: '2026-05-01',
      type: 'public',
      isRecurring: true,
    });

    expect(id).toBe('holiday_1');
    expect(insert).toHaveBeenCalledWith(
      'holidays',
      expect.objectContaining({ name: 'May Day', createdBy: ADMIN_ID }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'holiday_created' }),
    );
  });

  it('updateHoliday strips holidayId and skips undefined fields', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce({ _id: 'h1', organizationId: ORG_A, name: 'Old' });

    await handlers.updateHoliday(ctx, { holidayId: 'h1', name: 'New', date: undefined });

    const patchArgs = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(patchArgs[0]).toBe('h1');
    expect(patchArgs[1]).toEqual({ name: 'New', updatedAt: expect.any(Number) });
  });

  it('deleteHoliday returns silently when the holiday is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, remove } = makeCtx();
    get.mockResolvedValueOnce(null);

    await handlers.deleteHoliday(ctx, { holidayId: 'missing' });

    expect(remove).not.toHaveBeenCalled();
  });

  it('deleteHoliday deletes and audits', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, remove, insert } = makeCtx();
    get.mockResolvedValueOnce({ _id: 'h1', organizationId: ORG_A, name: 'X', date: '2026-01-01' });

    await handlers.deleteHoliday(ctx, { holidayId: 'h1' });

    expect(remove).toHaveBeenCalledWith('h1');
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'holiday_deleted' }),
    );
  });
});

describe('leave balances', () => {
  it('getEmployeeLeaveBalances returns [] for foreign orgs', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx } = makeCtx();
    expect(await handlers.getEmployeeLeaveBalances(ctx, { organizationId: ORG_A })).toEqual([]);
  });

  it('getEmployeeLeaveBalances enriches balances from userProfiles', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db } = makeCtx();
    const usersCh = makeChain();
    usersCh.take.mockResolvedValue([userDoc({ paidLeaveBalance: 20 })]);
    const profileCh = makeChain();
    profileCh.first.mockResolvedValue({
      userId: USER_ID,
      department: 'Eng',
      position: 'Dev',
      paidLeaveBalance: 15,
    });
    db.query.mockImplementation((table: string) =>
      table === 'userProfiles' ? profileCh.root : usersCh.root,
    );

    const result = (await handlers.getEmployeeLeaveBalances(ctx, {
      organizationId: ORG_A,
    })) as any[];

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        name: 'Anna',
        department: 'Eng',
        balances: expect.objectContaining({ paidLeaveBalance: 15 }),
      }),
    );
  });

  it('updateLeaveBalance rejects cross-org admins', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_A }));

    await expect(
      handlers.updateLeaveBalance(ctx, {
        userId: USER_ID,
        field: 'paidLeaveBalance',
        value: 30,
        reason: 'r',
      }),
    ).rejects.toThrow('Only admins of this organization can adjust leave balances');
    expect(patch).not.toHaveBeenCalled();
  });

  it('updateLeaveBalance requires a reason', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc());

    await expect(
      handlers.updateLeaveBalance(ctx, {
        userId: USER_ID,
        field: 'paidLeaveBalance',
        value: 30,
        reason: '  ',
      }),
    ).rejects.toThrow('A reason is required to adjust leave balances');
  });

  it('updateLeaveBalance patches the profile and audits the change', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ paidLeaveBalance: 20 }));

    const result = (await handlers.updateLeaveBalance(ctx, {
      userId: USER_ID,
      field: 'paidLeaveBalance',
      value: 30,
      reason: 'bonus days',
    })) as any;

    expect(mockPatchProfile).toHaveBeenCalledWith(ctx, USER_ID, { paidLeaveBalance: 30 });
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_balance_adjusted' }),
    );
    expect(result).toEqual({ field: 'paidLeaveBalance', previousValue: 20, newValue: 30 });
  });
});
