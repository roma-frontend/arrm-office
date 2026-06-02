import crypto from 'crypto';

const CSRF_SECRET =
  process.env.CSRF_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error(
          '[Security] CSRF_SECRET is required in production. Generate one with: openssl rand -base64 32',
        );
      })()
    : 'dev-csrf-secret-do-not-use-in-production-min-32-chars');

// Assert for TypeScript — guaranteed to be a string
const secret: string = CSRF_SECRET;

export const CSRF_TOKEN_NAME = 'X-CSRF-Token';
export const CSRF_SIGNATURE_NAME = `${CSRF_TOKEN_NAME}-Signature`;
export const CSRF_COOKIE_NAME = 'csrf-token';

/**
 * Generate CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create CSRF token with signature
 */
export function createCsrfToken(): { token: string; signature: string } {
  const token = generateCsrfToken();
  const signature = crypto.createHmac('sha256', secret).update(token).digest('hex');
  return { token, signature };
}

/**
 * Verify CSRF token
 */
export function verifyCsrfToken(token: string, signature: string): boolean {
  const expectedSignature = crypto.createHmac('sha256', secret).update(token).digest('hex');

  // timingSafeEqual throws if buffers have different length
  if (signature.length !== expectedSignature.length) return false;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Extract and verify CSRF token from request headers
 */
export function verifyCsrfFromRequest(request: Request): boolean {
  const token = request.headers.get(CSRF_TOKEN_NAME);
  const signature = request.headers.get(CSRF_SIGNATURE_NAME);

  if (!token || !signature) return false;

  try {
    return verifyCsrfToken(token, signature);
  } catch {
    return false;
  }
}

/**
 * Methods that require CSRF protection
 */
export const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'] as const;

/**
 * Check if method requires CSRF protection
 */
export function requiresCsrfProtection(method: string): boolean {
  return (CSRF_PROTECTED_METHODS as readonly string[]).includes(method.toUpperCase());
}
