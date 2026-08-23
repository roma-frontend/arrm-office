/**
 * Tests for convex/taskStatuses — status set CRUD with mocked Convex context.
 *
 * Pattern from convex-tasks.test.ts: mock _generated/server, capture handlers,
 * build a mock ctx with db operations.
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
  assertOrgStaff: jest.fn(),
  resolveOrgScope: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));

jest.mock('../../convex/lib/taskConfig', () => ({
  resolveStatusSet: jest.fn(),
  resyncCanonicalStatus: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../convex/lib/sanitize', () => ({
  sanitizeTitle: jest.fn((s: string) => s.trim()),
}));

// ── Module under test ────────────────────────────────────────────────────────
let handlers: Record<string, (ctx: any, args: any) => Promise<any>> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/taskStatuses');
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
const SET_ID = 'set-1';

const orgAccess = jest.requireMock('../../convex/lib/orgAccess') as Record<string, jest.Mock>;

function mockStaffScope() {
  const scope = { organizationId: ORG, caller: callerDoc(), isStaff: true, isAdmin: false };
  orgAccess.resolveOrgScope.mockResolvedValue(scope);
  orgAccess.assertOrgStaff.mockResolvedValue(scope);
  orgAccess.scopeOwnsRecord.mockReturnValue(true);
}

function callerDoc(overrides: Record<string, unknown> = {}) {
  return { _id: USER, role: 'admin', organizationId: ORG, name: 'Admin', ...overrides };
}

function statusSetDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: SET_ID,
    organizationId: ORG,
    name: 'Custom Set',
    isDefault: false,
    statuses: [
      { key: 'todo', label: 'To Do', color: 'gray', type: 'todo', order: 0 },
      { key: 'done', label: 'Done', color: 'green', type: 'done', order: 1 },
    ],
    createdBy: USER,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeCtx(dbOverrides: Record<string, jest.Mock> = {}) {
  const get = dbOverrides.get ?? jest.fn();
  const insert = dbOverrides.insert ?? jest.fn().mockResolvedValue('new_id');
  const patch = dbOverrides.patch ?? jest.fn().mockResolvedValue(undefined);
  const remove = dbOverrides.delete ?? jest.fn().mockResolvedValue(undefined);
  const take = dbOverrides.take ?? jest.fn().mockResolvedValue([]);
  const first = dbOverrides.first ?? jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, first });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, first });
  const db = { get, insert, patch, delete: remove, query };
  return { ctx: { db }, get, insert, patch, remove, query, withIndex, take, first };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createStatusSet', () => {
  it('creates a status set and returns its id', async () => {
    mockStaffScope();
    const { ctx, insert } = makeCtx();

    const id = await handlers.createStatusSet(ctx, {
      name: 'My Set',
      statuses: [
        { key: 'pending', label: 'Pending', color: 'gray', type: 'todo', order: 0 },
        { key: 'in_progress', label: 'In Progress', color: 'blue', type: 'active', order: 1 },
        { key: 'completed', label: 'Completed', color: 'green', type: 'done', order: 2 },
      ],
    });

    expect(id).toBe('new_id');
    expect(insert).toHaveBeenCalledWith('taskStatusSets', expect.objectContaining({
      name: 'My Set',
      organizationId: ORG,
      isDefault: expect.any(Boolean),
    }));
    // Should also create an audit log
    expect(insert).toHaveBeenCalledWith('auditLogs', expect.objectContaining({
      action: 'task_status_set_created',
    }));
  });

  it('first set becomes default automatically', async () => {
    mockStaffScope();
    const { ctx, insert } = makeCtx();
    // No existing sets
    const id = await handlers.createStatusSet(ctx, {
      name: 'First Set',
      statuses: [
        { key: 'pending', label: 'Pending', color: 'gray', type: 'todo', order: 0 },
        { key: 'completed', label: 'Done', color: 'green', type: 'done', order: 1 },
      ],
    });

    expect(id).toBe('new_id');
    expect(insert).toHaveBeenCalledWith('taskStatusSets', expect.objectContaining({
      isDefault: true,
    }));
  });

  it('makes set default when makeDefault=true and caller is admin', async () => {
    const adminScope = { organizationId: ORG, caller: callerDoc(), isStaff: true, isAdmin: true };
    orgAccess.resolveOrgScope.mockResolvedValue(adminScope);
    orgAccess.assertOrgStaff.mockResolvedValue(adminScope);
    orgAccess.scopeOwnsRecord.mockReturnValue(true);

    const existing = [statusSetDoc({ isDefault: true })];
    const { ctx, insert, patch } = makeCtx();
    // Existing set query returns one set
    ctx.db.query().withIndex().take.mockResolvedValue(existing);

    await handlers.createStatusSet(ctx, {
      name: 'New Default',
      statuses: [
        { key: 'pending', label: 'Pending', color: 'gray', type: 'todo', order: 0 },
        { key: 'completed', label: 'Done', color: 'green', type: 'done', order: 1 },
      ],
      makeDefault: true,
    });

    expect(patch).toHaveBeenCalledWith(existing[0]._id, expect.objectContaining({ isDefault: false }));
    expect(insert).toHaveBeenCalledWith('taskStatusSets', expect.objectContaining({ isDefault: true }));
  });
});

describe('updateStatusSet', () => {
  it('updates name', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(statusSetDoc());

    await handlers.updateStatusSet(ctx, {
      setId: SET_ID,
      name: 'Renamed Set',
    });

    expect(patch).toHaveBeenCalledWith(SET_ID, expect.objectContaining({ name: 'Renamed Set' }));
  });

  it('throws for non-existent set', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.updateStatusSet(ctx, { setId: SET_ID, name: 'New' }),
    ).rejects.toThrow('not found');
  });

  it('normalizes statuses and updates', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(statusSetDoc());

    await handlers.updateStatusSet(ctx, {
      setId: SET_ID,
      statuses: [
        { key: 'todo', label: 'To Do', color: 'gray', type: 'todo', order: 0 },
        { key: 'review', label: 'Review', color: 'amber', type: 'review', order: 1 },
        { key: 'done', label: 'Done', color: 'green', type: 'done', order: 2 },
      ],
    });

    expect(patch).toHaveBeenCalledWith(SET_ID, expect.objectContaining({
      statuses: expect.arrayContaining([
        expect.objectContaining({ key: 'todo' }),
        expect.objectContaining({ key: 'review' }),
        expect.objectContaining({ key: 'done' }),
      ]),
    }));
  });
});

describe('deleteStatusSet', () => {
  it('deletes the set', async () => {
    mockStaffScope();
    const { ctx, remove } = makeCtx();
    ctx.db.get.mockResolvedValue(statusSetDoc());

    await handlers.deleteStatusSet(ctx, { setId: SET_ID });

    expect(remove).toHaveBeenCalledWith(SET_ID);
  });

  it('throws for non-existent set', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.deleteStatusSet(ctx, { setId: SET_ID }),
    ).rejects.toThrow('not found');
  });
});

describe('setDefaultStatusSet', () => {
  it('sets the set as default and clears others', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(statusSetDoc());
    // No other defaults
    ctx.db.query().withIndex().take.mockResolvedValue([]);

    await handlers.setDefaultStatusSet(ctx, { setId: SET_ID });

    expect(patch).toHaveBeenCalledWith(SET_ID, expect.objectContaining({ isDefault: true }));
  });

  it('clears previous default when setting new one', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(statusSetDoc());
    const otherDefault = statusSetDoc({ _id: 'other-set', isDefault: true });
    ctx.db.query().withIndex().take.mockResolvedValue([otherDefault]);

    await handlers.setDefaultStatusSet(ctx, { setId: SET_ID });

    // Should clear the old default
    expect(patch).toHaveBeenCalledWith('other-set', expect.objectContaining({ isDefault: false }));
    // Should set new default
    expect(patch).toHaveBeenCalledWith(SET_ID, expect.objectContaining({ isDefault: true }));
  });

  it('throws for non-existent set', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.setDefaultStatusSet(ctx, { setId: SET_ID }),
    ).rejects.toThrow('not found');
  });
});
