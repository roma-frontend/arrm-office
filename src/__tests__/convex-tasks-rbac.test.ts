/**
 * Tests for the updateTask RBAC in convex/tasks.ts.
 *
 * Model: only same-org admins/supervisors or superadmins (role or bootstrap
 * email) may edit a task via updateTask; employees/drivers, cross-org staff
 * and unauthenticated callers are denied. Mirrors the leaves read-path fixes
 * and the secureDeleteTask/secureReassignTask mutations in the same file.
 *
 * Pattern: convex-leaves-rbac.test.ts — mock `_generated/server`,
 * getAuthCaller and lib/auth, require the module inside jest.isolateModules.
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

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let updateTaskHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tasks = require('../../convex/tasks');
    updateTaskHandler = tasks.updateTask.handler;
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const TASK_ID = 'task_1';
const ADMIN_ID = 'user_admin';
const EMPLOYEE_ID = 'user_emp';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver' = 'employee',
  org: string | undefined = ORG_A,
  id: string = EMPLOYEE_ID,
) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function makeCtx() {
  const patch = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn().mockResolvedValue(undefined);
  const get = jest.fn();
  return { ctx: { db: { get, patch, insert } }, patch, insert, get };
}

function taskDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: TASK_ID,
    title: 'Build the dashboard',
    description: 'Initial description',
    assignedTo: EMPLOYEE_ID,
    assignedBy: ADMIN_ID,
    organizationId: ORG_A,
    status: 'in_progress',
    priority: 'high',
    ...overrides,
  };
}

// ── updateTask RBAC ──────────────────────────────────────────────────────────
describe('updateTask RBAC', () => {
  it('lets a same-org admin update the task', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await updateTaskHandler(ctx, { taskId: TASK_ID, title: 'New title' });

    expect(patch).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ title: 'New title', updatedAt: expect.any(Number) }),
    );
  });

  it('lets a same-org supervisor update the task', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await updateTaskHandler(ctx, { taskId: TASK_ID, description: 'Updated description' });

    expect(patch).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ description: 'Updated description' }),
    );
  });

  it('lets a superadmin update a task of any organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ organizationId: ORG_B }));

    await updateTaskHandler(ctx, { taskId: TASK_ID, priority: 'urgent' });

    expect(patch).toHaveBeenCalledWith(TASK_ID, expect.objectContaining({ priority: 'urgent' }));
  });

  it('denies a cross-org admin without patching', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx, patch, get, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc()); // task belongs to ORG_A

    await expect(updateTaskHandler(ctx, { taskId: TASK_ID, title: 'Hacked' })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('denies a cross-org supervisor without patching', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_B, ADMIN_ID));
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await expect(updateTaskHandler(ctx, { taskId: TASK_ID, title: 'Hacked' })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('denies an employee (even their own task) without patching', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ assignedTo: EMPLOYEE_ID }));

    await expect(updateTaskHandler(ctx, { taskId: TASK_ID, title: 'Self edit' })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('denies a driver without patching', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await expect(updateTaskHandler(ctx, { taskId: TASK_ID, title: 'Driver edit' })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('denies unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await expect(updateTaskHandler(ctx, { taskId: TASK_ID, title: 'Anon edit' })).rejects.toThrow(
      'Not authenticated',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('throws Task not found when the task does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(updateTaskHandler(ctx, { taskId: TASK_ID, title: 'X' })).rejects.toThrow(
      'Task not found',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('treats a bootstrap-email admin (role admin + isSuperadmin) as superadmin', async () => {
    // isSuperadmin must be evaluated before the role/org check, or this admin
    // would be denied for a foreign-org task.
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ organizationId: ORG_B }));

    await updateTaskHandler(ctx, { taskId: TASK_ID, title: 'Bootstrap edit' });

    expect(patch).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ title: 'Bootstrap edit' }),
    );
  });

  it('writes an audit log with the authenticated caller as the actor', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, patch, get, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await updateTaskHandler(ctx, { taskId: TASK_ID, status: 'completed' });

    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        organizationId: ORG_A,
        userId: ADMIN_ID,
        action: 'task_updated',
        target: TASK_ID,
      }),
    );
    expect(patch).toHaveBeenCalled();
  });

  it('does not send undefined fields to the patch', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, patch, get } = makeCtx();
    get.mockResolvedValueOnce(taskDoc());

    await updateTaskHandler(ctx, { taskId: TASK_ID, title: 'Only title' });

    const patchArgs = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(patchArgs[0]).toBe(TASK_ID);
    expect(patchArgs[1]).toHaveProperty('title', 'Only title');
    expect(patchArgs[1]).not.toHaveProperty('status');
    expect(patchArgs[1]).not.toHaveProperty('priority');
  });

  it('lets a superadmin update an org-less legacy task but skips the audit log', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, patch, get, insert } = makeCtx();
    get.mockResolvedValueOnce(taskDoc({ organizationId: undefined }));

    await updateTaskHandler(ctx, { taskId: TASK_ID, title: 'Legacy fix' });

    expect(patch).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
