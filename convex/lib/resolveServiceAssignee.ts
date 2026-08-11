import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './limits';

export type ServiceKind = 'hr' | 'it';

// Department names that mark a department as owning HR / IT onboarding steps.
// Matched against every localized name so «Отдел кадров» and «HR» both hit.
export const SERVICE_DEPARTMENT_PATTERNS: Record<ServiceKind, RegExp> = {
  hr: /\b(hr|human resources|people ops|talent)\b|кадр|персонал|человеческ/i,
  it: /\b(it|ict|tech|engineering|software|devops|infrastructure)\b|информац|технолог|техническ|айти|программ/i,
};

// Fallback when the org has no matching department: recognise the function
// from a free-text department/position on the user profile.
export const SERVICE_POSITION_PATTERNS: Record<ServiceKind, RegExp> = {
  hr: /\b(hr|recruiter|talent)\b|кадр|рекрутер|персонал/i,
  it: /\b(it|sysadmin|system administrator|devops|engineer|developer)\b|сисадмин|администратор|инженер|программист|разработчик|айти/i,
};

/**
 * Resolve the person who owns HR / IT steps (onboarding, probation reminders)
 * for an organization.
 *
 * These duties belong to the corresponding department — assigning them to the
 * new hire puts someone else's job on their board. Resolution order: manager
 * of a matching department, then a staff member inside it, then anyone whose
 * profile says they do that job, then an org admin. `null` when the org has
 * nobody — the caller falls back to its own default.
 */
export async function resolveServiceAssignee(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<'organizations'>,
  kind: ServiceKind,
  excludeUserId: Id<'users'>,
): Promise<Id<'users'> | null> {
  const eligible = (u: Doc<'users'> | null | undefined): u is Doc<'users'> =>
    !!u && u._id !== excludeUserId && u.isActive && u.organizationId === orgId;

  const departments = await ctx.db
    .query('departments')
    .withIndex('by_org', (q) => q.eq('organizationId', orgId))
    .take(DEFAULT_LIST_CAP);

  const deptPattern = SERVICE_DEPARTMENT_PATTERNS[kind];
  const matching = departments.filter(
    (d) =>
      d.isActive !== false &&
      deptPattern.test([d.name, d.nameEn, d.nameRu, d.nameHy].filter(Boolean).join(' ')),
  );

  for (const dept of matching) {
    if (dept.managerId) {
      const manager = await ctx.db.get(dept.managerId);
      if (eligible(manager)) return manager._id;
    }
    const members = await ctx.db
      .query('users')
      .withIndex('by_department', (q) => q.eq('departmentId', dept._id))
      .take(SMALL_LIST_CAP);
    const lead = members.find(
      (m) => eligible(m) && (m.role === 'admin' || m.role === 'supervisor'),
    );
    if (lead) return lead._id;
    const member = members.find((m) => eligible(m));
    if (member) return member._id;
  }

  const orgUsers = await ctx.db
    .query('users')
    .withIndex('by_org', (q) => q.eq('organizationId', orgId))
    .take(DEFAULT_LIST_CAP);

  const positionPattern = SERVICE_POSITION_PATTERNS[kind];
  const byProfile = orgUsers.find(
    (u) => eligible(u) && positionPattern.test(`${u.department ?? ''} ${u.position ?? ''}`),
  );
  if (byProfile) return byProfile._id;

  const admin = orgUsers.find((u) => eligible(u) && u.role === 'admin');
  return admin?._id ?? null;
}

/** All staff who should hear about an HR process: HR owner + org admins. */
export async function resolveHrAudience(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<'organizations'>,
  excludeUserId?: Id<'users'>,
): Promise<Id<'users'>[]> {
  const audience = new Set<Id<'users'>>();
  const eligible = (id: Id<'users'>) => id !== excludeUserId;
  if (excludeUserId) {
    const hr = await resolveServiceAssignee(ctx, orgId, 'hr', excludeUserId);
    if (hr) audience.add(hr);
  }
  const admins = await ctx.db
    .query('users')
    .withIndex('by_org_role', (q) => q.eq('organizationId', orgId).eq('role', 'admin'))
    .take(DEFAULT_LIST_CAP);
  for (const admin of admins) {
    if (admin.isActive && eligible(admin._id)) audience.add(admin._id);
  }
  return [...audience];
}
