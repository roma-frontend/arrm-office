/**
 * Tests for convex/tasks.ts — task CRUD, comments, attachments, queries and
 * the secured delete/reassign mutations.
 *
 * Pattern: convex-tasks-rbac.test.ts — mock `_generated/server`, getAuthCaller,
 * lib/auth, lib/userProfile and lib/notify; require the module inside
 * jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
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
  getProfile: jest.fn(),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;
let mockNotify: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockGetProfile.mockReset();
  mockNotify.mockReset();
  mockGetProfile.mockResolvedValue(null);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tasks = require('../../convex/tasks');
    for (const [name, def] of Object.entries(tasks)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const TASK_ID = 'task_1';
const USER_ID = 'user_1';
const ADMIN_ID = 'user_admin';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver' = 'employee',
  org: string | undefined = ORG_A,
  id: string = USER_ID,
) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function taskDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: TASK_ID,
    title: 'Build the dashboard',
    description: 'Initial description',
    assignedTo: USER_ID,
    assignedBy: ADMIN_ID,
    organizationId: ORG_A,
    status: 'in_progress',
    priority: 'high',
    ...overrides,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    name: 'Anna',
    email: 'anna@example.com',
    role: 'employee',
    organizationId: ORG_A,
    isActive: true,
    isApproved: true,
    supervisorId: ADMIN_ID,
    ...overrides,
  };
}

/** ctx.db chain that supports withIndex().order().take() and .paginate(). */
function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const paginate = jest.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: null });
  const first = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, paginate, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, paginate, first });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, paginate, first });
  const db = { get, insert, patch, delete: remove, query };
  return {
    ctx: { db },
    get,
    insert,
    patch,
    remove,
    query,
    withIndex,
    order,
    take,
    paginate,
    first,
  };
}

describe('createTask', () => {
  it('creates a task and sanitizes the title', async () => {
    const { ctx, get, insert, patch, remove, query, withIndex, order, take, paginate, first } =
      makeCtx();
    get.mockResolvedValueOnce(userDoc({ role: 'admin', _id: ADMIN_ID, organizationId: ORG_A }));

    const id = await handlers.createTask(ctx, {
      title: '<script>alert(1)</script> Task',
      description: '  desc with <b>html</b>  ',
      assignedTo: USER_ID,
      assignedBy: ADMIN_ID,
      priority: 'high',
      deadline: 123,
      tags: ['a'],
    });

    expect(id).toBe('new_id');
    expect(insert).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({
        title: 'alert(1) Task',
        description: 'desc with html',
        assignedTo: USER_ID,
        assignedBy: ADMIN_ID,
        organizationId: ORG_A,
        status: 'pending',
        priority: 'high',
      }),
    );
  });

  it('notifies the assigner (non-superadmin) and writes an audit log', async () => {
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ role: 'admin', _id: ADMIN_ID }));

    await handlers.createTask(ctx, {
      title: 'T',
      assignedTo: USER_ID,
      assignedBy: ADMIN_ID,
      priority: 'medium',
    });

    expect(mockNotify).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_created', userId: ADMIN_ID }),
    );
  });

  it('skips the notification for a superadmin assigner but still audits', async () => {
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(
      userDoc({ role: 'superadmin', _id: ADMIN_ID, organizationId: ORG_A }),
    );

    await handlers.createTask(ctx, {
      title: 'T',
      assignedTo: USER_ID,
      assignedBy: ADMIN_ID,
      priority: 'low',
    });

    expect(mockNotify).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_created' }),
    );
  });

  it('rejects an objective that does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ role: 'admin', _id: ADMIN_ID }));
    get.mockResolvedValueOnce(null); // objective

    await expect(
      handlers.createTask(ctx, {
        title: 'T',
        assignedTo: USER_ID,
        assignedBy: ADMIN_ID,
        priority: 'high',
        objectiveId: 'objective_1',
      }),
    ).rejects.toThrow('Linked objective not found');
  });

  it('rejects a key result that does not belong to the objective', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ role: 'admin', _id: ADMIN_ID }));
    get.mockResolvedValueOnce({ _id: 'objective_1', title: 'O' }); // objective
    get.mockResolvedValueOnce({ _id: 'kr_1', objectiveId: 'objective_other' }); // key result

    await expect(
      handlers.createTask(ctx, {
        title: 'T',
        assignedTo: USER_ID,
        assignedBy: ADMIN_ID,
        priority: 'high',
        objectiveId: 'objective_1',
        keyResultId: 'kr_1',
      }),
    ).rejects.toThrow('Key result does not belong to the specified objective');
  });

  it('rejects a project from a foreign organization', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ role: 'admin', _id: ADMIN_ID, organizationId: ORG_A }));
    get.mockResolvedValueOnce({ _id: 'project_1', organizationId: ORG_B });

    await expect(
      handlers.createTask(ctx, {
        title: 'T',
        assignedTo: USER_ID,
        assignedBy: ADMIN_ID,
        priority: 'high',
        projectId: 'project_1',
      }),
    ).rejects.toThrow('Project does not belong to your organization');
  });

  it('accepts a project from the same organization', async () => {
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ role: 'admin', _id: ADMIN_ID, organizationId: ORG_A }));
    get.mockResolvedValueOnce({ _id: 'project_1', organizationId: ORG_A });

    await handlers.createTask(ctx, {
      title: 'T',
      assignedTo: USER_ID,
      assignedBy: ADMIN_ID,
      priority: 'high',
      projectId: 'project_1',
    });

    expect(insert).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({ projectId: 'project_1' }),
    );
  });
});

describe('updateTaskStatus', () => {
  it('patches the status and keeps completedAt when not completed', async () => {
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ status: 'pending' }));

    await handlers.updateTaskStatus(ctx, {
      taskId: TASK_ID,
      status: 'in_progress',
      userId: USER_ID,
    });

    expect(patch).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ status: 'in_progress', updatedAt: expect.any(Number) }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_status_updated' }),
    );
  });

  it('sets completedAt when completed and notifies the supervisor', async () => {
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ status: 'in_progress', assignedBy: ADMIN_ID }));
    get.mockResolvedValueOnce(userDoc({ name: 'Anna' })); // employee
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Boss' })); // supervisor

    await handlers.updateTaskStatus(ctx, { taskId: TASK_ID, status: 'completed', userId: USER_ID });

    const patchCall = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(patchCall[1].completedAt).toEqual(expect.any(Number));
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: ADMIN_ID, route: '/tasks' }),
    );
  });

  it('notifies with the review title when status goes to review', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ assignedBy: ADMIN_ID }));
    get.mockResolvedValueOnce(userDoc());
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Boss' }));

    await handlers.updateTaskStatus(ctx, { taskId: TASK_ID, status: 'review', userId: USER_ID });

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ titleKey: 'notifications.titles.taskReadyForReview' }),
    );
  });

  it('skips the notification when the supervisor is a superadmin', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ assignedBy: ADMIN_ID }));
    get.mockResolvedValueOnce(userDoc());
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'superadmin', name: 'Boss' }));

    await handlers.updateTaskStatus(ctx, { taskId: TASK_ID, status: 'completed', userId: USER_ID });

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('throws when the task does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(
      handlers.updateTaskStatus(ctx, { taskId: TASK_ID, status: 'pending', userId: USER_ID }),
    ).rejects.toThrow('Task not found');
  });
});

describe('deleteTask', () => {
  it('deletes comments then the task and audits', async () => {
    const { ctx, get, remove, withIndex, take, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ assignedBy: ADMIN_ID }));
    take.mockResolvedValueOnce([
      { _id: 'comment_1', taskId: TASK_ID, authorId: USER_ID, content: 'c' },
    ]);

    await handlers.deleteTask(ctx, { taskId: TASK_ID });

    expect(remove).toHaveBeenCalledWith('comment_1');
    expect(remove).toHaveBeenCalledWith(TASK_ID);
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_deleted' }),
    );
  });

  it('throws when the task does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(handlers.deleteTask(ctx, { taskId: TASK_ID })).rejects.toThrow('Task not found');
  });
});

describe('addComment', () => {
  it('inserts the comment, touches the task and audits', async () => {
    const { ctx, get, insert, patch } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await handlers.addComment(ctx, { taskId: TASK_ID, authorId: USER_ID, content: 'Nice work' });

    expect(insert).toHaveBeenCalledWith(
      'taskComments',
      expect.objectContaining({ taskId: TASK_ID, authorId: USER_ID, content: 'Nice work' }),
    );
    expect(patch).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ updatedAt: expect.any(Number) }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_comment_added' }),
    );
  });

  it('throws when the task does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(
      handlers.addComment(ctx, { taskId: TASK_ID, authorId: USER_ID, content: 'x' }),
    ).rejects.toThrow('Task not found');
  });
});

describe('assignSupervisor', () => {
  it('patches the supervisorId and audits with the employee org', async () => {
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_A }));

    await handlers.assignSupervisor(ctx, { employeeId: USER_ID, supervisorId: ADMIN_ID });

    expect(patch).toHaveBeenCalledWith(USER_ID, { supervisorId: ADMIN_ID });
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'task_supervisor_assigned',
        organizationId: ORG_A,
        userId: ADMIN_ID,
      }),
    );
  });

  it('falls back to the employee id when no supervisor is given', async () => {
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc());

    await handlers.assignSupervisor(ctx, { employeeId: USER_ID });

    expect(patch).toHaveBeenCalledWith(USER_ID, { supervisorId: undefined });
    expect(insert).toHaveBeenCalledWith('auditLogs', expect.objectContaining({ userId: USER_ID }));
  });
});

describe('getTasksForEmployee', () => {
  it('throws for a missing employee', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(handlers.getTasksForEmployee(ctx, { userId: USER_ID })).rejects.toThrow(
      'Employee not found',
    );
  });

  it('returns enriched tasks for a regular employee (org-filtered)', async () => {
    const { ctx, get, query, withIndex, order, take } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_A }));
    take.mockResolvedValueOnce([taskDoc()]);
    // enrich: users batch
    get.mockResolvedValueOnce(userDoc()); // assignedTo
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, name: 'Boss' })); // assignedBy
    // comments per task
    take.mockResolvedValueOnce([]);
    // projects
    get.mockResolvedValueOnce({ _id: 'project_1', name: 'P' });

    const result = (await handlers.getTasksForEmployee(ctx, { userId: USER_ID })) as any[];

    expect(query).toHaveBeenCalledWith('tasks');
    expect(withIndex).toHaveBeenCalledWith('by_assigned_to', expect.any(Function));
    expect(result).toHaveLength(1);
    expect(result[0].commentCount).toBe(0);
    expect(result[0].assignedToUser).toEqual(expect.objectContaining({ name: 'Anna' }));
  });

  it('filters out tasks from a different organization', async () => {
    const { ctx, get, take } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_A }));
    take.mockResolvedValueOnce([
      taskDoc({ organizationId: ORG_A }),
      taskDoc({ _id: 'task_2', organizationId: ORG_B }),
    ]);
    take.mockResolvedValueOnce([]); // comments

    const result = (await handlers.getTasksForEmployee(ctx, { userId: USER_ID })) as any[];

    expect(result.map((t) => t._id)).toEqual([TASK_ID]);
  });
});

describe('getTasksAssignedBy', () => {
  it('throws for a missing supervisor', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(handlers.getTasksAssignedBy(ctx, { supervisorId: ADMIN_ID })).rejects.toThrow(
      'Supervisor not found',
    );
  });

  it('returns tasks assigned by the supervisor', async () => {
    const { ctx, get, withIndex, take } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin' }));
    take.mockResolvedValueOnce([taskDoc()]);
    take.mockResolvedValueOnce([]); // comments

    const result = (await handlers.getTasksAssignedBy(ctx, { supervisorId: ADMIN_ID })) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_assigned_by', expect.any(Function));
    expect(result).toHaveLength(1);
  });
});

describe('getAllTasks', () => {
  it('returns [] for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    const result = await handlers.getAllTasks(ctx, {});

    expect(result).toEqual([]);
  });

  it('denies non-admin roles', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();

    await expect(handlers.getAllTasks(ctx, {})).rejects.toThrow('Only admins can access all tasks');
  });

  it('throws for an admin without an organization', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: ADMIN_ID,
      role: 'admin',
      email: 'admin@example.com',
      organizationId: undefined,
      name: 'Caller',
    });
    const { ctx } = makeCtx();

    await expect(handlers.getAllTasks(ctx, {})).rejects.toThrow(
      'Admin must belong to an organization',
    );
  });

  it('filters by the admin organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, query, take } = makeCtx();
    take.mockResolvedValueOnce([taskDoc(), taskDoc({ _id: 'task_2', organizationId: ORG_B })]);
    take.mockResolvedValueOnce([]); // comments

    const result = (await handlers.getAllTasks(ctx, {})) as any[];

    expect(query).toHaveBeenCalledWith('tasks');
    expect(result.map((t) => t._id)).toEqual([TASK_ID]);
  });

  it('lets a superadmin scope by selectedOrganizationId', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([
      taskDoc({ organizationId: ORG_A }),
      taskDoc({ _id: 'task_2', organizationId: ORG_B }),
    ]);
    take.mockResolvedValueOnce([]);

    const result = (await handlers.getAllTasks(ctx, {
      selectedOrganizationId: ORG_B,
    })) as any[];

    expect(result.map((t) => t._id)).toEqual(['task_2']);
  });

  it('lets a superadmin see all tasks without a selection', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([taskDoc(), taskDoc({ _id: 'task_2', organizationId: ORG_B })]);
    take.mockResolvedValueOnce([]);

    const result = (await handlers.getAllTasks(ctx, {})) as any[];

    expect(result).toHaveLength(2);
  });
});

describe('getTeamTasks', () => {
  it('returns tasks of employees under the supervisor', async () => {
    const { ctx, withIndex, take } = makeCtx();
    // employees under supervisor
    take.mockResolvedValueOnce([userDoc(), userDoc({ _id: 'user_2' })]);
    // tasks per employee
    take.mockResolvedValueOnce([taskDoc()]);
    take.mockResolvedValueOnce([taskDoc({ _id: 'task_2' })]);
    // enrich: no comments needed (already [] from take default? provide explicitly)
    take.mockResolvedValueOnce([]);

    const result = (await handlers.getTeamTasks(ctx, { supervisorId: ADMIN_ID })) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_supervisor', expect.any(Function));
    expect(withIndex).toHaveBeenCalledWith('by_assigned_to', expect.any(Function));
    expect(result).toHaveLength(2);
  });

  it('returns [] when the supervisor has no employees', async () => {
    const { ctx } = makeCtx();

    const result = await handlers.getTeamTasks(ctx, { supervisorId: ADMIN_ID });

    expect(result).toEqual([]);
  });
});

describe('getMyEmployees', () => {
  it('returns employees with their profile avatar', async () => {
    const { ctx, withIndex, take } = makeCtx();
    take.mockResolvedValueOnce([userDoc({ faceImageUrl: 'face-1' })]);
    mockGetProfile.mockResolvedValue({ userId: USER_ID, avatarUrl: 'avatar-1' });

    const result = (await handlers.getMyEmployees(ctx, { supervisorId: ADMIN_ID })) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_supervisor', expect.any(Function));
    expect(result[0].avatarUrl).toBe('avatar-1');
  });
});

describe('getUsersForAssignment', () => {
  it('returns active users of the caller organization without superadmins', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, withIndex, take } = makeCtx();
    take.mockResolvedValueOnce([
      userDoc({ role: 'superadmin', _id: 'super' }),
      userDoc({ isActive: false, _id: 'inactive' }),
      userDoc({ role: 'driver', _id: 'driver_1' }),
      userDoc(),
    ]);
    mockGetProfile.mockResolvedValue(null);

    const result = (await handlers.getUsersForAssignment(ctx, {})) as any[];

    expect(result.map((u) => u._id)).toEqual(['driver_1', USER_ID]);
    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('returns all users for unauthenticated callers (no org scoping)', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, query, withIndex, take } = makeCtx();
    take.mockResolvedValueOnce([userDoc()]);

    const result = (await handlers.getUsersForAssignment(ctx, {})) as any[];

    expect(withIndex).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith('users');
    expect(result).toHaveLength(1);
  });
});

describe('getSupervisors', () => {
  it('returns active supervisors and admins of the caller org', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, withIndex, take } = makeCtx();
    // supervisors query
    take.mockResolvedValueOnce([
      userDoc({ _id: 'sup_1', role: 'supervisor', isActive: true, isApproved: true }),
      userDoc({ _id: 'sup_2', role: 'supervisor', organizationId: ORG_B }),
    ]);
    // admins query
    take.mockResolvedValueOnce([
      userDoc({ _id: ADMIN_ID, role: 'admin', isActive: true, isApproved: true }),
    ]);
    mockGetProfile.mockResolvedValue(null);

    const result = (await handlers.getSupervisors(ctx, {})) as any[];

    expect(result.map((u) => u._id).sort()).toEqual([ADMIN_ID, 'sup_1'].sort());
  });
});

describe('addAttachment / removeAttachment', () => {
  it('appends the attachment to the task', async () => {
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ attachments: [{ url: 'a1' }] }));

    await handlers.addAttachment(ctx, {
      taskId: TASK_ID,
      url: 'a2',
      name: 'file.pdf',
      type: 'application/pdf',
      size: 123,
      uploadedBy: USER_ID,
    });

    expect(patch).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ url: 'a2', name: 'file.pdf' }),
        ]),
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_attachment_added' }),
    );
  });

  it('throws when the task does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(
      handlers.addAttachment(ctx, {
        taskId: TASK_ID,
        url: 'a',
        name: 'n',
        type: 't',
        size: 1,
        uploadedBy: USER_ID,
      }),
    ).rejects.toThrow('Task not found');
  });

  it('removes the matching attachment and audits', async () => {
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(
      taskDoc({ attachments: [{ url: 'a1' }, { url: 'a2' }], assignedBy: ADMIN_ID }),
    );

    await handlers.removeAttachment(ctx, { taskId: TASK_ID, url: 'a1' });

    const patchCall = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(patchCall[1].attachments).toEqual([{ url: 'a2' }]);
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_attachment_removed' }),
    );
  });

  it('skips the audit log for legacy tasks without an org', async () => {
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ organizationId: undefined, attachments: [{ url: 'a1' }] }));

    await handlers.removeAttachment(ctx, { taskId: TASK_ID, url: 'a1' });

    expect(patch).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('getTaskComments / listCommentsPaginated', () => {
  it('returns comments with authors', async () => {
    const { ctx, withIndex, order, take, get } = makeCtx();
    take.mockResolvedValueOnce([{ _id: 'c1', taskId: TASK_ID, authorId: USER_ID, content: 'hi' }]);
    get.mockResolvedValueOnce(userDoc({ name: 'Anna' }));

    const result = (await handlers.getTaskComments(ctx, { taskId: TASK_ID })) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_task', expect.any(Function));
    expect(result[0].author).toEqual(expect.objectContaining({ name: 'Anna' }));
  });

  it('paginates comments and attaches authors', async () => {
    const { ctx, withIndex, order, paginate, get } = makeCtx();
    paginate.mockResolvedValueOnce({
      page: [{ _id: 'c1', taskId: TASK_ID, authorId: USER_ID, content: 'hi' }],
      isDone: true,
      continueCursor: null,
    });
    get.mockResolvedValueOnce(userDoc({ name: 'Anna' }));

    const result = (await handlers.listCommentsPaginated(ctx, {
      taskId: TASK_ID,
      paginationOpts: { numItems: 10, cursor: null },
    })) as any;

    expect(paginate).toHaveBeenCalledWith({ numItems: 10, cursor: null });
    expect(result.page[0].author).toEqual(expect.objectContaining({ name: 'Anna' }));
  });
});

describe('backfillTaskOrg / getAllTasksRaw', () => {
  it('patches the organizationId', async () => {
    const { ctx, patch } = makeCtx();

    await handlers.backfillTaskOrg(ctx, { taskId: TASK_ID, organizationId: ORG_A });

    expect(patch).toHaveBeenCalledWith(TASK_ID, { organizationId: ORG_A });
  });

  it('returns raw tasks', async () => {
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([taskDoc()]);

    const result = await handlers.getAllTasksRaw(ctx, {});

    expect(result).toHaveLength(1);
  });
});

describe('getTask', () => {
  it('returns null for a missing task', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    const result = await handlers.getTask(ctx, { taskId: TASK_ID });

    expect(result).toBeNull();
  });

  it('enriches the task with users, comments and project', async () => {
    const { ctx, get, take } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ projectId: 'project_1' }));
    get.mockResolvedValueOnce(userDoc({ name: 'Anna' })); // assignedTo
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, name: 'Boss' })); // assignedBy
    get.mockResolvedValueOnce({ _id: 'project_1', name: 'Website' }); // project
    take.mockResolvedValueOnce([{ _id: 'c1', taskId: TASK_ID, authorId: USER_ID, content: 'hi' }]);
    get.mockResolvedValueOnce(userDoc({ name: 'Anna' })); // comment author

    const result = (await handlers.getTask(ctx, { taskId: TASK_ID })) as any;

    expect(result.assignedToUser).toEqual(expect.objectContaining({ name: 'Anna' }));
    expect(result.assignedByUser).toEqual(expect.objectContaining({ name: 'Boss' }));
    expect(result.projectName).toBe('Website');
    expect(result.commentCount).toBe(1);
    expect(result.comments[0].author).toEqual(expect.objectContaining({ name: 'Anna' }));
  });
});

describe('secureDeleteTask', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.secureDeleteTask(ctx, { taskId: TASK_ID })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('rejects cross-organization deletions', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx, get, remove } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ organizationId: ORG_A }));

    await expect(handlers.secureDeleteTask(ctx, { taskId: TASK_ID })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes the task and comments for an authorized caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, remove, take, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());
    take.mockResolvedValueOnce([{ _id: 'c1', taskId: TASK_ID }]);

    await handlers.secureDeleteTask(ctx, { taskId: TASK_ID });

    expect(remove).toHaveBeenCalledWith('c1');
    expect(remove).toHaveBeenCalledWith(TASK_ID);
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_deleted', userId: ADMIN_ID }),
    );
  });
});

describe('secureReassignTask', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(
      handlers.secureReassignTask(ctx, { taskId: TASK_ID, newAssigneeId: 'user_2' }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects cross-organization reassignments', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ organizationId: ORG_A }));

    await expect(
      handlers.secureReassignTask(ctx, { taskId: TASK_ID, newAssigneeId: 'user_2' }),
    ).rejects.toThrow('Access denied: cross-organization operation');
    expect(patch).not.toHaveBeenCalled();
  });

  it('reassigns, notifies the new assignee and audits', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await handlers.secureReassignTask(ctx, { taskId: TASK_ID, newAssigneeId: 'user_2' });

    expect(patch).toHaveBeenCalledWith(TASK_ID, expect.objectContaining({ assignedTo: 'user_2' }));
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: 'user_2', route: '/tasks' }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'task_reassigned', userId: ADMIN_ID }),
    );
  });
});
