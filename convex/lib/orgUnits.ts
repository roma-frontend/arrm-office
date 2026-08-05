/**
 * Resolving departments and positions by name.
 *
 * An employee's department is stored twice: as `departmentId` (the real link,
 * used by department head-counts and pickers) and as the denormalized string
 * `department` (shown in tables, used by the org chart). Only the admin form
 * ever wrote the id — every other creation path (SharePoint/HR sync, imID,
 * self-registration, hiring a candidate) wrote the string alone, so those people
 * were invisible in department statistics while still appearing in the org chart.
 *
 * These helpers turn an incoming name into both halves. External syncs pass
 * `create: true`: the provider is the source of truth for its structure, and
 * refusing to create the department would keep the record unlinked forever.
 */
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { DEFAULT_LIST_CAP } from './limits';

export interface OrgUnitLink {
  /** Canonical name to denormalize onto the user record. */
  name?: string;
  departmentId?: Id<'departments'>;
}

export interface PositionLink {
  title?: string;
  positionId?: Id<'positions'>;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Find (or optionally create) a department by name.
 *
 * Matching is case-insensitive and whitespace-tolerant, because provider data
 * arrives as "  Engineering" or "engineering" and creating a second department
 * for the same team is worse than a slightly fuzzy match.
 */
export async function resolveDepartmentByName(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  rawName: string | undefined,
  opts: { create?: boolean } = {},
): Promise<OrgUnitLink> {
  const name = rawName?.trim();
  if (!name) return {};

  const departments = await ctx.db
    .query('departments')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(DEFAULT_LIST_CAP);

  const match = departments.find((d) => normalize(d.name) === normalize(name));
  if (match) return { name: match.name, departmentId: match._id };
  if (!opts.create) return { name };

  const now = Date.now();
  const departmentId = await ctx.db.insert('departments', {
    organizationId,
    name,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  return { name, departmentId };
}

/** Same contract as {@link resolveDepartmentByName}, for job titles. */
export async function resolvePositionByTitle(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  rawTitle: string | undefined,
  opts: { create?: boolean; departmentId?: Id<'departments'> } = {},
): Promise<PositionLink> {
  const title = rawTitle?.trim();
  if (!title) return {};

  const positions = await ctx.db
    .query('positions')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(DEFAULT_LIST_CAP);

  const match = positions.find((p) => normalize(p.title) === normalize(title));
  if (match) {
    // Backfill the department link when the position was created without one.
    if (opts.departmentId && !match.departmentId) {
      await ctx.db.patch(match._id, { departmentId: opts.departmentId, updatedAt: Date.now() });
    }
    return { title: match.title, positionId: match._id };
  }
  if (!opts.create) return { title };

  const now = Date.now();
  const positionId = await ctx.db.insert('positions', {
    organizationId,
    departmentId: opts.departmentId,
    title,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  return { title, positionId };
}

/**
 * One call for both halves of "this person works as X in Y".
 *
 * Returns exactly the fields to spread into a `users` insert/patch.
 */
export async function resolveOrgUnitsByName(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  input: { department?: string; position?: string },
  opts: { create?: boolean } = {},
): Promise<{
  department?: string;
  departmentId?: Id<'departments'>;
  position?: string;
  positionId?: Id<'positions'>;
}> {
  const dept = await resolveDepartmentByName(ctx, organizationId, input.department, opts);
  const pos = await resolvePositionByTitle(ctx, organizationId, input.position, {
    ...opts,
    departmentId: dept.departmentId,
  });

  return {
    ...(dept.name ? { department: dept.name } : {}),
    ...(dept.departmentId ? { departmentId: dept.departmentId } : {}),
    ...(pos.title ? { position: pos.title } : {}),
    ...(pos.positionId ? { positionId: pos.positionId } : {}),
  };
}
