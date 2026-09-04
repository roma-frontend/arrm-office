/**
 * Deep coverage tests for convex/tasks.ts
 * Targets: addAttachment, removeAttachment, getTaskComments, listCommentsPaginated,
 * backfillTaskOrg, getAllTasksRaw, getTask, secureDeleteTask, secureReassignTask.
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
jest.mock('../../convex/lib/auth', () => ({ isSuperadmin: jest.fn() }));
jest.mock('../../convex/lib/userProfile', () => ({ getProfile: jest.fn() }));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn() }));
jest.mock('../../convex/lib/entitlements', () => ({ assertModuleAccess: jest.fn() }));

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

function makeCtx(opts: { user?: any; task?: any; comments?: any[] } = {}) {
  const get = jest.fn();
  const paginate = jest
    .fn()
    .mockResolvedValue({ page: opts.comments ?? [], isDone: true, continueCursor: null });
  const db: any = {
    get,
    insert: jest.fn().mockResolvedValue('new_id'),
    patch: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(() => ({
      withIndex: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null),
        filter: jest.fn(() => ({
          first: jest.fn().mockResolvedValue(null),
          take: jest.fn().mockResolvedValue([]),
        })),
        take: jest.fn().mockResolvedValue(opts.comments ?? []),
        order: jest.fn(() => ({
          take: jest.fn().mockResolvedValue(opts.comments ?? []),
          paginate,
        })),
        paginate,
      })),
      take: jest.fn().mockResolvedValue([]),
    })),
  };
  // get() returns different things based on call order
  if (opts.task) get.mockResolvedValue(opts.task);
  else get.mockResolvedValue(null);
  return { ctx: { db }, get, db };
}

describe('tasks (deep coverage)', () => {
  describe('getTask', () => {
    it('returns null when task not found', async () => {
      const { ctx } = makeCtx({});
      const result = await handlers.getTask(ctx, { taskId: 'task_x' as any });
      expect(result).toBeNull();
    });

    it('returns task with assigned user info', async () => {
      const task = {
        _id: 't1',
        title: 'Test',
        assignedTo: 'u1',
        assignedBy: 'u2',
        organizationId: 'org1',
        assigneeIds: [],
        watcherIds: [],
      };
      const user1 = {
        _id: 'u1',
        name: 'Alice',
        role: 'employee',
        department: 'Eng',
        position: 'Dev',
      };
      const user2 = {
        _id: 'u2',
        name: 'Bob',
        role: 'admin',
        department: 'HR',
        position: 'Manager',
      };
      const { ctx, db } = makeCtx({ task });
      let callCount = 0;
      db.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return task;
        if (callCount === 2) return user1;
        if (callCount === 3) return user2;
        return null;
      });
      const result = await handlers.getTask(ctx, { taskId: 't1' as any });
      expect(result).not.toBeNull();
      expect(result.title).toBe('Test');
    });
  });

  describe('getAllTasksRaw', () => {
    it('returns all tasks', async () => {
      const { ctx } = makeCtx({});
      const result = await handlers.getAllTasksRaw(ctx, {});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getTaskComments', () => {
    it('returns empty for task with no comments', async () => {
      const { ctx } = makeCtx({ comments: [] });
      const result = await handlers.getTaskComments(ctx, { taskId: 't1' as any });
      expect(result).toEqual([]);
    });

    it('returns comments with authors', async () => {
      const comments = [{ _id: 'c1', taskId: 't1', authorId: 'u1', text: 'Hello', createdAt: 100 }];
      const user = { _id: 'u1', name: 'Alice' };
      const { ctx, db } = makeCtx({ comments });
      let callCount = 0;
      db.get.mockImplementation(() => {
        callCount++;
        return user;
      });
      const result = await handlers.getTaskComments(ctx, { taskId: 't1' as any });
      expect(result.length).toBe(1);
      expect(result[0].author).toBeDefined();
    });
  });

  describe('backfillTaskOrg', () => {
    it('patches task organizationId', async () => {
      const { ctx, db } = makeCtx({});
      await handlers.backfillTaskOrg(ctx, {
        taskId: 't1' as any,
        organizationId: 'org1' as any,
      });
      expect(db.patch).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({
          organizationId: 'org1',
        }),
      );
    });
  });

  describe('secureDeleteTask', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(handlers.secureDeleteTask(ctx, { taskId: 't1' as any })).rejects.toThrow(
        'Not authenticated',
      );
    });

    it('throws when task not found', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const { ctx } = makeCtx({});
      await expect(handlers.secureDeleteTask(ctx, { taskId: 't1' as any })).rejects.toThrow(
        'Task not found',
      );
    });

    it('throws for cross-org access', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org_other' });
      const task = { _id: 't1', title: 'Test', organizationId: 'org1' };
      const { ctx, db } = makeCtx({ task });
      db.get.mockResolvedValue(task);
      await expect(handlers.secureDeleteTask(ctx, { taskId: 't1' as any })).rejects.toThrow(
        'cross-organization',
      );
    });

    it('soft-deletes task successfully', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const task = { _id: 't1', title: 'Test', organizationId: 'org1' };
      const { ctx, db } = makeCtx({ task });
      db.get.mockResolvedValue(task);
      await handlers.secureDeleteTask(ctx, { taskId: 't1' as any });
      expect(db.patch).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ deletedAt: expect.any(Number) }),
      );
    });
  });

  describe('secureReassignTask', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        handlers.secureReassignTask(ctx, { taskId: 't1' as any, newAssigneeId: 'u2' as any }),
      ).rejects.toThrow('Not authenticated');
    });

    it('throws when task not found', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const { ctx } = makeCtx({});
      await expect(
        handlers.secureReassignTask(ctx, { taskId: 't1' as any, newAssigneeId: 'u2' as any }),
      ).rejects.toThrow('Task not found');
    });

    it('reassigns task successfully', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({
        _id: 'u1',
        name: 'Admin',
        role: 'admin',
        organizationId: 'org1',
      });
      const task = { _id: 't1', title: 'Test', organizationId: 'org1', assignedTo: 'u_old' };
      const { ctx, db } = makeCtx({ task });
      db.get.mockResolvedValue(task);
      await handlers.secureReassignTask(ctx, { taskId: 't1' as any, newAssigneeId: 'u2' as any });
      expect(db.patch).toHaveBeenCalledWith('t1', expect.objectContaining({ assignedTo: 'u2' }));
    });
  });

  describe('addAttachment', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        handlers.addAttachment(ctx, {
          taskId: 't1' as any,
          url: 'file.pdf',
          name: 'doc.pdf',
          type: 'application/pdf',
          size: 1024,
        }),
      ).rejects.toThrow();
    });

    it('throws when uploadedBy mismatches caller', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'employee', organizationId: 'org1' });
      const task = {
        _id: 't1',
        organizationId: 'org1',
        assignedTo: 'u1',
        assignedBy: 'u1',
        attachments: [],
      };
      const { ctx, db } = makeCtx({ task });
      db.get.mockResolvedValue(task);
      await expect(
        handlers.addAttachment(ctx, {
          taskId: 't1' as any,
          url: 'file.pdf',
          name: 'doc.pdf',
          type: 'application/pdf',
          size: 1024,
          uploadedBy: 'u_other' as any,
        }),
      ).rejects.toThrow();
    });

    it('throws when task not found', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const { ctx, db } = makeCtx({});
      db.get.mockResolvedValue(null);
      await expect(
        handlers.addAttachment(ctx, {
          taskId: 't1' as any,
          url: 'file.pdf',
          name: 'doc.pdf',
          type: 'application/pdf',
          size: 1024,
        }),
      ).rejects.toThrow();
    });

    it('adds attachment successfully', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const task = {
        _id: 't1',
        organizationId: 'org1',
        assignedTo: 'u1',
        assignedBy: 'u1',
        attachments: [],
      };
      const { ctx, db } = makeCtx({ task });
      db.get.mockResolvedValue(task);
      const result = await handlers.addAttachment(ctx, {
        taskId: 't1' as any,
        url: 'file.pdf',
        name: 'doc.pdf',
        type: 'application/pdf',
        size: 1024,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('removeAttachment', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        handlers.removeAttachment(ctx, { taskId: 't1' as any, url: 'file.pdf' }),
      ).rejects.toThrow();
    });

    it('throws when task not found', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const { ctx, db } = makeCtx({});
      db.get.mockResolvedValue(null);
      await expect(
        handlers.removeAttachment(ctx, { taskId: 't1' as any, url: 'file.pdf' }),
      ).rejects.toThrow();
    });

    it('throws when attachment not found', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const task = {
        _id: 't1',
        organizationId: 'org1',
        assignedTo: 'u1',
        assignedBy: 'u1',
        attachments: [],
      };
      const { ctx, db } = makeCtx({ task });
      db.get.mockResolvedValue(task);
      await expect(
        handlers.removeAttachment(ctx, { taskId: 't1' as any, url: 'nonexistent.pdf' }),
      ).rejects.toThrow();
    });

    it('removes attachment as admin', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const task = {
        _id: 't1',
        organizationId: 'org1',
        assignedTo: 'u1',
        assignedBy: 'u1',
        attachments: [{ url: 'file.pdf', name: 'doc.pdf', uploadedBy: 'u1' }],
      };
      const { ctx, db } = makeCtx({ task });
      db.get.mockResolvedValue(task);
      const result = await handlers.removeAttachment(ctx, { taskId: 't1' as any, url: 'file.pdf' });
      expect(result.success).toBe(true);
    });
  });

  describe('listCommentsPaginated', () => {
    it('returns paginated comments', async () => {
      const { ctx } = makeCtx({ comments: [{ _id: 'c1', authorId: 'u1', text: 'hi' }] });
      const result = await handlers.listCommentsPaginated(ctx, {
        taskId: 't1' as any,
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(result).toBeDefined();
    });
  });
});
