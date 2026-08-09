/**
 * The asset catalogue's answer to "who has this?".
 *
 * The catalogue is where someone looks to find out where a thing went, and the
 * list query returned only the holder's name — the role, the handover date and
 * the return date all needed a second click. These tests pin the enriched shape,
 * including the case that matters operationally: a return date that has passed.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './assets.ts': () => import('../../convex/assets'),
} as unknown as Record<string, () => Promise<unknown>>;

type Catalogued = {
  name: string;
  isAssigned: boolean;
  currentUser: {
    name: string;
    email?: string;
    position?: string;
    department?: string;
  } | null;
  assignedAt?: number;
  expectedReturnAt?: number;
  isReturnOverdue?: boolean;
  assignedByName?: string;
  assignmentNotes?: string;
};

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const departmentId = await ctx.db.insert('departments', {
      organizationId,
      name: 'Engineering',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 0,
      sickLeaveBalance: 0,
      familyLeaveBalance: 0,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const holderId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Anna',
      email: 'anna@acme.test',
      role: 'employee',
      position: 'Backend Developer',
      departmentId,
    });

    return { organizationId, adminId, holderId };
  });

  return { t, ...ids };
}

async function addAsset(
  ctx: Awaited<ReturnType<typeof seed>>,
  status: 'available' | 'assigned' = 'available',
) {
  return await ctx.t.run(async (dbCtx) =>
    dbCtx.db.insert('assetCatalog', {
      organizationId: ctx.organizationId,
      name: 'MacBook Pro 16',
      category: 'laptop',
      status,
      condition: 'good',
      serialNumber: 'SN-1',
      createdBy: ctx.adminId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );
}

async function listOne(ctx: Awaited<ReturnType<typeof seed>>): Promise<Catalogued> {
  const rows = (await ctx.t.query(api.assets.listAssets, {
    organizationId: ctx.organizationId,
  })) as Catalogued[];
  return rows[0]!;
}

describe('listAssets — assignment details', () => {
  it('reports an unassigned asset as free of a holder', async () => {
    const ctx = await seed();
    await addAsset(ctx);

    const row = await listOne(ctx);
    expect(row.isAssigned).toBe(false);
    expect(row.currentUser).toBeNull();
    expect(row.assignedAt).toBeUndefined();
    expect(row.expectedReturnAt).toBeUndefined();
    expect(row.assignedByName).toBeUndefined();
  });

  it('spells out who holds the asset, in what role, since when and until when', async () => {
    const ctx = await seed();
    const assetId = await addAsset(ctx);
    const assignedAt = Date.now() - 86_400_000;
    const expectedReturnAt = Date.now() + 7 * 86_400_000;

    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('assetAssignments', {
        organizationId: ctx.organizationId,
        assetId,
        assignedTo: ctx.holderId,
        assignedBy: ctx.adminId,
        assignedAt,
        expectedReturnAt,
        notes: 'Handed over at the office',
        status: 'active',
      } as never);
      await dbCtx.db.patch(assetId, { status: 'assigned' });
    });

    const row = await listOne(ctx);
    expect(row.isAssigned).toBe(true);
    expect(row.currentUser).toMatchObject({
      name: 'Anna',
      email: 'anna@acme.test',
      position: 'Backend Developer',
      department: 'Engineering',
    });
    expect(row.assignedAt).toBe(assignedAt);
    expect(row.expectedReturnAt).toBe(expectedReturnAt);
    expect(row.assignedByName).toBe('Admin');
    expect(row.assignmentNotes).toBe('Handed over at the office');
  });

  it('still reports a return date that has already passed', async () => {
    const ctx = await seed();
    const assetId = await addAsset(ctx);
    const expectedReturnAt = Date.now() - 3 * 86_400_000;

    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('assetAssignments', {
        organizationId: ctx.organizationId,
        assetId,
        assignedTo: ctx.holderId,
        assignedBy: ctx.adminId,
        assignedAt: Date.now() - 30 * 86_400_000,
        expectedReturnAt,
        status: 'active',
      } as never);
      await dbCtx.db.patch(assetId, { status: 'assigned' });
    });

    const row = await listOne(ctx);
    // The server decides this: a render that reads the clock is impure, and the
    // interface only needs to know whether to colour the date red.
    expect(row.expectedReturnAt).toBe(expectedReturnAt);
    expect(row.isReturnOverdue).toBe(true);
  });

  it('does not call a future return date overdue', async () => {
    const ctx = await seed();
    const assetId = await addAsset(ctx);

    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('assetAssignments', {
        organizationId: ctx.organizationId,
        assetId,
        assignedTo: ctx.holderId,
        assignedBy: ctx.adminId,
        assignedAt: Date.now(),
        expectedReturnAt: Date.now() + 5 * 86_400_000,
        status: 'active',
      } as never);
      await dbCtx.db.patch(assetId, { status: 'assigned' });
    });

    expect((await listOne(ctx)).isReturnOverdue).toBe(false);
  });

  it('is not overdue when no return date was agreed', async () => {
    const ctx = await seed();
    const assetId = await addAsset(ctx);

    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('assetAssignments', {
        organizationId: ctx.organizationId,
        assetId,
        assignedTo: ctx.holderId,
        assignedBy: ctx.adminId,
        assignedAt: Date.now(),
        status: 'active',
      } as never);
      await dbCtx.db.patch(assetId, { status: 'assigned' });
    });

    const row = await listOne(ctx);
    expect(row.expectedReturnAt).toBeUndefined();
    expect(row.isReturnOverdue).toBe(false);
  });

  it('ignores a returned assignment when naming the holder', async () => {
    const ctx = await seed();
    const assetId = await addAsset(ctx);

    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('assetAssignments', {
        organizationId: ctx.organizationId,
        assetId,
        assignedTo: ctx.holderId,
        assignedBy: ctx.adminId,
        assignedAt: Date.now() - 90 * 86_400_000,
        returnedAt: Date.now() - 60 * 86_400_000,
        status: 'returned',
      } as never);
    });

    const row = await listOne(ctx);
    expect(row.isAssigned).toBe(false);
    expect(row.currentUser).toBeNull();
  });

  it('leaves the role line empty for a holder without a position or department', async () => {
    const ctx = await seed();
    const assetId = await addAsset(ctx);

    const plainId = await ctx.t.run(async (dbCtx) =>
      dbCtx.db.insert('users', {
        organizationId: ctx.organizationId,
        name: 'Bagrat',
        email: 'bagrat@acme.test',
        role: 'employee',
        passwordHash: 'x',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      } as never),
    );

    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('assetAssignments', {
        organizationId: ctx.organizationId,
        assetId,
        assignedTo: plainId as Id<'users'>,
        assignedBy: ctx.adminId,
        assignedAt: Date.now(),
        status: 'active',
      } as never);
      await dbCtx.db.patch(assetId, { status: 'assigned' });
    });

    const row = await listOne(ctx);
    expect(row.currentUser?.name).toBe('Bagrat');
    expect(row.currentUser?.position).toBeUndefined();
    expect(row.currentUser?.department).toBeUndefined();
  });
});
