/**
 * Capability grants — what a member of an organization may do.
 *
 * WHY THIS EXISTS
 *   `users.role` was being asked to mean five different things at once:
 *   permission tier, platform-operator flag, approval authority, visibility
 *   ceiling and implicit seniority. Because those meanings shared one field,
 *   "Tigran is more senior than Karine" was inexpressible — both are `admin`,
 *   and rank equality is what the code used to decide who may act on whom.
 *
 *   Capabilities split the *permission* meaning out. Seniority now lives in the
 *   reporting line (`users.supervisorId` + `organizations.headUserId`) and job
 *   classification lives on the position. Nothing in one axis may be inferred
 *   from another.
 *
 * SCOPE OF THIS FILE
 *   Capabilities are derived from `role` for now — a role rename is a large,
 *   risky sweep, and deriving keeps a single source of truth instead of adding
 *   a grants table nothing writes to. Call sites migrate to `requireCapability`
 *   module by module; `requireOrgAdmin`/`requireOrgSupervisor` keep working
 *   meanwhile.
 *
 *   Only capabilities that are actually enforced somewhere are listed. Adding a
 *   name here that no call site checks would recreate the dead-config problem
 *   this design is meant to remove.
 */

import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export const CAPABILITIES = [
  /** Approve leave for people in your own subtree (the reporting line decides). */
  'leave.approve',
  /** Approve leave for anyone in the organization, chain or not (HR/admin). */
  'leave.approve.org',
  /** Read every member of the organization, chain or not (HR/admin). */
  'users.read.org',
  /** Record attendance for somebody other than yourself. */
  'attendance.manage',
  /** Rate somebody's performance. */
  'ratings.manage',
  /** Set somebody's salary, bonuses and hourly rate. */
  'compensation.manage',
  /** Change org-level structure: the head of the organization, positions, chart. */
  'org.manage',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Minimal user shape a capability decision needs. */
export interface CapabilitySubject {
  role?: string;
  email?: string;
}

/**
 * Role → capabilities at introduction.
 *
 * `driver` is a job, not a privilege: it grants exactly what `employee` grants.
 * `superadmin` is the platform operator, not an org member — it is handled by
 * `isSuperadmin` at the call sites rather than by holding org capabilities.
 */
const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  superadmin: CAPABILITIES,
  admin: [
    'leave.approve',
    'leave.approve.org',
    'users.read.org',
    'attendance.manage',
    'ratings.manage',
    'compensation.manage',
    'org.manage',
  ],
  supervisor: ['leave.approve', 'attendance.manage', 'ratings.manage', 'compensation.manage'],
  employee: [],
  driver: [],
};

export function capabilitiesForRole(role: string | undefined): readonly Capability[] {
  if (!role) return [];
  return ROLE_CAPABILITIES[role] ?? [];
}

/**
 * Does this capability holder reach the whole organization, or only their own
 * subtree?
 *
 * Several capabilities are held by both HR/admins and managers but mean
 * different things to each: HR sets anyone's salary, a manager only their own
 * reports'. Rather than inventing a `.org` twin for every capability, the call
 * site asks this once and falls back to a reporting-line check.
 */
export function hasOrgWideReach(user: CapabilitySubject | null | undefined): boolean {
  return hasCapability(user, 'users.read.org');
}

/** Does this user hold `capability`? Pure — no DB access, safe in loops. */
export function hasCapability(
  user: CapabilitySubject | null | undefined,
  capability: Capability,
): boolean {
  if (!user) return false;
  return capabilitiesForRole(user.role).includes(capability);
}

/**
 * Require `capability` from the caller, optionally within a specific org.
 *
 * A platform superadmin passes any check; every other holder must belong to
 * `organizationId` when one is given, so a capability can never reach across
 * tenants.
 */
export async function requireCapability(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  capability: Capability,
  organizationId?: Id<'organizations'>,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error('User not found');

  if (user.role === 'superadmin') return;

  if (!hasCapability(user, capability)) {
    throw new Error(`Insufficient permissions. Required capability: ${capability}`);
  }

  if (organizationId && user.organizationId !== organizationId) {
    throw new Error('Access denied: cross-organization operation');
  }
}
