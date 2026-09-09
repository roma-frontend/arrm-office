/**
 * SSO OIDC protocol layer — internalConvex actions that do the network I/O
 * (Convex actions may fetch; mutations may not).
 *
 * The flow lives in two Convex httpActions (see convex/http.ts):
 *   GET /api/sso/<connectionId>          → redirect to the IdP (state+PKCE)
 *   GET /api/sso/callback/<connectionId> → validate, consume flow, open session
 *
 * Sessions are then bridged to the Next.js app by the existing imid-callback
 * pattern (Convex httpAction → /api/auth/imid-callback?sessionToken=… → JWT
 * cookies), so SSO sessions are identical to password/Google/imID sessions
 * downstream. Nothing in the existing auth stack changes.
 *
 * Pure protocol helpers live in ./protocol.ts (unit-testable without Convex).
 */
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { normalizeIssuer } from './protocol';

export interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

/** Fetch and validate the IdP's discovery document. */
export const fetchDiscovery = internalAction({
  args: { issuer: v.string() },
  handler: async (_ctx, { issuer }): Promise<OidcDiscovery> => {
    const normalized = normalizeIssuer(issuer);
    const res = await fetch(`${normalized}/.well-known/openid-configuration`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Discovery request failed (${res.status})`);
    const doc = (await res.json()) as Partial<OidcDiscovery>;
    if (!doc.authorization_endpoint || !doc.token_endpoint) {
      throw new Error('IdP discovery document is missing required endpoints');
    }
    return {
      authorization_endpoint: doc.authorization_endpoint,
      token_endpoint: doc.token_endpoint,
      userinfo_endpoint: doc.userinfo_endpoint,
    };
  },
});

export interface TokenExchangeResult {
  idToken: string;
  accessToken?: string;
}

/**
 * Authorization-code + PKCE token exchange (client_secret_basic auth).
 * Returns the raw id_token — signature verification happens in verifyIdToken.
 */
export const exchangeCode = internalAction({
  args: {
    tokenEndpoint: v.string(),
    clientId: v.string(),
    clientSecret: v.string(),
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },
  handler: async (_ctx, args): Promise<TokenExchangeResult | null> => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      code_verifier: args.codeVerifier,
    });
    const res = await fetch(args.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${encodeURIComponent(args.clientId)}:${encodeURIComponent(args.clientSecret)}`)}`,
      },
      body,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id_token?: string; access_token?: string };
    if (!json.id_token) return null;
    return { idToken: json.id_token, accessToken: json.access_token };
  },
});

export interface IdTokenClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

/**
 * Verify an OIDC id_token against the IdP's JWKS: signature, issuer,
 * audience and expiry. Throws 'SSO_LOGIN_FAILED|<key>' on any failure —
 * the httpAction maps the key to a translated login-page message.
 */
export const verifyIdToken = internalAction({
  args: {
    idToken: v.string(),
    issuer: v.string(),
    clientId: v.string(),
  },
  handler: async (_ctx, { idToken, issuer, clientId }): Promise<IdTokenClaims> => {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const normalized = normalizeIssuer(issuer);
    const JWKS = createRemoteJWKSet(new URL(`${normalized}/.well-known/jwks.json`));
    try {
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: normalized,
        audience: clientId,
      });
      return payload as unknown as IdTokenClaims;
    } catch {
      throw new Error('SSO_LOGIN_FAILED|invalid_id_token');
    }
  },
});

/** Best-effort userinfo fetch — enriches name/picture when present. */
export const fetchUserinfo = internalAction({
  args: {
    userinfoEndpoint: v.string(),
    accessToken: v.string(),
  },
  handler: async (_ctx, { userinfoEndpoint, accessToken }): Promise<IdTokenClaims | null> => {
    try {
      const res = await fetch(userinfoEndpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json()) as IdTokenClaims;
    } catch {
      return null;
    }
  },
});
