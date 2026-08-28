import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { isSuperadmin } from './lib/auth';
import { getAuthCaller } from './lib/getAuthCaller';
import { hasCapability, hasOrgWideReach } from './lib/capabilities';
import { isAncestorOf } from './lib/reportingLine';
import { SMALL_LIST_CAP, DEFAULT_LIST_CAP } from './lib/limits';

/**
 * Shared access rule for one employee's profile data (profile, documents,
 * salary, passport, performance). Mirrors recordTaxIdVerification /
 * updateExtendedProfile: same-org admins/supervisors, superadmin (role or
 * bootstrap email), or the employee themself.
 *
 * `selfAllowed: false` restricts to staff only — used for records an employee
 * must not write about themselves (salary, performance metrics).
 *
 * Returns null when access is denied so *queries* can degrade to empty data
 * instead of tripping an error boundary; mutations turn null into a throw via
 * assertCanManageEmployee below.
 */
async function resolveEmployeeAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  opts: { selfAllowed?: boolean } = {},
) {
  const { selfAllowed = true } = opts;
  const caller = await getAuthCaller(ctx);
  if (!caller) return null;

  const target = await ctx.db.get(userId);
  if (!target) return null;

  if (isSuperadmin(caller)) return caller;

  const isOrgStaff =
    (caller.role === 'admin' || caller.role === 'supervisor') &&
    !!caller.organizationId &&
    caller.organizationId === target.organizationId;
  if (isOrgStaff) return caller;

  if (selfAllowed && caller._id === userId) return caller;

  return null;
}

/** Mutation variant: throws instead of returning null. */
async function assertCanManageEmployee(
  ctx: MutationCtx,
  userId: Id<'users'>,
  opts: { selfAllowed?: boolean } = {},
) {
  const caller = await resolveEmployeeAccess(ctx, userId, opts);
  if (!caller) throw new Error('Not authorized to manage this employee');
  return caller;
}

/**
 * Compensation is a narrower decision than the rest of the employee record.
 *
 * `resolveEmployeeAccess` treats every admin *and every supervisor* of the
 * organization as equal, which let any supervisor set anybody's salary —
 * including the CEO's. Money follows the same shape as leave approval instead:
 * an org-wide holder (HR / admin) may set anyone's, a manager only for people
 * below them in the reporting line, and nobody sets their own.
 */
async function assertCanSetCompensation(ctx: MutationCtx, userId: Id<'users'>) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');

  if (caller._id === userId) {
    throw new Error('You cannot change your own compensation');
  }

  const target = await ctx.db.get(userId);
  if (!target) throw new Error('User not found');
  if (isSuperadmin(caller)) return caller;

  if (!caller.organizationId || caller.organizationId !== target.organizationId) {
    throw new Error('Access denied: cross-organization operation');
  }

  // `getAuthCaller` already carries the role, so the capability decision needs no
  // second read of the caller's own document.
  if (!hasCapability(caller, 'compensation.manage')) {
    throw new Error("Not authorized to change this employee's compensation");
  }
  if (!hasOrgWideReach(caller) && !(await isAncestorOf(ctx, caller._id, userId))) {
    throw new Error("Only a manager in this employee's reporting line may set their compensation");
  }

  return caller;
}

// ── Get Employee Profile with Extended Data ──────────────────────────────────
export const getEmployeeProfile = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    // Profile bundles documents and performance data — restrict to same-org
    // staff, superadmin, or the employee themself.
    if (!(await resolveEmployeeAccess(ctx, args.userId))) return null;

    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Get profile data
    const profile = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    // Get documents
    const documents = await ctx.db
      .query('employeeDocuments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(SMALL_LIST_CAP);

    // Get performance metrics
    const metrics = await ctx.db
      .query('performanceMetrics')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(1);

    return {
      user,
      profile,
      documents,
      metrics: metrics[0] ?? null,
    };
  },
});

// ── Update Employee Biography ──────────────────────────────────────────────
export const updateBiography = mutation({
  args: {
    userId: v.id('users'),
    biography: v.object({
      education: v.optional(v.array(v.string())),
      certifications: v.optional(v.array(v.string())),
      workHistory: v.optional(v.array(v.string())),
      skills: v.optional(v.array(v.string())),
      languages: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    await assertCanManageEmployee(ctx, args.userId);

    const existing = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        biography: args.biography,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert('employeeProfiles', {
        userId: args.userId,
        biography: args.biography,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// ── Upload Employee Document ──────────────────────────────────────────────
export const uploadDocument = mutation({
  args: {
    userId: v.id('users'),
    uploaderId: v.id('users'),
    category: v.union(
      v.literal('resume'),
      v.literal('contract'),
      v.literal('certificate'),
      v.literal('performance_review'),
      v.literal('id_document'),
      v.literal('other'),
    ),
    fileName: v.string(),
    fileUrl: v.string(),
    fileSize: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await assertCanManageEmployee(ctx, args.userId);
    // uploaderId is client-supplied; bind it to the verified caller so an
    // upload cannot be attributed to someone else.
    if (args.uploaderId !== caller._id) {
      throw new Error('uploaderId must match the authenticated caller');
    }

    const target = await ctx.db.get(args.userId);

    return await ctx.db.insert('employeeDocuments', {
      // Without this the `by_org` index silently misses every document uploaded
      // through the wizard, so org-wide document queries returned nothing.
      ...(target?.organizationId ? { organizationId: target.organizationId } : {}),
      userId: args.userId,
      uploaderId: args.uploaderId,
      category: args.category,
      fileName: args.fileName,
      fileUrl: args.fileUrl,
      fileSize: args.fileSize,
      description: args.description,
      uploadedAt: Date.now(),
    });
  },
});

// ── Get Employee Documents ──────────────────────────────────────────────
export const getDocuments = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    if (!(await resolveEmployeeAccess(ctx, args.userId))) return [];

    return await ctx.db
      .query('employeeDocuments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(SMALL_LIST_CAP);
  },
});

// ── Delete Document ──────────────────────────────────────────────
export const deleteDocument = mutation({
  args: { documentId: v.id('employeeDocuments') },
  handler: async (ctx, args) => {
    // Authorize against the document's owner — the id alone carries no scope.
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return;
    await assertCanManageEmployee(ctx, doc.userId);

    await ctx.db.delete(args.documentId);
  },
});

// ── Update Performance Metrics ──────────────────────────────────────────────
export const updatePerformanceMetrics = mutation({
  args: {
    userId: v.id('users'),
    updatedBy: v.id('users'),
    metrics: v.object({
      punctualityScore: v.number(),
      absenceRate: v.number(),
      lateArrivals: v.number(),
      kpiScore: v.number(),
      projectCompletion: v.number(),
      deadlineAdherence: v.number(),
      teamworkRating: v.number(),
      communicationScore: v.number(),
      conflictIncidents: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Staff-only: an employee must not score themselves.
    const caller = await assertCanManageEmployee(ctx, args.userId, { selfAllowed: false });
    if (args.updatedBy !== caller._id) {
      throw new Error('updatedBy must match the authenticated caller');
    }

    return await ctx.db.insert('performanceMetrics', {
      userId: args.userId,
      updatedBy: args.updatedBy,
      ...args.metrics,
      createdAt: Date.now(),
    });
  },
});

// ── Get Performance History ──────────────────────────────────────────────
export const getPerformanceHistory = query({
  args: {
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await resolveEmployeeAccess(ctx, args.userId))) return [];

    const limit = args.limit ?? 12;
    return await ctx.db
      .query('performanceMetrics')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit);
  },
});

// ── Update Employee Salary ──────────────────────────────────────────────
export const updateSalary = mutation({
  args: {
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    baseSalary: v.optional(v.number()),
    bonuses: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    salaryCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Staff-only, scoped: HR org-wide, a manager only within their own subtree,
    // and never your own compensation.
    await assertCanSetCompensation(ctx, args.userId);

    const existing = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    const now = Date.now();
    const patch: Record<string, unknown> = {
      salaryUpdatedAt: now,
      updatedAt: now,
    };
    if (args.baseSalary !== undefined) patch.baseSalary = args.baseSalary;
    if (args.bonuses !== undefined) patch.bonuses = args.bonuses;
    if (args.overtimeHours !== undefined) patch.overtimeHours = args.overtimeHours;
    if (args.hourlyRate !== undefined) patch.hourlyRate = args.hourlyRate;
    if (args.salaryCurrency !== undefined) patch.salaryCurrency = args.salaryCurrency;

    let profileId: Id<'employeeProfiles'>;
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      profileId = existing._id;
    } else {
      profileId = await ctx.db.insert('employeeProfiles', {
        userId: args.userId,
        organizationId: args.organizationId,
        baseSalary: args.baseSalary,
        bonuses: args.bonuses,
        overtimeHours: args.overtimeHours,
        hourlyRate: args.hourlyRate,
        salaryCurrency: args.salaryCurrency,
        salaryUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ── Sync: salary change → create compensation record ──
    if (args.baseSalary !== undefined && args.organizationId) {
      const oldSalary = existing?.baseSalary ?? 0;
      const newSalary = args.baseSalary;
      if (newSalary !== oldSalary && newSalary > 0) {
        await ctx.db.insert('compensationRecords', {
          organizationId: args.organizationId,
          userId: args.userId,
          type: newSalary > oldSalary ? 'raise' : 'adjustment',
          amount: Math.abs(newSalary - oldSalary),
          currency: args.salaryCurrency ?? existing?.salaryCurrency ?? 'USD',
          frequency: 'monthly',
          effectiveFrom: now,
          status: 'approved',
          approvedBy: args.userId,
          approvedAt: now,
          notes: oldSalary > 0
            ? `Salary changed from ${oldSalary} to ${newSalary}`
            : `Initial salary set to ${newSalary}`,
          createdBy: args.userId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return profileId;
  },
});

// ── Update Passport / Identity ──────────────────────────────────────
export const updatePassport = mutation({
  args: {
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    passportNumber: v.optional(v.string()),
    passportIssuedBy: v.optional(v.string()),
    passportIssueDate: v.optional(v.string()),
    passportExpiryDate: v.optional(v.string()),
    socialCardNumber: v.optional(v.string()),
    nationality: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCanManageEmployee(ctx, args.userId);

    const existing = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.passportNumber !== undefined) patch.passportNumber = args.passportNumber;
    if (args.passportIssuedBy !== undefined) patch.passportIssuedBy = args.passportIssuedBy;
    if (args.passportIssueDate !== undefined) patch.passportIssueDate = args.passportIssueDate;
    if (args.passportExpiryDate !== undefined) patch.passportExpiryDate = args.passportExpiryDate;
    if (args.socialCardNumber !== undefined) patch.socialCardNumber = args.socialCardNumber;
    if (args.nationality !== undefined) patch.nationality = args.nationality;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert('employeeProfiles', {
      userId: args.userId,
      organizationId: args.organizationId,
      passportNumber: args.passportNumber,
      passportIssuedBy: args.passportIssuedBy,
      passportIssueDate: args.passportIssueDate,
      passportExpiryDate: args.passportExpiryDate,
      socialCardNumber: args.socialCardNumber,
      nationality: args.nationality,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Record SRC (ՀՎՀՀ) taxpayer verification ───────────────────────
export const recordTaxIdVerification = mutation({
  args: {
    userId: v.id('users'),
    status: v.union(
      v.literal('verified'),
      v.literal('not_found'),
      v.literal('valid_local'),
      v.literal('invalid_checksum'),
      v.literal('invalid_format'),
    ),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error('User not found');

    // Same-org admins/supervisors, superadmin (role or bootstrap email), or
    // the employee themself may record a verification for this employee —
    // matches createRating / updateExtendedProfile / documents.ts.
    const isOrgStaff =
      (caller.role === 'admin' || caller.role === 'supervisor') &&
      caller.organizationId === target.organizationId;
    if (!isSuperadmin(caller) && !isOrgStaff && caller._id !== args.userId) {
      throw new Error('Not authorized to update this employee');
    }

    const now = Date.now();
    const existing = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        taxIdStatus: args.status,
        taxIdVerifiedAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('employeeProfiles', {
      userId: args.userId,
      organizationId: target.organizationId,
      taxIdStatus: args.status,
      taxIdVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Get Salary by User ──────────────────────────────────────────────
export const getSalary = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    // Compensation is sensitive: same-org staff, superadmin, or the employee
    // reading their own salary.
    if (!(await resolveEmployeeAccess(ctx, args.userId))) return null;

    const profile = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    if (!profile) return null;
    return {
      baseSalary: profile.baseSalary ?? 0,
      bonuses: profile.bonuses ?? 0,
      overtimeHours: profile.overtimeHours ?? 0,
      hourlyRate: profile.hourlyRate ?? 0,
      salaryCurrency: profile.salaryCurrency,
      salaryUpdatedAt: profile.salaryUpdatedAt,
    };
  },
});

// ── Get Employees by Organization ──────────────────────────────────────────────
export const getEmployeesByOrganization = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    // Org-scoped listing: members of that org, or superadmin.
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) return [];

    const profiles = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    return profiles;
  },
});
