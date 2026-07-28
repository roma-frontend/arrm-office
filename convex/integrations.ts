import { v } from 'convex/values';
import { mutation, query, action, internalQuery, internalMutation } from './_generated/server';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';

const providerValidator = v.union(
  v.literal('lucky_carrot'),
  v.literal('imid'),
  v.literal('armsoft'),
);

/** Credential fields that must never reach the client. */
const SECRET_FIELDS = ['apiKey', 'clientSecret', 'apiPassword'] as const;

/** Placeholder sent to the client in place of a stored secret. */
export const SECRET_MASK = '••••••••';

/**
 * Only org admins may see or change integration settings — these configs hold
 * third-party credentials.
 */
function canAdminOrg(caller: AuthenticatedCaller, organizationId: Id<'organizations'>) {
  if (isSuperadmin(caller)) return true;
  return caller.role === 'admin' && caller.organizationId === organizationId;
}

/**
 * Replace stored secrets with a mask so the UI can show "a value is set"
 * without ever transmitting the credential itself.
 */
function maskConfig(doc: Doc<'integrationConfigs'>) {
  const config = { ...doc.config };
  for (const field of SECRET_FIELDS) {
    if (config[field]) config[field] = SECRET_MASK;
  }
  return { ...doc, config };
}

// ── Get integration config for an organization (masked) ────────────────────
export const getIntegrationConfig = query({
  args: { organizationId: v.id('organizations'), provider: providerValidator },
  handler: async (ctx, { organizationId, provider }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canAdminOrg(caller, organizationId)) return null;

    const doc = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .first();

    return doc ? maskConfig(doc) : null;
  },
});

// ── Get all integration configs for an organization (masked) ───────────────
export const getAllIntegrationConfigs = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canAdminOrg(caller, organizationId)) return [];

    const docs = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(10);

    return docs.map(maskConfig);
  },
});

// ── Internal: read the raw config (secrets intact) for server-side syncing ──
export const getIntegrationConfigInternal = internalQuery({
  args: { organizationId: v.id('organizations'), provider: providerValidator },
  handler: async (ctx, { organizationId, provider }) => {
    return await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .first();
  },
});

// ── Internal: record sync progress without re-sending the whole config ──────
export const setSyncState = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
    syncStatus: v.union(
      v.literal('idle'),
      v.literal('syncing'),
      v.literal('error'),
      v.literal('success'),
    ),
    lastError: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, provider, syncStatus, lastError, lastSyncAt }) => {
    const existing = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .first();
    if (!existing) return;

    await ctx.db.patch(existing._id, {
      config: {
        ...existing.config,
        syncStatus,
        lastError,
        ...(lastSyncAt ? { lastSyncAt } : {}),
      },
      updatedAt: Date.now(),
    });
  },
});

// ── Save/update integration config ────────────────────────────────────────
export const saveIntegrationConfig = mutation({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
    config: v.object({
      isEnabled: v.boolean(),
      lastSyncAt: v.optional(v.number()),
      syncStatus: v.optional(
        v.union(v.literal('idle'), v.literal('syncing'), v.literal('error'), v.literal('success')),
      ),
      lastError: v.optional(v.string()),
      apiKey: v.optional(v.string()),
      apiUrl: v.optional(v.string()),
      webhookUrl: v.optional(v.string()),
      autoSyncEmployees: v.optional(v.boolean()),
      clientId: v.optional(v.string()),
      clientSecret: v.optional(v.string()),
      redirectUri: v.optional(v.string()),
      enableLogin: v.optional(v.boolean()),
      enableSigning: v.optional(v.boolean()),
      enableVerification: v.optional(v.boolean()),
      apiEndpoint: v.optional(v.string()),
      apiUsername: v.optional(v.string()),
      apiPassword: v.optional(v.string()),
      syncEmployees: v.optional(v.boolean()),
      syncPayroll: v.optional(v.boolean()),
      syncSchedule: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { organizationId, provider, config }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!canAdminOrg(caller, organizationId)) {
      throw new Error('Only admins of this organization can configure integrations');
    }

    // A masked secret means "unchanged" — never persist the placeholder.
    const incoming: Record<string, unknown> = { ...config };
    for (const field of SECRET_FIELDS) {
      if (incoming[field] === SECRET_MASK) delete incoming[field];
    }

    const existing = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .first();

    const now = Date.now();
    if (existing) {
      // Merge with existing config to preserve fields not sent
      const merged = { ...existing.config, ...incoming };
      await ctx.db.patch(existing._id, { config: merged as any, updatedAt: now });
    } else {
      await ctx.db.insert('integrationConfigs', {
        organizationId,
        provider,
        config: incoming as any,
        createdBy: caller._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: caller._id,
      action: `integration_${provider}_updated`,
      target: provider,
      details: JSON.stringify({ isEnabled: config.isEnabled }),
      createdAt: now,
    });
  },
});

// ── Sync integration data (action - runs externally) ──────────────────────
export const syncIntegration = action({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
  },
  handler: async (ctx, { organizationId, provider }) => {
    // Actions have no db access, so authorize via an internal query.
    const authorized = await ctx.runQuery(internal.integrations.assertCanSync, {
      organizationId,
    });
    if (!authorized) {
      return { success: false, error: 'Not authorized to sync this integration' };
    }

    // Read the raw config (with secrets) — never the masked public query.
    const config = await ctx.runQuery(internal.integrations.getIntegrationConfigInternal, {
      organizationId,
      provider,
    });

    if (!config || !config.config.isEnabled) {
      return { success: false, error: 'Integration not configured or disabled' };
    }

    // Mark as syncing
    await ctx.runMutation(internal.integrations.setSyncState, {
      organizationId,
      provider,
      syncStatus: 'syncing',
    });

    try {
      const result = await performSync(provider, config.config);

      // Log success
      await ctx.runMutation(internal.integrations.logSync, {
        organizationId,
        provider,
        action: 'sync',
        status: 'success',
        message: `Sync completed: ${result.message || 'OK'}`,
      });

      // Mark as success
      await ctx.runMutation(internal.integrations.setSyncState, {
        organizationId,
        provider,
        syncStatus: 'success',
        lastSyncAt: Date.now(),
      });

      return { success: true, message: result.message };
    } catch (error: any) {
      const message = error?.message ? String(error.message) : 'Sync failed';

      // Log error
      await ctx.runMutation(internal.integrations.logSync, {
        organizationId,
        provider,
        action: 'sync',
        status: 'error',
        message,
      });

      // Mark as error
      await ctx.runMutation(internal.integrations.setSyncState, {
        organizationId,
        provider,
        syncStatus: 'error',
        lastError: message,
      });

      return { success: false, error: message };
    }
  },
});

// ── Internal: check the caller may sync this org's integrations ─────────────
export const assertCanSync = internalQuery({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    return !!caller && canAdminOrg(caller, organizationId);
  },
});

// ── Log a sync event (internal — written only by the sync action) ───────────
export const logSync = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
    action: v.string(),
    status: v.union(v.literal('success'), v.literal('error'), v.literal('skipped')),
    message: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('integrationSyncLogs', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ── Get sync logs ─────────────────────────────────────────────────────────
export const getSyncLogs = query({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
  },
  handler: async (ctx, { organizationId, provider }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canAdminOrg(caller, organizationId)) return [];

    return await ctx.db
      .query('integrationSyncLogs')
      .withIndex('by_org_provider_created', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .order('desc')
      .take(50);
  },
});

// ── Perform the actual sync based on provider ─────────────────────────────
/**
 * Third-party error bodies can echo back the credentials we sent, and they land
 * in sync logs shown in the UI. Truncate and strip anything secret-looking.
 */
function safeErrorBody(body: string, config: any): string {
  let out = body.slice(0, 300);
  for (const field of SECRET_FIELDS) {
    const secret = config?.[field];
    if (typeof secret === 'string' && secret.length >= 6) {
      out = out.split(secret).join(SECRET_MASK);
    }
  }
  return out;
}

async function performSync(provider: string, config: any): Promise<{ message: string }> {
  switch (provider) {
    case 'lucky_carrot':
      return syncLuckyCarrot(config);
    case 'imid':
      return syncImid(config);
    case 'armsoft':
      return syncArmsoft(config);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Lucky Carrot Sync ──────────────────────────────────────────────────────
async function syncLuckyCarrot(config: any): Promise<{ message: string }> {
  if (!config.apiKey || !config.apiUrl) {
    throw new Error('Lucky Carrot: API key and URL required');
  }
  const response = await fetch(`${config.apiUrl}/api/v1/employees/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'sync_employees' }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Lucky Carrot API error (${response.status}): ${safeErrorBody(err, config)}`);
  }
  return { message: 'Lucky Carrot employees synced successfully' };
}

// ── imID Sync ──────────────────────────────────────────────────────────────
async function syncImid(config: any): Promise<{ message: string }> {
  if (!config.clientId) {
    throw new Error('imID: Client ID required');
  }
  // Generate OAuth2 token using client credentials
  if (config.clientSecret) {
    const tokenResponse = await fetch('https://api.imid.am/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      throw new Error(`imID auth error (${tokenResponse.status}): ${safeErrorBody(err, config)}`);
    }
  }
  return { message: 'imID integration active' };
}

// ── Armsoft (ՀԾ) Sync ─────────────────────────────────────────────────────
async function syncArmsoft(config: any): Promise<{ message: string }> {
  if (!config.apiEndpoint) {
    throw new Error('ՀԾ Armsoft: API endpoint required');
  }
  // Convex's default runtime has no Buffer — use btoa for Basic auth.
  const basic = btoa(`${config.apiUsername || ''}:${config.apiPassword || ''}`);
  const response = await fetch(`${config.apiEndpoint}/api/hr/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'sync_all', direction: 'bidirectional' }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Armsoft API error (${response.status}): ${safeErrorBody(err, config)}`);
  }
  return { message: 'ՀԾ Armsoft data synced successfully' };
}
