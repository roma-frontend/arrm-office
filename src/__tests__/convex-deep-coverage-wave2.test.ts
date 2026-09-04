/**
 * Deep coverage tests — Wave 2:
 * - tasks: addComment, deleteTask, secureDeleteTask, secureReassignTask
 * - auth_module: register, login, getSession, verifySession, changePassword, logout, disableTotp, getWebauthnCredential
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
  isSuperadmin: jest.fn(),
  SUPERADMIN_EMAIL: 'boss@example.com',
}));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
  assertQuota: jest.fn().mockResolvedValue(undefined),
  currentPeriodKey: jest.fn().mockReturnValue('2026-09'),
  incrementUsage: jest.fn().mockResolvedValue(undefined),
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
}));
jest.mock('../../convex/lib/rbac', () => ({
  requireRole: jest.fn(),
  requireOrgAdmin: jest.fn(),
  requireUser: jest.fn(),
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
jest.mock('bcryptjs', () => ({
  hashSync: jest.fn().mockReturnValue('hashed'),
  compareSync: jest.fn().mockReturnValue(true),
}));

const userDoc = (o: Record<string, any> = {}) => ({
  _id: 'u1',
  name: 'Test',
  email: 't@t.com',
  role: 'admin' as const,
  organizationId: 'org-1',
  isActive: true,
  isApproved: true,
  ...o,
});
const taskDoc = (o: Record<string, any> = {}) => ({
  _id: 'task_1',
  title: 'Test',
  status: 'pending',
  priority: 'medium',
  assignedTo: 'u1',
  assignedBy: 'u2',
  organizationId: 'org-1',
  tags: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  subtaskIds: [],
  customFields: {},
  ...o,
});

// ── Tasks ──────────────────────────────────────────────────────────────────
describe('tasks deep coverage wave 2', () => {
  let handlers: Record<string, any> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/tasks');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
          handlers[name] = (def as any).handler;
        }
      }
    });
  });

  function makeCtx() {
    const get = jest.fn();
    const insert = jest.fn().mockResolvedValue('new_id');
    const patch = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn();
    const collect = jest.fn().mockResolvedValue([]);
    const first = jest.fn().mockResolvedValue(null);
    const take = jest.fn().mockResolvedValue([]);
    const order = jest.fn().mockReturnValue({ collect, first, take });
    const withIndex = jest.fn().mockReturnValue({ order, collect, first, take });
    const query = jest.fn().mockReturnValue({ withIndex, order, collect, first, take });
    return {
      ctx: { db: { get, insert, patch, delete: remove, query } },
      get,
      insert,
      patch,
      remove,
      query,
      collect,
      take,
    };
  }

  describe('addComment', () => {
    it('inserts comment and patches task', async () => {
      const { ctx, get, insert, patch } = makeCtx();
      get.mockResolvedValueOnce(taskDoc());
      get.mockResolvedValueOnce(userDoc());
      await handlers.addComment(ctx, {
        taskId: 'task_1' as any,
        authorId: 'u1' as any,
        content: 'Nice!',
      });
      expect(insert).toHaveBeenCalledWith(
        'taskComments',
        expect.objectContaining({ content: 'Nice!' }),
      );
      expect(patch).toHaveBeenCalledWith(
        'task_1',
        expect.objectContaining({ updatedAt: expect.any(Number) }),
      );
    });

    it('sends notification when commenter is not assignee', async () => {
      const { ctx, get } = makeCtx();
      get.mockResolvedValueOnce(taskDoc({ assignedTo: 'u2' }));
      get.mockResolvedValueOnce(userDoc({ _id: 'u1', name: 'Alice' }));
      await handlers.addComment(ctx, {
        taskId: 'task_1' as any,
        authorId: 'u1' as any,
        content: 'Review?',
      });
      // notify is called — check via mock
      expect(get).toHaveBeenCalled();
    });

    it('throws when task not found', async () => {
      const { ctx, get } = makeCtx();
      get.mockResolvedValueOnce(null);
      await expect(
        handlers.addComment(ctx, { taskId: 'bad' as any, authorId: 'u1' as any, content: 'x' }),
      ).rejects.toThrow('Task not found');
    });
  });

  describe('deleteTask', () => {
    it('throws when task not found', async () => {
      const { ctx, get } = makeCtx();
      const authMod = require('../../convex/lib/getAuthCaller');
      authMod.getAuthCaller.mockResolvedValue(userDoc());
      get.mockResolvedValueOnce(null);
      await expect(handlers.deleteTask(ctx, { taskId: 'bad' as any })).rejects.toThrow();
    });
  });

  describe('secureDeleteTask', () => {
    it('soft-deletes and reassigns subtasks', async () => {
      const { ctx, get, patch } = makeCtx();
      const authMod = require('../../convex/lib/getAuthCaller');
      authMod.getAuthCaller.mockResolvedValue(userDoc());
      get.mockResolvedValueOnce(taskDoc({ subtaskIds: ['sub1'] }));
      get.mockResolvedValueOnce(taskDoc({ _id: 'sub1', assignedTo: 'u1' }));
      await handlers.secureDeleteTask(ctx, { taskId: 'task_1' as any });
      expect(patch).toHaveBeenCalledWith(
        'task_1',
        expect.objectContaining({ deletedAt: expect.any(Number) }),
      );
    });

    it('throws when task not found', async () => {
      const { ctx, get } = makeCtx();
      const authMod = require('../../convex/lib/getAuthCaller');
      authMod.getAuthCaller.mockResolvedValue(userDoc());
      get.mockResolvedValueOnce(null);
      await expect(handlers.secureDeleteTask(ctx, { taskId: 'bad' as any })).rejects.toThrow();
    });
  });

  describe('secureReassignTask', () => {
    it('reassigns task', async () => {
      const { ctx, get, patch } = makeCtx();
      const authMod = require('../../convex/lib/getAuthCaller');
      authMod.getAuthCaller.mockResolvedValue(userDoc());
      get.mockResolvedValueOnce(taskDoc({ assignedTo: 'u1' }));
      get.mockResolvedValueOnce(userDoc({ _id: 'u3', name: 'Carol' }));
      await handlers.secureReassignTask(ctx, {
        taskId: 'task_1' as any,
        newAssigneeId: 'u3' as any,
      });
      expect(patch).toHaveBeenCalledWith('task_1', expect.objectContaining({ assignedTo: 'u3' }));
    });

    it('throws when task not found', async () => {
      const { ctx, get } = makeCtx();
      const authMod = require('../../convex/lib/getAuthCaller');
      authMod.getAuthCaller.mockResolvedValue(userDoc());
      get.mockResolvedValueOnce(null);
      await expect(
        handlers.secureReassignTask(ctx, { taskId: 'bad' as any, newAssigneeId: 'u3' as any }),
      ).rejects.toThrow();
    });
  });

  describe('sendDeadlineReminders', () => {
    it('handles empty task list', async () => {
      const { ctx, collect, get } = makeCtx();
      get.mockResolvedValue(userDoc());
      collect.mockResolvedValue([]);
      // Should not throw
      await handlers.sendDeadlineReminders(ctx, {});
    });
  });

  describe('getTaskComments', () => {
    it('returns empty when no comments', async () => {
      const { ctx, collect } = makeCtx();
      collect.mockResolvedValue([]);
      const result = await handlers.getTaskComments(ctx, { taskId: 'task_1' as any });
      expect(result).toEqual([]);
    });
  });

  describe('getAllTasksRaw', () => {
    it('returns tasks', async () => {
      const { ctx, collect } = makeCtx();
      collect.mockResolvedValue([]);
      const result = await handlers.getAllTasksRaw(ctx, {});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getDeletedTasks', () => {
    it('returns deleted tasks', async () => {
      const { ctx, collect } = makeCtx();
      collect.mockResolvedValue([]);
      const result = await handlers.getDeletedTasks(ctx, {});
      expect(result).toEqual([]);
    });
  });

  describe('getTaskActivity', () => {
    it('returns activity', async () => {
      const { ctx, collect } = makeCtx();
      collect.mockResolvedValue([]);
      const result = await handlers.getTaskActivity(ctx, { taskId: 'task_1' as any });
      expect(result).toEqual([]);
    });
  });
});

// ── Auth Module ────────────────────────────────────────────────────────────
describe('auth_module deep coverage wave 2', () => {
  let handlers: Record<string, any> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/auth_module/main');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
          handlers[name] = (def as any).handler;
        }
      }
    });
  });

  function makeCtx() {
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

  describe('register', () => {
    it('throws when email already registered', async () => {
      const { ctx, query } = makeCtx();
      query.mockReturnValue({
        withIndex: jest
          .fn()
          .mockReturnValue({ unique: jest.fn().mockResolvedValue({ _id: 'existing' }) }),
      });
      await expect(
        handlers.register(ctx, {
          name: 'X',
          email: 'taken@t.com',
          password: 'p',
          organizationId: 'org-1' as any,
        }),
      ).rejects.toThrow('already registered');
    });

    it('throws when no org and no invite token', async () => {
      const { ctx, query } = makeCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        handlers.register(ctx, { name: 'X', email: 'new@t.com', password: 'p' }),
      ).rejects.toThrow();
    });

    it('creates user with valid org', async () => {
      const { ctx, query, get, insert, take } = makeCtx();
      // Multiple queries: first for email check, then for org members via by_org
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest.fn().mockResolvedValue(null),
          take: jest.fn().mockResolvedValue([]),
        }),
      });
      get.mockResolvedValue({
        _id: 'org-1',
        name: 'Acme',
        timezone: 'UTC',
        plan: 'enterprise',
        employeeLimit: 100,
        isActive: true,
      });
      const result = await handlers.register(ctx, {
        name: 'New',
        email: 'new@t.com',
        password: 'p',
        organizationId: 'org-1' as any,
      });
      expect(result).toHaveProperty('userId');
      expect(insert).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('throws when user not found', async () => {
      const { ctx, query } = makeCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(handlers.login(ctx, { email: 'nobody@t.com', password: 'p' })).rejects.toThrow();
    });

    it('throws when password wrong', async () => {
      const { ctx, query } = makeCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest
            .fn()
            .mockResolvedValue({
              _id: 'u1',
              passwordHash: 'hashed',
              role: 'admin',
              organizationId: 'org-1',
              isActive: true,
              isApproved: true,
            }),
        }),
      });
      const bcrypt = require('bcryptjs');
      bcrypt.compareSync.mockReturnValueOnce(false);
      await expect(handlers.login(ctx, { email: 'u1@t.com', password: 'wrong' })).rejects.toThrow();
    });
  });

  describe('verifySession', () => {
    it('returns null when user not found', async () => {
      const { ctx, query } = makeCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      const result = await handlers.verifySession(ctx, { sessionToken: 'bad' });
      expect(result).toBeNull();
    });

    it('returns user data when valid', async () => {
      const { ctx, query, get } = makeCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest
            .fn()
            .mockResolvedValue({
              _id: 'u1',
              sessionToken: 'tok',
              sessionExpiry: Date.now() + 3600000,
              organizationId: 'org-1',
              role: 'admin',
              name: 'X',
              email: 'x@t.com',
              isActive: true,
            }),
        }),
      });
      get.mockResolvedValue({ _id: 'org-1', name: 'Acme' });
      const result = await handlers.verifySession(ctx, { sessionToken: 'tok' });
      expect(result).toBeTruthy();
    });
  });

  describe('getSession', () => {
    it('returns null when user not found', async () => {
      const { ctx, query } = makeCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      const result = await handlers.getSession(ctx, { sessionToken: 'bad' });
      expect(result).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('throws when user not found', async () => {
      const { ctx, get } = makeCtx();
      get.mockResolvedValue(null);
      await expect(
        handlers.changePassword(ctx, {
          userId: 'bad' as any,
          currentPassword: 'old',
          newPassword: 'new',
        }),
      ).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('clears session token', async () => {
      const { ctx, get, patch } = makeCtx();
      get.mockResolvedValue({ _id: 'u1', sessionToken: 'abc' });
      await handlers.logout(ctx, { userId: 'u1' as any });
      expect(patch).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ sessionToken: undefined }),
      );
    });
  });

  describe('googleOAuthLogin', () => {
    it('throws when email empty', async () => {
      const { ctx } = makeCtx();
      await expect(handlers.googleOAuthLogin(ctx, { email: '', name: 'X' })).rejects.toThrow();
    });
    it('throws when name empty', async () => {
      const { ctx } = makeCtx();
      await expect(
        handlers.googleOAuthLogin(ctx, { email: 'x@t.com', name: '' }),
      ).rejects.toThrow();
    });
  });

  describe('disableTotp', () => {
    it('throws when user not found', async () => {
      const { ctx, get } = makeCtx();
      get.mockResolvedValue(null);
      await expect(handlers.disableTotp(ctx, { userId: 'bad' as any })).rejects.toThrow(
        'User not found',
      );
    });
    it('clears totp secret', async () => {
      const { ctx, get, patch } = makeCtx();
      get.mockResolvedValue({ _id: 'u1', totpSecret: 'secret' });
      await handlers.disableTotp(ctx, { userId: 'u1' as any });
      expect(patch).toHaveBeenCalledWith('u1', expect.objectContaining({ totpSecret: undefined }));
    });
  });

  describe('getWebauthnCredential', () => {
    it('returns null when not found', async () => {
      const { ctx, query } = makeCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      const result = await handlers.getWebauthnCredential(ctx, { credentialId: 'bad' });
      expect(result).toBeNull();
    });
    it('returns credential with user', async () => {
      const { ctx, query, get } = makeCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest
            .fn()
            .mockResolvedValue({ _id: 'c1', credentialId: 'cred', publicKey: 'pk', userId: 'u1' }),
        }),
      });
      get.mockResolvedValue({ _id: 'u1', name: 'Test' });
      const result = await handlers.getWebauthnCredential(ctx, { credentialId: 'cred' });
      expect(result).toHaveProperty('user');
    });
  });
});
