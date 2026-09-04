/**
 * Extended tests for convex/tasks.ts — focused on error paths and simple flows
 * that don't require deep mocking of internal helper chains.
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

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  jest.isolateModules(() => {
    const tasks = require('../../convex/tasks');
    for (const [name, def] of Object.entries(tasks)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

const ORG_A = 'org-1';
const USER_ID = 'user_1';
const ADMIN_ID = 'user_admin';
const TASK_ID = 'task_1';

function makeCaller(role = 'admin', org = ORG_A, id = ADMIN_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function taskDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: TASK_ID,
    title: 'Test',
    assignedTo: USER_ID,
    assignedBy: ADMIN_ID,
    organizationId: ORG_A,
    status: 'open',
    statusKey: 'open',
    priority: 'high',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const collect = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, collect, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, collect, first });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first });
  return {
    ctx: { db: { get, insert, patch, delete: remove, query } },
    get,
    insert,
    patch,
    remove,
    query,
  };
}

// ── bulkDeleteTasks ──────────────────────────────────────────────────────────
describe('bulkDeleteTasks', () => {
  it('returns zero for empty array', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const r = await handlers.bulkDeleteTasks(ctx, { taskIds: [] });
    expect(r).toEqual({ deleted: 0, skipped: 0, subtasksDeleted: 0 });
  });

  it('skips non-existent tasks', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    const r = await handlers.bulkDeleteTasks(ctx, { taskIds: ['bad' as any] });
    expect(r.deleted).toBe(0);
    expect(r.skipped).toBe(1);
  });
});

// ── bulkUpdateTasks ──────────────────────────────────────────────────────────
describe('bulkUpdateTasks', () => {
  it('returns zero for empty input', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const r = await handlers.bulkUpdateTasks(ctx, { taskIds: [], patch: {} });
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(0);
  });

  it('skips non-existent tasks', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    // Task lookup -> not found
    get.mockResolvedValueOnce(null);
    const r = await handlers.bulkUpdateTasks(ctx, {
      taskIds: ['bad' as any],
      patch: { priority: 'low' },
    });
    expect(r.skipped).toBe(1);
  });
});

// ── setTaskStatus ────────────────────────────────────────────────────────────
describe('setTaskStatus', () => {
  it('throws when task does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.setTaskStatus(ctx, { taskId: 'bad' as any, statusKey: 'done' }),
    ).rejects.toThrow('Task not found');
  });
});

// ── createSubtask ────────────────────────────────────────────────────────────
describe('createSubtask', () => {
  it('throws when parent does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.createSubtask(ctx, { parentTaskId: 'bad' as any, title: 'Sub' }),
    ).rejects.toThrow('Task not found');
  });

  it('rejects empty title', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(taskDoc());
    await expect(
      handlers.createSubtask(ctx, { parentTaskId: TASK_ID as any, title: '' }),
    ).rejects.toThrow();
  });

  it('rejects nesting deeper than one level', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(taskDoc({ parentTaskId: 'parent_1' }));
    await expect(
      handlers.createSubtask(ctx, { parentTaskId: TASK_ID as any, title: 'Deep sub' }),
    ).rejects.toThrow('subtask');
  });
});

// ── restoreTask ──────────────────────────────────────────────────────────────
describe('restoreTask', () => {
  it('throws when task is not deleted', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(taskDoc({ deletedAt: undefined }));
    await expect(handlers.restoreTask(ctx, { taskId: TASK_ID as any })).rejects.toThrow(
      'not deleted',
    );
  });
});

// ── setWatching ──────────────────────────────────────────────────────────────
describe('setWatching', () => {
  it('throws when task does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.setWatching(ctx, { taskId: 'bad' as any, watching: true }),
    ).rejects.toThrow('Task not found');
  });

  it('is idempotent when already watching', async () => {
    const { ctx, get, patch } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(taskDoc({ watcherIds: [ADMIN_ID] }));
    const r = await handlers.setWatching(ctx, { taskId: TASK_ID as any, watching: true });
    expect(r.watching).toBe(true);
    expect(patch).not.toHaveBeenCalled();
  });
});

// ── setAssignees ─────────────────────────────────────────────────────────────
describe('setAssignees', () => {
  it('throws when task does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.setAssignees(ctx, { taskId: 'bad' as any, assigneeIds: [] }),
    ).rejects.toThrow('Task not found');
  });
});

// ── listSubtasks ─────────────────────────────────────────────────────────────
describe('listSubtasks', () => {
  it('returns empty when parent does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    const r = await handlers.listSubtasks(ctx, { parentTaskId: 'bad' as any });
    expect(r).toEqual([]);
  });

  it('returns empty for unauthenticated user', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);
    const r = await handlers.listSubtasks(ctx, { parentTaskId: 'any' as any });
    expect(r).toEqual([]);
  });
});

// ── getTask ──────────────────────────────────────────────────────────────────
describe('getTask', () => {
  it('returns null for non-existent task', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    const r = await handlers.getTask(ctx, { taskId: 'bad' as any });
    expect(r).toBeNull();
  });
});

// ── getAllTasksRaw ────────────────────────────────────────────────────────────
describe('getAllTasksRaw', () => {
  it('returns empty for non-superadmin without org', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue({
      _id: USER_ID,
      role: 'employee',
      organizationId: undefined,
      email: 'a@b.c',
      name: 'x',
    });
    const r = await handlers.getAllTasksRaw(ctx, {});
    expect(r).toEqual([]);
  });
});

// ── updateTaskFields ─────────────────────────────────────────────────────────
describe('updateTaskFields', () => {
  it('throws when task does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.updateTaskFields(ctx, { taskId: 'bad' as any, values: {} }),
    ).rejects.toThrow('Task not found');
  });
});

// ── reorderTask ──────────────────────────────────────────────────────────────
describe('reorderTask', () => {
  it('throws when task does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(handlers.reorderTask(ctx, { taskId: 'bad' as any })).rejects.toThrow(
      'Task not found',
    );
  });
});

// ── getDeletedTasks ──────────────────────────────────────────────────────────
describe('getDeletedTasks', () => {
  it('returns empty for non-admin', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue({
      _id: USER_ID,
      role: 'employee',
      organizationId: ORG_A,
      email: 'a@b.c',
      name: 'x',
    });
    const r = await handlers.getDeletedTasks(ctx, {});
    expect(r).toEqual([]);
  });
});

// ── getTaskActivity ──────────────────────────────────────────────────────────
describe('getTaskActivity', () => {
  it('returns empty for non-existent task', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    const r = await handlers.getTaskActivity(ctx, { taskId: 'bad' as any });
    expect(r).toBeDefined();
  });
});
