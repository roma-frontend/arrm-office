/**
 * AI Governance — real-data queries and mutations for the AI Governance panel.
 *
 * Reads derive entirely from the `aiRequestLogs` table (written by the chat
 * API on every request) and `aiGuardrailSettings` (per-org toggles). No mock
 * data — empty tables produce zeroed stats and empty lists, not fake rows.
 */

import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { requireOrgAdmin } from './lib/rbac';

/** Guardrail toggles the panel exposes, with their shipped defaults. */
export const GUARDRAIL_DEFAULTS: Record<string, boolean> = {
  inputFiltering: true,
  outputFiltering: true,
  piiDetection: true,
  rateLimiting: true,
  humanApprovalRequired: false,
};

// ── Queries ──────────────────────────────────────────────────────────────────

/** Overview stat cards: total requests, blocked, active agents, avg latency. */
export const getStats = query({
  args: { organizationId: v.id('organizations'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.userId, args.organizationId);

    const logs = await ctx.db
      .query('aiRequestLogs')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const total = logs.length;
    const blocked = logs.filter((l) => l.status === 'blocked').length;
    const activeAgents = new Set(logs.map((l) => l.agent)).size;
    const avgLatencyMs =
      total > 0 ? Math.round(logs.reduce((s, l) => s + l.latencyMs, 0) / total) : 0;

    return { total, blocked, activeAgents, avgLatencyMs };
  },
});

/** Most recent AI requests for the overview activity feed. */
export const getRecentActivity = query({
  args: { organizationId: v.id('organizations'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.userId, args.organizationId);

    const logs = await ctx.db
      .query('aiRequestLogs')
      .withIndex('by_org_created', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(10);

    return logs.map((l) => ({
      id: l._id,
      action: l.action,
      user: l.userName,
      agent: l.agent,
      status: l.status,
      createdAt: l.createdAt,
    }));
  },
});

/** Per-agent health derived from real traffic (request counts + block rate). */
export const getAgentHealth = query({
  args: { organizationId: v.id('organizations'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.userId, args.organizationId);

    const logs = await ctx.db
      .query('aiRequestLogs')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const byAgent = new Map<string, { requests: number; blocked: number }>();
    for (const l of logs) {
      const entry = byAgent.get(l.agent) ?? { requests: 0, blocked: 0 };
      entry.requests += 1;
      if (l.status === 'blocked') entry.blocked += 1;
      byAgent.set(l.agent, entry);
    }

    return Array.from(byAgent.entries())
      .map(([agent, { requests, blocked }]) => {
        // Uptime proxy: share of requests that were not blocked.
        const uptime = requests > 0 ? ((requests - blocked) / requests) * 100 : 100;
        return {
          agent,
          requests,
          blocked,
          uptime: Math.round(uptime * 10) / 10,
          status: uptime >= 99 ? 'healthy' : 'degraded',
        };
      })
      .sort((a, b) => b.requests - a.requests);
  },
});

/** Audit log: recent requests with token/latency detail, optional agent filter. */
export const getAuditLog = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    agent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.userId, args.organizationId);

    const logs = args.agent
      ? await ctx.db
          .query('aiRequestLogs')
          .withIndex('by_org_agent', (q) =>
            q.eq('organizationId', args.organizationId).eq('agent', args.agent!),
          )
          .order('desc')
          .take(50)
      : await ctx.db
          .query('aiRequestLogs')
          .withIndex('by_org_created', (q) => q.eq('organizationId', args.organizationId))
          .order('desc')
          .take(50);

    return logs.map((l) => ({
      id: l._id,
      agent: l.agent,
      action: l.action,
      user: l.userName,
      status: l.status,
      tokens: l.tokens,
      latencyMs: l.latencyMs,
      createdAt: l.createdAt,
    }));
  },
});

/** Current guardrail toggles for the org, merged over shipped defaults. */
export const getGuardrails = query({
  args: { organizationId: v.id('organizations'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.userId, args.organizationId);

    const rows = await ctx.db
      .query('aiGuardrailSettings')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const settings: Record<string, boolean> = { ...GUARDRAIL_DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.enabled;
    }
    return settings;
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Record one AI request. Called server-to-server from the chat API route, so
 * it is intentionally unauthenticated (trusted caller) — mirrors
 * `security:logLoginAttempt`. Never throws for missing optional fields.
 */
export const logRequest = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
    userName: v.string(),
    agent: v.string(),
    action: v.string(),
    status: v.union(v.literal('allowed'), v.literal('blocked')),
    blockedReason: v.optional(v.string()),
    tokens: v.number(),
    latencyMs: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('aiRequestLogs', {
      organizationId: args.organizationId,
      userId: args.userId,
      userName: args.userName,
      agent: args.agent,
      action: args.action,
      status: args.status,
      blockedReason: args.blockedReason,
      tokens: args.tokens,
      latencyMs: args.latencyMs,
      createdAt: Date.now(),
    });
    return { id };
  },
});

/** Persist a single guardrail toggle for the org (admin only). */
export const updateGuardrail = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    key: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.userId, args.organizationId);

    if (!(args.key in GUARDRAIL_DEFAULTS)) {
      throw new Error(`Unknown guardrail key: ${args.key}`);
    }

    const existing = await ctx.db
      .query('aiGuardrailSettings')
      .withIndex('by_org_key', (q) =>
        q.eq('organizationId', args.organizationId).eq('key', args.key),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedBy: args.userId,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('aiGuardrailSettings', {
        organizationId: args.organizationId,
        key: args.key,
        enabled: args.enabled,
        updatedBy: args.userId,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});
