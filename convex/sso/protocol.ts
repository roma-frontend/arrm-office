/**
 * Pure SSO protocol helpers — no Convex runtime imports, so this file is
 * unit-testable in isolation (see src/__tests__/ssoProtocol.test.ts).
 */

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cryptographically random URL-safe string (`nBytes` of entropy). */
export function randomToken(nBytes = 32): string {
  const bytes = new Uint8Array(nBytes);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * PKCE code_verifier → code_challenge per RFC 7636 §4.2 (S256).
 * Uses the global WebCrypto only — no Node fallback, so this stays bundle-safe
 * for the Convex V8 runtime (tests polyfill globalThis.crypto themselves).
 */
export async function pkceChallenge(verifier: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto unavailable: cannot compute PKCE challenge');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Constant-time string comparison — for token comparisons. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** TLS-only issuer normalization — a non-https issuer can never be trusted. */
export function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, '');
}
