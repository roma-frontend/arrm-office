/**
 * Deep coverage tests — Wave 3:
 * - projects (read-only queries), timeTracking, taskStatuses, recurringTasks,
 *   documents, orgchart, auth_module (queries + simple mutations)
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

jest.mock('../../convex/lib/getAuthCaller', () => ({ getAuthCaller: jest.fn() }));
jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(() => false),
  SUPERADMIN_EMAIL: 'boss@example.com',
}));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
  assertQuota: jest.fn().mockResolvedValue(undefined),
  currentPeriodKey: jest.fn().mockReturnValue('2026-09'),
  incrementUsage: jest.fn().mockResolvedValue(undefined),
  decrementUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn().mockResolvedValue(null),
  patchProfile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn().mockResolvedValue({ paid: 0, sick: 0, family: 0 }),
}));
jest.mock('../../convex/lib/orgUnits', () => ({
  resolveOrgUnitsByName: jest.fn().mockResolvedValue({}),
  resolveDepartmentByName: jest.fn().mockResolvedValue(null),
  resolvePositionByTitle: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../convex/lib/travelAllowance', () => ({
  resolveTravelAllowanceForOrg: jest.fn().mockResolvedValue(0),
  resolveTravelAllowanceForUser: jest.fn().mockResolvedValue(0),
  validateTravelAllowanceOverride: jest.fn().mockReturnValue(true),
}));
jest.mock('../../convex/lib/reportingLine', () => ({
  assertAssignable: jest.fn().mockResolvedValue(undefined),
  writeSupervisorId: jest.fn().mockResolvedValue(undefined),
  getSubordinateIds: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../convex/lib/rbac', () => ({
  requireRole: jest.fn(),
  requireOrgAdmin: jest.fn(),
  requireUser: jest.fn(),
  canAccessUser: jest.fn().mockResolvedValue(true),
  canManageOrg: jest.fn().mockReturnValue(true),
}));
jest.mock('../../convex/superadmin/accessTokens', () => ({
  checkTempAccessStillValid: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../convex/superadmin/tempPasswords', () => ({
  notifyTempPasswordLogin: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/chat/queries', () => ({
  isFeatureEnabledForCaller: jest.fn().mockResolvedValue(true),
}));

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn();
  const collect = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const take = jest.fn().mockResolvedValue([]);
  const unique = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ collect, first, take });
  const withIndex = jest.fn().mockReturnValue({ order, collect, first, take, unique });
  const query = jest.fn().mockReturnValue({ withIndex, order, collect, first, take, unique });
  return {
    ctx: { db: { get, insert, patch, delete: remove, query } },
    get,
    insert,
    patch,
    remove,
    query,
    collect,
    take,
    unique,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS (read-only)
// ═══════════════════════════════════════════════════════════════════════════
describe('projects coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/projects');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
          h[name] = (def as any).handler;
      }
    });
  });

  it('listProjects returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([{ _id: 'p1', name: 'Alpha', status: 'active', memberIds: [] }]);
    const result = await h.listProjects(ctx, { organizationId: 'org-1' as any });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getProject returns project', async () => {
    const { ctx, get, collect } = makeCtx();
    get.mockResolvedValue({
      _id: 'p1',
      name: 'Alpha',
      status: 'active',
      tags: [],
      memberIds: [],
      organizationId: 'org-1',
    });
    collect.mockResolvedValue([]);
    const result = await h.getProject(ctx, { projectId: 'p1' as any });
    expect(result).toBeDefined();
  });

  it('getProject returns null for missing', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValue(null);
    const result = await h.getProject(ctx, { projectId: 'bad' as any });
    expect(result).toBeNull();
  });

  it('listTemplates returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.listTemplates(ctx, { organizationId: 'org-1' as any });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getProjectStats returns stats', async () => {
    const { ctx, get, collect } = makeCtx();
    get.mockResolvedValue({ _id: 'p1', memberIds: [], name: 'X' });
    collect.mockResolvedValue([]);
    const result = await h.getProjectStats(ctx, { projectId: 'p1' as any });
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TIME TRACKING
// ═══════════════════════════════════════════════════════════════════════════
describe('timeTracking coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/timeTracking');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
          h[name] = (def as any).handler;
      }
    });
  });

  it('getCurrentlyAtWork returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.getCurrentlyAtWork(ctx, { organizationId: 'org-1' as any });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getTodayAllAttendance returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.getTodayAllAttendance(ctx, { organizationId: 'org-1' as any });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAllEmployeesAttendanceOverview returns overview', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.getAllEmployeesAttendanceOverview(ctx, {
      organizationId: 'org-1' as any,
    });
    expect(result).toBeDefined();
  });

  it('getEmployeeAttendanceHistory returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.getEmployeeAttendanceHistory(ctx, {
      userId: 'u1' as any,
      organizationId: 'org-1' as any,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK STATUSES
// ═══════════════════════════════════════════════════════════════════════════
describe('taskStatuses coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/taskStatuses');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
          h[name] = (def as any).handler;
      }
    });
  });

  it('resolveForProject returns default statuses', async () => {
    const { ctx, get, collect } = makeCtx();
    collect.mockResolvedValue([
      { _id: 'default', statuses: [{ key: 'todo', label: 'To Do', order: 0 }], isDefault: true },
    ]);
    get.mockResolvedValue(null);
    const result = await h.resolveForProject(ctx, { organizationId: 'org-1' as any });
    expect(result).toHaveProperty('statuses');
  });

  it('resolveForProject with project-specific', async () => {
    const { ctx, get, collect } = makeCtx();
    get.mockResolvedValue({ _id: 'p1', statusSetId: 'ss1' });
    collect.mockResolvedValue([{ _id: 'ss1', statuses: [{ key: 'wip', label: 'WIP', order: 0 }] }]);
    const result = await h.resolveForProject(ctx, {
      organizationId: 'org-1' as any,
      projectId: 'p1' as any,
    });
    expect(result).toHaveProperty('statuses');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RECURRING TASKS (read-only)
// ═══════════════════════════════════════════════════════════════════════════
describe('recurringTasks coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/recurringTasks');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
          h[name] = (def as any).handler;
      }
    });
  });

  it('listRecurringTasks returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.listRecurringTasks(ctx, { organizationId: 'org-1' as any });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getRecurringTaskOccurrences returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.getRecurringTaskOccurrences(ctx, { recurringTaskId: 'rt1' as any });
    expect(Array.isArray(result)).toBe(true);
  });

  // listRecurringTaskComments skipped: requires auth inside isolateModules
});

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS (read-only)
// ═══════════════════════════════════════════════════════════════════════════
describe('documents coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/documents');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
          h[name] = (def as any).handler;
      }
    });
  });

  // listDocuments skipped: requires auth inside isolateModules

  it('getDocumentById returns document', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValue({ _id: 'd1', title: 'Handbook', organizationId: 'org-1' });
    const result = await h.getDocumentById(ctx, { documentId: 'd1' as any });
    expect(result).toBeDefined();
  });

  // getDocumentCategories skipped: requires auth inside isolateModules
});

// ═══════════════════════════════════════════════════════════════════════════
// ORGCHART
// ═══════════════════════════════════════════════════════════════════════════
describe('orgchart coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/orgchart');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
          h[name] = (def as any).handler;
      }
    });
  });

  it('getOrgChartTree returns tree', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.getOrgChartTree(ctx, { organizationId: 'org-1' as any });
    expect(result).toBeDefined();
  });

  it('getLayouts returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.getLayouts(ctx, { organizationId: 'org-1' as any });
    expect(Array.isArray(result)).toBe(true);
  });

  it('debugOrgChart returns debug', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.debugOrgChart(ctx, { organizationId: 'org-1' as any });
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MODULE — queries
// ═══════════════════════════════════════════════════════════════════════════
describe('auth_module extra coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/auth_module/main');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
          h[name] = (def as any).handler;
      }
    });
  });

  function makeAuthCtx() {
    const get = jest.fn();
    const insert = jest.fn().mockResolvedValue('new_id');
    const patch = jest.fn().mockResolvedValue(undefined);
    const collect = jest.fn().mockResolvedValue([]);
    const first = jest.fn().mockResolvedValue(null);
    const take = jest.fn().mockResolvedValue([]);
    const unique = jest.fn().mockResolvedValue(null);
    const order = jest.fn().mockReturnValue({ collect, first, take });
    const withIndex = jest.fn().mockReturnValue({ order, collect, first, take, unique });
    const query = jest.fn().mockReturnValue({ withIndex, order, collect, first, take, unique });
    return { ctx: { db: { get, insert, patch, query } }, get, insert, patch, query, unique };
  }

  it('googleOAuthLogin returns existing user', async () => {
    const { ctx, query, get } = makeAuthCtx();
    const existing = {
      _id: 'u1',
      email: 'google@t.com',
      name: 'G',
      role: 'admin',
      organizationId: 'org-1',
      isActive: true,
      isApproved: true,
    };
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(existing) }),
    });
    get.mockResolvedValue({
      _id: 'org-1',
      name: 'Acme',
      timezone: 'UTC',
      plan: 'enterprise',
      employeeLimit: 100,
      isActive: true,
    });
    const result = await h.googleOAuthLogin(ctx, { email: 'google@t.com', name: 'G' });
    expect(result).toHaveProperty('userId');
  });

  it('registerWebauthn registers credential', async () => {
    const { ctx, query, insert } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    await h.registerWebauthn(ctx, {
      userId: 'u1' as any,
      credentialId: 'new-cred',
      publicKey: 'pk',
      counter: 0,
    });
    expect(insert).toHaveBeenCalled();
  });

  it('loginWebauthn logs in', async () => {
    const { ctx, query, get, patch } = makeAuthCtx();
    const cred = { _id: 'c1', credentialId: 'cred', publicKey: 'pk', counter: 0, userId: 'u1' };
    const user = {
      _id: 'u1',
      name: 'Test',
      email: 't@t.com',
      role: 'admin',
      organizationId: 'org-1',
      isActive: true,
      isApproved: true,
    };
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(cred) }),
    });
    get.mockResolvedValue(user);
    const result = await h.loginWebauthn(ctx, { credentialId: 'cred', counter: 1 });
    expect(result).toHaveProperty('userId');
  });

  it('register throws for duplicate email', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest
        .fn()
        .mockReturnValue({ unique: jest.fn().mockResolvedValue({ _id: 'existing' }) }),
    });
    await expect(
      h.register(ctx, {
        name: 'X',
        email: 'taken@t.com',
        password: 'p',
        organizationId: 'org-1' as any,
      }),
    ).rejects.toThrow('already registered');
  });

  // login-wrong-password skipped: bcrypt mock not available inside isolateModules

  it('verifySession returns null for bad token', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await h.verifySession(ctx, { sessionToken: 'bad' });
    expect(result).toBeNull();
  });

  it('getSession returns null for bad token', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await h.getSession(ctx, { sessionToken: 'bad' });
    expect(result).toBeNull();
  });

  it('disableTotp clears totp secret', async () => {
    const { ctx, get, patch } = makeAuthCtx();
    get.mockResolvedValue({ _id: 'u1', totpSecret: 'secret' });
    await h.disableTotp(ctx, { userId: 'u1' as any });
    expect(patch).toHaveBeenCalledWith('u1', expect.objectContaining({ totpSecret: undefined }));
  });

  it('disableTotp throws for missing user', async () => {
    const { ctx, get } = makeAuthCtx();
    get.mockResolvedValue(null);
    await expect(h.disableTotp(ctx, { userId: 'bad' as any })).rejects.toThrow('User not found');
  });

  it('getWebauthnCredential returns null', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await h.getWebauthnCredential(ctx, { credentialId: 'bad' });
    expect(result).toBeNull();
  });

  it('getWebauthnCredential returns credential', async () => {
    const { ctx, query, get } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest
          .fn()
          .mockResolvedValue({ _id: 'c1', credentialId: 'cred', publicKey: 'pk', userId: 'u1' }),
      }),
    });
    get.mockResolvedValue({ _id: 'u1', name: 'Test' });
    const result = await h.getWebauthnCredential(ctx, { credentialId: 'cred' });
    expect(result).toHaveProperty('user');
  });

  it('logout clears session', async () => {
    const { ctx, get, patch } = makeAuthCtx();
    get.mockResolvedValue({ _id: 'u1', sessionToken: 'abc' });
    await h.logout(ctx, { userId: 'u1' as any });
    expect(patch).toHaveBeenCalledWith('u1', expect.objectContaining({ sessionToken: undefined }));
  });

  it('googleOAuthLogin throws when email empty', async () => {
    const { ctx } = makeAuthCtx();
    await expect(h.googleOAuthLogin(ctx, { email: '', name: 'X' })).rejects.toThrow();
  });
});
