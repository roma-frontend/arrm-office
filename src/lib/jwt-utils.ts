/**
 * JWT Token Utilities
 * Handles token expiry validation and refresh
 */

interface JwtPayload {
  iat: number;
  exp: number;
  sub: string;
  [key: string]: unknown;
}

/**
 * Decode JWT without verification (for client-side expiry check only)
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;

    const decoded: unknown = JSON.parse(atob(parts[1]));
    return decoded as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string, bufferSeconds = 60): boolean {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return true;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = payload.exp;

  // Add buffer (default 60s) to refresh token before actual expiry
  return now >= expiresAt - bufferSeconds;
}

/**
 * Get token expiry time in ms
 */
export function getTokenExpiryTime(token: string): number | null {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return null;

  const expiresAt = payload.exp * 1000; // Convert to ms
  return expiresAt - Date.now();
}

/**
 * Validate token format and expiry
 */
export function validateToken(token: string | null | undefined): boolean {
  if (!token) return false;

  const payload = decodeJwt(token);
  if (!payload) return false;

  return !isTokenExpired(token);
}
