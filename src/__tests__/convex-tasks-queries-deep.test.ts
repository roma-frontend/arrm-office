/**
 * Deep coverage tests for convex/tasks.ts query functions.
 * Tests the actual logic paths, not just auth errors.
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
jest.mock('../../convex/lib/auth', () => ({ isSuperadmin: jest.fn(() => false) }));
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn() }));
jest.mock('../../convex/lib/entitlements', () => ({ assertModuleAccess: jest.fn() }));
jest.mock('../../convex/lib/reportingLine', () => ({
  getSubordinateIds: jest.fn(() => Promise.resolve([])),
  resolveSupervisorId: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../convex/lib/points', () => ({
  creditBalance: jest.fn(),
  resolveRecognitionSettings: jest.fn(() => Promise.resolve({ attendanceReward: 0 })),
}));
jest.mock('../../convex/lib/systemAccounts', () => ({
  isSystemAccountEmail: jest.fn(() => false),
}));

let handlers: Record<string, any> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/tasks');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
        handlers[name] = (def as any).handler;
    }
  });
});

function makeCtx(tables: Record<string, any[]> = {}) {
  const get = jest.fn();
  let queryIdx = 0;
  const db: any = {
    get,
    insert: jest.fn().mockResolvedValue('new_id'),
    patch: jest.fn().mockResolvedValue(undefined),
    query: jest.fn((table: string) => {
      const rows = tables[table] ?? [];
      let filters: Record<string, any> = {};
      const chain: any = {
        withIndex: (idxName: string, cb: any) => {
          const cap = {
            eq: (k: string, v: any) => {
              filters[k] = v;
              return cap;
            },
            gt: () => cap,
            gte: () => cap,
            lt: () => cap,
            lte: () => cap,
          };
          if (cb) cb(cap);
          return chain;
        },
        filter: (cb: any) => chain,
        gt: () => chain,
        gte: () => chain,
        lt: () => chain,
        lte: () => chain,
        eq: (k: string, v: any) => {
          filters[k] = v;
          return chain;
        },
        order: () => chain,
        take: jest.fn().mockResolvedValue(
          rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            return true;
          }),
        ),
        first: jest.fn().mockResolvedValue(
          rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            return true;
          })[0] ?? null,
        ),
      };
      return chain;
    }),
  };
  return { ctx: { db }, get, db };
}

describe('tasks queries (deep)', () => {
  describe('getTasksForEmployee', () => {
    it('throws when employee not found', async () => {
      const { ctx } = makeCtx({});
      await expect(handlers.getTasksForEmployee(ctx, { userId: 'u_x' as any })).rejects.toThrow(
        'Employee not found',
      );
    });

    it('returns tasks for an employee', async () => {
      const { ctx, db } = makeCtx({
        tasks: [
          {
            _id: 't1',
            assignedTo: 'u1',
            assignedBy: 'u2',
            organizationId: 'org1',
            title: 'Task 1',
            createdAt: 100,
            status: 'pending',
          },
        ],
      });
      db.get.mockResolvedValue({
        _id: 'u1',
        name: 'Alice',
        role: 'employee',
        organizationId: 'org1',
      });
      const result = await handlers.getTasksForEmployee(ctx, { userId: 'u1' as any });
      expect(Array.isArray(result)).toBe(true);
    });

    it('filters out soft-deleted tasks', async () => {
      const { ctx, db } = makeCtx({
        tasks: [
          {
            _id: 't1',
            assignedTo: 'u1',
            assignedBy: 'u2',
            organizationId: 'org1',
            title: 'Active',
            createdAt: 100,
            status: 'pending',
          },
          {
            _id: 't2',
            assignedTo: 'u1',
            assignedBy: 'u2',
            organizationId: 'org1',
            title: 'Deleted',
            createdAt: 200,
            status: 'pending',
            deletedAt: 300,
          },
        ],
      });
      db.get.mockResolvedValue({
        _id: 'u1',
        name: 'Alice',
        role: 'employee',
        organizationId: 'org1',
      });
      const result = await handlers.getTasksForEmployee(ctx, { userId: 'u1' as any });
      expect(result.length).toBe(1);
    });
  });

  describe('getAllTasks', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      const result = await handlers.getAllTasks(ctx, {});
      expect(result).toEqual([]);
    });

    it('throws for non-admin', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'employee', organizationId: 'org1' });
      const { ctx } = makeCtx({});
      await expect(handlers.getAllTasks(ctx, {})).rejects.toThrow('Only admins');
    });
  });

  describe('getDeletedTasks', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      const result = await handlers.getDeletedTasks(ctx, {});
      expect(result).toEqual([]);
    });

    it('returns deleted tasks for admin', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const { ctx } = makeCtx({
        tasks: [
          {
            _id: 't1',
            assignedTo: 'u1',
            assignedBy: 'u2',
            organizationId: 'org1',
            title: 'Deleted',
            deletedAt: 100,
            createdAt: 50,
            status: 'completed',
          },
        ],
      });
      const result = await handlers.getDeletedTasks(ctx, {});
      expect(result).toBeDefined();
    });
  });

  describe('getTaskActivity', () => {
    it('returns activity logs for a task', async () => {
      const { ctx, db } = makeCtx({
        auditLogs: [
          { _id: 'a1', target: 't1', userId: 'u1', action: 'task_created', createdAt: 100 },
        ],
      });
      db.get.mockResolvedValue({ _id: 'u1', name: 'Alice' });
      const result = await handlers.getTaskActivity(ctx, { taskId: 't1' });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].user.name).toBe('Alice');
    });

    it('returns empty for task with no logs', async () => {
      const { ctx } = makeCtx({ auditLogs: [] });
      const result = await handlers.getTaskActivity(ctx, { taskId: 't_x' });
      expect(result).toEqual([]);
    });
  });

  describe('getTeamTasks', () => {
    it('returns tasks for supervisor team', async () => {
      const { ctx, db } = makeCtx({
        users: [{ _id: 'emp1', supervisorId: 'sup1', organizationId: 'org1' }],
        tasks: [
          {
            _id: 't1',
            assignedTo: 'emp1',
            assignedBy: 'sup1',
            organizationId: 'org1',
            title: 'Team Task',
            createdAt: 100,
            status: 'pending',
          },
        ],
      });
      db.get.mockResolvedValue(null);
      const result = await handlers.getTeamTasks(ctx, { supervisorId: 'sup1' as any });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getMyEmployees', () => {
    it('returns employees for a supervisor', async () => {
      const { ctx, db } = makeCtx({
        users: [
          {
            _id: 'emp1',
            supervisorId: 'sup1',
            organizationId: 'org1',
            name: 'Employee 1',
            role: 'employee',
            isActive: true,
          },
        ],
      });
      db.get.mockResolvedValue({ _id: 'sup1', organizationId: 'org1', role: 'admin' });
      const result = await handlers.getMyEmployees(ctx, {});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getUsersForAssignment', () => {
    it('returns users for assignment', async () => {
      const { ctx, db } = makeCtx({
        users: [
          {
            _id: 'u1',
            organizationId: 'org1',
            name: 'User 1',
            role: 'employee',
            isActive: true,
            email: 'u1@test.com',
          },
        ],
      });
      db.get.mockResolvedValue({ _id: 'caller', organizationId: 'org1', role: 'admin' });
      const result = await handlers.getUsersForAssignment(ctx, {});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('sendDeadlineReminders', () => {
    it('does not throw', async () => {
      const { ctx, db } = makeCtx({
        tasks: [
          {
            _id: 't1',
            assignedTo: 'u1',
            organizationId: 'org1',
            title: 'Due Task',
            deadline: Date.now() + 86400000,
            status: 'pending',
          },
        ],
      });
      db.get.mockResolvedValue({ _id: 'u1', name: 'Alice', organizationId: 'org1' });
      await expect(handlers.sendDeadlineReminders(ctx, {})).resolves.not.toThrow();
    });
  });
});
