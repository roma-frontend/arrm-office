import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { mutation, query, type QueryCtx } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import type { Doc, Id } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';

/**
 * Helper: requires caller to be admin or superadmin.
 * Returns the admin user record and the orgId they should see:
 * - superadmin: sees all orgs (returns undefined orgId filter)
 * - admin: sees only their own org
 */
async function requireAdmin(ctx: QueryCtx) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  const user = caller as Doc<'users'> | typeof caller;
  if (!user) {
    throw new Error('User not found');
  }

  const isAdmin = user.role === 'admin' || user.role === 'superadmin' || isSuperadmin(user);
  if (!isAdmin) {
    throw new Error('Only admins can access compliance features');
  }

  const isSuper = isSuperadmin(user);
  return { user, orgId: isSuper ? undefined : user.organizationId };
}

// ── GDPR Requests ─────────────────────────────────────────────────────────────

export const createGdprRequest = mutation({
  args: {
    userId: v.id('users'),
    requestType: v.union(
      v.literal('data_access'),
      v.literal('data_deletion'),
      v.literal('data_rectification'),
      v.literal('data_portability'),
      v.literal('data_restriction'),
      v.literal('consent_withdrawal'),
    ),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error('User not found');
    if (!orgId || targetUser.organizationId !== orgId) {
      throw new Error('Can only create GDPR requests for users in your organization');
    }

    const requestId = await ctx.db.insert('gdprRequests', {
      organizationId: orgId,
      userId: args.userId,
      requestType: args.requestType,
      status: 'pending',
      details: args.details,
      requestedBy: user._id,
      requestedAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: orgId,
      userId: user._id,
      action: `gdpr_request_${args.requestType}`,
      target: `gdpr_request_${requestId}`,
      details: args.details || `GDPR ${args.requestType} request created`,
      createdAt: Date.now(),
    });

    return { success: true, requestId };
  },
});

export const updateGdprRequestStatus = mutation({
  args: {
    requestId: v.id('gdprRequests'),
    status: v.union(
      v.literal('pending'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('rejected'),
    ),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireAdmin(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error('GDPR request not found');
    }
    if (orgId && request.organizationId !== orgId) {
      throw new Error('Can only update GDPR requests for your organization');
    }

    const updates: Record<string, unknown> = {
      status: args.status,
      processedBy: user._id,
      processedAt: Date.now(),
    };
    if (args.status === 'completed') {
      updates.completedAt = Date.now();
    }
    if (args.status === 'rejected' && args.rejectionReason) {
      updates.rejectionReason = args.rejectionReason;
    }

    await ctx.db.patch(args.requestId, updates);

    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId: user._id,
      action: `gdpr_request_status_changed`,
      target: `gdpr_request_${args.requestId}`,
      details: `GDPR request status changed to ${args.status}${args.rejectionReason ? `: ${args.rejectionReason}` : ''}`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const getGdprRequests = query({
  args: {
    userId: v.optional(v.id('users')),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    // Scope by org via by_org index when admin is non-superadmin; else capped full-table.
    let requests = orgId
      ? await ctx.db
          .query('gdprRequests')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('gdprRequests').order('desc').take(XLARGE_LIST_CAP);

    if (args.userId) {
      requests = requests.filter((r) => r.userId === args.userId);
    }

    if (args.status) {
      requests = requests.filter((r) => r.status === args.status);
    }

    requests = requests.slice(0, args.limit || 100);

    // Enrich with user names
    const uniqueUserIds = [
      ...new Set([
        ...requests.map((r) => r.userId),
        ...requests.map((r) => r.requestedBy),
        ...requests.map((r) => r.processedBy).filter(Boolean),
      ]),
    ];

    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id as Id<'users'>)));
    const userMap = new Map(
      usersBatch.filter((u): u is Doc<'users'> => u !== null).map((u) => [u._id, u]),
    );

    return requests.map((request) => {
      const user = userMap.get(request.userId);
      const requestedBy = userMap.get(request.requestedBy);
      const processedBy = request.processedBy ? userMap.get(request.processedBy) : null;

      return {
        ...request,
        userName: user?.name ?? 'Unknown',
        userEmail: user?.email ?? '',
        requestedByName: requestedBy?.name ?? 'Unknown',
        processedByName: processedBy?.name ?? null,
      };
    });
  },
});

// ── Paginated GDPR Requests ───────────────────────────────────────────────────
export const listGdprRequestsPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { paginationOpts } = args;
    const { orgId } = await requireAdmin(ctx);

    const result = orgId
      ? await ctx.db
          .query('gdprRequests')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .order('desc')
          .paginate(paginationOpts)
      : await ctx.db.query('gdprRequests').order('desc').paginate(paginationOpts);

    const uniqueUserIds = [
      ...new Set([
        ...result.page.map((r) => r.userId),
        ...result.page.map((r) => r.requestedBy),
        ...result.page.map((r) => r.processedBy).filter(Boolean),
      ]),
    ];
    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id as Id<'users'>)));
    const userMap = new Map(
      usersBatch.filter((u): u is Doc<'users'> => u !== null).map((u) => [u._id, u]),
    );

    return {
      ...result,
      page: result.page.map((r) => ({
        ...r,
        userName: userMap.get(r.userId)?.name ?? 'Unknown',
        userEmail: userMap.get(r.userId)?.email ?? '',
        requestedByName: userMap.get(r.requestedBy)?.name ?? 'Unknown',
        processedByName: r.processedBy ? (userMap.get(r.processedBy)?.name ?? null) : null,
      })),
    };
  },
});

// ── Consent Management ────────────────────────────────────────────────────────

export const grantConsent = mutation({
  args: {
    userId: v.id('users'),
    consentType: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    version: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error('User not found');
    if (orgId && targetUser.organizationId !== orgId) {
      throw new Error('Can only manage consent for users in your organization');
    }

    const existing = await ctx.db
      .query('consentRecords')
      .withIndex('by_user_consent', (q) =>
        q.eq('userId', args.userId).eq('consentType', args.consentType),
      )
      .filter((q) => q.eq(q.field('granted'), true))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        grantedAt: Date.now(),
        withdrawnAt: undefined,
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
        version: args.version,
        metadata: args.metadata,
      });
      return { success: true, consentId: existing._id };
    }

    const consentId = await ctx.db.insert('consentRecords', {
      organizationId: orgId! ?? targetUser.organizationId,
      userId: args.userId,
      consentType: args.consentType,
      granted: true,
      grantedAt: Date.now(),
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      version: args.version,
      metadata: args.metadata,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: orgId! ?? targetUser.organizationId,
      userId: user._id,
      action: 'consent_granted',
      target: `consent_${args.consentType}`,
      details: `Admin granted consent for ${args.consentType} on behalf of ${targetUser.email}`,
      createdAt: Date.now(),
    });

    return { success: true, consentId };
  },
});

export const withdrawConsent = mutation({
  args: {
    userId: v.id('users'),
    consentType: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireAdmin(ctx);

    const existing = await ctx.db
      .query('consentRecords')
      .withIndex('by_user_consent', (q) =>
        q.eq('userId', args.userId).eq('consentType', args.consentType),
      )
      .filter((q) => q.eq(q.field('granted'), true))
      .first();

    if (!existing) {
      throw new Error('No active consent found to withdraw');
    }
    if (orgId && existing.organizationId !== orgId) {
      throw new Error('Can only withdraw consent for users in your organization');
    }

    await ctx.db.patch(existing._id, {
      granted: false,
      withdrawnAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: existing.organizationId,
      userId: user._id,
      action: 'consent_withdrawn',
      target: `consent_${args.consentType}`,
      details: `Admin withdrew consent for ${args.consentType} on behalf of user`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const getUserConsents = query({
  args: {
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    // Scope by org via by_org index when admin is non-superadmin; else capped full-table.
    let consents = orgId
      ? await ctx.db
          .query('consentRecords')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('consentRecords').order('desc').take(XLARGE_LIST_CAP);

    if (args.userId) {
      consents = consents.filter((c) => c.userId === args.userId);
    }

    return consents;
  },
});

export const getOrgConsentStats = query({
  args: {},
  handler: async (ctx, _args) => {
    const { orgId } = await requireAdmin(ctx);
    if (!orgId) throw new Error('Admin must belong to an organization');

    const allConsents = await ctx.db
      .query('consentRecords')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(DEFAULT_LIST_CAP);

    const consentTypes = new Set(allConsents.map((c) => c.consentType));
    const stats: Record<string, { granted: number; withdrawn: number }> = {};

    for (const type of consentTypes) {
      const typeConsents = allConsents.filter((c) => c.consentType === type);
      stats[type] = {
        granted: typeConsents.filter((c) => c.granted).length,
        withdrawn: typeConsents.filter((c) => !c.granted || c.withdrawnAt).length,
      };
    }

    return stats;
  },
});

// ── Data Access Logging ───────────────────────────────────────────────────────

export const logDataAccess = mutation({
  args: {
    userId: v.id('users'),
    accessType: v.union(
      v.literal('view'),
      v.literal('export'),
      v.literal('modify'),
      v.literal('delete'),
    ),
    dataType: v.string(),
    recordId: v.optional(v.string()),
    reason: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error('User not found');
    if (orgId && targetUser.organizationId !== orgId) {
      throw new Error('Can only log data access for users in your organization');
    }

    await ctx.db.insert('dataAccessLogs', {
      organizationId: orgId! ?? targetUser.organizationId,
      userId: args.userId,
      accessedBy: user._id,
      accessType: args.accessType,
      dataType: args.dataType,
      recordId: args.recordId,
      reason: args.reason,
      ipAddress: args.ipAddress,
      createdAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: orgId! ?? targetUser.organizationId,
      userId: user._id,
      action: `data_access_${args.accessType}`,
      target: `${args.dataType}${args.recordId ? ` (${args.recordId})` : ''}`,
      details: `Admin accessed ${args.dataType} for user ${targetUser.email}${args.reason ? ` - Reason: ${args.reason}` : ''}`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const getDataAccessLogs = query({
  args: {
    userId: v.optional(v.id('users')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    // Scope by org via by_org index when admin is non-superadmin; else capped full-table.
    let logs = orgId
      ? await ctx.db
          .query('dataAccessLogs')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('dataAccessLogs').order('desc').take(XLARGE_LIST_CAP);

    if (args.userId) {
      logs = logs.filter((l) => l.userId === args.userId);
    }

    logs = logs.slice(0, args.limit || 100);

    // Enrich with user names
    const uniqueUserIds = [
      ...new Set([...logs.map((l) => l.userId), ...logs.map((l) => l.accessedBy)]),
    ];

    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id as Id<'users'>)));
    const userMap = new Map(
      usersBatch.filter((u): u is Doc<'users'> => u !== null).map((u) => [u._id, u]),
    );

    return logs.map((log) => {
      const user = userMap.get(log.userId);
      const accessedBy = userMap.get(log.accessedBy);

      return {
        ...log,
        userName: user?.name ?? 'Unknown',
        userEmail: user?.email ?? '',
        accessedByName: accessedBy?.name ?? 'Unknown',
        accessedByEmail: accessedBy?.email ?? '',
      };
    });
  },
});

// ── Paginated Data Access Logs ────────────────────────────────────────────────
export const listDataAccessLogsPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { paginationOpts } = args;
    const { orgId } = await requireAdmin(ctx);

    const result = orgId
      ? await ctx.db
          .query('dataAccessLogs')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .order('desc')
          .paginate(paginationOpts)
      : await ctx.db.query('dataAccessLogs').order('desc').paginate(paginationOpts);

    const uniqueUserIds = [
      ...new Set([...result.page.map((l) => l.userId), ...result.page.map((l) => l.accessedBy)]),
    ];
    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id as Id<'users'>)));
    const userMap = new Map(
      usersBatch.filter((u): u is Doc<'users'> => u !== null).map((u) => [u._id, u]),
    );

    return {
      ...result,
      page: result.page.map((log) => ({
        ...log,
        userName: userMap.get(log.userId)?.name ?? 'Unknown',
        userEmail: userMap.get(log.userId)?.email ?? '',
        accessedByName: userMap.get(log.accessedBy)?.name ?? 'Unknown',
        accessedByEmail: userMap.get(log.accessedBy)?.email ?? '',
      })),
    };
  },
});

// ── Compliance Policies ───────────────────────────────────────────────────────

export const createPolicy = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    policyType: v.union(
      v.literal('data_retention'),
      v.literal('privacy'),
      v.literal('security'),
      v.literal('access_control'),
      v.literal('general'),
    ),
    content: v.string(),
    version: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireAdmin(ctx);
    if (!orgId) throw new Error('Admin must belong to an organization');

    const policyId = await ctx.db.insert('compliancePolicies', {
      organizationId: orgId,
      title: args.title,
      description: args.description,
      policyType: args.policyType,
      content: args.content,
      version: args.version,
      isActive: true,
      effectiveFrom: Date.now(),
      createdBy: user._id,
      updatedBy: user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: orgId,
      userId: user._id,
      action: 'policy_created',
      target: `policy_${policyId}`,
      details: `Compliance policy "${args.title}" created`,
      createdAt: Date.now(),
    });

    return { success: true, policyId };
  },
});

export const updatePolicy = mutation({
  args: {
    policyId: v.id('compliancePolicies'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    version: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    effectiveUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireAdmin(ctx);

    const policy = await ctx.db.get(args.policyId);
    if (!policy) {
      throw new Error('Policy not found');
    }
    if (orgId && policy.organizationId !== orgId) {
      throw new Error('Can only update policies for your organization');
    }

    await ctx.db.patch(args.policyId, {
      ...(args.title && { title: args.title }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.content && { content: args.content }),
      ...(args.version && { version: args.version }),
      ...(args.isActive !== undefined && { isActive: args.isActive }),
      ...(args.effectiveUntil !== undefined && { effectiveUntil: args.effectiveUntil }),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: policy.organizationId,
      userId: user._id,
      action: 'policy_updated',
      target: `policy_${args.policyId}`,
      details: `Compliance policy "${policy.title}" updated`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const getPolicies = query({
  args: {
    policyType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    // Scope by org via by_org index when admin is non-superadmin; else capped full-table.
    let policies = orgId
      ? await ctx.db
          .query('compliancePolicies')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('compliancePolicies').order('desc').take(XLARGE_LIST_CAP);

    if (args.policyType) {
      policies = policies.filter((p) => p.policyType === args.policyType);
    }

    // Enrich with creator/updater names
    const uniqueUserIds = [
      ...new Set([...policies.map((p) => p.createdBy), ...policies.map((p) => p.updatedBy)]),
    ];

    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id as Id<'users'>)));
    const userMap = new Map(
      usersBatch.filter((u): u is Doc<'users'> => u !== null).map((u) => [u._id, u]),
    );

    return policies.map((policy) => {
      const createdBy = userMap.get(policy.createdBy);
      const updatedBy = userMap.get(policy.updatedBy);

      return {
        ...policy,
        createdByName: createdBy?.name ?? 'Unknown',
        updatedByName: updatedBy?.name ?? 'Unknown',
      };
    });
  },
});

export const deletePolicy = mutation({
  args: {
    policyId: v.id('compliancePolicies'),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireAdmin(ctx);

    const policy = await ctx.db.get(args.policyId);
    if (!policy) {
      throw new Error('Policy not found');
    }
    if (orgId && policy.organizationId !== orgId) {
      throw new Error('Can only delete policies for your organization');
    }

    await ctx.db.delete(args.policyId);

    await ctx.db.insert('auditLogs', {
      organizationId: policy.organizationId,
      userId: user._id,
      action: 'policy_deleted',
      target: `policy_${args.policyId}`,
      details: `Compliance policy "${policy.title}" deleted`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// ── Compliance Dashboard Stats ────────────────────────────────────────────────

export const getComplianceStats = query({
  args: {},
  handler: async (ctx, _args) => {
    const { orgId } = await requireAdmin(ctx);

    // Scope all counts by org via by_org indexes when admin is non-superadmin;
    // else capped full-table reads at XLARGE.
    const gdprRequests = orgId
      ? await ctx.db
          .query('gdprRequests')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('gdprRequests').take(XLARGE_LIST_CAP);
    const dataAccessLogs = orgId
      ? await ctx.db
          .query('dataAccessLogs')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('dataAccessLogs').take(XLARGE_LIST_CAP);
    const consentRecords = orgId
      ? await ctx.db
          .query('consentRecords')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('consentRecords').take(XLARGE_LIST_CAP);
    const policies = orgId
      ? await ctx.db
          .query('compliancePolicies')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('compliancePolicies').take(XLARGE_LIST_CAP);

    const gdprByStatus = {
      pending: gdprRequests.filter((r) => r.status === 'pending').length,
      in_progress: gdprRequests.filter((r) => r.status === 'in_progress').length,
      completed: gdprRequests.filter((r) => r.status === 'completed').length,
      rejected: gdprRequests.filter((r) => r.status === 'rejected').length,
    };

    const consentStats = {
      total: consentRecords.length,
      active: consentRecords.filter((c) => c.granted && !c.withdrawnAt).length,
      withdrawn: consentRecords.filter((c) => !c.granted || c.withdrawnAt).length,
    };

    const policyStats = {
      total: policies.length,
      active: policies.filter((p) => p.isActive).length,
      inactive: policies.filter((p) => !p.isActive).length,
    };

    return {
      gdprRequests: gdprRequests.length,
      gdprByStatus,
      dataAccessLogs: dataAccessLogs.length,
      consentStats,
      policyStats,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED MUTATIONS — verified identity via ctx.auth
// ═══════════════════════════════════════════════════════════════════════════════

export const secureUpdateGdprStatus = mutation({
  args: {
    requestId: v.id('gdprRequests'),
    status: v.union(v.literal('in_progress'), v.literal('completed'), v.literal('rejected')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, status, notes }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');

    if (caller.role !== 'superadmin' && caller.organizationId !== request.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    await ctx.db.patch(requestId, {
      status,
      processedBy: caller._id,
      processedAt: Date.now(),
      ...(notes ? { rejectionReason: notes } : {}),
    });
  },
});

export const secureDeletePolicy = mutation({
  args: { policyId: v.id('compliancePolicies') },
  handler: async (ctx, { policyId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const policy = await ctx.db.get(policyId);
    if (!policy) throw new Error('Policy not found');

    if (caller.role !== 'superadmin' && caller.organizationId !== policy.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    await ctx.db.delete(policyId);

    await ctx.db.insert('auditLogs', {
      organizationId: policy.organizationId,
      userId: caller._id,
      action: 'policy_deleted',
      target: policyId,
      details: JSON.stringify({ title: policy.title }),
      createdAt: Date.now(),
    });
  },
});
