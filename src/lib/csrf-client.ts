/**
 * CSRF-protected JSON POST.
 *
 * Every client that talks to a `withCsrfProtection` route needs the same dance:
 * fetch a token pair, send it in two headers, and on a 403 assume the token
 * expired, fetch a fresh pair and retry once. That sequence is currently written
 * out by hand in AIChatClient, useChatWidgetAI and SiteEditorChat — three copies,
 * two of which forget the retry.
 *
 * The token is cached for the lifetime of the page: it only changes when the
 * server rotates it, and the 403 retry is what handles that.
 */
import { logger } from '@/lib/logger';

interface CsrfPair {
  token: string;
  signature: string;
}

let cached: CsrfPair | null = null;
let inFlight: Promise<CsrfPair | null> | null = null;

async function fetchPair(force = false): Promise<CsrfPair | null> {
  if (!force && cached) return cached;
  // Concurrent callers share one request rather than each triggering their own.
  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch('/api/csrf-token', { method: 'GET' });
      if (!res.ok) return null;
      const pair = (await res.json()) as CsrfPair;
      if (!pair?.token || !pair?.signature) return null;
      cached = pair;
      return pair;
    } catch (error) {
      logger.log('CSRF token fetch failed:', String(error));
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function headersFor(pair: CsrfPair | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(pair ? { 'X-CSRF-Token': pair.token, 'X-CSRF-Token-Signature': pair.signature } : {}),
  };
}

/**
 * POST JSON to a CSRF-protected route, retrying once with a fresh token if the
 * server rejects the first attempt.
 *
 * Returns the raw `Response` so callers keep control over status handling; a
 * failed request is still a resolved promise, exactly as with `fetch`.
 */
export async function postJsonWithCsrf(url: string, body: unknown, signal?: AbortSignal) {
  const pair = await fetchPair();

  const send = (p: CsrfPair | null) =>
    fetch(url, {
      method: 'POST',
      headers: headersFor(p),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });

  const res = await send(pair);
  if (res.status !== 403) return res;

  // A 403 here is almost always a rotated or expired token rather than a real
  // authorisation failure, so one silent retry is worth more than an error toast.
  const fresh = await fetchPair(true);
  if (!fresh) return res;
  return send(fresh);
}
