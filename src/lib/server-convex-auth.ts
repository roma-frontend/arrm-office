import { cookies } from 'next/headers';
import { verifyJWT, signConvexJWT, type JWTPayload } from '@/lib/jwt';

/**
 * Resolve the authenticated user's identity from the server session cookie and
 * mint a Convex JWT that can be forwarded to Convex from server-side routes.
 *
 * Server API routes call Convex via ConvexHttpClient / fetchQuery WITHOUT the
 * browser auth bridge, so they must explicitly forward an auth token for
 * `getAuthCaller(ctx)` to resolve. This derives identity from the trusted
 * `hr-auth-token` session cookie (never from client-supplied ids).
 *
 * Returns `null` when there is no valid session.
 */
export async function getServerConvexAuth(): Promise<{
  payload: JWTPayload;
  token: string;
} | null> {
  const jar = await cookies();
  const hrToken = jar.get('hr-auth-token')?.value ?? jar.get('oauth-session')?.value;
  if (!hrToken) return null;

  const payload = await verifyJWT(hrToken);
  if (!payload) return null;

  const token = await signConvexJWT(payload);
  return { payload, token };
}
