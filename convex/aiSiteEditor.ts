import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_LIST_CAP } from './lib/limits';

// ── Get current month's usage for a user ──────────────────────────────────────
export const getCurrentMonthUsage = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { userId } = args;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const usage = await ctx.db
      .query('aiSiteEditorUsage')
      .withIndex('by_user_month', (q) => q.eq('userId', userId).eq('month', month))
      .first();

    if (!usage) {
      // Return empty usage if not found
      return {
        designChanges: 0,
        contentChanges: 0,
        layoutChanges: 0,
        logicChanges: 0,
        fullControlChanges: 0,
        totalRequests: 0,
      };
    }

    return {
      designChanges: usage.designChanges,
      contentChanges: usage.contentChanges,
      layoutChanges: usage.layoutChanges,
      logicChanges: usage.logicChanges,
      fullControlChanges: usage.fullControlChanges,
      totalRequests: usage.totalRequests,
    };
  },
});

// ── Check if user can make a specific type of edit ───────────────────────────
export const canMakeEdit = query({
  args: {
    userId: v.id('users'),
    organizationId: v.id('organizations'),
    editType: v.union(
      v.literal('design'),
      v.literal('content'),
      v.literal('layout'),
      v.literal('logic'),
      v.literal('full_control'),
    ),
  },
  handler: async (ctx, args) => {
    const { userId, organizationId, editType } = args;
    // Get organization to check plan
    const org = await ctx.db.get(organizationId);
    if (!org) return { allowed: false, reason: 'Organization not found' };

    const plan = org.plan;

    // Professional and Enterprise have unlimited access
    if (plan === 'professional' || plan === 'enterprise') {
      return { allowed: true, reason: null };
    }

    // For starter plan, check limits
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const usage = await ctx.db
      .query('aiSiteEditorUsage')
      .withIndex('by_user_month', (q) => q.eq('userId', userId).eq('month', month))
      .first();

    const currentUsage = usage || {
      designChanges: 0,
      contentChanges: 0,
      layoutChanges: 0,
      logicChanges: 0,
      fullControlChanges: 0,
    };

    // Starter plan limits
    const limits = {
      design: 5,
      content: 10,
      layout: 2,
      logic: 0, // Not allowed
      full_control: 0, // Not allowed
    };

    // Check specific limit
    switch (editType) {
      case 'design':
        if (currentUsage.designChanges >= limits.design) {
          return {
            allowed: false,
            reason: `Вы достигли лимита изменений дизайна (${limits.design}/месяц). Обновитесь до Professional для неограниченного доступа.`,
          };
        }
        break;
      case 'content':
        if (currentUsage.contentChanges >= limits.content) {
          return {
            allowed: false,
            reason: `Вы достигли лимита изменений контента (${limits.content}/месяц). Обновитесь до Professional для неограниченного доступа.`,
          };
        }
        break;
      case 'layout':
        if (currentUsage.layoutChanges >= limits.layout) {
          return {
            allowed: false,
            reason: `Вы достигли лимита изменений макета (${limits.layout}/месяц). Обновитесь до Professional для неограниченного доступа.`,
          };
        }
        break;
      case 'logic':
      case 'full_control':
        return {
          allowed: false,
          reason: 'Эта функция доступна только для плана Professional и выше.',
        };
    }

    return { allowed: true, reason: null };
  },
});

// ── Increment usage counter ───────────────────────────────────────────────────
export const incrementUsage = mutation({
  args: {
    userId: v.id('users'),
    organizationId: v.id('organizations'),
    editType: v.union(
      v.literal('design'),
      v.literal('content'),
      v.literal('layout'),
      v.literal('logic'),
      v.literal('full_control'),
    ),
  },
  handler: async (ctx, args) => {
    const { userId, organizationId, editType } = args;
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error('Organization not found');

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const usage = await ctx.db
      .query('aiSiteEditorUsage')
      .withIndex('by_user_month', (q) => q.eq('userId', userId).eq('month', month))
      .first();

    const increment = {
      designChanges: editType === 'design' ? 1 : 0,
      contentChanges: editType === 'content' ? 1 : 0,
      layoutChanges: editType === 'layout' ? 1 : 0,
      logicChanges: editType === 'logic' ? 1 : 0,
      fullControlChanges: editType === 'full_control' ? 1 : 0,
      totalRequests: 1,
    };

    if (usage) {
      await ctx.db.patch(usage._id, {
        designChanges: usage.designChanges + increment.designChanges,
        contentChanges: usage.contentChanges + increment.contentChanges,
        layoutChanges: usage.layoutChanges + increment.layoutChanges,
        logicChanges: usage.logicChanges + increment.logicChanges,
        fullControlChanges: usage.fullControlChanges + increment.fullControlChanges,
        totalRequests: usage.totalRequests + 1,
        updatedAt: Date.now(),
      });
      return usage._id;
    } else {
      return await ctx.db.insert('aiSiteEditorUsage', {
        userId,
        organizationId,
        plan: org.plan,
        month,
        designChanges: increment.designChanges,
        contentChanges: increment.contentChanges,
        layoutChanges: increment.layoutChanges,
        logicChanges: increment.logicChanges,
        fullControlChanges: increment.fullControlChanges,
        totalRequests: 1,
        lastResetAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// ── Create a new editing session ──────────────────────────────────────────────
export const createSession = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    userMessage: v.string(),
    editType: v.union(
      v.literal('design'),
      v.literal('content'),
      v.literal('layout'),
      v.literal('logic'),
      v.literal('full_control'),
    ),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error('Organization not found');

    const limitType =
      org.plan === 'professional' || org.plan === 'enterprise' ? 'unlimited' : 'limited';

    return await ctx.db.insert('aiSiteEditorSessions', {
      organizationId: args.organizationId,
      userId: args.userId,
      plan: org.plan,
      userMessage: args.userMessage,
      aiResponse: '', // Will be updated later
      editType: args.editType,
      changesMade: [],
      limitType,
      status: 'pending',
      canRollback: false,
      rolledBack: false,
      createdAt: Date.now(),
    });
  },
});

// ── Update session with AI response and changes ───────────────────────────────
export const updateSession = mutation({
  args: {
    sessionId: v.id('aiSiteEditorSessions'),
    aiResponse: v.string(),
    changesMade: v.array(
      v.object({
        file: v.string(),
        type: v.string(),
        description: v.string(),
        before: v.optional(v.string()),
        after: v.optional(v.string()),
      }),
    ),
    status: v.union(v.literal('completed'), v.literal('failed'), v.literal('rejected')),
    errorMessage: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { sessionId, ...updates } = args;
    await ctx.db.patch(sessionId, {
      ...updates,
      canRollback: updates.changesMade.length > 0 && updates.status === 'completed',
    });
    return sessionId;
  },
});

// ── Get user's editing history ────────────────────────────────────────────────
export const getHistory = query({
  args: {
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, limit = 50 } = args;
    return await ctx.db
      .query('aiSiteEditorSessions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .take(limit);
  },
});

// ── Rollback a session ────────────────────────────────────────────────────────
export const rollbackSession = mutation({
  args: {
    sessionId: v.id('aiSiteEditorSessions'),
  },
  handler: async (ctx, args) => {
    const { sessionId } = args;
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (!session.canRollback) throw new Error('This session cannot be rolled back');
    if (session.rolledBack) throw new Error('This session has already been rolled back');

    await ctx.db.patch(sessionId, {
      rolledBack: true,
      rolledBackAt: Date.now(),
    });

    return session;
  },
});

// ── Get organization's usage stats ────────────────────────────────────────────
export const getOrganizationStats = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const usageRecords = await ctx.db
      .query('aiSiteEditorUsage')
      .withIndex('by_org_month', (q) => q.eq('organizationId', organizationId).eq('month', month))
      .take(DEFAULT_LIST_CAP);

    const totalStats = usageRecords.reduce(
      (acc, record) => ({
        designChanges: acc.designChanges + record.designChanges,
        contentChanges: acc.contentChanges + record.contentChanges,
        layoutChanges: acc.layoutChanges + record.layoutChanges,
        logicChanges: acc.logicChanges + record.logicChanges,
        fullControlChanges: acc.fullControlChanges + record.fullControlChanges,
        totalRequests: acc.totalRequests + record.totalRequests,
      }),
      {
        designChanges: 0,
        contentChanges: 0,
        layoutChanges: 0,
        logicChanges: 0,
        fullControlChanges: 0,
        totalRequests: 0,
      },
    );

    return totalStats;
  },
});
