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
      /** Accept inbound webhook pushes at /webhooks/lucky-carrot/<orgId>. */
      webhookEnabled: v.optional(v.boolean()),
      /**
       * HMAC-SHA256 signing secret for inbound webhooks. Generated server-side
       * and returned to the admin exactly once — never accepted from a client.
       */
      webhookSecret: v.optional(v.string()),
      /** Timestamp of the last accepted webhook delivery. */
      lastWebhookAt: v.optional(v.number()),

      // imID
      clientId: v.optional(v.string()),
      clientSecret: v.optional(v.string()),
      redirectUri: v.optional(v.string()),
      enableLogin: v.optional(v.boolean()),
      enableSigning: v.optional(v.boolean()),
      enableVerification: v.optional(v.boolean()),
      /** Override for the OAuth authorization endpoint (default: https://api.imid.am/v1/oauth/authorize). */
      authorizePath: v.optional(v.string()),
      /** Override for the userinfo endpoint (default: https://api.imid.am/v1/oauth/userinfo). */
      userInfoPath: v.optional(v.string()),
      /** Override for the signing API endpoint (default: https://api.imid.am/v1/sign). */
      signingPath: v.optional(v.string()),

      // Armsoft (ՀԾ)
      apiEndpoint: v.optional(v.string()),
      apiUsername: v.optional(v.string()),
      apiPassword: v.optional(v.string()),
      syncEmployees: v.optional(v.boolean()),
      syncPayroll: v.optional(v.boolean()),
      syncSchedule: v.optional(v.string()), // cron expression

      // ── Response-shape overrides ────────────────────────────────────────
      // Provider APIs differ in path and payload shape, and we have no fixed
      // contract for them. These let an admin point the sync at the right
      // endpoint and pick the array out of the response without a code change.
      // All optional — sensible defaults are probed when absent.
      employeesPath: v.optional(v.string()), // e.g. "/api/v1/employees"
      employeesListKey: v.optional(v.string()), // e.g. "data.items"
      /** Maps our employee fields to provider field names, JSON-encoded. */
      fieldMap: v.optional(v.string()),
      /** Deactivate org users absent from the provider's list. Default false. */
      deactivateMissing: v.optional(v.boolean()),

      // ── imID token cache (server-only; never returned to the client) ─────
      imidAccessToken: v.optional(v.string()),
      imidTokenExpiresAt: v.optional(v.number()),
      tokenPath: v.optional(v.string()), // override for the OAuth token endpoint
      // ── OAuth session state ──────────────────────────────────
      /** Pending OAuth authorization state (anti-CSRF). */
      oauthState: v.optional(v.string()),
    }),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_provider', ['organizationId', 'provider'])
    // Drives the scheduled-sync sweep: find enabled configs without scanning all orgs.
    .index('by_provider_enabled', ['provider', 'config.isEnabled']),

  // ── Integration Sync Logs ────────────────────────────────────────────────
  integrationSyncLogs: defineTable({
    organizationId: v.id('organizations'),
    provider: v.union(v.literal('lucky_carrot'), v.literal('imid'), v.literal('armsoft')),
    action: v.string(),
    status: v.union(v.literal('success'), v.literal('error'), v.literal('skipped')),
    message: v.string(),
    details: v.optional(v.string()),
    /** Per-run counters so the UI can show what the sync actually changed. */
    created: v.optional(v.number()),
    updated: v.optional(v.number()),
    deactivated: v.optional(v.number()),
    skipped: v.optional(v.number()),
    /** Null for cron-triggered runs. */
    triggeredBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_org_provider', ['organizationId', 'provider'])
    .index('by_org_provider_created', ['organizationId', 'provider', 'createdAt']),
};
