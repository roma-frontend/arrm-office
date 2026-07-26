import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * AI Governance — real telemetry for the AI Governance panel.
 *
 * `aiRequestLogs`      — one row per AI chat request (allowed or blocked), the
 *                        source of truth for stats, recent activity, agent
 *                        health, and the audit log.
 * `aiGuardrailSettings`— per-organization guardrail toggles, so flipping a
 *                        switch persists instead of resetting on refresh.
 */
export const aiGovernance = {
  aiRequestLogs: defineTable({
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
    userName: v.string(),
    agent: v.string(), // 'recruitment' | 'policy' | 'analytics' | 'kpi' | 'general'
    action: v.string(),
    status: v.union(v.literal('allowed'), v.literal('blocked')),
    blockedReason: v.optional(v.string()),
    tokens: v.number(),
    latencyMs: v.number(),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_org_agent', ['organizationId', 'agent']),

  aiGuardrailSettings: defineTable({
    organizationId: v.id('organizations'),
    key: v.string(),
    enabled: v.boolean(),
    updatedBy: v.optional(v.id('users')),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_key', ['organizationId', 'key']),
};
