/**
 * Full-document navigation — leaves the SPA behind instead of doing a client
 * transition. Use it when the current React tree must not survive the
 * navigation: it drops the RSC cache, every mounted Convex subscription and all
 * in-memory auth state (sign-out, session revocation).
 *
 * It lives in its own module on purpose: jsdom's `window.location` is
 * [LegacyUnforgeable], so tests cannot spy on `replace` — they mock this module.
 */
export function hardRedirect(url: string): void {
  window.location.replace(url);
}
