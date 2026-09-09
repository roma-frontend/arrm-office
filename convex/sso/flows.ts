import { internalMutation, internalQuery } from '../_generated/server';
import { v } from 'convex/values';

/**
 * SSO login-flow state — internal persistence for the OIDC httpActions in
 * convex/http.ts. Flows are created by startSsoLogin, consumed exactly once
 * by consumeSsoFlow, and opportunistically purged on every new start.
 */

/** Create an in-flight flow and purge expired rows opportunistically. */
export const createFlow = internalMutation({
  args: {
    state: v.string(),
    connectionId: v.string(),
    redirectUri: v.string(),
    codeVerifier: v.string(),
    ttlMs: v.number(),
  },
  handler: async (ctx, { state, connectionId, redirectUri, codeVerifier, ttlMs }) => {
    const now = Date.now();
    // Opportunistic GC — cheap indexed scan, keeps the table tiny.
    const stale = await ctx.db
      .query('ssoLoginFlows')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', now))
      .take(25);
    for (const row of stale) await ctx.db.delete(row._id);

    return await ctx.db.insert('ssoLoginFlows', {
      state,
      connectionId,
      redirectUri,
      codeVerifier,
      expiresAt: now + ttlMs,
    });
  },
});

interface SsoLoginFlow {
  _id: import('../_generated/dataModel').Id<'ssoLoginFlows'>;
  state: string;
  connectionId: string;
  redirectUri: string;
  codeVerifier: string;
  expiresAt: number;
}

/** Read a flow by state (no consume) — used to resolve the redirect URI. */
export const getFlow = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, { state }): Promise<SsoLoginFlow | null> => {
    return await ctx.db
      .query('ssoLoginFlows')
      .withIndex('by_state', (q) => q.eq('state', state))
      .unique();
  },
});

/** Connection projection for the callback (endpoint overrides resolved). */
export const getConnectionForCallback = internalQuery({
  args: { connectionId: v.string() },
  handler: async (
    ctx,
    { connectionId },
  ): Promise<{
    organizationId: import('../_generated/dataModel').Id<'organizations'>;
    connectionId: string;
    issuer: string;
    clientId: string;
    clientSecret: string;
    tokenEndpoint?: string;
    scopes?: string;
    domains: string[];
    autoProvision: boolean;
    enabled: boolean;
    appUrl: string;
  } | null> => {
    const row = await ctx.db
      .query('ssoConnections')
      .withIndex('by_connection_id', (q) => q.eq('connectionId', connectionId))
      .unique();
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      connectionId: row.connectionId,
      issuer: row.issuer,
      clientId: row.clientId,
      clientSecret: row.clientSecret,
      tokenEndpoint: row.tokenEndpoint,
      scopes: row.scopes,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      domains: row.domains ?? [],
      autoProvision: row.autoProvision,
      enabled: row.enabled,
    };
  },
});

/** Connection projection for the login start (redirect target resolved). */
export const getConnectionForStart = internalQuery({
  args: { connectionId: v.string() },
  handler: async (
    ctx,
    { connectionId },
  ): Promise<{
    connectionId: string;
    issuer: string;
    clientId: string;
    authorizationEndpoint?: string;
    scopes?: string;
    enabled: boolean;
    appUrl: string;
  } | null> => {
    const row = await ctx.db
      .query('ssoConnections')
      .withIndex('by_connection_id', (q) => q.eq('connectionId', connectionId))
      .unique();
    if (!row) return null;
    return {
      connectionId: row.connectionId,
      issuer: row.issuer,
      clientId: row.clientId,
      authorizationEndpoint: row.authorizationEndpoint,
      scopes: row.scopes,
      enabled: row.enabled,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    };
  },
});

/** Resolve a user by email scoped to the connection's organization. */
export const findUserByEmail = internalQuery({
  args: {
    email: v.string(),
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, { email, organizationId }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email.toLowerCase().trim()))
      .unique();
    if (!user || user.organizationId !== organizationId) return null;
    return { _id: user._id, isActive: user.isActive };
  },
});

/** Consume a flow exactly once (single-use, TTL-checked). */
export const consumeFlow = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }): Promise<SsoLoginFlow | null> => {
    const flow = await ctx.db
      .query('ssoLoginFlows')
      .withIndex('by_state', (q) => q.eq('state', state))
      .unique();
    if (!flow) return null;
    await ctx.db.delete(flow._id);
    if (flow.expiresAt < Date.now()) return null;
    return flow;
  },
});
