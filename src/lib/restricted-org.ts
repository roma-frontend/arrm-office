/**
 * 🛡️ RESTRICTED ORGANIZATION: ADB-ARRM
 *
 * SharePoint and Outlook Calendar integrations are ONLY available
 * for the ADB-ARRM organization. This module provides validation
 * helpers to enforce this restriction at all levels.
 */

import type { NextRequest } from 'next/server';
import type { JWTPayload } from './jwt';

export const RESTRICTED_ORG_NAME = 'ADB-ARRM';
export const RESTRICTED_ORG_SLUG = 'adb-arrm';

/**
 * Check if the given organization name or slug matches ADB-ARRM
 */
export function isRestrictedOrganization(orgIdentifier: string): boolean {
  const normalized = orgIdentifier.toLowerCase().trim();
  return (
    normalized === RESTRICTED_ORG_NAME.toLowerCase() ||
    normalized === RESTRICTED_ORG_SLUG.toLowerCase()
  );
}

/**
 * Validate that the user's organization is ADB-ARRM.
 * Returns { allowed: true } or { allowed: false, reason: string }
 */
export function validateRestrictedAccess(
  userOrgName?: string,
  userOrgSlug?: string,
): {
  allowed: boolean;
  reason?: string;
} {
  if (!userOrgName && !userOrgSlug) {
    return { allowed: false, reason: 'Organization not identified' };
  }

  const orgMatch = userOrgName ? isRestrictedOrganization(userOrgName) : false;
  const slugMatch = userOrgSlug ? isRestrictedOrganization(userOrgSlug) : false;

  if (!orgMatch && !slugMatch) {
    return {
      allowed: false,
      reason: `Access restricted to ${RESTRICTED_ORG_NAME} organization only`,
    };
  }

  return { allowed: true };
}

/**
 * Extract and validate user's organization from JWT token in request cookies.
 * Returns the JWT payload if org validation passes, or an error response.
 * Uses dynamic import to avoid JWT_SECRET errors at module load time.
 */
export async function validateRestrictedOrgFromRequest(
  request: NextRequest,
): Promise<
  | { allowed: true; payload: JWTPayload }
  | { allowed: false; status: number; body: { error: string } }
> {
  const token = request.cookies.get('hr-auth-token')?.value;

  if (!token) {
    return {
      allowed: false,
      status: 401,
      body: { error: 'Authentication required' },
    };
  }

  // Dynamic import to avoid JWT_SECRET errors at module load time
  const { verifyJWT } = await import('./jwt');
  const payload = await verifyJWT(token);

  if (!payload) {
    return {
      allowed: false,
      status: 401,
      body: { error: 'Invalid or expired token' },
    };
  }

  const validation = validateRestrictedAccess(payload.organizationId);

  if (!validation.allowed) {
    return {
      allowed: false,
      status: 403,
      body: { error: validation.reason || 'Access denied' },
    };
  }

  return { allowed: true, payload };
}
