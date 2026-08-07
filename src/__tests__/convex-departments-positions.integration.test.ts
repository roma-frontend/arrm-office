/**
 * Integration tests for convex/departments and convex/positions — full CRUD
 * through the real `lib/orgAccess` scope resolution and RBAC, against
 * convex-test's in-memory database with the real schema.
 *
 * Covers: staff-only writes, cross-organization protection (client-passed
 * `organizationId` never wins for non-superadmins), employee-count enrichment
 * through `userProfiles`, delete guards for referenced rows, and the lean
 * `options` pickers.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './departments.ts': () => import('../../convex/departments'),
  './positions.ts': () => import('../../convex/positions'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function insertOrg(
  ctx: { db: { insert: (table: 'organizations', doc: never) => Promise<Id<'organizations'>> } },
  name: string,
): Promise<Id<'organizations'>> {
  return await ctx.db.insert('organizations', {
    name,
    slug: `${name.toLowerCase()}-${Math.random().toString(36).slice(2)}`,
    plan: 'professional',
    isActive: true,
    createdBySuperadmin: false,
    employeeLimit: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as never);
}

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await insertOrg(ctx, 'Acme');
    const otherOrgId = await insertOrg(ctx, 'Other');

    const baseUser = {
      organizationId,
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const managerId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Manager',
      email: 'manager@acme.test',
      role: 'supervisor',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
      supervisorId: managerId,
    });
    const foreignAdminId = await ctx.db.insert('users', {
      organizationId: otherOrgId,
      name: 'Foreign Admin',
      email: 'fadmin@other.test',
      passwordHash: 'x',
      role: 'admin',
      employeeType: 'staff',
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 0,
      sickLeaveBalance: 0,
      familyLeaveBalance: 0,
      createdAt: Date.now(),
    });
    const superadminId = await ctx.db.insert('users', {
      name: 'Root',
      email: 'root@acme.test',
      passwordHash: 'x',
      role: 'superadmin',
      employeeType: 'staff',
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 0,
      sickLeaveBalance: 0,
      familyLeaveBalance: 0,
      createdAt: Date.now(),
    });

    return {
      organizationId,
      otherOrgId,
      adminId,
      managerId,
      employeeId,
      foreignAdminId,
      superadminId,
    };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asManager = (c: Ctx) => c.t.withIdentity({ email: 'manager@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });
const asForeignAdmin = (c: Ctx) => c.t.withIdentity({ email: 'fadmin@other.test' });
const asSuperadmin = (c: Ctx) => c.t.withIdentity({ email: 'root@acme.test' });

async function createDept(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'departments'>> {
  const result = await asAdmin(c).mutation(api.departments.create, {
    organizationId: c.organizationId,
    name: 'Engineering',
    ...overrides,
  });
  return result as Id<'departments'>;
}

async function createPosition(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'positions'>> {
  const result = await asAdmin(c).mutation(api.positions.create, {
    organizationId: c.organizationId,
    title: 'Developer',
    ...overrides,
  });
  return result as Id<'positions'>;
}

describe('departments.create', () => {
  it('creates a department with trimmed name and audit fields', async () => {
    const c = await seed();
    const deptId = await asAdmin(c).mutation(api.departments.create, {
      organizationId: c.organizationId,
      name: '  Engineering  ',
      description: 'Core product team',
    });

    const dept = await c.t.run(async (ctx) => await ctx.db.get(deptId as Id<'departments'>));
    expect(dept?.name).toBe('Engineering'); // trimmed
    expect(dept?.description).toBe('Core product team');
    expect(dept?.isActive).toBe(true);
    expect(dept?.organizationId).toBe(c.organizationId);
    expect(dept?.createdAt).toEqual(expect.any(Number));
  });

  it('refuses a plain employee', async () => {
    const c = await seed();
    await expect(
      asEmployee(c).mutation(api.departments.create, {
        organizationId: c.organizationId,
        name: 'Sales',
      }),
    ).rejects.toThrow(/staff access required/i);
  });

  it('refuses an empty name', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.departments.create, {
        organizationId: c.organizationId,
        name: '   ',
      }),
    ).rejects.toThrow('Department name is required');
  });

  it('rejects a client-passed foreign organizationId outright', async () => {
    const c = await seed();
    // An admin cannot create inside another tenant by naming it.
    await expect(
      asAdmin(c).mutation(api.departments.create, {
        organizationId: c.otherOrgId,
        name: 'Sneaky',
      }),
    ).rejects.toThrow('Not authorized for this organization');
  });

  it('lets a superadmin create inside any org they name', async () => {
    const c = await seed();
    const deptId = await asSuperadmin(c).mutation(api.departments.create, {
      organizationId: c.otherOrgId,
      name: 'Super-created',
    });

    const dept = await c.t.run(async (ctx) => await ctx.db.get(deptId as Id<'departments'>));
    expect(dept?.organizationId).toBe(c.otherOrgId);
  });

  it('rejects a manager from another organization', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.departments.create, {
        organizationId: c.organizationId,
        name: 'Ops',
        managerId: c.foreignAdminId,
      }),
    ).rejects.toThrow('Manager not found in this organization');
  });
});

describe('departments.list / getById / options', () => {
  it('enriches with managerName and employeeCount', async () => {
    const c = await seed();
    const deptId = await createDept(c, { managerId: c.managerId });
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { departmentId: deptId });
    });

    const rows = await asAdmin(c).query(api.departments.list, {
      organizationId: c.organizationId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].managerName).toBe('Manager');
    expect(rows[0].employeeCount).toBe(1);
  });

  it('counts employees whose profile carries the departmentId', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    await c.t.run(async (ctx) => {
      // Profile (not the user doc) is the source of truth for the lookup.
      await ctx.db.insert('userProfiles', {
        userId: c.employeeId,
        departmentId: deptId,
      } as never);
    });

    const rows = await asAdmin(c).query(api.departments.list, {
      organizationId: c.organizationId,
    });
    expect(rows[0].employeeCount).toBe(1);
  });

  it('scopes reads to the caller org — foreign org rows stay hidden', async () => {
    const c = await seed();
    await createDept(c);
    const foreignDept = await asForeignAdmin(c).mutation(api.departments.create, {
      organizationId: c.otherOrgId,
      name: 'Foreign Dept',
    });

    const local = await asAdmin(c).query(api.departments.list, {
      organizationId: c.organizationId,
    });
    expect(local.map((d) => d._id)).toEqual([expect.any(String)]);
    expect(local[0]._id).not.toBe(foreignDept);

    const foreign = await asForeignAdmin(c).query(api.departments.list, {
      organizationId: c.otherOrgId,
    });
    expect(foreign.map((d) => d._id)).toContain(foreignDept);
  });

  it('returns null for a department in another org via getById', async () => {
    const c = await seed();
    const foreignDept = await asForeignAdmin(c).mutation(api.departments.create, {
      organizationId: c.otherOrgId,
      name: 'Hidden',
    });
    const visible = await asAdmin(c).query(api.departments.getById, { id: foreignDept });
    expect(visible).toBeNull();
  });

  it('options hides inactive departments and sorts by name', async () => {
    const c = await seed();
    await createDept(c, { name: 'Zeta' });
    const betaId = await createDept(c, { name: 'Beta' });
    await c.t.run(async (ctx) => {
      await ctx.db.patch(betaId, { isActive: false });
    });

    const opts = await asAdmin(c).query(api.departments.options, {
      organizationId: c.organizationId,
    });
    expect(opts.map((o) => o.name)).toEqual(['Zeta']);
  });

  it('lets a plain employee read the org-scoped department list', async () => {
    const c = await seed();
    await createDept(c);
    const rows = await asEmployee(c).query(api.departments.list, {
      organizationId: c.organizationId,
    });
    // Employees are not staff but reads are org-scoped — they still see the org.
    expect(rows).toHaveLength(1);
  });

  it('returns a department to its own org via getById', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    const visible = await asAdmin(c).query(api.departments.getById, { id: deptId });
    expect(visible?._id).toBe(deptId);
    expect(visible?.name).toBe('Engineering');
  });
});

describe('departments.update', () => {
  it('renames (trimmed) and can deactivate a department', async () => {
    const c = await seed();
    const deptId = await createDept(c);

    await asAdmin(c).mutation(api.departments.update, {
      id: deptId,
      name: '  Platform  ',
      isActive: false,
    });

    const dept = await c.t.run(async (ctx) => await ctx.db.get(deptId));
    expect(dept?.name).toBe('Platform');
    expect(dept?.isActive).toBe(false);
  });

  it('refuses an empty new name', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    await expect(
      asAdmin(c).mutation(api.departments.update, { id: deptId, name: '  ' }),
    ).rejects.toThrow('Department name is required');
  });

  it('blocks a plain employee and a foreign admin', async () => {
    const c = await seed();
    const deptId = await createDept(c);

    await expect(
      asEmployee(c).mutation(api.departments.update, { id: deptId, name: 'X' }),
    ).rejects.toThrow(/staff access required/i);

    await expect(
      asForeignAdmin(c).mutation(api.departments.update, { id: deptId, name: 'X' }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('rejects a manager from another organization', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    await expect(
      asAdmin(c).mutation(api.departments.update, {
        id: deptId,
        managerId: c.foreignAdminId,
      }),
    ).rejects.toThrow('Manager not found in this organization');
  });

  it('throws for a missing department', async () => {
    const c = await seed();
    const ghost = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('departments', {
        organizationId: c.organizationId,
        name: 'Ghost',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      asAdmin(c).mutation(api.departments.update, { id: ghost, name: 'X' }),
    ).rejects.toThrow('Department not found');
  });
});

describe('departments.remove', () => {
  it('deletes an unreferenced department', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    await asAdmin(c).mutation(api.departments.remove, { id: deptId });
    const dept = await c.t.run(async (ctx) => await ctx.db.get(deptId));
    expect(dept).toBeNull();
  });

  it('refuses to delete a department that still has employees', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { departmentId: deptId });
    });

    await expect(asAdmin(c).mutation(api.departments.remove, { id: deptId })).rejects.toThrow(
      /still belong to this department/i,
    );
  });

  it('refuses to delete a department that positions still reference', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    await createPosition(c, { departmentId: deptId });

    await expect(asAdmin(c).mutation(api.departments.remove, { id: deptId })).rejects.toThrow(
      /still reference this department/i,
    );
  });
});

describe('positions.create', () => {
  it('creates a position with trimmed title and salary bounds', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    const posId = await asAdmin(c).mutation(api.positions.create, {
      organizationId: c.organizationId,
      departmentId: deptId,
      title: '  Senior Developer  ',
      level: 'senior',
      salaryMin: 2000,
      salaryMax: 3000,
    });

    const pos = await c.t.run(async (ctx) => await ctx.db.get(posId as Id<'positions'>));
    expect(pos?.title).toBe('Senior Developer');
    expect(pos?.departmentId).toBe(deptId);
    expect(pos?.salaryMin).toBe(2000);
    expect(pos?.isActive).toBe(true);
  });

  it('refuses an empty title and an inverted salary range', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.positions.create, {
        organizationId: c.organizationId,
        title: '   ',
      }),
    ).rejects.toThrow('Position title is required');

    await expect(
      asAdmin(c).mutation(api.positions.create, {
        organizationId: c.organizationId,
        title: 'Dev',
        salaryMin: 5000,
        salaryMax: 2000,
      }),
    ).rejects.toThrow('Minimum salary cannot exceed the maximum');
  });

  it('refuses a department from another organization', async () => {
    const c = await seed();
    const foreignDept = await asForeignAdmin(c).mutation(api.departments.create, {
      organizationId: c.otherOrgId,
      name: 'Foreign Dept',
    });
    await expect(
      asAdmin(c).mutation(api.positions.create, {
        organizationId: c.organizationId,
        departmentId: foreignDept,
        title: 'Dev',
      }),
    ).rejects.toThrow('Department not found in this organization');
  });

  it('refuses writes from a plain employee', async () => {
    const c = await seed();
    await expect(
      asEmployee(c).mutation(api.positions.create, {
        organizationId: c.organizationId,
        title: 'Dev',
      }),
    ).rejects.toThrow(/staff access required/i);
  });

  it('lets a supervisor (non-admin staff) create and update', async () => {
    const c = await seed();
    const deptId = await asManager(c).mutation(api.departments.create, {
      organizationId: c.organizationId,
      name: 'QA',
    });
    const posId = await asManager(c).mutation(api.positions.create, {
      organizationId: c.organizationId,
      departmentId: deptId as Id<'departments'>,
      title: 'QA Lead',
    });

    await asManager(c).mutation(api.positions.update, {
      id: posId as Id<'positions'>,
      level: 'lead',
    });

    const pos = await c.t.run(async (ctx) => await ctx.db.get(posId as Id<'positions'>));
    expect(pos?.title).toBe('QA Lead');
    expect(pos?.level).toBe('lead');
  });
});

describe('positions.list / getById / options', () => {
  it('enriches with employeeCount and filters by department', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    const posId = await createPosition(c, { departmentId: deptId });
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { positionId: posId });
    });

    const all = await asAdmin(c).query(api.positions.list, {
      organizationId: c.organizationId,
    });
    expect(all).toHaveLength(1);
    expect(all[0].employeeCount).toBe(1);

    const byDept = await asAdmin(c).query(api.positions.list, {
      organizationId: c.organizationId,
      departmentId: deptId,
    });
    expect(byDept.map((p) => p._id)).toEqual([posId]);
  });

  it('keeps other tenants out when reached by departmentId', async () => {
    const c = await seed();
    const foreignDept = await asForeignAdmin(c).mutation(api.departments.create, {
      organizationId: c.otherOrgId,
      name: 'Foreign Dept',
    });
    await asForeignAdmin(c).mutation(api.positions.create, {
      organizationId: c.otherOrgId,
      departmentId: foreignDept,
      title: 'Foreign Dev',
    });

    // The local admin cannot see the foreign department's positions.
    const byDept = await asAdmin(c).query(api.positions.list, {
      organizationId: c.organizationId,
      departmentId: foreignDept,
    });
    expect(byDept).toHaveLength(0);
  });

  it('lets a superadmin list every position across orgs', async () => {
    const c = await seed();
    await createPosition(c);
    await asForeignAdmin(c).mutation(api.positions.create, {
      organizationId: c.otherOrgId,
      title: 'Foreign Dev',
    });

    // No orgId passed — the superadmin is not pinned to any org.
    const all = await asSuperadmin(c).query(api.positions.list, {});
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('pins a superadmin to the organizationId they pass', async () => {
    const c = await seed();
    await createPosition(c);
    await asForeignAdmin(c).mutation(api.positions.create, {
      organizationId: c.otherOrgId,
      title: 'Foreign Dev',
    });

    const acmeOnly = await asSuperadmin(c).query(api.positions.list, {
      organizationId: c.organizationId,
    });
    expect(acmeOnly.map((p) => p.title)).toEqual(['Developer']);
  });

  it('counts employees whose profile carries the positionId', async () => {
    const c = await seed();
    const posId = await createPosition(c);
    await c.t.run(async (ctx) => {
      await ctx.db.insert('userProfiles', {
        userId: c.employeeId,
        positionId: posId,
      } as never);
    });

    const rows = await asAdmin(c).query(api.positions.list, {
      organizationId: c.organizationId,
    });
    expect(rows[0].employeeCount).toBe(1);
  });

  it('options narrows by department and drops inactive rows', async () => {
    const c = await seed();
    const deptId = await createDept(c);
    const posA = await createPosition(c, { departmentId: deptId, title: 'Alpha' });
    await createPosition(c, { departmentId: deptId, title: 'Beta' });
    await c.t.run(async (ctx) => {
      await ctx.db.patch(posA, { isActive: false });
    });

    const opts = await asAdmin(c).query(api.positions.options, {
      organizationId: c.organizationId,
      departmentId: deptId,
    });
    expect(opts.map((o) => o.title)).toEqual(['Beta']);

    // Picking a department with no positions yields nothing.
    const otherDept = await createDept(c, { name: 'Empty' });
    const empty = await asAdmin(c).query(api.positions.options, {
      organizationId: c.organizationId,
      departmentId: otherDept,
    });
    expect(empty).toHaveLength(0);
  });

  it('getById hides a position from another org', async () => {
    const c = await seed();
    const foreignPos = await asForeignAdmin(c).mutation(api.positions.create, {
      organizationId: c.otherOrgId,
      title: 'Hidden',
    });
    const visible = await asAdmin(c).query(api.positions.getById, { id: foreignPos });
    expect(visible).toBeNull();
  });
});

describe('positions.update', () => {
  it('renames (trimmed) and moves a position between departments', async () => {
    const c = await seed();
    const deptA = await createDept(c, { name: 'Engineering' });
    const deptB = await createDept(c, { name: 'Platform' });
    const posId = await createPosition(c, { departmentId: deptA });

    await asAdmin(c).mutation(api.positions.update, {
      id: posId,
      title: '  Staff Engineer  ',
      departmentId: deptB,
      level: 'staff',
    });

    const pos = await c.t.run(async (ctx) => await ctx.db.get(posId));
    expect(pos?.title).toBe('Staff Engineer');
    expect(pos?.departmentId).toBe(deptB);
    expect(pos?.level).toBe('staff');
  });

  it('rejects an empty title and a foreign department move', async () => {
    const c = await seed();
    const posId = await createPosition(c);
    const foreignDept = await asForeignAdmin(c).mutation(api.departments.create, {
      organizationId: c.otherOrgId,
      name: 'Foreign Dept',
    });

    await expect(
      asAdmin(c).mutation(api.positions.update, { id: posId, title: '  ' }),
    ).rejects.toThrow('Position title is required');

    await expect(
      asAdmin(c).mutation(api.positions.update, { id: posId, departmentId: foreignDept }),
    ).rejects.toThrow('Department not found in this organization');
  });

  it('validates salary bounds against the merged values', async () => {
    const c = await seed();
    const posId = await createPosition(c, { salaryMin: 1000, salaryMax: 2000 });
    // Merged with the existing min 1000 → max 500 is below it.
    await expect(
      asAdmin(c).mutation(api.positions.update, { id: posId, salaryMax: 500 }),
    ).rejects.toThrow('Minimum salary cannot exceed the maximum');
  });

  it('blocks a foreign admin from editing', async () => {
    const c = await seed();
    const posId = await createPosition(c);
    await expect(
      asForeignAdmin(c).mutation(api.positions.update, { id: posId, title: 'X' }),
    ).rejects.toThrow(/not authorized/i);
  });
});

describe('positions.remove', () => {
  it('deletes an unreferenced position', async () => {
    const c = await seed();
    const posId = await createPosition(c);
    await asAdmin(c).mutation(api.positions.remove, { id: posId });
    const pos = await c.t.run(async (ctx) => await ctx.db.get(posId));
    expect(pos).toBeNull();
  });

  it('refuses to delete a position employees still hold', async () => {
    const c = await seed();
    const posId = await createPosition(c);
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { positionId: posId });
    });

    await expect(asAdmin(c).mutation(api.positions.remove, { id: posId })).rejects.toThrow(
      /still hold this position/i,
    );
  });

  it('blocks a foreign admin from deleting', async () => {
    const c = await seed();
    const posId = await createPosition(c);
    await expect(asForeignAdmin(c).mutation(api.positions.remove, { id: posId })).rejects.toThrow(
      /not authorized/i,
    );
  });
});
