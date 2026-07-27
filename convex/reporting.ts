import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { getAuthCaller } from './lib/getAuthCaller';
import { requireUser } from './lib/rbac';
import { isSuperadmin } from './lib/auth';
import { getProfile } from './lib/userProfile';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';

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
    let currentId: Id<'users'> | undefined = targetUser.supervisorId ?? undefined;

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

      currentId = profile?.supervisorId ?? sup.supervisorId ?? undefined;
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
      supervisorId: targetUser.supervisorId,
    };

    return {
      subject,
      ancestors, // top-level first (CEO → … → direct supervisor)
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

    // Sort: admins first, then supervisors, then employees
    const roleOrder = { admin: 0, supervisor: 1, employee: 2, driver: 3 } as const;
    candidates.sort(
      (a, b) =>
        (roleOrder[a.role as keyof typeof roleOrder] ?? 99) -
        (roleOrder[b.role as keyof typeof roleOrder] ?? 99),
    );

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
    adminId: v.id('users'),
    employeeId: v.id('users'),
    supervisorId: v.optional(v.id('users')), // null = remove manager
  },
  handler: async (ctx, { adminId, employeeId, supervisorId }) => {
    const admin = await requireUser(ctx, adminId);
    const isSuperadminUser = isSuperadmin(admin);

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
    }

    // Update both users table and userProfiles
    await ctx.db.patch(employeeId, { supervisorId });

    // Sync to profile
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_user', (q) => q.eq('userId', employeeId))
      .first();

    if (profile) {
      await ctx.db.patch(profile._id, { supervisorId });
    }

    // Audit log
    const supervisorName = supervisorId
      ? ((await ctx.db.get(supervisorId))?.name ?? 'Unknown')
      : 'None';

    await ctx.db.insert('auditLogs', {
      organizationId: employee.organizationId,
      userId: adminId,
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
// Returns the full user hierarchy as a nested tree structure, starting from
// users with no supervisor (org admins/root) down to leaf employees.

export const getOrgHierarchyTree = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    // Fetch all active non-superadmin users in the org
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(XLARGE_LIST_CAP);

    const activeUsers = users.filter((u) => u.isActive && u.role !== 'superadmin');

    // Build a map: userId → user data
    const userMap = new Map(activeUsers.map((u) => [u._id, u]));

    // Build children map
    const childrenMap = new Map<string, typeof activeUsers>();
    const roots: typeof activeUsers = [];

    for (const u of activeUsers) {
      if (u.supervisorId && userMap.has(u.supervisorId)) {
        const existing = childrenMap.get(u.supervisorId) ?? [];
        existing.push(u);
        childrenMap.set(u.supervisorId, existing);
      } else {
        roots.push(u);
      }
    }

    // Recursively build tree
    const buildNode = (u: (typeof activeUsers)[number]): any => ({
      _id: u._id,
      name: u.name,
      role: u.role,
      position: u.position,
      department: u.department,
      avatarUrl: u.avatarUrl,
      email: u.email,
      employeeType: u.employeeType,
      children: (childrenMap.get(u._id) ?? []).map(buildNode),
      directReportCount: childrenMap.get(u._id)?.length ?? 0,
    });

    return roots.map(buildNode);
  },
});
