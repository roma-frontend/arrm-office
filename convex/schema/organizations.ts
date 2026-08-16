import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const organizations = {
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    plan: v.union(v.literal('starter'), v.literal('professional'), v.literal('enterprise')),
    isActive: v.boolean(),
    createdBySuperadmin: v.boolean(),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    timezone: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
    employeeLimit: v.number(),
    taxCountry: v.optional(v.string()),
    currency: v.optional(v.string()),
    payrollCycle: v.optional(v.string()),
    overtimeMultiplier: v.optional(v.number()),
    /**
     * The head of this organization (CEO / owner) — the single root of the
     * reporting line and of the org chart.
     *
     * Lives here rather than as a flag on the user so that "exactly one head"
     * is enforced by cardinality instead of by convention, and so that "who is
     * the CEO" is a fact you can query rather than something inferred from a
     * missing `supervisorId`. Users with no supervisor who are *not* the head
     * are unassigned, not co-roots.
     *
     * The head is a normal org member: they hold a position, file attendance,
     * accrue leave and are paid. Never model them as `superadmin` — that would
     * remove them from the roster, the chart and every attendance statistic
     * while keeping them in payroll.
     */
    headUserId: v.optional(v.id('users')),
    /**
     * What happens to the head's own leave request, which has no ancestor to
     * route to. `auto` records it as approved with an audit note; `delegate`
     * routes it to `headApproverUserId`; `peer` lets any other holder of
     * `leave.approve.org` decide. Unset behaves as `auto`.
     */
    headApproval: v.optional(v.union(v.literal('auto'), v.literal('delegate'), v.literal('peer'))),
    /** Who approves the head's leave when `headApproval` is `delegate`. */
    headApproverUserId: v.optional(v.id('users')),
    // Superadmin freeze: the org keeps its data but nobody inside it can log
    // in or use any feature until unfrozen. The reason is shown to employees
    // at login and on the in-app freeze screen.
    frozenAt: v.optional(v.number()),
    frozenBy: v.optional(v.id('users')),
    frozenReason: v.optional(v.string()),
    // Soft delete: set by the superadmin trash instead of removing the row, so
    // the organization (and its users) can be restored. `deletedBy` records who
    // moved it to trash.
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_plan', ['plan'])
    .index('by_active', ['isActive'])
    .index('by_deleted', ['deletedAt']),

  // Tombstone + progress tracker for a superadmin hard delete. The purge runs
  // in batched internal mutations; this row makes it resumable and auditable.
  orgDeletions: defineTable({
    organizationId: v.id('organizations'),
    organizationName: v.string(),
    requestedBy: v.id('users'),
    status: v.union(v.literal('in_progress'), v.literal('done')),
    tableIndex: v.number(),
    deletedDocs: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index('by_org', ['organizationId']),

  organizationRequests: defineTable({
    requestedName: v.string(),
    requestedSlug: v.string(),
    requesterName: v.string(),
    requesterEmail: v.string(),
    requesterPhone: v.optional(v.string()),
    requesterPassword: v.string(),
    requestedPlan: v.union(v.literal('professional'), v.literal('enterprise')),
    industry: v.optional(v.string()),
    country: v.optional(v.string()),
    teamSize: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    organizationId: v.optional(v.id('organizations')),
    userId: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_email', ['requesterEmail'])
    .index('by_slug', ['requestedSlug']),

  organizationInvites: defineTable({
    organizationId: v.optional(v.id('organizations')),
    requestedByEmail: v.string(),
    requestedByName: v.string(),
    requestedAt: v.number(),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    userId: v.optional(v.id('users')),
    inviteToken: v.optional(v.string()),
    inviteEmail: v.optional(v.string()),
    inviteExpiry: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_email', ['requestedByEmail'])
    .index('by_status', ['status'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_token', ['inviteToken']),
};
