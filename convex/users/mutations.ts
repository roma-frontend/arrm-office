import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { mutation } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { requireRole, requireOrgAdmin, requireUser } from '../lib/rbac';
import { isSuperadminEmail } from '../lib/auth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from '../lib/limits';
import { notify } from '../lib/notify';
import { patchProfile } from '../lib/userProfile';
import { getStartingLeaveBalances } from '../lib/leaveBalances';
import { resolveDepartmentByName, resolvePositionByTitle } from '../lib/orgUnits';
import type { MutationCtx } from '../_generated/server';

// ─────────────────────────────────────────────────────────────────────────────
// Department / position resolution
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Resolves departmentId/positionId to their names, verifying both belong to
 * `orgId`. The name is denormalized onto the user doc so existing readers
 * (filters, exports, reports) keep working without a join.
 *
 * When only the legacy free-text value is supplied it is passed through
 * unchanged — older clients and imports must keep working.
 */
async function resolveOrgUnits(
  ctx: MutationCtx,
  orgId: Id<'organizations'>,
  input: {
    departmentId?: Id<'departments'>;
    positionId?: Id<'positions'>;
    department?: string;
    position?: string;
  },
): Promise<{
  departmentName?: string;
  positionName?: string;
  departmentId?: Id<'departments'>;
  positionId?: Id<'positions'>;
}> {
  let departmentName = input.department;
  let positionName = input.position;
  let departmentId = input.departmentId;
  let positionId = input.positionId;

  if (input.departmentId) {
    const dept = await ctx.db.get(input.departmentId);
    if (!dept) throw new Error('Department not found');
    if (dept.organizationId !== orgId) {
      throw new Error('Department belongs to a different organization');
    }
    departmentName = dept.name;
  } else if (departmentName) {
    // Legacy string-only input: link it to the real record when one exists, so
    // the employee still counts towards that department.
    const link = await resolveDepartmentByName(ctx, orgId, departmentName);
    departmentName = link.name ?? departmentName;
    departmentId = link.departmentId;
  }

  if (input.positionId) {
    const pos = await ctx.db.get(input.positionId);
    if (!pos) throw new Error('Position not found');
    if (pos.organizationId !== orgId) {
      throw new Error('Position belongs to a different organization');
    }
    positionName = pos.title;
  } else if (positionName) {
    const link = await resolvePositionByTitle(ctx, orgId, positionName);
    positionName = link.title ?? positionName;
    positionId = link.positionId;
  }

  return { departmentName, positionName, departmentId, positionId };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE USER (admin only) — auto-scoped to admin's org
// ─────────────────────────────────────────────────────────────────────────────
export const createUser = mutation({
  args: {
    adminId: v.id('users'),
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(
      v.literal('admin'),
      v.literal('supervisor'),
      v.literal('employee'),
      v.literal('driver'),
    ),
    employeeType: v.union(v.literal('staff'), v.literal('contractor')),
    // Departments/positions are org-scoped records. Prefer the *Id fields; the
    // string ones stay for backward compat and are kept in sync as a
    // denormalized label so existing readers keep working.
    department: v.optional(v.string()),
    departmentId: v.optional(v.id('departments')),
    position: v.optional(v.string()),
    positionId: v.optional(v.id('positions')),
    phone: v.optional(v.string()),
    supervisorId: v.optional(v.id('users')),
    organizationId: v.optional(v.id('organizations')),
    // Salary (optional — persisted into employeeProfiles on creation)
    baseSalary: v.optional(v.number()),
    bonuses: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    salaryCurrency: v.optional(v.string()),
    // Passport / identity (optional — sensitive PII, persisted into employeeProfiles)
    passportNumber: v.optional(v.string()),
    passportIssuedBy: v.optional(v.string()),
    passportIssueDate: v.optional(v.string()),
    passportExpiryDate: v.optional(v.string()),
    socialCardNumber: v.optional(v.string()),
    nationality: v.optional(v.string()),
    /**
     * Date of birth (`YYYY-MM-DD`). Needed by the personal-data and biometric
     * consent documents, which otherwise print a blank placeholder.
     */
    dateOfBirth: v.optional(v.string()),
    /**
     * Working language of the employee (`en` | `ru` | `de` | `hy`). Drives the
     * second column of their bilingual hiring documents — Armenian is always the
     * first — and their UI locale.
     */
    language: v.optional(
      v.union(v.literal('en'), v.literal('ru'), v.literal('de'), v.literal('hy')),
    ),
    // Registration / join date (ms epoch) — lets admins backdate employees who
    // were already working before the account was created (project handover).
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { adminId, organizationId } = args;
    // RBAC: require org admin access (superadmin can create in any org)
    const caller = await requireUser(ctx, adminId);
    const isSuperadmin = isSuperadminEmail(caller.email);

    const email = args.email.toLowerCase().trim();

    // Check email uniqueness globally
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (existing) throw new Error('A user with this email already exists');

    // Determine target organization:
    const targetOrgId = organizationId || (isSuperadmin ? null : caller.organizationId);

    if (!targetOrgId) {
      throw new Error(
        isSuperadmin
          ? 'Superadmin must specify an organization when creating users'
          : 'Admin must belong to an organization',
      );
    }

    // RBAC: verify caller has admin access to the target org
    if (!isSuperadmin) {
      await requireOrgAdmin(ctx, adminId, targetOrgId);
    }

    const org = await ctx.db.get(targetOrgId);
    if (!org) throw new Error('Organization not found');

    // NOTE: Capped at DEFAULT_LIST_CAP — sufficient to enforce employee limit.
    const currentCount = await ctx.db
      .query('users')
      .withIndex('by_org_active', (q) => q.eq('organizationId', targetOrgId).eq('isActive', true))
      .take(DEFAULT_LIST_CAP);

    if (currentCount.length >= org.employeeLimit) {
      throw new Error(
        `Employee limit reached (${org.employeeLimit}). Upgrade your plan to add more employees.`,
      );
    }

    const travelAllowance = args.employeeType === 'contractor' ? 12000 : 20000;

    // Resolve department/position records and denormalize their names. Both
    // must belong to the target org — otherwise an admin could attach an
    // employee to another organization's department.
    const { departmentName, positionName, departmentId, positionId } = await resolveOrgUnits(
      ctx,
      targetOrgId,
      {
        departmentId: args.departmentId,
        positionId: args.positionId,
        department: args.department,
        position: args.position,
      },
    );
    const balances = await getStartingLeaveBalances(ctx, targetOrgId);

    const userId = await ctx.db.insert('users', {
      organizationId: targetOrgId,
      name: args.name,
      email,
      passwordHash: args.passwordHash,
      role: args.role,
      employeeType: args.employeeType,
      department: departmentName,
      departmentId,
      position: positionName,
      positionId,
      phone: args.phone,
      supervisorId: args.supervisorId,
      dateOfBirth: args.dateOfBirth,
      language: args.language,
      isActive: true,
      isApproved: true,
      approvedBy: adminId,
      approvedAt: Date.now(),
      travelAllowance,
      ...balances,
      createdAt: args.createdAt ?? Date.now(),
    });

    // Atomically persist salary / passport into employeeProfiles when provided.
    const hasSalary =
      args.baseSalary !== undefined ||
      args.bonuses !== undefined ||
      args.overtimeHours !== undefined ||
      args.hourlyRate !== undefined ||
      args.salaryCurrency !== undefined;
    const hasPassport =
      args.passportNumber !== undefined ||
      args.passportIssuedBy !== undefined ||
      args.passportIssueDate !== undefined ||
      args.passportExpiryDate !== undefined ||
      args.socialCardNumber !== undefined ||
      args.nationality !== undefined ||
      args.dateOfBirth !== undefined;

    if (hasSalary || hasPassport) {
      const now = Date.now();
      await ctx.db.insert('employeeProfiles', {
        userId,
        organizationId: targetOrgId,
        baseSalary: args.baseSalary,
        bonuses: args.bonuses,
        overtimeHours: args.overtimeHours,
        hourlyRate: args.hourlyRate,
        salaryCurrency: args.salaryCurrency,
        salaryUpdatedAt: hasSalary ? now : undefined,
        passportNumber: args.passportNumber,
        passportIssuedBy: args.passportIssuedBy,
        passportIssueDate: args.passportIssueDate,
        passportExpiryDate: args.passportExpiryDate,
        socialCardNumber: args.socialCardNumber,
        nationality: args.nationality,
        // Mirrored onto the profile as well: the extended-profile editor reads
        // it from here, while document merge tokens read it from `users`.
        dateOfBirth: args.dateOfBirth,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Notify org admins (within same org). Capped — admin count bounded.
    const admins = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) => q.eq('organizationId', targetOrgId).eq('role', 'admin'))
      .take(SMALL_LIST_CAP);

    for (const a of admins) {
      await notify(ctx, {
        organizationId: targetOrgId,
        userId: a._id,
        type: 'employee_added',
        titleKey: 'notifications.titles.employeeAdded',
        messageKey: 'notifications.messages.employeeAdded',
        params: {
          name: args.name,
          role: args.role,
          orgName: org.name,
        },
        fallbackTitle: '👤 New Employee Added',
        fallbackMessage: `${args.name} (${args.role}) has been added to ${org.name}.`,
        relatedId: userId,
        route: '/employees',
      });
    }

    // Audit log: user created
    await ctx.db.insert('auditLogs', {
      organizationId: targetOrgId,
      userId: adminId,
      action: 'user_created',
      target: userId,
      details: JSON.stringify({
        name: args.name,
        email,
        role: args.role,
        employeeType: args.employeeType,
        department: args.department,
        // PII values intentionally omitted — only presence flags are logged.
        hasSalary,
        hasPassport,
      }),
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE USER — only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const updateUser = mutation({
  args: {
    adminId: v.id('users'),
    userId: v.id('users'),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal('admin'),
        v.literal('supervisor'),
        v.literal('employee'),
        v.literal('driver'),
      ),
    ),
    employeeType: v.optional(v.union(v.literal('staff'), v.literal('contractor'))),
    department: v.optional(v.string()),
    departmentId: v.optional(v.id('departments')),
    position: v.optional(v.string()),
    positionId: v.optional(v.id('positions')),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    supervisorId: v.optional(v.id('users')),
    isActive: v.optional(v.boolean()),
    paidLeaveBalance: v.optional(v.number()),
    sickLeaveBalance: v.optional(v.number()),
    familyLeaveBalance: v.optional(v.number()),
    // Registration / join date (ms epoch) — editable so admins can backdate
    // employees that have been working before the account was created.
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { adminId, userId, ...updates } = args;
    // RBAC: require org admin access
    const caller = await requireUser(ctx, adminId);
    const isSuperadmin = isSuperadminEmail(caller.email);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // RBAC: verify same organization (superadmin can update any org)
    if (!isSuperadmin) {
      await requireOrgAdmin(ctx, adminId, user.organizationId as Id<'organizations'>);
    }

    const employeeType = updates.employeeType ?? user.employeeType;
    const travelAllowance = employeeType === 'contractor' ? 12000 : 20000;

    // Same rule as createUser: an *Id wins over the free-text value and its
    // name is denormalized onto the doc, scoped to the user's own org.
    const { departmentName, positionName } = await resolveOrgUnits(
      ctx,
      user.organizationId as Id<'organizations'>,
      {
        departmentId: updates.departmentId,
        positionId: updates.positionId,
        department: updates.department,
        position: updates.position,
      },
    );
    if (departmentName !== undefined) updates.department = departmentName;
    if (positionName !== undefined) updates.position = positionName;

    // Dual-write: patch users table (backward compat) + sync profile fields to userProfiles
    await ctx.db.patch(userId, { ...updates, travelAllowance });
    const profileFields: Record<string, unknown> = {};
    if (updates.employeeType !== undefined) profileFields.employeeType = updates.employeeType;
    if (updates.department !== undefined) profileFields.department = updates.department;
    if (updates.departmentId !== undefined) profileFields.departmentId = updates.departmentId;
    if (updates.position !== undefined) profileFields.position = updates.position;
    if (updates.positionId !== undefined) profileFields.positionId = updates.positionId;
    if (updates.phone !== undefined) profileFields.phone = updates.phone;
    if (updates.location !== undefined) profileFields.location = updates.location;
    if (updates.avatarUrl !== undefined) profileFields.avatarUrl = updates.avatarUrl;
    if (updates.supervisorId !== undefined) profileFields.supervisorId = updates.supervisorId;
    if (updates.paidLeaveBalance !== undefined)
      profileFields.paidLeaveBalance = updates.paidLeaveBalance;
    if (updates.sickLeaveBalance !== undefined)
      profileFields.sickLeaveBalance = updates.sickLeaveBalance;
    if (updates.familyLeaveBalance !== undefined)
      profileFields.familyLeaveBalance = updates.familyLeaveBalance;
    profileFields.travelAllowance = travelAllowance;
    if (Object.keys(profileFields).length > 0) {
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .first();
      if (profile) await ctx.db.patch(profile._id, profileFields);
    }

    // Audit log: user updated
    await ctx.db.insert('auditLogs', {
      organizationId: caller.organizationId,
      userId: adminId,
      action: 'user_updated',
      target: userId,
      details: JSON.stringify({
        updatedFields: Object.keys(updates),
        name: updates.name || user.name,
        role: updates.role || user.role,
      }),
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE USER — soft delete, only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const deleteUser = mutation({
  args: {
    adminId: v.id('users'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { adminId, userId } = args;
    // RBAC: require org admin access
    const caller = await requireUser(ctx, adminId);
    const isSuperadmin = isSuperadminEmail(caller.email);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // RBAC: cross-org protection (superadmin can delete from any org)
    if (!isSuperadmin) {
      await requireOrgAdmin(ctx, adminId, user.organizationId as Id<'organizations'>);
    }

    // Protect superadmin
    if (user.role === 'superadmin' && !isSuperadmin) {
      throw new Error('Only superadmin can deactivate superadmin account');
    }

    // Protect other admins
    if (user.role === 'admin' && caller.role === 'admin' && !isSuperadmin) {
      throw new Error('Only superadmin can deactivate admin accounts');
    }

    if (user.role === 'admin' && user.email.toLowerCase() === caller.email.toLowerCase()) {
      throw new Error('Cannot delete your own admin account');
    }

    await ctx.db.patch(userId, { isActive: false });

    // Audit log: user deleted (soft)
    await ctx.db.insert('auditLogs', {
      organizationId: caller.organizationId,
      userId: adminId,
      action: 'user_deleted',
      target: userId,
      details: JSON.stringify({ name: user.name, email: user.email, role: user.role }),
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// HARD DELETE USER — completely removes user from database
// ─────────────────────────────────────────────────────────────────────────────
export const hardDeleteUser = mutation({
  args: {
    adminId: v.id('users'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { adminId, userId } = args;
    // RBAC: require superadmin role
    await requireRole(ctx, adminId, 'superadmin');

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Hard delete - remove from database completely
    await ctx.db.delete(userId);

    // Audit log: user hard deleted
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: adminId,
      action: 'user_hard_deleted',
      target: userId,
      details: JSON.stringify({ name: user.name, email: user.email, role: user.role }),
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE USER — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const approveUser = mutation({
  args: {
    adminId: v.id('users'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { adminId, userId } = args;
    // RBAC: require org admin access
    const caller = await requireUser(ctx, adminId);
    const isSuperadmin = isSuperadminEmail(caller.email);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // RBAC: cross-org protection
    if (!isSuperadmin) {
      await requireOrgAdmin(ctx, adminId, user.organizationId as Id<'organizations'>);
    }

    if (user.isApproved) throw new Error('User already approved');

    let org = null;
    if (user.organizationId) {
      org = await ctx.db.get(user.organizationId);
    }

    const callerUser = await ctx.db.get(adminId);

    await ctx.db.patch(userId, {
      isApproved: true,
      approvedBy: adminId,
      approvedAt: Date.now(),
    });

    const approverName = callerUser?.name ?? 'admin';
    const orgName = org?.name ?? 'the team';

    await notify(ctx, {
      organizationId: user.organizationId,
      userId,
      type: 'join_approved',
      titleKey: 'notifications.titles.accountApproved',
      messageKey: 'notifications.messages.accountApproved',
      params: { approverName, orgName },
      fallbackTitle: '✅ Account Approved',
      fallbackMessage: `Your account has been approved by ${approverName}. Welcome to ${orgName}!`,
      route: '/dashboard',
    });

    // Audit log: user approved
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: adminId,
      action: 'user_approved',
      target: userId,
      details: JSON.stringify({ name: user.name, email: user.email }),
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REJECT USER — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const rejectUser = mutation({
  args: {
    adminId: v.id('users'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { adminId, userId } = args;
    // RBAC: require org admin access
    const caller = await requireUser(ctx, adminId);
    const isSuperadmin = isSuperadminEmail(caller.email);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // RBAC: cross-org protection
    if (!isSuperadmin) {
      await requireOrgAdmin(ctx, adminId, user.organizationId as Id<'organizations'>);
    }

    // Audit log: user rejected
    await ctx.db.insert('auditLogs', {
      organizationId: caller.organizationId,
      userId: adminId,
      action: 'user_rejected',
      target: userId,
      details: JSON.stringify({ name: user.name, email: user.email, role: user.role }),
      createdAt: Date.now(),
    });

    await ctx.db.delete(userId);
    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE OWN PROFILE (users can update their own profile without admin)
// ─────────────────────────────────────────────────────────────────────────────
export const updateOwnProfile = mutation({
  args: {
    userId: v.id('users'),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    // Productivity Settings
    focusModeEnabled: v.optional(v.boolean()),
    workHoursStart: v.optional(v.string()),
    workHoursEnd: v.optional(v.string()),
    breakRemindersEnabled: v.optional(v.boolean()),
    breakInterval: v.optional(v.number()),
    dailyTaskGoal: v.optional(v.number()),
    // Localization Settings
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
    timeFormat: v.optional(v.string()),
    firstDayOfWeek: v.optional(v.string()),
    // Dashboard Settings
    defaultView: v.optional(v.string()),
    dataRefreshRate: v.optional(v.string()),
    compactMode: v.optional(v.boolean()),
    dashboardWidgets: v.optional(
      v.object({
        quickStats: v.boolean(),
        leaveCalendar: v.boolean(),
        upcomingTasks: v.boolean(),
        teamActivity: v.boolean(),
        recentLeaves: v.boolean(),
        analytics: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;
    // RBAC: verify ownership
    await requireUser(ctx, userId);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    await ctx.db.patch(userId, updates);

    // Audit log: profile updated
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: userId,
      action: 'profile_updated',
      target: userId,
      details: JSON.stringify({ updatedFields: Object.keys(updates) }),
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PRESENCE STATUS
// ─────────────────────────────────────────────────────────────────────────────
export const updatePresenceStatus = mutation({
  args: {
    userId: v.id('users'),
    presenceStatus: v.union(
      v.literal('available'),
      v.literal('in_meeting'),
      v.literal('in_call'),
      v.literal('out_of_office'),
      v.literal('busy'),
    ),
    outOfOfficeMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, presenceStatus, outOfOfficeMessage: _outOfOfficeMessage } = args;
    // RBAC: verify ownership
    await requireUser(ctx, userId);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Update status in both users and userProfiles tables (dual-write)
    await ctx.db.patch(userId, { presenceStatus, updatedAt: Date.now() });
    await patchProfile(ctx, userId, { presenceStatus });

    // Audit log: presence status updated
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: userId,
      action: 'presence_status_updated',
      target: userId,
      details: JSON.stringify({ newStatus: presenceStatus }),
      createdAt: Date.now(),
    });

    return { success: true, newStatus: presenceStatus };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE AVATAR
// ─────────────────────────────────────────────────────────────────────────────
export const updateAvatar = mutation({
  args: { userId: v.id('users'), avatarUrl: v.string() },
  handler: async (ctx, args) => {
    const { userId, avatarUrl } = args;
    // RBAC: verify ownership
    await requireUser(ctx, userId);

    const userForAvatar = await ctx.db.get(userId);
    await patchProfile(ctx, userId, { avatarUrl });

    // Audit log: avatar updated
    await ctx.db.insert('auditLogs', {
      organizationId: userForAvatar?.organizationId,
      userId: userId,
      action: 'avatar_updated',
      target: userId,
      details: JSON.stringify({ avatarUrl }),
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE AVATAR
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAvatar = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    // RBAC: verify ownership
    await requireUser(ctx, userId);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Remove avatar URL from database
    await ctx.db.patch(userId, {
      avatarUrl: undefined,
    });

    // Audit log: avatar deleted
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: userId,
      action: 'avatar_deleted',
      target: userId,
      details: 'User avatar removed',
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SET STATUS TO IN CALL — called automatically when starting a call
// ─────────────────────────────────────────────────────────────────────────────
export const setInCallStatus = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { userId } = args;
    // RBAC: verify ownership
    await requireUser(ctx, userId);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Only update if not already "in_call"
    if (user.presenceStatus !== 'in_call') {
      await ctx.db.patch(userId, {
        presenceStatus: 'in_call',
        updatedAt: Date.now(),
      });

      // Audit log: set in call status
      await ctx.db.insert('auditLogs', {
        organizationId: user.organizationId,
        userId: userId,
        action: 'status_set_in_call',
        target: userId,
        details: 'User status set to in_call',
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// RESET STATUS FROM IN CALL — called when call ends
// ─────────────────────────────────────────────────────────────────────────────
export const resetFromCallStatus = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { userId } = args;
    // RBAC: verify ownership
    await requireUser(ctx, userId);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Reset to available if they're currently in_call
    if (user.presenceStatus === 'in_call') {
      await ctx.db.patch(userId, {
        presenceStatus: 'available',
        updatedAt: Date.now(),
      });

      // Audit log: reset from call status
      await ctx.db.insert('auditLogs', {
        organizationId: user.organizationId,
        userId: userId,
        action: 'status_reset_from_call',
        target: userId,
        details: 'User status reset from in_call to available',
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURED: DELETE USER — uses ctx.auth identity verification (no client userId trust)
// ─────────────────────────────────────────────────────────────────────────────
export const secureDeleteUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Cross-org protection
    if (caller.role !== 'superadmin' && caller.organizationId !== user.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    // Protect superadmin/admin accounts
    if (user.role === 'superadmin' && caller.role !== 'superadmin') {
      throw new Error('Only superadmin can deactivate superadmin');
    }
    if (user.role === 'admin' && caller.role === 'admin') {
      throw new Error('Only superadmin can deactivate admin accounts');
    }
    if (user._id === caller._id) {
      throw new Error('Cannot delete your own account');
    }

    await ctx.db.patch(userId, { isActive: false });

    await ctx.db.insert('auditLogs', {
      organizationId: caller.organizationId,
      userId: caller._id,
      action: 'user_deleted',
      target: userId,
      details: JSON.stringify({ name: user.name, email: user.email, role: user.role }),
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE CHAT BACKGROUND — user's own preference
// ─────────────────────────────────────────────────────────────────────────────
export const updateChatBackground = mutation({
  args: {
    userId: v.id('users'),
    backgroundId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, backgroundId } = args;
    await ctx.db.patch(userId, { chatBackground: backgroundId });
    return { success: true };
  },
});
