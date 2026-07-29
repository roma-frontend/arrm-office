/**
 * HTTP router for Convex
 */

import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_MAX_BODY_BYTES,
} from './integrations';

const http = httpRouter();

// ── OIDC Discovery (required for Convex auth) ────────────────────────────────
http.route({
  path: '/.well-known/openid-configuration',
  method: 'GET',
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        issuer: process.env.CONVEX_SITE_URL,
        jwks_uri: process.env.CONVEX_SITE_URL + '/.well-known/jwks.json',
        authorization_endpoint: process.env.CONVEX_SITE_URL + '/oauth/authorize',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=15, stale-if-error=86400',
        },
      },
    );
  }),
});

http.route({
  path: '/.well-known/jwks.json',
  method: 'GET',
  handler: httpAction(async () => {
    if (!process.env.JWKS) {
      throw new Error('Missing JWKS Convex environment variable');
    }
    return new Response(process.env.JWKS, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=15, stale-if-error=86400',
      },
    });
  }),
});

// ── Lucky Carrot inbound webhook ─────────────────────────────────────────────
/**
 * Employee changes pushed by Lucky Carrot, so a new hire lands here in seconds
 * instead of waiting for the hourly sync sweep.
 *
 * The organization is named in the path rather than the body: the signature is
 * checked against that organization's own secret, so a caller cannot present a
 * valid signature for one tenant and have it applied to another.
 *
 * Authentication, replay rejection and every write live in
 * `internal.integrations.ingestLuckyCarrotWebhook` — this handler only moves
 * bytes and maps the outcome onto a status code.
 */
http.route({
  pathPrefix: '/webhooks/lucky-carrot/',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const organizationIdRaw = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';

    const tooLarge = () =>
      new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });

    // Reject an oversized body before reading it into memory or hashing it.
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > WEBHOOK_MAX_BODY_BYTES) {
      return tooLarge();
    }

    // The raw text is what was signed — parsing and re-serializing would change
    // key order and whitespace, and the HMAC would never match.
    const body = await request.text();
    // Re-check: content-length is advisory and may be absent or understated.
    if (body.length > WEBHOOK_MAX_BODY_BYTES) return tooLarge();

    const outcome = await ctx.runAction(internal.integrations.ingestLuckyCarrotWebhook, {
      organizationIdRaw,
      body,
      signature: request.headers.get(WEBHOOK_SIGNATURE_HEADER) ?? '',
      timestamp: request.headers.get(WEBHOOK_TIMESTAMP_HEADER) ?? '',
    });

    const json = (status: number, payload: Record<string, unknown>) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    switch (outcome.status) {
      case 'unauthorized':
        return json(401, { error: 'Invalid signature' });
      case 'disabled':
        // 202: authentic sender, nothing applied. A 4xx here would make Lucky
        // Carrot retry and eventually disable the endpoint on its side.
        return json(202, { ok: false, error: 'Webhook is disabled for this organization' });
      case 'invalid':
        // 400 — the delivery is malformed, so retrying it verbatim cannot help.
        return json(400, { ok: false, error: outcome.message });
      case 'ok':
        return json(200, {
          ok: true,
          message: outcome.message,
          created: outcome.created,
          updated: outcome.updated,
          skipped: outcome.skipped,
        });
      default:
        return json(500, { error: 'Unknown outcome status' });
    }
  }),
});

// ── imID OAuth Login Callback ────────────────────────────────────────────────
/**
 * OAuth redirect target for imID login.
 *
 * imID redirects the user here after authentication with an authorization code
 * and state parameter. This handler exchanges the code for a session, then
 * redirects the browser to the app with a session cookie.
 *
 * The state parameter is validated against the stored value to prevent CSRF.
 */
http.route({
  pathPrefix: '/auth/imid/callback/',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const error = url.searchParams.get('error') ?? '';

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    // User denied or imID returned an error.
    if (error) {
      const loc = new URL('/login?error=imid_denied', APP_URL);
      loc.searchParams.set('imid_error', error);
      return new Response(null, { status: 302, headers: { Location: loc.toString() } });
    }

    if (!code || !state) {
      const loc = new URL('/login?error=imid_missing_params', APP_URL);
      return new Response(null, { status: 302, headers: { Location: loc.toString() } });
    }

    // The org id is embedded in the state when we generated the authorize URL
    // (see imidGetAuthorizationUrl). It was persisted as a hex string alongside
    // the org id in the config. To keep the state simple, the state IS the hex
    // and we try every enabled imID config — but that's O(n). Better: extract
    // the org from the redirect_uri which is in the saved config.
    // We store state per-org, so try to find the right org from the code+state.
    // For simplicity, the state ties to the latest config.
    // In a multi-org setup, the app should ensure org-specific redirect URIs.

    // Scan all imID configs for a matching state.
    // (This is an httpAction so we have no direct db access — use internal query.)
    const orgResult = await ctx.runAction(internal.integrations.imidResolveOrgByState, {
      state,
    });

    if (!orgResult || !orgResult.organizationId) {
      const loc = new URL('/login?error=imid_invalid_state', APP_URL);
      return new Response(null, { status: 302, headers: { Location: loc.toString() } });
    }

    // Exchange the code for a session.
    const result = await ctx.runAction(internal.integrations.imidLoginCallback, {
      organizationId: orgResult.organizationId,
      code,
      state,
    });

    if (result.status === 'error') {
      const loc = new URL('/login?error=imid_login_failed', APP_URL);
      loc.searchParams.set('imid_message', result.message);
      return new Response(null, { status: 302, headers: { Location: loc.toString() } });
    }

    // Set session cookie and redirect to app.
    const redirectTarget = new URL('/dashboard', APP_URL);
    if (result.isNewUser) {
      redirectTarget.searchParams.set('welcome', 'true');
    }
    if (result.needsApproval) {
      redirectTarget.searchParams.set('pending_approval', 'true');
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectTarget.toString(),
        'Set-Cookie': `hr-auth-token=${result.sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
      },
    });
  }),
});

// ── imID Sign Webhook ────────────────────────────────────────────────────────
/**
 * Receive signing callbacks from imID.
 *
 * When a user completes or declines a signing request in the imID app, imID
 * sends a POST to this endpoint with the outcome.
 */
http.route({
  pathPrefix: '/webhooks/imid/sign/',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const organizationIdRaw = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';

    const body = await request.text();
    if (body.length > 1_000_000) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const outcome = await ctx.runAction(internal.integrations.ingestImidSignCallback, {
      organizationIdRaw,
      body,
    });

    return new Response(JSON.stringify({ ok: true, message: outcome.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

// ── imID Verify Webhook ───────────────────────────────────────────────────────
/**
 * Receive verification callbacks from imID.
 *
 * Delegates to `ingestImidVerifyCallback` because `httpAction` has no `ctx.db`.
 */
http.route({
  pathPrefix: '/webhooks/imid/verify/',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    if (body.length > 1_000_000) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const organizationIdRaw = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';

    await ctx.runAction(internal.integrations.ingestImidVerifyCallback, {
      organizationIdRaw,
      body,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

// ── imID Resolve Org By State (internal) ──────────────────────────────────────
/**
 * Resolve the organization that owns a given OAuth state value.
 * Scans all integration configs for a matching `oauthState`.
 */
export {};

export default http;
