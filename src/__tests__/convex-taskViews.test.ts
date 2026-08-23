/**
 * Tests for convex/taskViews — saved view CRUD with mocked Convex context.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler }: any) => ({ handler }),
  query: ({ handler }: any) => ({ handler }),
  internalMutation: ({ handler }: any) => ({ handler }),
}));

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../convex/lib/orgAccess', () => ({
  assertOrgStaff: jest.fn(),
  assertOrgScope: jest.fn(),
  resolveOrgScope: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));

jest.mock('../../convex/lib/sanitize', () => ({
  sanitizeTitle: jest.fn((s: string) => s.trim()),
}));

// ── Module under test ────────────────────────────────────────────────────────
let handlers: Record<string, (ctx: any, args: any) => Promise<any>> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/taskViews');
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
const VIEW_ID = 'view-1';
const PROJECT_ID = 'proj-1';

// Keep direct references to the mocks created at module level
const orgAccess = jest.requireMock('../../convex/lib/orgAccess') as Record<string, jest.Mock>;

function mockStaffScope(overrides: Record<string, unknown> = {}) {
  const scope = {
    organizationId: ORG,
    caller: callerDoc(),
    isStaff: true,
    isAdmin: false,
    ...overrides,
  };
  orgAccess.assertOrgStaff.mockResolvedValue(scope);
  orgAccess.assertOrgScope.mockResolvedValue(scope);
  orgAccess.resolveOrgScope.mockResolvedValue(scope);
  orgAccess.scopeOwnsRecord.mockReturnValue(true);
  return scope;
}

function callerDoc(overrides: Record<string, unknown> = {}) {
  return { _id: USER, role: 'admin', organizationId: ORG, name: 'Admin', ...overrides };
}

function viewDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: VIEW_ID,
    organizationId: ORG,
    projectId: undefined,
    name: 'My View',
    icon: undefined,
    type: 'list',
    state: { view: 'list', sort: 'status' },
    visibility: 'private',
    ownerId: USER,
    isDefault: false,
    order: 0,
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

describe('saveView', () => {
  it('creates a view and returns its id', async () => {
    mockStaffScope();
    const { ctx, insert } = makeCtx();

    const id = await handlers.saveView(ctx, {
      name: 'Payable Outstanding',
      type: 'list',
      state: { view: 'list', status: 'pending' },
    });

    expect(id).toBe('new_id');
    expect(insert).toHaveBeenCalledWith(
      'taskViews',
      expect.objectContaining({
        name: 'Payable Outstanding',
        type: 'list',
        visibility: 'private',
        ownerId: USER,
        organizationId: ORG,
      }),
    );
  });

  it('defaults visibility to private', async () => {
    mockStaffScope();
    const { ctx, insert } = makeCtx();

    await handlers.saveView(ctx, {
      name: 'Private View',
      type: 'list',
      state: {},
    });

    expect(insert).toHaveBeenCalledWith(
      'taskViews',
      expect.objectContaining({
        visibility: 'private',
      }),
    );
  });

  it('allows staff to create team views', async () => {
    mockStaffScope();
    const { ctx, insert } = makeCtx();

    await handlers.saveView(ctx, {
      name: 'Team View',
      type: 'list',
      state: {},
      visibility: 'team',
    });

    expect(insert).toHaveBeenCalledWith(
      'taskViews',
      expect.objectContaining({
        visibility: 'team',
      }),
    );
  });

  it('rejects non-staff creating team views', async () => {
    mockStaffScope({ isStaff: false });
    const { ctx } = makeCtx();

    await expect(
      handlers.saveView(ctx, {
        name: 'Team View',
        type: 'list',
        state: {},
        visibility: 'team',
      }),
    ).rejects.toThrow('admins and supervisors');
  });

  it('rejects empty name', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();

    await expect(
      handlers.saveView(ctx, {
        name: '   ',
        type: 'list',
        state: {},
      }),
    ).rejects.toThrow('needs a name');
  });
});

describe('updateView', () => {
  it('updates view name', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(viewDoc());

    await handlers.updateView(ctx, {
      viewId: VIEW_ID,
      name: 'Renamed View',
    });

    expect(patch).toHaveBeenCalledWith(
      VIEW_ID,
      expect.objectContaining({
        name: 'Renamed View',
      }),
    );
  });

  it('updates view state', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(viewDoc());

    await handlers.updateView(ctx, {
      viewId: VIEW_ID,
      state: { view: 'kanban', group: 'status' },
    });

    expect(patch).toHaveBeenCalledWith(
      VIEW_ID,
      expect.objectContaining({
        state: { view: 'kanban', group: 'status' },
      }),
    );
  });

  it('throws for non-existent view', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(handlers.updateView(ctx, { viewId: VIEW_ID, name: 'New' })).rejects.toThrow(
      'not found',
    );
  });

  it('rejects non-owner non-staff editing private view', async () => {
    mockStaffScope({ isStaff: false });
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(viewDoc({ ownerId: 'other-user', visibility: 'private' }));
    // scopeOwnsRecord returns true (same org), but canEditView still denies:
    // not owner + not staff + private view

    await expect(handlers.updateView(ctx, { viewId: VIEW_ID, name: 'Hacked' })).rejects.toThrow(
      'cannot change',
    );
  });

  it('allows staff to edit team views they do not own', async () => {
    mockStaffScope({ isStaff: true });
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(viewDoc({ ownerId: 'other-user', visibility: 'team' }));
    // scopeOwnsRecord returns true (same org), canEditView allows staff on team views

    await handlers.updateView(ctx, {
      viewId: VIEW_ID,
      name: 'Updated by staff',
    });

    expect(patch).toHaveBeenCalled();
  });
});

describe('deleteView', () => {
  it('deletes the view', async () => {
    mockStaffScope();
    const { ctx, remove } = makeCtx();
    ctx.db.get.mockResolvedValue(viewDoc());

    await handlers.deleteView(ctx, { viewId: VIEW_ID });

    expect(remove).toHaveBeenCalledWith(VIEW_ID);
  });

  it('clears project defaultViewId if it points to deleted view', async () => {
    mockStaffScope();
    const { ctx, remove, patch } = makeCtx();
    ctx.db.get
      .mockResolvedValueOnce(viewDoc({ projectId: PROJECT_ID }))
      .mockResolvedValueOnce({ _id: PROJECT_ID, defaultViewId: VIEW_ID });

    await handlers.deleteView(ctx, { viewId: VIEW_ID });

    expect(patch).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        defaultViewId: undefined,
      }),
    );
    expect(remove).toHaveBeenCalledWith(VIEW_ID);
  });

  it('does not clear project defaultViewId if different view', async () => {
    mockStaffScope();
    const { ctx, remove, patch } = makeCtx();
    ctx.db.get
      .mockResolvedValueOnce(viewDoc({ projectId: PROJECT_ID }))
      .mockResolvedValueOnce({ _id: PROJECT_ID, defaultViewId: 'other-view' });

    await handlers.deleteView(ctx, { viewId: VIEW_ID });

    expect(patch).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(VIEW_ID);
  });
});

describe('setDefaultView', () => {
  it('sets view as default and clears siblings', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(viewDoc({ visibility: 'team' }));
    const sibling = viewDoc({ _id: 'sibling-1', isDefault: true });
    ctx.db.query().withIndex().take.mockResolvedValue([sibling, viewDoc()]);

    await handlers.setDefaultView(ctx, { viewId: VIEW_ID });

    expect(patch).toHaveBeenCalledWith('sibling-1', expect.objectContaining({ isDefault: false }));
    expect(patch).toHaveBeenCalledWith(VIEW_ID, expect.objectContaining({ isDefault: true }));
  });

  it('rejects setting private view as default', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(viewDoc({ visibility: 'private' }));

    await expect(handlers.setDefaultView(ctx, { viewId: VIEW_ID })).rejects.toThrow(
      'Share the view',
    );
  });

  it('throws for non-existent view', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(handlers.setDefaultView(ctx, { viewId: VIEW_ID })).rejects.toThrow('not found');
  });
});

describe('reorderViews', () => {
  it('reorders views and returns count', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    const views = [viewDoc({ _id: 'v1', order: 0 }), viewDoc({ _id: 'v2', order: 1 })];
    ctx.db.query().withIndex().take.mockResolvedValue(views);

    const result = await handlers.reorderViews(ctx, {
      viewIds: ['v2', 'v1'],
    });

    expect(result).toEqual({ moved: expect.any(Number) });
  });

  it('skips views the caller cannot edit', async () => {
    mockStaffScope({ isStaff: false });
    const { ctx, patch } = makeCtx();
    // own view (same owner) → editable
    const own = viewDoc({ _id: 'v1', order: 0, ownerId: USER, visibility: 'team' });
    // other's private view → not editable (not owner, not staff, private)
    const other = viewDoc({ _id: 'v2', order: 1, ownerId: 'other-user', visibility: 'private' });
    ctx.db.query().withIndex().take.mockResolvedValue([own, other]);

    const result = await handlers.reorderViews(ctx, {
      viewIds: ['v1', 'v2'],
    });

    // v1 is editable (owner), v2 is not (private, not owner, not staff)
    // Since view order for v1 is 0, no patch needed (order already 0)
    expect(result.moved).toBe(0);
  });
});
