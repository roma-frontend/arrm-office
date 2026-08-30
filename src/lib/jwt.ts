import { SignJWT, jwtVerify, importPKCS8 } from 'jose';

const jwtSecret = process.env.JWT_SECRET;

// SECURITY: JWT_SECRET is mandatory in all environments
// No dev fallback allowed — this prevents unauthorized token creation
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    'JWT_SECRET environment variable is required and must be at least 32 characters long. ' +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

const secret = new TextEncoder().encode(jwtSecret);

export interface JWTPayload {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'employee' | 'superadmin' | 'driver';
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  isApproved?: boolean;
  department?: string;
  position?: string;
  employeeType?: 'staff' | 'contractor';
  avatar?: string;
  /** Superadmin issued a temporary password — user must change it first. */
  mustChangePassword?: boolean;
  type?: '2fa-pending';
  impersonation?: {
    active: true;
    sessionId: string;
    sessionToken: string;
    expiresAt: number;
    superadmin: {
      userId: string;
      name: string;
      email: string;
      role: 'superadmin';
      organizationId?: string;
      organizationSlug?: string;
      organizationName?: string;
      department?: string;
      position?: string;
      employeeType?: 'staff' | 'contractor';
      avatar?: string;
      isApproved?: boolean;
    };
  };
}

/**
 * Read and verify the current `hr-auth-token` from a request's cookies.
 * Returns the payload if it verifies and contains an active impersonation
 * block; returns null otherwise (no cookie, invalid signature, or no
 * impersonation marker). Used by signJWT helpers to preserve the marker
 * across any JWT re-sign — without this, every auth-bridge re-issue
 * (oauth-session, profile/update, refresh, etc.) silently strips the
 * impersonation and the superadmin falls back to their own identity.
 */
/**
 * Minimal structural type for anything that exposes a Next.js-style cookies
 * jar: both `NextRequest.cookies` and `ReadonlyRequestCookies` from
 * `next/headers` satisfy it. Using a structural type instead of importing
 * the concrete classes keeps this helper usable from both API routes and
 * server actions.
 */
interface CookieJarLike {
  get?: (name: string) => { value?: string } | undefined;
  cookies?: { get: (name: string) => { value?: string } | undefined };
}

export async function readActiveImpersonation(
  jarLike: CookieJarLike,
): Promise<JWTPayload['impersonation'] | null> {
  const token = (jarLike.cookies ?? (jarLike as { get?: CookieJarLike['get'] }))?.get?.(
    'hr-auth-token',
  )?.value;
  if (!token) return null;
  const existing = await verifyJWT(token);
  if (!existing?.impersonation?.active) return null;
  if (existing.impersonation.expiresAt <= Date.now()) return null;
  return existing.impersonation;
}

/**
 * Sign a session JWT for the given payload. If the request already carries
 * an active impersonation marker, it is preserved on the new token unless
 * the caller explicitly passes `impersonation: undefined`. This makes every
 * downstream auth route (`oauth-session`, `profile/update`, `face-login`,
 * `imid-callback`, etc.) impersonation-safe by default — they don't have to
 * remember to forward the field, and a forgotten `signJWT(...)` call in a
 * new route can't silently end the impersonation.
 */
export async function signJWT(
  payload: JWTPayload,
  expiresIn: string = '7d',
  jarLike?: CookieJarLike,
): Promise<string> {
  let impersonation = payload.impersonation;
  if (!impersonation && jarLike) {
    const existing = await readActiveImpersonation(jarLike);
    if (existing) impersonation = existing;
  }
  const finalPayload: JWTPayload = impersonation ? { ...payload, impersonation } : payload;
  return await new SignJWT({ ...finalPayload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function signConvexJWT(
  payload: JWTPayload,
  expiresIn: string = '7d',
  jarLike?: CookieJarLike,
): Promise<string> {
  const rawKey = process.env.CONVEX_AUTH_PRIVATE_KEY;
  if (!rawKey) throw new Error('CONVEX_AUTH_PRIVATE_KEY is not set');
  const siteUrl = process.env.CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!siteUrl) throw new Error('CONVEX_SITE_URL is not set');
  const pk = await importPKCS8(rawKey.replace(/\\n/g, '\n'), 'RS256');
  let impersonation = payload.impersonation;
  if (!impersonation && jarLike) {
    const existing = await readActiveImpersonation(jarLike);
    if (existing) impersonation = existing;
  }
  const finalPayload: JWTPayload = impersonation ? { ...payload, impersonation } : payload;
  return new SignJWT({ ...finalPayload })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(siteUrl)
    .setAudience('convex')
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(pk);
}
