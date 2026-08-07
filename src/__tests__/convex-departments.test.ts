/**
 * Tests for convex/departments.ts — org-scoped department CRUD backed by
 * lib/orgAccess (resolveOrgScope / assertOrgStaff / scopeOwnsRecord).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/orgAccess', () => ({
  resolveOrgScope: jest.fn(),
  assertOrgStaff: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

let mockResolveOrgScope: jest.Mock;
let mockAssertOrgStaff: jest.Mock;
let mockScopeOwnsRecord: jest.Mock;
let mockGetProfile: jest.Mock;

let listHandler: (ctx: any, args: any) => Promise<unknown>;
let optionsHandler: (ctx: any, args: any) => Promise<unknown>;
let getByIdHandler: (ctx: any, args: any) => Promise<unknown>;
let createHandler: (ctx: any, args: any) => Promise<unknown>;
let updateHandler: (ctx: any, args: any) => Promise<unknown>;
let removeHandler: (ctx: any, args: any) => Promise<unknown>;

const ORG_A = 'org-1';
const ORG_B = 'org-2';
const DEPT_ID = 'dept_1';

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveOrgScope = jest.requireMock('../../convex/lib/orgAccess').resolveOrgScope;
  mockAssertOrgStaff = jest.requireMock('../../convex/lib/orgAccess').assertOrgStaff;
  mockScopeOwnsRecord = jest.requireMock('../../convex/lib/orgAccess').scopeOwnsRecord;
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  mockResolveOrgScope.mockReset();
  mockAssertOrgStaff.mockReset();
  mockScopeOwnsRecord.mockReset();
  mockGetProfile.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/departments');
    listHandler = mod.list.handler;
    optionsHandler = mod.options.handler;
    getByIdHandler = mod.getById.handler;
    createHandler = mod.create.handler;
    updateHandler = mod.update.handler;
    removeHandler = mod.remove.handler;
  });
});

function makeStaffScope(org: string = ORG_A, isSuper = false) {
  return {
    caller: { _id: 'user_admin', role: 'admin', organizationId: org },
    organizationId: org,
    isStaff: true,
    isAdmin: true,
    isSuper,
  };
}

function deptDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: DEPT_ID,
    organizationId: ORG_A,
    name: 'Engineering',
    description: undefined,
    managerId: undefined,
    color: undefined,
    isActive: true,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user_1',
    organizationId: ORG_A,
    name: 'Alice',
    email: 'alice@example.com',
    ...overrides,
  };
}

function makeCtx() {
  const take = jest.fn().mockResolvedValue([]);
  const withIndex = jest.fn().mockReturnValue({ take });
  const get = jest.fn();
  const insert = jest.fn();
  const patch = jest.fn();
  const del = jest.fn();
  return {
    ctx: {
      db: {
        query: jest.fn().mockReturnValue({ withIndex, take }),
        get,
        insert,
        patch,
        delete: del,
      },
    },
    take,
    withIndex,
    get,
    insert,
    patch,
    del,
  };
}

describe('list', () => {
  it('returns an empty array when the caller has no org scope', async () => {
    mockResolveOrgScope.mockResolvedValue(null);
    const { ctx } = makeCtx();
    const result = await listHandler(ctx, {});
    expect(result).toEqual([]);
  });

  it('lists departments with employee counts for a staff member', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, withIndex, take } = makeCtx();
    take.mockResolvedValueOnce([deptDoc()]); // departments
    take.mockResolvedValueOnce([userDoc()]); // users
    mockGetProfile.mockResolvedValue({ departmentId: DEPT_ID });

    const result = (await listHandler(ctx, {})) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    expect(result).toHaveLength(1);
    expect(result[0].employeeCount).toBe(1);
  });

  it('counts employees via the profile departmentId when present', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([deptDoc()]).mockResolvedValueOnce([userDoc()]);
    mockGetProfile.mockResolvedValue({ departmentId: DEPT_ID });

    const result = (await listHandler(ctx, {})) as any[];
    expect(result[0].employeeCount).toBe(1);
  });

  it('ignores users from other departments in the count', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([deptDoc()]).mockResolvedValueOnce([userDoc()]);
    mockGetProfile.mockResolvedValue({ departmentId: 'dept_other' });

    const result = (await listHandler(ctx, {})) as any[];
    expect(result[0].employeeCount).toBe(0);
  });

  it('resolves the manager name', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take
      .mockResolvedValueOnce([deptDoc({ managerId: 'user_1' })])
      .mockResolvedValueOnce([userDoc()]);
    mockGetProfile.mockResolvedValue({});

    const result = (await listHandler(ctx, {})) as any[];
    expect(result[0].managerName).toBe('Alice');
  });

  it('returns null managerName when the manager is not in the user list', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take
      .mockResolvedValueOnce([deptDoc({ managerId: 'user_missing' })])
      .mockResolvedValueOnce([userDoc()]);
    mockGetProfile.mockResolvedValue({});

    const result = (await listHandler(ctx, {})) as any[];
    expect(result[0].managerName).toBeNull();
  });
});

describe('options', () => {
  it('returns an empty array without org scope', async () => {
    mockResolveOrgScope.mockResolvedValue(null);
    const { ctx } = makeCtx();
    const result = await optionsHandler(ctx, {});
    expect(result).toEqual([]);
  });

  it('returns an empty array for a superadmin without an org id', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(undefined, true));
    const { ctx } = makeCtx();
    const result = await optionsHandler(ctx, {});
    expect(result).toEqual([]);
  });

  it('returns active departments sorted by name', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([
      deptDoc({ _id: 'd2', name: 'Zebra' }),
      deptDoc({ _id: 'd1', name: 'Alpha' }),
      deptDoc({ _id: 'd3', name: 'Hidden', isActive: false }),
    ]);

    const result = (await optionsHandler(ctx, {})) as any[];
    expect(result.map((r) => r.name)).toEqual(['Alpha', 'Zebra']);
  });
});

describe('getById', () => {
  it('returns null when the department does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    const result = await getByIdHandler(ctx, { id: DEPT_ID });
    expect(result).toBeNull();
  });

  it('returns null when the caller is outside the org', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_B));
    mockScopeOwnsRecord.mockReturnValue(false);

    const result = await getByIdHandler(ctx, { id: DEPT_ID });
    expect(result).toBeNull();
  });

  it('returns the department for an authorized caller', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    const result = await getByIdHandler(ctx, { id: DEPT_ID });
    expect(result).toEqual(deptDoc());
  });
});

describe('create', () => {
  it('throws when the name is blank', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx } = makeCtx();
    await expect(createHandler(ctx, { organizationId: ORG_A, name: '   ' })).rejects.toThrow(
      'Department name is required',
    );
  });

  it('throws when the manager belongs to another org', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce({ _id: 'user_x', organizationId: ORG_B });
    await expect(
      createHandler(ctx, { organizationId: ORG_A, name: 'Dev', managerId: 'user_x' }),
    ).rejects.toThrow('Manager not found in this organization');
  });

  it('throws when the manager does not exist', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      createHandler(ctx, { organizationId: ORG_A, name: 'Dev', managerId: 'user_x' }),
    ).rejects.toThrow('Manager not found in this organization');
  });

  it('inserts a new department with a trimmed name', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValue('dept_new');

    const result = await createHandler(ctx, {
      organizationId: ORG_A,
      name: '  Sales  ',
      description: 'desc',
      color: '#ff0000',
    });

    expect(insert).toHaveBeenCalledWith(
      'departments',
      expect.objectContaining({
        organizationId: ORG_A,
        name: 'Sales',
        description: 'desc',
        color: '#ff0000',
        isActive: true,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    );
    expect(result).toBe('dept_new');
  });
});

describe('update', () => {
  it('throws when the department does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(updateHandler(ctx, { id: DEPT_ID, name: 'X' })).rejects.toThrow(
      'Department not found',
    );
  });

  it('throws when the caller lacks access', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_B));
    mockScopeOwnsRecord.mockReturnValue(false);

    await expect(updateHandler(ctx, { id: DEPT_ID, name: 'X' })).rejects.toThrow('Access denied');
  });

  it('throws for a blank name', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    await expect(updateHandler(ctx, { id: DEPT_ID, name: '   ' })).rejects.toThrow(
      'Department name is required',
    );
  });

  it('throws when the new manager is outside the org', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);
    get.mockResolvedValueOnce({ _id: 'user_x', organizationId: ORG_B });

    await expect(updateHandler(ctx, { id: DEPT_ID, managerId: 'user_x' })).rejects.toThrow(
      'Manager not found in this organization',
    );
  });

  it('patches fields and trims the name', async () => {
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    await updateHandler(ctx, { id: DEPT_ID, name: '  HR  ', isActive: false });

    expect(patch).toHaveBeenCalledWith(
      DEPT_ID,
      expect.objectContaining({
        name: 'HR',
        isActive: false,
        updatedAt: expect.any(Number),
      }),
    );
  });

  it('does not trim when the name is unchanged', async () => {
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    await updateHandler(ctx, { id: DEPT_ID, color: '#00ff00' });

    expect(patch).toHaveBeenCalledWith(
      DEPT_ID,
      expect.objectContaining({ color: '#00ff00', updatedAt: expect.any(Number) }),
    );
    // The name key must be absent entirely when it was not part of the update.
    expect(patch).toHaveBeenCalledWith(
      DEPT_ID,
      expect.not.objectContaining({ name: expect.anything() }),
    );
  });
});

describe('remove', () => {
  it('throws when the department does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(removeHandler(ctx, { id: DEPT_ID })).rejects.toThrow('Department not found');
  });

  it('throws when employees still belong to the department', async () => {
    const { ctx, get, take } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);
    take.mockResolvedValueOnce([{ _id: 'u1' }, { _id: 'u2' }]);

    await expect(removeHandler(ctx, { id: DEPT_ID })).rejects.toThrow(
      '2 employee(s) still belong to this department',
    );
  });

  it('throws when positions still reference the department', async () => {
    const { ctx, get, take } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);
    take.mockResolvedValueOnce([]); // no users
    take.mockResolvedValueOnce([{ _id: 'p1', departmentId: DEPT_ID }]);

    await expect(removeHandler(ctx, { id: DEPT_ID })).rejects.toThrow(
      '1 position(s) still reference this department',
    );
  });

  it('ignores positions of other departments', async () => {
    const { ctx, get, take, del } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);
    take.mockResolvedValueOnce([]); // no users
    take.mockResolvedValueOnce([{ _id: 'p1', departmentId: 'dept_other' }]);

    await removeHandler(ctx, { id: DEPT_ID });

    expect(del).toHaveBeenCalledWith(DEPT_ID);
  });

  it('deletes the department when nothing references it', async () => {
    const { ctx, get, take, del } = makeCtx();
    get.mockResolvedValueOnce(deptDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);
    take.mockResolvedValueOnce([]);
    take.mockResolvedValueOnce([]);

    await removeHandler(ctx, { id: DEPT_ID });

    expect(del).toHaveBeenCalledWith(DEPT_ID);
  });
});
