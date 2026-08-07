/**
 * Tests for convex/positions.ts — org-scoped position CRUD backed by
 * lib/orgAccess (resolveOrgScope / assertOrgStaff / scopeOwnsRecord).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { XLARGE_LIST_CAP } from '../../convex/lib/limits';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../convex/lib/orgAccess', () => ({
  resolveOrgScope: jest.fn(),
  assertOrgStaff: jest.fn(),
  scopeOwnsRecord: jest.fn(),
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
    const mod = require('../../convex/positions');
    listHandler = mod.list.handler;
    optionsHandler = mod.options.handler;
    getByIdHandler = mod.getById.handler;
    createHandler = mod.create.handler;
    updateHandler = mod.update.handler;
    removeHandler = mod.remove.handler;
  });
});

const ORG_A = 'org-1';
const ORG_B = 'org-2';
const DEPT_A = 'dept-1';
const POS_ID = 'pos_1';

function makeStaffScope(org: string = ORG_A, isSuper = false) {
  return {
    caller: { _id: 'user_admin', role: 'admin', organizationId: org },
    organizationId: org,
    isStaff: true,
    isAdmin: true,
    isSuper,
  };
}

function posDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: POS_ID,
    organizationId: ORG_A,
    departmentId: DEPT_A,
    title: 'Engineer',
    description: undefined,
    level: undefined,
    salaryMin: undefined,
    salaryMax: undefined,
    isActive: true,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function makeCtx() {
  const take = jest.fn().mockResolvedValue([]);
  const order = jest.fn().mockReturnValue({ take });
  // Chainable eq so a hypothetical `.eq(...).eq(...)` callback works too.
  const eq = jest.fn().mockImplementation((..._args: unknown[]) => eq);
  (eq as any).eq = eq;
  // The module passes a callback to withIndex: invoke it so the `q.eq(...)`
  // bodies execute, mirroring the real Convex query builder.
  const withIndex = jest.fn().mockImplementation((_name: string, cb?: (q: any) => unknown) => {
    cb?.({ eq });
    return { order, take };
  });
  const get = jest.fn();
  const insert = jest.fn();
  const patch = jest.fn();
  const del = jest.fn();
  return {
    ctx: {
      db: {
        query: jest.fn().mockReturnValue({ withIndex, order, take }),
        get,
        insert,
        patch,
        delete: del,
      },
    },
    take,
    order,
    withIndex,
    eq,
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
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it('lists positions by_org for a staff member', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, withIndex, take } = makeCtx();
    take.mockResolvedValueOnce([posDoc()]); // positions
    take.mockResolvedValueOnce([]); // users
    mockGetProfile.mockResolvedValue({});

    const result = (await listHandler(ctx, {})) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    expect(result).toHaveLength(1);
    expect(result[0].employeeCount).toBe(0);
  });

  it('counts employees whose profile positionId matches', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take
      .mockResolvedValueOnce([posDoc()]) // positions
      .mockResolvedValueOnce([
        { _id: 'u_in', organizationId: ORG_A, positionId: POS_ID, name: 'In' },
        { _id: 'u_out', organizationId: ORG_A, positionId: 'pos_other', name: 'Out' },
      ]);
    mockGetProfile.mockResolvedValue({});

    const result = (await listHandler(ctx, {})) as any[];
    expect(result[0].employeeCount).toBe(1);
  });

  it('counts employees via the profile positionId when the user lacks one', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take
      .mockResolvedValueOnce([posDoc()]) // positions
      .mockResolvedValueOnce([
        { _id: 'u1', organizationId: ORG_A, positionId: undefined, name: 'A' },
        { _id: 'u2', organizationId: ORG_B, positionId: POS_ID, name: 'B' },
      ]);
    mockGetProfile.mockImplementation(async (ctx: any, id: string) =>
      id === 'u1' ? { positionId: POS_ID } : { positionId: 'pos_other' },
    );

    const result = (await listHandler(ctx, {})) as any[];
    // u1 counted via profile; u2 is a different-org employee → excluded
    expect(result[0].employeeCount).toBe(1);
  });

  it('filters positions by departmentId', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, withIndex, take } = makeCtx();
    take.mockResolvedValueOnce([posDoc()]).mockResolvedValueOnce([]);
    mockGetProfile.mockResolvedValue({});

    await listHandler(ctx, { departmentId: DEPT_A });

    expect(withIndex).toHaveBeenCalledWith('by_department', expect.any(Function));
  });

  it('filters foreign-org rows when reaching by department id', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    // Position belongs to another org but was found by department index
    take.mockResolvedValueOnce([posDoc({ organizationId: ORG_B })]).mockResolvedValueOnce([]);
    mockGetProfile.mockResolvedValue({});

    const result = (await listHandler(ctx, { departmentId: DEPT_A })) as any[];
    expect(result).toEqual([]);
  });

  it('does not filter by org when a superadmin passes a department without an org', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(undefined, true));
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([posDoc({ organizationId: ORG_B })]).mockResolvedValueOnce([]);
    mockGetProfile.mockResolvedValue({});

    const result = (await listHandler(ctx, { departmentId: DEPT_A })) as any[];
    // No orgId → the org filter is skipped, the foreign-org row survives.
    expect(result).toHaveLength(1);
  });

  it('lists all positions when the caller is a superadmin without an org', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(undefined, true));
    const { ctx, withIndex, take } = makeCtx();
    take.mockResolvedValueOnce([posDoc()]).mockResolvedValueOnce([]);
    mockGetProfile.mockResolvedValue({});

    await listHandler(ctx, {});

    expect(withIndex).not.toHaveBeenCalled();
    expect(take).toHaveBeenCalledWith(XLARGE_LIST_CAP);
  });

  it('counts employees across orgs when the superadmin has no org scope', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(undefined, true));
    const { ctx, take } = makeCtx();
    take
      .mockResolvedValueOnce([posDoc({ organizationId: ORG_B })]) // positions (any org)
      .mockResolvedValueOnce([
        { _id: 'u1', organizationId: ORG_A, positionId: POS_ID },
        { _id: 'u2', organizationId: ORG_B, positionId: POS_ID },
      ]);
    mockGetProfile.mockResolvedValue({});

    const result = (await listHandler(ctx, {})) as any[];
    // No org filter: employees from every org holding the position count.
    expect(result[0].employeeCount).toBe(2);
  });

  it('filters by department and scopes rows to the caller org', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, withIndex, take } = makeCtx();
    take
      .mockResolvedValueOnce([posDoc(), posDoc({ _id: 'p2', organizationId: ORG_B })])
      .mockResolvedValueOnce([]);
    mockGetProfile.mockResolvedValue({});

    const result = (await listHandler(ctx, { departmentId: DEPT_A })) as any[];
    expect(withIndex).toHaveBeenCalledWith('by_department', expect.any(Function));
    expect(result).toHaveLength(1);
  });
});

describe('options', () => {
  it('returns an empty array without org scope', async () => {
    mockResolveOrgScope.mockResolvedValue(null);
    const { ctx } = makeCtx();
    const result = await optionsHandler(ctx, {});
    expect(result).toEqual([]);
  });

  it('returns active positions sorted by title', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([
      posDoc({ _id: 'p2', title: 'Zebra', isActive: true, departmentId: DEPT_A }),
      posDoc({ _id: 'p1', title: 'Alpha', isActive: true, departmentId: DEPT_A }),
      posDoc({ _id: 'p3', title: 'Hidden', isActive: false }),
    ]);

    const result = (await optionsHandler(ctx, {})) as any[];

    expect(result.map((r) => r.title)).toEqual(['Alpha', 'Zebra']);
  });

  it('filters by departmentId when provided', async () => {
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([
      posDoc({ _id: 'p1', title: 'A', departmentId: DEPT_A }),
      posDoc({ _id: 'p2', title: 'B', departmentId: 'dept-other' }),
    ]);

    const result = (await optionsHandler(ctx, { departmentId: DEPT_A })) as any[];
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('p1');
  });
});

describe('getById', () => {
  it('returns null when the position does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    const result = await getByIdHandler(ctx, { id: POS_ID });
    expect(result).toBeNull();
  });

  it('returns null when the caller is outside the org', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_B));
    mockScopeOwnsRecord.mockReturnValue(false);

    const result = await getByIdHandler(ctx, { id: POS_ID });
    expect(result).toBeNull();
  });

  it('returns the position for an authorized caller', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    mockResolveOrgScope.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    const result = await getByIdHandler(ctx, { id: POS_ID });
    expect(result).toEqual(posDoc());
  });
});

describe('create', () => {
  it('throws when the title is empty', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx } = makeCtx();
    await expect(createHandler(ctx, { organizationId: ORG_A, title: '   ' })).rejects.toThrow(
      'Position title is required',
    );
  });

  it('throws when salaryMin exceeds salaryMax', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx } = makeCtx();
    await expect(
      createHandler(ctx, { organizationId: ORG_A, title: 'Dev', salaryMin: 100, salaryMax: 50 }),
    ).rejects.toThrow('Minimum salary cannot exceed the maximum');
  });

  it('throws when the department belongs to another organization', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce({ _id: DEPT_A, organizationId: ORG_B });
    await expect(
      createHandler(ctx, { organizationId: ORG_A, departmentId: DEPT_A, title: 'Dev' }),
    ).rejects.toThrow('Department not found in this organization');
  });

  it('inserts with a departmentId when the department is valid', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce({ _id: DEPT_A, organizationId: ORG_A });
    insert.mockResolvedValue('pos_new');

    await createHandler(ctx, {
      organizationId: ORG_A,
      departmentId: DEPT_A,
      title: '  Dev  ',
      level: 'Senior',
    });

    expect(insert).toHaveBeenCalledWith(
      'positions',
      expect.objectContaining({
        departmentId: DEPT_A,
        title: 'Dev',
        level: 'Senior',
        isActive: true,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    );
  });

  it('inserts a new position with trimmed title', async () => {
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValue('pos_new');
    const result = await createHandler(ctx, {
      organizationId: ORG_A,
      title: '  Senior Engineer  ',
      salaryMin: 100,
      salaryMax: 200,
    });

    expect(insert).toHaveBeenCalledWith(
      'positions',
      expect.objectContaining({
        title: 'Senior Engineer',
        organizationId: ORG_A,
        isActive: true,
        salaryMin: 100,
        salaryMax: 200,
      }),
    );
    expect(result).toBeDefined();
  });
});

describe('update', () => {
  it('throws when the position does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(updateHandler(ctx, { id: POS_ID, title: 'X' })).rejects.toThrow(
      'Position not found',
    );
  });

  it('throws when the caller lacks access', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_B));
    mockScopeOwnsRecord.mockReturnValue(false);

    await expect(updateHandler(ctx, { id: POS_ID, title: 'X' })).rejects.toThrow('Access denied');
  });

  it('throws for a blank title', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    await expect(updateHandler(ctx, { id: POS_ID, title: '   ' })).rejects.toThrow(
      'Position title is required',
    );
  });

  it('patches provided fields and trims the title', async () => {
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    await updateHandler(ctx, { id: POS_ID, title: '  Lead  ', isActive: false });

    expect(patch).toHaveBeenCalledWith(
      POS_ID,
      expect.objectContaining({ title: 'Lead', isActive: false, updatedAt: expect.any(Number) }),
    );
  });

  it('throws when the new department is outside the org', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    get.mockResolvedValueOnce({ _id: 'dept_x', organizationId: ORG_B });
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    await expect(updateHandler(ctx, { id: POS_ID, departmentId: 'dept_x' })).rejects.toThrow(
      'Department not found in this organization',
    );
  });

  it('patches departmentId when the department is valid', async () => {
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    get.mockResolvedValueOnce({ _id: DEPT_A, organizationId: ORG_A });
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    await updateHandler(ctx, { id: POS_ID, departmentId: DEPT_A });

    expect(patch).toHaveBeenCalledWith(POS_ID, expect.objectContaining({ departmentId: DEPT_A }));
  });

  it('validates salary range across existing values', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(posDoc({ salaryMin: 500 }));
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);

    await expect(updateHandler(ctx, { id: POS_ID, salaryMax: 100 })).rejects.toThrow(
      'Minimum salary cannot exceed the maximum',
    );
  });
});

describe('remove', () => {
  it('throws when the position does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(removeHandler(ctx, { id: POS_ID })).rejects.toThrow('Position not found');
  });

  it('throws when employees still hold the position', async () => {
    const { ctx, get, take } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);
    take.mockResolvedValueOnce([{ _id: 'u1' }, { _id: 'u2' }]);

    await expect(removeHandler(ctx, { id: POS_ID })).rejects.toThrow(
      '2 employee(s) still hold this position',
    );
  });

  it('deletes the position when no employees reference it', async () => {
    const { ctx, get, take, del } = makeCtx();
    get.mockResolvedValueOnce(posDoc());
    mockAssertOrgStaff.mockResolvedValue(makeStaffScope(ORG_A));
    mockScopeOwnsRecord.mockReturnValue(true);
    take.mockResolvedValueOnce([]);

    await removeHandler(ctx, { id: POS_ID });

    expect(del).toHaveBeenCalledWith(POS_ID);
  });
});
