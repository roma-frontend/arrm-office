/**
 * Integration tests for building the org chart from the reporting line.
 *
 * The previous generator grouped everyone by department into Company →
 * Department → flat people, so depth was always 3 and the CEO rendered as a leaf
 * beside their own reports. It also deleted every node first, destroying any
 * hand-made structure. Both are what these tests pin down.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './orgchart.ts': () => import('../../convex/orgchart'),
  './reporting.ts': () => import('../../convex/reporting'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/capabilities.ts': () => import('../../convex/lib/capabilities'),
  './lib/reportingLine.ts': () => import('../../convex/lib/reportingLine'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './pagination.ts': () => import('../../convex/pagination'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Profix',
      slug: `profix-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const ceoPositionId = await ctx.db.insert('positions', {
      organizationId,
      title: 'Chief Executive Officer',
      rank: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);
    const hrPositionId = await ctx.db.insert('positions', {
      organizationId,
      title: 'HR Manager',
      rank: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const base = {
      organizationId,
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      dayOffBalance: 4,
      createdAt: Date.now(),
    };

    const tigranId = await ctx.db.insert('users', {
      ...base,
      name: 'Tigran',
      email: 'tigran@profix.test',
      role: 'admin',
      department: 'Management',
      positionId: ceoPositionId,
    });
    const karineId = await ctx.db.insert('users', {
      ...base,
      name: 'Karine',
      email: 'karine@profix.test',
      role: 'admin',
      department: 'HR',
      positionId: hrPositionId,
      supervisorId: tigranId,
    });
    const annaId = await ctx.db.insert('users', {
      ...base,
      name: 'Anna',
      email: 'anna@profix.test',
      role: 'employee',
      department: 'HR',
      supervisorId: karineId,
    });
    // Nobody's report and not the head: unplaced.
    const danaId = await ctx.db.insert('users', {
      ...base,
      name: 'Dana',
      email: 'dana@profix.test',
      role: 'driver',
      department: 'Logistics',
    });

    await ctx.db.patch(organizationId, { headUserId: tigranId });

    return { organizationId, tigranId, karineId, annaId, danaId };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'tigran@profix.test' });

async function nodes(c: Ctx): Promise<Doc<'orgChartNodes'>[]> {
  return c.t.run((ctx) => ctx.db.query('orgChartNodes').collect());
}

describe('generateOrgChartFromUsers', () => {
  it('parents each person by their manager, rooted at the head', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.orgchart.generateOrgChartFromUsers, {
      organizationId: c.organizationId,
    });

    const all = await nodes(c);
    const byName = new Map(all.map((n) => [n.name, n]));
    const tigran = byName.get('Tigran')!;
    const karine = byName.get('Karine')!;
    const anna = byName.get('Anna')!;
    const dana = byName.get('Dana')!;

    // Three levels deep, which the department-based generator could never produce.
    expect(tigran.parentId).toBeUndefined();
    expect(karine.parentId).toBe(tigran._id);
    expect(anna.parentId).toBe(karine._id);

    // No Company or Department scaffolding — the tree is people.
    expect(all.every((n) => n.type === 'person')).toBe(true);

    // The unplaced person is a separate root, not a child of the CEO.
    expect(dana.parentId).toBeUndefined();
    expect(tigran.order).toBeLessThan(dana.order!);
  });

  it('labels nodes from the position record and never from the role', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.orgchart.generateOrgChartFromUsers, {
      organizationId: c.organizationId,
    });

    const byName = new Map((await nodes(c)).map((n) => [n.name, n]));
    expect(byName.get('Tigran')?.title).toBe('Chief Executive Officer');
    expect(byName.get('Karine')?.title).toBe('HR Manager');
    // Anna has no position at all: an empty label, not "employee".
    expect(byName.get('Anna')?.title).toBeUndefined();
    expect(byName.get('Dana')?.title).toBeUndefined();
  });

  it('keeps hand-made nodes and node identity across a regenerate', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.orgchart.generateOrgChartFromUsers, {
      organizationId: c.organizationId,
    });
    const first = await nodes(c);
    const karineIdBefore = first.find((n) => n.name === 'Karine')!._id;

    // A vacancy — the kind of thing the reporting line cannot express.
    const vacancyId = await asAdmin(c).mutation(api.orgchart.createNode, {
      organizationId: c.organizationId,
      name: 'Open: Recruiter',
      type: 'group',
      parentId: karineIdBefore,
    });

    const result = (await asAdmin(c).mutation(api.orgchart.generateOrgChartFromUsers, {
      organizationId: c.organizationId,
    })) as { preservedManual: number; created: number; updated: number };

    const after = await nodes(c);
    expect(result.preservedManual).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(4);
    expect(after.find((n) => n._id === vacancyId)).toBeDefined();
    // Karine's node was patched, not recreated, so the vacancy still hangs off it.
    expect(after.find((n) => n.name === 'Karine')!._id).toBe(karineIdBefore);
    expect(after.find((n) => n._id === vacancyId)!.parentId).toBe(karineIdBefore);
  });

  it('clears the old department scaffolding on the first run', async () => {
    const c = await seed();
    const legacyId = await c.t.run((ctx) =>
      ctx.db.insert('orgChartNodes', {
        organizationId: c.organizationId,
        name: 'HR',
        type: 'department',
        title: 'HR',
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never),
    );

    await asAdmin(c).mutation(api.orgchart.generateOrgChartFromUsers, {
      organizationId: c.organizationId,
    });

    const after = await nodes(c);
    expect(after.find((n) => n._id === legacyId)).toBeUndefined();
  });

  it('refuses a caller without org.manage', async () => {
    const c = await seed();
    await expect(
      c.t
        .withIdentity({ email: 'anna@profix.test' })
        .mutation(api.orgchart.generateOrgChartFromUsers, { organizationId: c.organizationId }),
    ).rejects.toThrow('org.manage');
  });
});

describe('reporting.getOrgHierarchyTree', () => {
  it('roots at the head and flags who is not placed', async () => {
    const c = await seed();
    const tree = (await asAdmin(c).query(api.reporting.getOrgHierarchyTree, {
      organizationId: c.organizationId,
    })) as Array<{
      _id: Id<'users'>;
      isHead: boolean;
      isUnassigned: boolean;
      children: Array<{ _id: Id<'users'>; children: Array<{ _id: Id<'users'> }> }>;
    }>;

    expect(tree).toHaveLength(2);
    expect(tree[0]!._id).toBe(c.tigranId);
    expect(tree[0]!.isHead).toBe(true);
    expect(tree[0]!.children[0]!._id).toBe(c.karineId);
    expect(tree[0]!.children[0]!.children[0]!._id).toBe(c.annaId);
    expect(tree[1]!._id).toBe(c.danaId);
    expect(tree[1]!.isUnassigned).toBe(true);
  });
});

describe('reporting.setOrganizationHead', () => {
  it('refuses someone who reports to another person', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.reporting.setOrganizationHead, {
        organizationId: c.organizationId,
        userId: c.karineId,
      }),
    ).rejects.toThrow('cannot report to anyone');
  });

  it('accepts an unmanaged member and audits the change', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.reporting.setOrganizationHead, {
      organizationId: c.organizationId,
      userId: c.danaId,
    });

    const state = await c.t.run(async (ctx) => ({
      org: await ctx.db.get(c.organizationId),
      audits: await ctx.db.query('auditLogs').collect(),
    }));
    expect(state.org?.headUserId).toBe(c.danaId);
    expect(state.audits.map((a) => a.action)).toContain('org_head_set');
  });
});

// ── Configuring the chart configures the line ───────────────────────────────
describe('re-parenting a person in the chart', () => {
  async function generated(c: Ctx) {
    await asAdmin(c).mutation(api.orgchart.generateOrgChartFromUsers, {
      organizationId: c.organizationId,
    });
    const all = await nodes(c);
    return new Map(all.map((n) => [n.name, n]));
  }

  it('writes the reporting line instead of pinning a manual override', async () => {
    const c = await seed();
    const byName = await generated(c);

    // Anna reports to Karine; move her under Tigran directly.
    const result = (await asAdmin(c).mutation(api.orgchart.moveNode, {
      nodeId: byName.get('Anna')!._id,
      newParentId: byName.get('Tigran')!._id,
    })) as { reassignedManager: boolean };

    expect(result.reassignedManager).toBe(true);

    const state = await c.t.run(async (ctx) => ({
      anna: await ctx.db.get(c.annaId),
      node: await ctx.db.get(byName.get('Anna')!._id),
    }));
    expect(state.anna?.supervisorId).toBe(c.tigranId);
    // Still owned by the generator, because the chart now agrees with the line.
    expect(state.node?.source).toBe('auto');
    expect(state.node?.parentId).toBe(byName.get('Tigran')!._id);
  });

  it('refuses a move that would close a loop', async () => {
    const c = await seed();
    const byName = await generated(c);

    // Karine manages Anna, so Karine cannot come to report to Anna. `moveNode`
    // catches it at the node level first; the line-level guard below covers the
    // path that has no node-level check.
    await expect(
      asAdmin(c).mutation(api.orgchart.moveNode, {
        nodeId: byName.get('Karine')!._id,
        newParentId: byName.get('Anna')!._id,
      }),
    ).rejects.toThrow('its own descendant');

    await expect(
      asAdmin(c).mutation(api.orgchart.updateNode, {
        nodeId: byName.get('Karine')!._id,
        name: 'Karine',
        parentId: byName.get('Anna')!._id,
      }),
    ).rejects.toThrow('circular reporting line');
  });

  it('detaching a person clears their manager', async () => {
    const c = await seed();
    const byName = await generated(c);

    await asAdmin(c).mutation(api.orgchart.moveNode, {
      nodeId: byName.get('Anna')!._id,
    });

    const anna = await c.t.run((ctx) => ctx.db.get(c.annaId));
    expect(anna?.supervisorId).toBeUndefined();
  });

  it('keeps the plain manual behaviour for a box the line cannot express', async () => {
    const c = await seed();
    const byName = await generated(c);

    const boxId = await asAdmin(c).mutation(api.orgchart.createNode, {
      organizationId: c.organizationId,
      name: 'Logistics',
      type: 'department',
    });

    const result = (await asAdmin(c).mutation(api.orgchart.moveNode, {
      nodeId: boxId,
      newParentId: byName.get('Tigran')!._id,
    })) as { reassignedManager: boolean };

    expect(result.reassignedManager).toBe(false);
    const box = await c.t.run((ctx) => ctx.db.get(boxId));
    expect(box?.source).toBe('manual');
    expect(box?.parentId).toBe(byName.get('Tigran')!._id);
  });

  it('the edit dialog’s parent field goes through the same path', async () => {
    const c = await seed();
    const byName = await generated(c);

    await asAdmin(c).mutation(api.orgchart.updateNode, {
      nodeId: byName.get('Anna')!._id,
      name: 'Anna',
      parentId: byName.get('Tigran')!._id,
    });

    const anna = await c.t.run((ctx) => ctx.db.get(c.annaId));
    expect(anna?.supervisorId).toBe(c.tigranId);
  });
});
