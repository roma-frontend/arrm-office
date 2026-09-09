import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * SSO (OIDC) connections — Phase 1 of the enterprise SSO/SCIM rollout.
 *
 * Additive-only module: nothing here changes existing tables or flows. A
 * connection is created per organization by an org admin (see
 * convex/sso/main.ts) and used by the Next.js routes in
 * src/app/api/auth/sso/* to broker an OIDC authorization-code + PKCE login.
 *
 * Session issuance reuses the existing `auth:login { isOAuthLogin: true }`
 * path — the exact bridge Google OAuth already uses — so SSO sessions are
 * indistinguishable from password/Google sessions downstream.
 */
export const sso = {
  /**
   * One row per enterprise identity connection. Secrets are stored here the
   * same way `integrations` already stores provider tokens (Convex DB is the
   * existing secret store; DB access is gated by RBAC). The client secret is
   * NEVER returned by any query — only a masked hint for the admin UI.
   */
  ssoConnections: defineTable({
    /** Org this connection belongs to (one connection per domain set). */
    organizationId: v.id('organizations'),
    /** Public, URL-safe identifier used in /api/auth/sso/<connectionId>. */
    connectionId: v.string(),
    protocol: v.literal('oidc'),
    /** OIDC issuer, e.g. https://accounts.google.com or https://idp.corp.com */
    issuer: v.string(),
    clientId: v.string(),
    /** Confidential client secret — never exposed via API. */
    clientSecret: v.string(),
    /** Optional explicit endpoints; otherwise resolved from /.well-known/openid-configuration */
    authorizationEndpoint: v.optional(v.string()),
    tokenEndpoint: v.optional(v.string()),
    userinfoEndpoint: v.optional(v.string()),
    /** Space-separated scopes; defaults to 'openid email profile'. */
    scopes: v.optional(v.string()),
    /**
     * Email-domain allowlist. When set, only identities whose verified email
     * ends with one of these domains may log in through this connection.
     */
    domains: v.optional(v.array(v.string())),
    /** Admin-facing label, e.g. "Okta (HQ)". */
    label: v.optional(v.string()),
    /** Create an employee account automatically for unknown verified emails. */
    autoProvision: v.boolean(),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id('users')),
  })
    .index('by_connection_id', ['connectionId'])
    .index('by_org', ['organizationId']),

  /** Audit trail for SSO login attempts — visible to org admins. */
  ssoLoginEvents: defineTable({
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
    createdAt: v.number(),
  }).index('by_org_time', ['organizationId', 'createdAt']),

  /**
   * In-flight OIDC authorization flows (PKCE verifier + state). Rows live for
   * 10 minutes, are consumed exactly once at callback time, and are purged
   * opportunistically on every new login start.
   */
  ssoLoginFlows: defineTable({
    state: v.string(),
    connectionId: v.string(),
    redirectUri: v.string(),
    codeVerifier: v.string(),
    expiresAt: v.number(),
  })
    .index('by_state', ['state'])
    .index('by_expiry', ['expiresAt']),
};
