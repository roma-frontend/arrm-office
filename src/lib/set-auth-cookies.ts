import { cookies } from 'next/headers';
import { signJWT, signConvexJWT, type JWTPayload } from './jwt';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
};

export async function setAuthCookies(payload: JWTPayload): Promise<string> {
  const [hrToken, convexToken] = await Promise.all([
    signJWT(payload),
    signConvexJWT(payload).catch(() => null),
  ]);

  const jar = await cookies();
  jar.set('hr-auth-token', hrToken, COOKIE_OPTS);
  if (convexToken) {
    jar.set('convex-auth-token', convexToken, COOKIE_OPTS);
  }
  return hrToken;
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete('hr-auth-token');
  jar.delete('convex-auth-token');
  jar.delete('hr-session-token');
}
