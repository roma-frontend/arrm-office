import { v } from 'convex/values';
import { internalMutation, mutation, query } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { getAuthCaller } from '../lib/getAuthCaller';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from '../lib/limits';
import { getStartingLeaveBalances } from '../lib/leaveBalances';
import { resolveTravelAllowanceForOrg } from '../lib/travelAllowance';
import { notify } from '../lib/notify';

/**
 * SSO (OIDC) connections — Phase 1 of enterprise SSO.
 *
 * All admin functions require an org admin (or superadmin). The only public
 * surface is `getPublicConnectionMeta` / `findConnectionForEmail`, which leak
 * nothing beyond a connection id and label for enabled connections.
 */

function assertOrgManager(
  caller: { role: string; organizationId?: Id<'organizations'> } | null,
  action: string,
): Id<'organizations'> {
  if (!caller) throw new Error('Not authenticated');
  if (caller.role === 'superadmin') {
    // Superadmins manage connections from their own (platform) org context.
    if (!caller.organizationId) throw new Error('Superadmin has no organization context');
    return caller.organizationId;
  }
  if (caller.role !== 'admin' || !caller.organizationId) {
    throw new Error(`Only organization admins can ${action}`);
  }
  return caller.organizationId;
}

function normalizeDomains(input?: string[] | null): string[] | undefined {
  const cleaned = (input ?? [])
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  return cleaned.length ? Array.from(new Set(cleaned)) : undefined;
}

function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin queries
// ─────────────────────────────────────────────────────────────────────────────

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller?.organizationId) return [];
    const orgId = caller.organizationId;

    const rows = await ctx.db
      .query('ssoConnections')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(SMALL_LIST_CAP);

    // Secret is write-only — admins only ever see a masked hint.
    return rows.map((row) => ({
      _id: row._id,
      connectionId: row.connectionId,
      protocol: row.protocol,
      issuer: row.issuer,
      clientId: row.clientId,
      clientSecretHint: row.clientSecret ? `••••${row.clientSecret.slice(-4)}` : '',
      scopes: row.scopes ?? 'openid email profile',
      domains: row.domains ?? [],
      label: row.label,
      autoProvision: row.autoProvision,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});

export const getLoginEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller?.organizationId) return [];
    return await ctx.db
      .query('ssoLoginEvents')
      .withIndex('by_org_time', (q) => q.eq('organizationId', caller.organizationId!))
      .order('desc')
      .take(Math.min(Math.max(limit ?? 50, 1), 200));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Public queries (used by the login page + SSO routes)
// ─────────────────────────────────────────────────────────────────────────────

/** Non-sensitive connection metadata by public connection id. */
export const getPublicConnectionMeta = query({
  args: { connectionId: v.string() },
  handler: async (ctx, { connectionId }) => {
    const row = await ctx.db
      .query('ssoConnections')
      .withIndex('by_connection_id', (q) => q.eq('connectionId', connectionId))
      .unique();
    if (!row || !row.enabled) return null;
    return {
      connectionId: row.connectionId,
      issuer: row.issuer,
      label: row.label ?? 'SSO',
    };
  },
});

/**
 * Which SSO connections (if any) cover a given email's domain. Lets the login
 * page render "Continue with company SSO" affordances. Returns only public
 * fields for enabled connections; an org may have several per domain.
 */
export const findConnectionForEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const domain = email.toLowerCase().trim().split('@')[1];
    if (!domain) return [];
    const rows = await ctx.db
      .query('ssoConnections')
      .filter((q) => q.eq(q.field('enabled'), true))
      .take(DEFAULT_LIST_CAP);
    return rows
      .filter((r) => (r.domains ?? []).includes(domain))
      .map((r) => ({ connectionId: r.connectionId, label: r.label ?? 'SSO' }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin mutations
// ─────────────────────────────────────────────────────────────────────────────

export const upsertConnection = mutation({
  args: {
    id: v.optional(v.id('ssoConnections')),
    issuer: v.string(),
    clientId: v.string(),
    /** Omit on update to keep the existing secret. */
    clientSecret: v.optional(v.string()),
    scopes: v.optional(v.string()),
    domains: v.optional(v.array(v.string())),
    label: v.optional(v.string()),
    autoProvision: v.boolean(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    const orgId = assertOrgManager(caller, 'manage SSO connections');

    const issuer = normalizeIssuer(args.issuer);
    if (!/^https:\/\//.test(issuer)) throw new Error('Issuer must be an https:// URL');
    if (!args.clientId.trim()) throw new Error('Client ID is required');

    const domains = normalizeDomains(args.domains);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error('Connection not found');
      if (existing.organizationId !== orgId) throw new Error('Connection not found');
      await ctx.db.patch(args.id, {
        issuer,
        clientId: args.clientId.trim(),
        clientSecret: args.clientSecret?.trim() || existing.clientSecret,
        scopes: args.scopes?.trim() || undefined,
        domains,
        label: args.label?.trim() || undefined,
        autoProvision: args.autoProvision,
        enabled: args.enabled,
        updatedAt: Date.now(),
      });
      return args.id;
    }

    if (!args.clientSecret?.trim()) throw new Error('Client secret is required');

    // Public, URL-safe identifier — retried on the astronomically rare clash.
    for (let attempt = 0; attempt < 3; attempt++) {
      const connectionId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const clash = await ctx.db
        .query('ssoConnections')
        .withIndex('by_connection_id', (q) => q.eq('connectionId', connectionId))
        .unique();
      if (clash) continue;
      return await ctx.db.insert('ssoConnections', {
        organizationId: orgId,
        connectionId,
        protocol: 'oidc' as const,
        issuer,
        clientId: args.clientId.trim(),
        clientSecret: args.clientSecret.trim(),
        scopes: args.scopes?.trim() || undefined,
        domains,
        label: args.label?.trim() || undefined,
        autoProvision: args.autoProvision,
        enabled: args.enabled,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: caller?._id,
      });
    }
    throw new Error('Could not allocate a connection id — try again');
  },
});

export const deleteConnection = mutation({
  args: { id: v.id('ssoConnections') },
  handler: async (ctx, { id }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error('Connection not found');
    if (existing.organizationId !== caller.organizationId) {
      throw new Error('Connection not found');
    }
    await ctx.db.delete(id);
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal mutations — called by the Next.js SSO routes
// ─────────────────────────────────────────────────────────────────────────────

/** Append-only audit row for every SSO attempt. */
export const recordLoginEvent = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    connectionId: v.string(),
    userId: v.optional(v.id('users')),
    email: v.string(),
    result: v.union(
      v.literal('success'),
      v.literal('provisioned'),
      v.literal('domain_denied'),
      v.literal('user_not_found'),
      v.literal('inactive_user'),
      v.literal('error'),
    ),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('ssoLoginEvents', { ...args, createdAt: Date.now() });
  },
});

/**
 * Auto-provision an employee for a verified SSO identity that has no account.
 * Mirrors the Google-OAuth new-user path (passwordHash '', auto-approved,
 * starting balances) but is scoped to the connection's org and its domain
 * allowlist — never the whole deployment.
 *
 * Returns the created user id, or null when the org seat limit is reached.
 */
export const provisionUser = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    connectionId: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    // Idempotency: a race with another callback may have created the account.
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (existing) return existing._id;

    const org = await ctx.db.get(args.organizationId);
    if (!org || !org.isActive) return null;

    const members = await ctx.db
      .query('users')
      .withIndex('by_org_active', (q) =>
        q.eq('organizationId', args.organizationId).eq('isActive', true),
      )
      .take(DEFAULT_LIST_CAP);
    if (members.length >= org.employeeLimit) return null;

    const userId = await ctx.db.insert('users', {
      organizationId: args.organizationId,
      name: args.name || email.split('@')[0] || 'User',
      email,
      passwordHash: '',
      avatarUrl: args.avatarUrl,
      role: 'employee' as const,
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      approvedAt: Date.now(),
      travelAllowance: await resolveTravelAllowanceForOrg(ctx, args.organizationId, 'staff'),
      ...(await getStartingLeaveBalances(ctx, args.organizationId)),
      createdAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId,
      action: 'sso_user_provisioned',
      details: `Provisioned via SSO connection ${args.connectionId}`,
      createdAt: Date.now(),
    });

    // Heads-up for org admins — same pattern as the Google sign-up flow.
    const admins = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) =>
        q.eq('organizationId', args.organizationId).eq('role', 'admin'),
      )
      .take(SMALL_LIST_CAP);
    for (const admin of admins) {
      await notify(ctx, {
        organizationId: args.organizationId,
        userId: admin._id,
        type: 'join_request',
        titleKey: 'notifications.titles.joinRequestNew',
        messageKey: 'notifications.messages.joinRequestNew',
        params: { name: args.name || email, email, orgName: org.name },
        fallbackTitle: '🆕 SSO auto-provisioned user',
        fallbackMessage: `${args.name || email} (${email}) joined via SSO.`,
        relatedId: userId,
        route: '/employees',
      });
    }

    return userId;
  },
});

/**
 * Complete an SSO login: validate the account can actually log in (mirrors the
 * checks in auth:login), then open the session exactly like every other flow
 * (sessionToken on the user doc). The Next.js route signs the JWT cookie.
 */
export const completeSsoLogin = internalMutation({
  args: {
    userId: v.id('users'),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
    connectionId: v.string(),
  },
  handler: async (ctx, { userId, sessionToken, sessionExpiry, connectionId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !user.isActive) return null;
    if (!user.isApproved) return null;
    if (user.isSuspended && (!user.suspendedUntil || user.suspendedUntil > Date.now())) {
      return null;
    }
    if (!user.organizationId) return null;

    const org = await ctx.db.get(user.organizationId);
    if (!org || !org.isActive || org.frozenAt) return null;

    await ctx.db.patch(userId, {
      sessionToken,
      sessionExpiry,
      lastLoginAt: Date.now(),
      loginFailedAttempts: 0,
      loginLockedUntil: undefined,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId,
      action: 'sso_login',
      details: `Signed in via SSO connection ${connectionId}`,
      createdAt: Date.now(),
    });

    return {
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: org.name,
      organizationSlug: org.slug,
      department: user.department,
      position: user.position,
      employeeType: user.employeeType,
      avatarUrl: user.avatarUrl,
      isApproved: user.isApproved,
    };
  },
});
