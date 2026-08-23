/**
 * Tests for convex/probation — probation period CRUD with mocked Convex context.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler }: any) => ({ handler }),
  query: ({ handler }: any) => ({ handler }),
  internalMutation: ({ handler }: any) => ({ handler }),
  internalQuery: ({ handler }: any) => ({ handler }),
}));

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../convex/lib/orgAccess', () => ({
  assertOrgScope: jest.fn(),
  resolveOrgScope: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));

jest.mock('../../convex/lib/resolveServiceAssignee', () => ({
  resolveServiceAssignee: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
}));

// ── Module under test ────────────────────────────────────────────────────────
let handlers: Record<string, (ctx: any, args: any) => Promise<any>> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/probation');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG = 'org-1';
const USER = 'user-1';
const EMPLOYEE_ID = 'emp-1';
const PERIOD_ID = 'period-1';
const DAY = 86400000;

function callerDoc(overrides: Record<string, unknown> = {}) {
  return { _id: USER, role: 'admin', organizationId: ORG, name: 'Admin', ...overrides };
}

function employeeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: EMPLOYEE_ID,
    name: 'Alice',
    email: 'alice@example.com',
    role: 'employee',
    organizationId: ORG,
    supervisorId: 'sup-1',
    isActive: true,
    ...overrides,
  };
}

function probationDoc(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    _id: PERIOD_ID,
    organizationId: ORG,
    employeeId: EMPLOYEE_ID,
    startDate: now,
    endDate: now + 90 * DAY,
    originalEndDate: now + 90 * DAY,
    durationDays: 90,
    status: 'active',
    remindersSent: [],
    extensions: [],
    createdBy: USER,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const orgAccessMock = jest.requireMock('../../convex/lib/orgAccess') as Record<string, jest.Mock>;

function mockAdminScope() {
  const scope = { organizationId: ORG, caller: callerDoc(), isStaff: true, isAdmin: true };
  orgAccessMock.assertOrgScope.mockResolvedValue(scope);
  orgAccessMock.resolveOrgScope.mockResolvedValue(scope);
  orgAccessMock.scopeOwnsRecord.mockReturnValue(true);
  return scope;
}

function makeCtx(dbOverrides: Record<string, jest.Mock> = {}) {
  const get = dbOverrides.get ?? jest.fn();
  const insert = dbOverrides.insert ?? jest.fn().mockResolvedValue('new_id');
  const patch = dbOverrides.patch ?? jest.fn().mockResolvedValue(undefined);
  const remove = dbOverrides.delete ?? jest.fn().mockResolvedValue(undefined);
  const take = dbOverrides.take ?? jest.fn().mockResolvedValue([]);
  const first = dbOverrides.first ?? jest.fn().mockResolvedValue(null);
  const filter = dbOverrides.filter ?? jest.fn().mockReturnValue({ first });
  const order = jest.fn().mockReturnValue({ take, first, filter });
  const withIndex = jest.fn().mockReturnValue({ order, take, first, filter });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, first, filter });
  const db = { get, insert, patch, delete: remove, query };
  return { ctx: { db }, get, insert, patch, remove, query, withIndex, take, first, filter };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('startProbation', () => {
  it('creates a probation period for an employee', async () => {
    mockAdminScope();
    const { ctx, insert } = makeCtx();
    ctx.db.get.mockResolvedValue(employeeDoc());

    const id = await handlers.startProbation(ctx, {
      organizationId: ORG,
      employeeId: EMPLOYEE_ID,
      durationDays: 90,
    });

    expect(id).toBe('new_id');
    expect(insert).toHaveBeenCalledWith(
      'probationPeriods',
      expect.objectContaining({
        organizationId: ORG,
        employeeId: EMPLOYEE_ID,
        status: 'active',
        durationDays: 90,
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'probation_started',
      }),
    );
  });

  it('throws for non-existent employee', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.startProbation(ctx, { organizationId: ORG, employeeId: 'unknown' }),
    ).rejects.toThrow('not found');
  });

  it('throws for employee in different org', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(employeeDoc({ organizationId: 'other-org' }));

    await expect(
      handlers.startProbation(ctx, { organizationId: ORG, employeeId: EMPLOYEE_ID }),
    ).rejects.toThrow('different organization');
  });

  it('throws when duration exceeds max (180 days)', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(employeeDoc());

    await expect(
      handlers.startProbation(ctx, {
        organizationId: ORG,
        employeeId: EMPLOYEE_ID,
        durationDays: 200,
      }),
    ).rejects.toThrow('between 1 and');
  });

  it('throws for invalid duration (non-finite)', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(employeeDoc());

    await expect(
      handlers.startProbation(ctx, {
        organizationId: ORG,
        employeeId: EMPLOYEE_ID,
        durationDays: NaN,
      }),
    ).rejects.toThrow();
  });
});

describe('extendProbation', () => {
  it('extends an active probation period', async () => {
    mockAdminScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValueOnce(probationDoc()).mockResolvedValueOnce(employeeDoc());

    await handlers.extendProbation(ctx, {
      probationId: PERIOD_ID,
      additionalDays: 30,
      reason: 'Project not complete',
    });

    expect(patch).toHaveBeenCalledWith(
      PERIOD_ID,
      expect.objectContaining({
        extensions: expect.arrayContaining([
          expect.objectContaining({
            reason: 'Project not complete',
          }),
        ]),
      }),
    );
  });

  it('throws for non-existent probation', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.extendProbation(ctx, { probationId: PERIOD_ID, additionalDays: 30 }),
    ).rejects.toThrow('not found');
  });

  it('throws for inactive probation', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(probationDoc({ status: 'completed' }));

    await expect(
      handlers.extendProbation(ctx, { probationId: PERIOD_ID, additionalDays: 30 }),
    ).rejects.toThrow('not active');
  });

  it('throws when extension exceeds 180-day cap', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    const now = Date.now();
    // Started 150 days ago, extending by 40 = 190 total → exceeds cap
    ctx.db.get
      .mockResolvedValueOnce(
        probationDoc({
          startDate: now - 150 * DAY,
          endDate: now + 30 * DAY,
          durationDays: 180,
        }),
      )
      .mockResolvedValueOnce(employeeDoc());

    await expect(
      handlers.extendProbation(ctx, { probationId: PERIOD_ID, additionalDays: 40 }),
    ).rejects.toThrow('exceed');
  });

  it('throws for invalid additionalDays (< 1)', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValueOnce(probationDoc()).mockResolvedValueOnce(employeeDoc());

    await expect(
      handlers.extendProbation(ctx, { probationId: PERIOD_ID, additionalDays: 0 }),
    ).rejects.toThrow('at least 1');
  });
});

describe('completeProbation', () => {
  it('marks probation as completed', async () => {
    mockAdminScope();
    const { ctx, patch } = makeCtx();
    // get calls: period, employee, then audience queries
    ctx.db.get
      .mockResolvedValueOnce(probationDoc())
      .mockResolvedValueOnce(employeeDoc())
      .mockResolvedValue(null);

    await handlers.completeProbation(ctx, {
      probationId: PERIOD_ID,
      outcome: 'passed',
    });

    expect(patch).toHaveBeenCalledWith(
      PERIOD_ID,
      expect.objectContaining({
        status: 'passed',
      }),
    );
  });

  it('throws for non-existent probation', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.completeProbation(ctx, { probationId: PERIOD_ID, outcome: 'passed' }),
    ).rejects.toThrow('not found');
  });

  it('throws for inactive probation', async () => {
    mockAdminScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(probationDoc({ status: 'completed' }));

    await expect(
      handlers.completeProbation(ctx, { probationId: PERIOD_ID, outcome: 'passed' }),
    ).rejects.toThrow('not active');
  });
});
