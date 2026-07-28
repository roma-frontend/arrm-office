import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const integrations = {
  // ── Integration Configurations per Organization ──────────────────────────
  integrationConfigs: defineTable({
    organizationId: v.id('organizations'),
    provider: v.union(v.literal('lucky_carrot'), v.literal('imid'), v.literal('armsoft')),
    // Provider-specific settings stored as JSON
    config: v.object({
      // Common
      isEnabled: v.boolean(),
      lastSyncAt: v.optional(v.number()),
      syncStatus: v.optional(
        v.union(v.literal('idle'), v.literal('syncing'), v.literal('error'), v.literal('success')),
      ),
      lastError: v.optional(v.string()),

      // Lucky Carrot
      apiKey: v.optional(v.string()),
      apiUrl: v.optional(v.string()),
      webhookUrl: v.optional(v.string()),
      autoSyncEmployees: v.optional(v.boolean()),

      // imID
      clientId: v.optional(v.string()),
      clientSecret: v.optional(v.string()),
      redirectUri: v.optional(v.string()),
      enableLogin: v.optional(v.boolean()),
      enableSigning: v.optional(v.boolean()),
      enableVerification: v.optional(v.boolean()),

      // Armsoft (ՀԾ)
      apiEndpoint: v.optional(v.string()),
      apiUsername: v.optional(v.string()),
      apiPassword: v.optional(v.string()),
      syncEmployees: v.optional(v.boolean()),
      syncPayroll: v.optional(v.boolean()),
      syncSchedule: v.optional(v.string()), // cron expression
    }),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_provider', ['organizationId', 'provider']),

  // ── Integration Sync Logs ────────────────────────────────────────────────
  integrationSyncLogs: defineTable({
    organizationId: v.id('organizations'),
    provider: v.union(v.literal('lucky_carrot'), v.literal('imid'), v.literal('armsoft')),
    action: v.string(),
    status: v.union(v.literal('success'), v.literal('error'), v.literal('skipped')),
    message: v.string(),
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_org_provider', ['organizationId', 'provider'])
    .index('by_org_provider_created', ['organizationId', 'provider', 'createdAt']),
};
