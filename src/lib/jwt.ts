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

export async function signJWT(payload: JWTPayload, expiresIn: string = '7d'): Promise<string> {
  return await new SignJWT({ ...payload })
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
): Promise<string> {
  const rawKey = process.env.CONVEX_AUTH_PRIVATE_KEY;
  if (!rawKey) throw new Error('CONVEX_AUTH_PRIVATE_KEY is not set');
  const siteUrl = process.env.CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!siteUrl) throw new Error('CONVEX_SITE_URL is not set');
  const pk = await importPKCS8(rawKey.replace(/\\n/g, '\n'), 'RS256');
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(siteUrl)
    .setAudience('convex')
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(pk);
}
