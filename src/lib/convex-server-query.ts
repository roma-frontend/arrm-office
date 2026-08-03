/**
 * Server-side helpers for calling Convex HTTP endpoints from Next.js
 * (server components, route handlers, server actions).
 *
 * The Convex HTTP API accepts unauthenticated queries here: the browser auth
 * bridge is not wired up, so server code reaches Convex directly. These
 * helpers intentionally return `null` on any failure instead of throwing, so
 * callers can degrade gracefully.
 */

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

interface ConvexQueryResponse<T> {
  status?: string;
  value?: T;
  errorMessage?: string;
}

/** POST a query to the Convex HTTP endpoint. Returns `null` on any failure. */
export async function convexServerQuery<T>(
  path: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  if (!CONVEX_URL) return null;
  try {
    const res = await fetch(`${CONVEX_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, args, format: 'json' }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ConvexQueryResponse<T>;
    if (data.status === 'error') return null;
    return data.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the Convex document `_id` of the user with the given email.
 *
 * Uses the dedicated PUBLIC projection (`users.queries.getPublicUserByEmail`),
 * which returns only the fields needed to establish a session — never
 * credentials or session secrets. This bridges NextAuth/OAuth sessions — whose
 * `session.user.id` is a provider subject (UUID / Google sub), NOT a Convex id
 * — into the Convex user ids that every `v.id('users')` validator and
 * `ctx.db.get(userId)` call expects.
 */
export async function resolveConvexUserIdByEmail(email: string): Promise<string | null> {
  const user = await convexServerQuery<{ _id: string }>('users.queries.getPublicUserByEmail', {
    email,
  });
  return user?._id ?? null;
}
