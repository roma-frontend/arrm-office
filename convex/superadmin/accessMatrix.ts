/**
 * Superadmin Access Matrix.
 *
 * A single-pane view of who-can-do-what across every tenant: the capability
 * catalog (from lib/capabilities.ts — the single source of truth for role
 * grants), the role → capability grid, how the roles are distributed across
 * organizations, and drift alerts for accounts whose role is not in the enum.
 */

import { query } from '../_generated/server';
import type { QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { getAuthCaller } from '../lib/getAuthCaller';
import { CAPABILITIES, capabilitiesForRole, type Capability } from '../lib/capabilities';
import { loadDriverPositionIds, isDriverUser } from '../lib/driverEligibility';
import { MAX_PAGE_SIZE } from '../pagination';

/** Human-readable descriptions for the matrix grid — one per capability. */
const CAPABILITY_DESCRIPTIONS: Record<Capability, string> = {
  'leave.approve': 'Approve leave for people in your own reporting subtree.',
  'leave.approve.org': 'Approve leave for anyone in the organization, chain or not (HR/admin).',
  'users.read.org': 'Read every member of the organization, chain or not (HR/admin).',
  'attendance.manage': 'Record attendance for somebody other than yourself.',
  'ratings.manage': "Rate somebody's performance.",
  'compensation.manage': "Set somebody's salary, bonuses and hourly rate.",
  'org.manage': 'Change org-level structure: head of the organization, positions, chart.',
};

/** Display order and labels for the role tiers. */
const ROLES = ['superadmin', 'admin', 'supervisor', 'employee', 'driver'] as const;

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  superadmin: 'Platform operator',
  admin: 'Organization admin',
  supervisor: 'Manager',
  employee: 'Employee',
  // Drivers are identified by their position (`isDriverPosition`), not by a
  // role — the `driver` tier exists only as the legacy fallback bucket.
  driver: 'Fleet driver (by position)',
};

async function requireSuperadmin(ctx: QueryCtx) {
  const caller = await getAuthCaller(ctx);
  if (!caller) return null;
  if (caller.role !== 'superadmin') return null;
  return caller;
}

export const getAccessMatrix = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireSuperadmin(ctx);
    if (!caller) return null;

    // Capability catalog.
    const capabilities = CAPABILITIES.map((cap) => ({
      key: cap,
      description: CAPABILITY_DESCRIPTIONS[cap] ?? '',
    }));

    // Role → capabilities grid.
    const roles = ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      capabilities: capabilitiesForRole(role),
    }));

    // Role distribution per organization + global counts.
    //
    // Driving is a job, not a permission tier: the `driver` bucket counts users
    // whose position is flagged `isDriverPosition` (with the legacy
    // `role === 'driver'` fallback), exactly like the fleet queries do. Everyone
    // else is counted by their permission role.
    const orgs = await ctx.db.query('organizations').take(MAX_PAGE_SIZE);
    const users = await ctx.db.query('users').take(MAX_PAGE_SIZE * 2);
    const driverPositionIds = await loadDriverPositionIds(ctx);

    // Position is canonical on userProfiles; users keeps a dual-written copy
    // (see lib/driverEligibility.ts). Batch-load profiles so the driver bucket
    // classifies by the same merged source as the fleet queries.
    const profilesByUser = new Map<string, { positionId?: Id<'positions'> }>();
    const profiles = await ctx.db.query('userProfiles').take(MAX_PAGE_SIZE * 2);
    for (const p of profiles) profilesByUser.set(String(p.userId), p);

    const globalCounts: Record<string, number> = {};
    for (const role of ROLES) globalCounts[role] = 0;
    const perOrg: Record<
      string,
      { orgId: string; orgName: string; counts: Record<string, number> }
    > = {};

    const knownRoles = new Set<string>(ROLES);
    const drift: { userId: string; name: string; email: string; role: string; orgName: string }[] =
      [];

    const bump = (role: string, orgId: string | null | undefined) => {
      globalCounts[role] = (globalCounts[role] ?? 0) + 1;
      if (orgId) {
        const key = orgId;
        perOrg[key] ??= {
          orgId: key,
          orgName: '',
          counts: Object.fromEntries(ROLES.map((r) => [r, 0])),
        };
        perOrg[key].counts[role] = (perOrg[key].counts[role] ?? 0) + 1;
      }
    };

    for (const u of users) {
      if (!u.isActive) continue;

      // Position is canonical for job classification; users keeps a dual-written
      // copy (see lib/driverEligibility.ts).
      const positionId = profilesByUser.get(String(u._id))?.positionId ?? u.positionId;
      if (isDriverUser({ role: u.role, positionId }, driverPositionIds)) {
        bump('driver', u.organizationId);
        continue;
      }

      const role = u.role ?? 'unknown';
      if (!knownRoles.has(role)) {
        const org = u.organizationId ? await ctx.db.get(u.organizationId) : null;
        drift.push({
          userId: u._id,
          name: u.name ?? '—',
          email: u.email ?? '—',
          role,
          orgName: org?.name ?? '—',
        });
        continue;
      }
      bump(role, u.organizationId);
    }
    for (const org of orgs) {
      if (perOrg[org._id]) perOrg[org._id]!.orgName = org.name;
    }

    return {
      capabilities,
      roles,
      globalCounts,
      perOrg: Object.values(perOrg)
        .filter((o) => o.orgName)
        .sort((a, b) => a.orgName.localeCompare(b.orgName)),
      drift,
      generatedAt: Date.now(),
    };
  },
});
