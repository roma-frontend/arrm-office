import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { getAuthCaller } from './lib/getAuthCaller';
// ── Update Extended Profile Fields ──────────────────────────────────────────
export const updateExtendedProfile = mutation({
  args: {
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    address: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    emergencyContactRelation: v.optional(v.string()),
    workFormat: v.optional(v.union(v.literal('remote'), v.literal('office'), v.literal('hybrid'))),
    workSchedule: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        workingDays: v.array(v.string()),
        flexHours: v.boolean(),
      }),
    ),
    socialLinks: v.optional(
      v.object({
        linkedin: v.optional(v.string()),
        github: v.optional(v.string()),
        portfolio: v.optional(v.string()),
      }),
    ),
    structuredWorkHistory: v.optional(
      v.array(
        v.object({
          company: v.string(),
          position: v.string(),
          startDate: v.string(),
          endDate: v.optional(v.string()),
          description: v.optional(v.string()),
        }),
      ),
    ),
    structuredEducation: v.optional(
      v.array(
        v.object({
          institution: v.string(),
          degree: v.string(),
          field: v.string(),
          startDate: v.string(),
          endDate: v.optional(v.string()),
          gpa: v.optional(v.string()),
        }),
      ),
    ),
    dateOfBirth: v.optional(v.string()),
    birthYear: v.optional(v.number()),
    pensionExempt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');

    const { userId, ...fields } = args;

    // RBAC: only same-org admins/supervisors, superadmin, or the employee
    // themself may update this employee's extended profile. (Matches
    // recordTaxIdVerification's authorization model.)
    const target = await ctx.db.get(userId);
    if (!target) throw new Error('User not found');
    const isOrgStaff =
      (requester.role === 'admin' || requester.role === 'supervisor') &&
      requester.organizationId === target.organizationId;
    if (requester.role !== 'superadmin' && !isOrgStaff && requester._id !== userId) {
      throw new Error('Not authorized to update this employee');
    }

    const existing = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };

    // Only include fields that were actually provided
    const optionalFields = [
      'address',
      'emergencyContactName',
      'emergencyContactPhone',
      'emergencyContactRelation',
      'workFormat',
      'workSchedule',
      'socialLinks',
      'structuredWorkHistory',
      'structuredEducation',
      'dateOfBirth',
      'birthYear',
      'pensionExempt',
    ] as const;

    for (const field of optionalFields) {
      const value = (fields as Record<string, unknown>)[field];
      if (value !== undefined) {
        patch[field] = value;
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert('employeeProfiles', {
      userId,
      organizationId: fields.organizationId,
      ...patch,
      createdAt: now,
      updatedAt: now,
    });
  },
});
