import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { getProfile } from './lib/userProfile';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import {
  assertAssignable,
  resolveSupervisorId,
  writeSupervisorId,
  getOrgHeadId,
} from './lib/reportingLine';
import { requireCapability } from './lib/capabilities';

// ── Reporting Line ───────────────────────────────────────────────────────────
// Returns the chain of command: employee → supervisor → their supervisor → …
// up to the top (org admin or root). Also includes direct reports of the target.

export const getReportingLine = query({
  args: {
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, { userId, organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return null;

    const targetUser = await ctx.db.get(userId);
    if (!targetUser) return null;

    // ── Resolve org ──────────────────────────────────────────────────────
    const orgId = organizationId ?? targetUser.organizationId;
    if (!orgId) return null;

    // Only colleagues (or a superadmin) may inspect someone's reporting line.
    if (!isSuperadmin(requester) && requester.organizationId !== targetUser.organizationId) {
      return null;
    }

    // ── Walk up the chain (max 10 hops, cycle-safe) ──────────────────────
    const ancestors: Array<{
      _id: Id<'users'>;
      name: string;
      role: string;
      position?: string;
      department?: string;
      avatarUrl?: string;
      email: string;
    }> = [];

    const seen = new Set<string>();
    let currentId: Id<'users'> | undefined = await resolveSupervisorId(ctx, targetUser);

    for (let hops = 0; hops < 10 && currentId; hops++) {
      if (seen.has(currentId)) break;
      seen.add(currentId);

      const sup = await ctx.db.get(currentId);
      if (!sup || !sup.isActive) break;

      const profile = await getProfile(ctx, currentId);
      ancestors.push({
        _id: sup._id,
        name: sup.name,
        role: sup.role,
        position: sup.position ?? profile?.position,
        department: sup.department ?? profile?.department,
        avatarUrl: sup.avatarUrl ?? profile?.avatarUrl,
        email: sup.email,
      });

      currentId = await resolveSupervisorId(ctx, sup);
    }

    // ── Walk down the chain (direct reports) ────────────────────────────
    const directReports = await ctx.db
      .query('users')
      .withIndex('by_supervisor', (q) => q.eq('supervisorId', userId))
      .filter((q) => q.eq(q.field('isActive'), true))
      .take(DEFAULT_LIST_CAP);

    const reportsData = await Promise.all(
      directReports.map(async (r) => {
        const profile = await getProfile(ctx, r._id);
        return {
          _id: r._id,
          name: r.name,
          role: r.role,
          position: r.position ?? profile?.position,
          department: r.department ?? profile?.department,
          avatarUrl: r.avatarUrl ?? profile?.avatarUrl,
          email: r.email,
          employeeType: r.employeeType,
        };
      }),
    );

    // ── The subject ─────────────────────────────────────────────────────
    const subjectProfile = await getProfile(ctx, userId);
    const subject = {
      _id: targetUser._id,
      name: targetUser.name,
      role: targetUser.role,
      position: targetUser.position ?? subjectProfile?.position,
      department: targetUser.department ?? subjectProfile?.department,
      avatarUrl: targetUser.avatarUrl ?? subjectProfile?.avatarUrl,
      email: targetUser.email,
      employeeType: targetUser.employeeType,
      supervisorId: await resolveSupervisorId(ctx, targetUser),
    };

    return {
      subject,
      // Walked bottom-up, so reverse to match the documented (and rendered)
      // order: top-level first (CEO → … → direct supervisor).
      ancestors: ancestors.reverse(),
      directReports: reportsData,
    };
  },
});

// ── Get potential managers (searchable) ─────────────────────────────────────
// Returns users who can be assigned as managers: admins, supervisors, and
// optionally any active user in the org.

export const getPotentialManagers = query({
  args: {
    organizationId: v.id('organizations'),
    searchQuery: v.optional(v.string()),
    excludeUserId: v.optional(v.id('users')),
  },
  handler: async (ctx, { organizationId, searchQuery, excludeUserId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];
    if (!isSuperadmin(requester) && requester.organizationId !== organizationId) return [];

    // Fetch all active users in the org (capped)
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(XLARGE_LIST_CAP);

    // Filter: active, not superadmin, not self
    let candidates = users.filter(
      (u) =>
        u.isActive && u.role !== 'superadmin' && (excludeUserId ? u._id !== excludeUserId : true),
    );

    // Search by name, email, department, position
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      candidates = candidates.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.department ?? '').toLowerCase().includes(q) ||
          (u.position ?? '').toLowerCase().includes(q),
      );
    }

    // Order: the head of the organization first, then by position rank (0 = top),
    // then alphabetically. Ranking by *role* was the old behaviour and it is
    // exactly the conflation this model removes — an `admin` is not thereby
    // senior to a `supervisor`, and seniority is not a permission.
    const positions = await ctx.db
      .query('positions')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(XLARGE_LIST_CAP);
    const rankByPosition = new Map(positions.map((p) => [p._id as string, p.rank]));
    const headId = await getOrgHeadId(ctx, organizationId);

    const rankOf = (u: (typeof candidates)[number]): number => {
      if (headId && u._id === headId) return -1;
      const rank = u.positionId ? rankByPosition.get(u.positionId) : undefined;
      return rank ?? Number.MAX_SAFE_INTEGER;
    };
    candidates.sort((a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name));

    // Limit and format
    return candidates.slice(0, 50).map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      position: u.position,
      avatarUrl: u.avatarUrl,
      isActive: u.isActive,
    }));
  },
});

// ── Assign Manager ──────────────────────────────────────────────────────────
export const assignManager = mutation({
  args: {
    employeeId: v.id('users'),
    supervisorId: v.optional(v.id('users')), // omitted = remove manager
  },
  handler: async (ctx, { employeeId, supervisorId }) => {
    // Trust the authenticated identity, never a client-supplied adminId.
    const admin = await getAuthCaller(ctx);
    if (!admin) throw new Error('Not authenticated');
    const isSuperadminUser = isSuperadmin(admin);
    if (!isSuperadminUser && admin.role !== 'admin' && admin.role !== 'supervisor') {
      throw new Error('Insufficient permissions to assign managers');
    }

    const employee = await ctx.db.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    // Verify admin has access to this employee's org
    if (!isSuperadminUser && admin.organizationId !== employee.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    // If supervisorId provided, verify they exist and are in the same org
    if (supervisorId) {
      const supervisor = await ctx.db.get(supervisorId);
      if (!supervisor) throw new Error('Supervisor not found');
      if (!isSuperadminUser && supervisor.organizationId !== employee.organizationId) {
        throw new Error('Supervisor must be in the same organization');
      }
      if (!supervisor.isActive) throw new Error('Supervisor account is inactive');

      // Self-management and cycles: one shared guard, so every writer of
      // `supervisorId` rejects the same assignments.
      await assertAssignable(ctx, employeeId, supervisorId);
    }

    // Canonical field + profile mirror, in one call.
    await writeSupervisorId(ctx, employeeId, supervisorId);

    // Audit log
    const supervisorName = supervisorId
      ? ((await ctx.db.get(supervisorId))?.name ?? 'Unknown')
      : 'None';

    await ctx.db.insert('auditLogs', {
      organizationId: employee.organizationId,
      userId: admin._id,
      action: supervisorId ? 'manager_assigned' : 'manager_removed',
      target: employeeId,
      details: JSON.stringify({
        employeeName: employee.name,
        supervisorId,
        supervisorName,
        previousSupervisorId: employee.supervisorId,
      }),
      createdAt: Date.now(),
    });

    return { success: true, supervisorId };
  },
});

// ── Get Org Tree (for hierarchical view) ────────────────────────────────────
// Returns the user hierarchy as a nested tree rooted at the declared head of the
// organization (`organizations.headUserId`).
//
// Before the head was declared, "no supervisor" was read as "root", so every
// unassigned employee became a co-root next to the CEO — a forest, not a tree.
// They are still returned (hiding people is worse than showing them out of
// place) but flagged `isUnassigned` so the UI can park them in a "not placed in
// the hierarchy yet" area instead of pretending they run the company.

export const getOrgHierarchyTree = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];
    if (!isSuperadmin(requester) && requester.organizationId !== organizationId) return [];

    // Fetch all active non-superadmin users in the org
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(XLARGE_LIST_CAP);

    const activeUsers = users.filter((u) => u.isActive && u.role !== 'superadmin');

    // Build a map: userId → user data
    const userMap = new Map(activeUsers.map((u) => [u._id, u]));
    const headId = await getOrgHeadId(ctx, organizationId);

    // Resolve each person's manager once, from the canonical field.
    const supervisorOf = new Map<string, Id<'users'> | undefined>();
    for (const u of activeUsers) {
      supervisorOf.set(u._id, await resolveSupervisorId(ctx, u));
    }

    // Build children map
    const childrenMap = new Map<string, typeof activeUsers>();
    const head = headId ? userMap.get(headId) : undefined;
    const unassigned: typeof activeUsers = [];

    for (const u of activeUsers) {
      const supervisorId = supervisorOf.get(u._id);
      if (supervisorId && userMap.has(supervisorId)) {
        const existing = childrenMap.get(supervisorId) ?? [];
        existing.push(u);
        childrenMap.set(supervisorId, existing);
      } else if (!head || u._id !== head._id) {
        unassigned.push(u);
      }
    }

    // Recursively build tree
    type OrgTreeNode = {
      _id: Id<'users'>;
      name: string;
      role: string;
      position?: string;
      department?: string;
      avatarUrl?: string;
      email: string;
      employeeType?: string;
      /** True for the declared head of the organization. */
      isHead: boolean;
      /** True when this person has no manager and is not the head. */
      isUnassigned: boolean;
      children: OrgTreeNode[];
      directReportCount: number;
    };
    const buildNode = (u: (typeof activeUsers)[number], isUnassigned = false): OrgTreeNode => ({
      _id: u._id,
      name: u.name,
      role: u.role,
      position: u.position,
      department: u.department,
      avatarUrl: u.avatarUrl,
      email: u.email,
      employeeType: u.employeeType,
      isHead: headId !== undefined && u._id === headId,
      isUnassigned,
      children: (childrenMap.get(u._id) ?? []).map((child) => buildNode(child)),
      directReportCount: childrenMap.get(u._id)?.length ?? 0,
    });

    return [...(head ? [buildNode(head)] : []), ...unassigned.map((u) => buildNode(u, true))];
  },
});

// ── Head of the organization ────────────────────────────────────────────────

export const getOrganizationHead = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return null;
    if (!isSuperadmin(requester) && requester.organizationId !== organizationId) return null;

    const headId = await getOrgHeadId(ctx, organizationId);
    if (!headId) return null;
    const head = await ctx.db.get(headId);
    if (!head) return null;

    const profile = await getProfile(ctx, headId);
    return {
      _id: head._id,
      name: head.name,
      email: head.email,
      role: head.role,
      position: head.position ?? profile?.position,
      department: head.department ?? profile?.department,
      avatarUrl: head.avatarUrl ?? profile?.avatarUrl,
      isActive: head.isActive,
    };
  },
});

/**
 * Declare who runs the organization.
 *
 * The head must be an active member of that organization and must not report to
 * anyone: a head with a manager would make the tree's root an arbitrary point in
 * the middle of the chain.
 */
export const setOrganizationHead = mutation({
  args: {
    organizationId: v.id('organizations'),
    // Omitted clears the head — the chart falls back to "nobody is placed".
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, { organizationId, userId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    await requireCapability(ctx, caller._id, 'org.manage', organizationId);

    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error('Organization not found');

    if (userId) {
      const head = await ctx.db.get(userId);
      if (!head) throw new Error('User not found');
      if (head.organizationId !== organizationId) {
        throw new Error('The head of the organization must belong to that organization');
      }
      if (!head.isActive) throw new Error('The head of the organization must be active');
      if (head.role === 'superadmin') {
        // A superadmin is the platform operator, not an org member: as head they
        // would be paid by payroll but absent from the roster, the chart and
        // every attendance list — the exact trap this model warns about.
        throw new Error('The platform superadmin cannot be the head of an organization');
      }
      const supervisorId = await resolveSupervisorId(ctx, head);
      if (supervisorId) {
        throw new Error('The head of the organization cannot report to anyone');
      }
    }

    await ctx.db.patch(organizationId, { headUserId: userId, updatedAt: Date.now() });

    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: caller._id,
      action: userId ? 'org_head_set' : 'org_head_cleared',
      target: userId ?? organizationId,
      details: JSON.stringify({
        previousHeadUserId: org.headUserId,
        headUserId: userId,
      }),
      createdAt: Date.now(),
    });

    return { success: true, headUserId: userId };
  },
});

/**
 * People with no manager who are not the head — the bucket the UI should nag
 * about. Empty is the healthy state.
 */
export const getUnassignedUsers = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];
    if (!isSuperadmin(requester) && requester.organizationId !== organizationId) return [];

    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(XLARGE_LIST_CAP);
    const headId = await getOrgHeadId(ctx, organizationId);

    const result: Array<{
      _id: Id<'users'>;
      name: string;
      email: string;
      role: string;
      position?: string;
      department?: string;
      avatarUrl?: string;
    }> = [];

    for (const u of users) {
      if (!u.isActive || u.role === 'superadmin') continue;
      if (headId && u._id === headId) continue;
      if (await resolveSupervisorId(ctx, u)) continue;
      result.push({
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        position: u.position,
        department: u.department,
        avatarUrl: u.avatarUrl,
      });
    }

    return result;
  },
});
