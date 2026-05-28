/**
 * Caller activity check for trusted-userId Convex callsites.
 *
 * SECURITY NOTE — KNOWN GAP, READ BEFORE EDITING
 * ----------------------------------------------
 * This helper trusts the client-supplied `requesterId` arg. That is unsafe
 * by itself: a browser-side caller can pass any user's id and read/mutate
 * their data, because the current `ConvexProvider` (see `src/lib/convex.tsx`)
 * is not wrapped in `ConvexProviderWithAuth`, so `ctx.auth.getUserIdentity()`
 * is always `null` and we cannot independently verify who the caller is.
 *
 * Real protection lives at one of two layers:
 *   1. **Edge / API routes** (`src/proxy.ts`, route handlers under
 *      `src/app/api/`) verify the `hr-auth-token` JWT before forwarding to
 *      Convex via `fetchQuery`/`fetchMutation`. Server-side calls are safe.
 *   2. **Browser → Convex direct calls** are NOT currently protected from
 *      requesterId spoofing. Closing this gap requires bridging Convex auth
 *      with the existing JWT (`ConvexProviderWithAuth`), then migrating the
 *      callsites to `lib/getAuthCaller.ts` which derives the caller from
 *      identity instead of taking it as an arg.
 *
 * The in-memory rate-limiter that used to live here was removed: it was
 * reset on every serverless cold start (so capped almost nothing) and
 * served only as security theatre. Real rate-limiting is in `src/proxy.ts`
 * (Upstash-backed).
 *
 * For new code, prefer `lib/getAuthCaller.ts`. For existing code, this function
 * is the minimum activity check until the migration above is done.
 */
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id, Doc } from '../_generated/dataModel';

export async function requireRequester(
  ctx: QueryCtx | MutationCtx,
  requesterId: Id<'users'>,
): Promise<Doc<'users'>> {
  const user = await ctx.db.get(requesterId);
  if (!user) throw new Error('User not found');
  if (!user.isActive) throw new Error('Account deactivated');
  if (!user.sessionToken || !user.sessionExpiry || user.sessionExpiry < Date.now()) {
    throw new Error('Session expired');
  }
  return user;
}
