/**
 * HTTP router for Convex
 */

import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_MAX_BODY_BYTES,
} from './integrations';

const http = httpRouter();

/** Minimal shape of the Telegram update this router consumes. */
interface TelegramUpdate {
  callback_query?: {
    data?: string;
    message?: { chat?: { id?: number | string } };
  };
  message?: {
    text?: string;
    chat?: { id?: number | string };
    message_id?: number;
  };
  secret_token?: string;
}

// ── Telegram Bot Webhook ────────────────────────────────────────────────────
/**
 * Receives updates from the Telegram bot: inline keyboard callbacks
 * ("I completed screening") and text messages for screening responses.
 *
 * Set the webhook URL in Telegram BotFather:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<CONVEX_SITE>/api/telegram
 */
http.route({
  path: '/api/telegram',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as TelegramUpdate;

    // Handle inline keyboard callbacks (button presses)
    if (body.callback_query) {
      const cb = body.callback_query;
      const data: string = cb.data ?? '';

      // Validate the webhook secret
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (secret && body.secret_token !== secret) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Handle screening completion callback: screening_done:<applicationId>
      if (data.startsWith('screening_done:')) {
        const applicationId = data.replace('screening_done:', '') as Id<'applications'>;
        try {
          // Look up the application to get organizationId for the mutation
          const app = await ctx.runQuery(internal.telegram.getAppForScreening, {
            applicationId,
          });
          if (app) {
            await ctx.runMutation(internal.telegram.markScreeningComplete, {
              applicationId,
              organizationId: app.organizationId,
            });

            // Fetch all screening responses for AI scoring
            const responses: { message: string; createdAt: number }[] = [];
            for (const resp of app.screeningResponses ?? []) {
              responses.push({ message: resp.message, createdAt: resp.createdAt });
            }

            // Run AI scoring (non-blocking — don't fail the webhook if scoring fails)
            if (responses.length > 0) {
              try {
                const scoreResult = await ctx.runAction(api.recruitmentAI.scoreScreeningResponses, {
                  applicationId,
                  vacancyTitle: app.vacancy?.title ?? 'Position',
                  vacancyDescription: app.vacancy?.description,
                  requirements: app.vacancy?.requirements,
                  screeningInstructions: app.screeningInstructions,
                  responses,
                });
                await ctx.runMutation(internal.telegram.saveScreeningScore, {
                  applicationId,
                  score: scoreResult.score,
                  verdict: scoreResult.verdict,
                  reasoning: scoreResult.reasoning,
                  strengths: scoreResult.strengths,
                  concerns: scoreResult.concerns,
                });
              } catch (scoringErr) {
                console.error('AI scoring failed:', scoringErr);
              }
            }

            // Send confirmation to candidate via Telegram
            if (app.candidate?.telegramChatId) {
              const botToken = process.env.TELEGRAM_BOT_TOKEN;
              if (botToken) {
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: app.candidate.telegramChatId,
                    text: '✅ Скрининг завершен! / Screening completed!\n\nСпасибо за ответы. HR уведомлен и свяжется с вами.\nThank you for your answers. HR has been notified and will contact you.',
                    parse_mode: 'HTML',
                  }),
                }).catch(() => {}); // Non-critical
              }
            }
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (e) {
          console.error('Screening completion error:', e);
          return new Response(JSON.stringify({ ok: false, error: String(e) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Handle Telegram account linking: link:<email>
      if (data.startsWith('link:')) {
        // Email extracted but not used yet — the linking flow is handled by the bot command.
        void data.replace('link:', '');
        // TODO: find candidate profile by email and link Telegram chat
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle text messages (for screening responses)
    if (body.message) {
      const msg = body.message;
      const chatId = String(msg.chat?.id ?? '');
      const text = msg.text ?? '';

      // Ignore commands and non-text messages
      if (text.startsWith('/')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Find candidate by Telegram chat ID and store their screening response
      if (chatId) {
        try {
          // Find the active screening application for this Telegram user
          const screeningApp = (await ctx.runQuery(internal.telegram.findActiveScreeningApp, {
            telegramChatId: chatId,
          })) as {
            _id: Id<'applications'>;
            organizationId: Id<'organizations'>;
          } | null;
          if (screeningApp) {
            // Save the response to the screeningResponses table
            await ctx.runMutation(internal.telegram.saveScreeningResponse, {
              applicationId: screeningApp._id,
              organizationId: screeningApp.organizationId,
              message: text,
              telegramChatId: chatId,
              telegramMessageId: msg.message_id,
            });
          }
        } catch {
          // Non-critical — candidate may not be linked or in screening
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

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

    // The Convex HTTP runtime cannot sign a JWT (no access to JWT_SECRET),
    // so we delegate to the Next.js API route which will:
    //   1. Verify the session token via Convex query `auth:verifySession`
    //   2. Sign a proper JWT with user info
    //   3. Set hr-auth-token (JWT) + hr-session-token (UUID) cookies
    //   4. Redirect to /dashboard
    const callbackUrl = new URL('/api/auth/imid-callback', APP_URL);
    callbackUrl.searchParams.set('sessionToken', result.sessionToken);
    if (result.isNewUser) {
      callbackUrl.searchParams.set('welcome', 'true');
    }
    if (result.needsApproval) {
      callbackUrl.searchParams.set('pending_approval', 'true');
    }

    return new Response(null, {
      status: 302,
      headers: { Location: callbackUrl.toString() },
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
