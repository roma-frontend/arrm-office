/**
 * Tests for convex/lib/orgUnits.ts — resolving department/position names into
 * ids, with optional creation for external syncs and the combined helper.
 */

import { jest, describe, it, expect } from '@jest/globals';

// The module only imports types from `_generated/server` (erased at runtime),
// so no module mocks are needed — pure functions + a fake ctx.
import {
  resolveDepartmentByName,
  resolvePositionByTitle,
  resolveOrgUnitsByName,
} from '../../convex/lib/orgUnits';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';

// Query builder fake: predicates are *executed* so their bodies count as
// covered lines (like the real Convex query layer would run them).
function makeQueryBuilder() {
  const q: any = {};
  q.eq = jest.fn(() => q);
  q.neq = jest.fn(() => q);
  q.field = jest.fn(() => q);
  return q;
}

function makeChain(rows: any[] = []) {
  const node: any = {};
  const q = makeQueryBuilder();
  node.take = jest.fn().mockResolvedValue(rows);
  node.first = jest.fn().mockResolvedValue(null);
  node.order = jest.fn().mockReturnValue(node);
  node.filter = jest.fn((pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.withIndex = jest.fn((_name: string, pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  return node;
}

function makeCtx(rowsByTable: Record<string, any[]> = {}) {
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get: jest.fn().mockResolvedValue(null),
    insert,
    patch,
    delete: jest.fn(),
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain(rowsByTable[table] ?? []));
      return chains.get(table)!;
    }),
  };
  return { ctx: { db }, insert, patch, chains, db };
}

// ── resolveDepartmentByName ──────────────────────────────────────────────────
describe('resolveDepartmentByName', () => {
  it('returns an empty link for a missing name', async () => {
    const { ctx } = makeCtx();
    await expect(resolveDepartmentByName(ctx as any, ORG_A, undefined)).resolves.toEqual({});
    await expect(resolveDepartmentByName(ctx as any, ORG_A, '   ')).resolves.toEqual({});
  });

  it('matches an existing department case-insensitively with whitespace tolerance', async () => {
    const { ctx, db } = makeCtx({
      departments: [{ _id: 'dept_1', name: 'Engineering' }],
    });

    const res = await resolveDepartmentByName(ctx as any, ORG_A, '  engineering  ');

    expect(res).toEqual({ name: 'Engineering', departmentId: 'dept_1' });
    expect(db.query).toHaveBeenCalledWith('departments');
    expect(db.query('departments').withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('returns just the name when no match and create is disabled', async () => {
    const { ctx } = makeCtx({ departments: [] });

    const res = await resolveDepartmentByName(ctx as any, ORG_A, 'Marketing');

    expect(res).toEqual({ name: 'Marketing' });
  });

  it('creates a department when create is enabled and no match exists', async () => {
    const { ctx, insert } = makeCtx({ departments: [] });

    const res = await resolveDepartmentByName(ctx as any, ORG_A, 'Marketing', { create: true });

    expect(res).toEqual({ name: 'Marketing', departmentId: 'new_id' });
    expect(insert).toHaveBeenCalledWith(
      'departments',
      expect.objectContaining({
        organizationId: ORG_A,
        name: 'Marketing',
        isActive: true,
        createdAt: expect.any(Number),
      }),
    );
  });

  it('does not create a duplicate when a case-insensitive match exists', async () => {
    const { ctx, insert } = makeCtx({
      departments: [{ _id: 'dept_1', name: 'engineering' }],
    });

    const res = await resolveDepartmentByName(ctx as any, ORG_A, 'Engineering', { create: true });

    expect(res).toEqual({ name: 'engineering', departmentId: 'dept_1' });
    expect(insert).not.toHaveBeenCalled();
  });
});

// ── resolvePositionByTitle ───────────────────────────────────────────────────
describe('resolvePositionByTitle', () => {
  it('returns an empty link for a missing title', async () => {
    const { ctx } = makeCtx();
    await expect(resolvePositionByTitle(ctx as any, ORG_A, undefined)).resolves.toEqual({});
  });

  it('matches an existing position and backfills the department link when missing', async () => {
    const { ctx, patch } = makeCtx({
      positions: [{ _id: 'pos_1', title: 'Developer' }],
    });

    const res = await resolvePositionByTitle(ctx as any, ORG_A, 'developer', {
      departmentId: 'dept_1',
    });

    expect(res).toEqual({ title: 'Developer', positionId: 'pos_1' });
    expect(patch).toHaveBeenCalledWith(
      'pos_1',
      expect.objectContaining({ departmentId: 'dept_1', updatedAt: expect.any(Number) }),
    );
  });

  it('does not backfill when the position already has a department', async () => {
    const { ctx, patch } = makeCtx({
      positions: [{ _id: 'pos_1', title: 'Developer', departmentId: 'dept_x' }],
    });

    const res = await resolvePositionByTitle(ctx as any, ORG_A, 'Developer', {
      departmentId: 'dept_1',
    });

    expect(res.positionId).toBe('pos_1');
    expect(patch).not.toHaveBeenCalled();
  });

  it('returns just the title when no match and create is disabled', async () => {
    const { ctx } = makeCtx({ positions: [] });

    const res = await resolvePositionByTitle(ctx as any, ORG_A, 'QA');

    expect(res).toEqual({ title: 'QA' });
  });

  it('creates a position with the department link when create is enabled', async () => {
    const { ctx, insert } = makeCtx({ positions: [] });

    const res = await resolvePositionByTitle(ctx as any, ORG_A, 'QA', {
      create: true,
      departmentId: 'dept_1',
    });

    expect(res).toEqual({ title: 'QA', positionId: 'new_id' });
    expect(insert).toHaveBeenCalledWith(
      'positions',
      expect.objectContaining({
        organizationId: ORG_A,
        departmentId: 'dept_1',
        title: 'QA',
        isActive: true,
      }),
    );
  });
});

// ── resolveOrgUnitsByName ────────────────────────────────────────────────────
describe('resolveOrgUnitsByName', () => {
  it('combines department and position resolutions into a spreadable result', async () => {
    const { ctx, insert } = makeCtx({ departments: [], positions: [] });

    const res = await resolveOrgUnitsByName(
      ctx as any,
      ORG_A,
      {
        department: 'Engineering',
        position: 'Developer',
      },
      { create: true },
    );

    expect(res).toEqual({
      department: 'Engineering',
      departmentId: 'new_id',
      position: 'Developer',
      positionId: 'new_id',
    });
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('omits empty fields when nothing resolves', async () => {
    const { ctx } = makeCtx({ departments: [], positions: [] });

    const res = await resolveOrgUnitsByName(ctx as any, ORG_A, {});

    expect(res).toEqual({});
  });

  it('passes the resolved department id into the position resolver', async () => {
    const { ctx, insert } = makeCtx({ departments: [], positions: [] });

    await resolveOrgUnitsByName(
      ctx as any,
      ORG_A,
      {
        department: 'Eng',
        position: 'Dev',
      },
      { create: true },
    );

    // The position insert must carry the departmentId resolved from the first call.
    expect(insert).toHaveBeenCalledWith(
      'positions',
      expect.objectContaining({ departmentId: 'new_id' }),
    );
  });
});
