'use client';

/**
 * useLoginBranding — lightweight hook for auth pages (login, register, etc.)
 *
 * Reads the `?org=<organizationId>` query parameter from the URL and fetches
 * the org's branding via the public getBrandingByOrg query. Returns null when
 * no org param is present or no branding exists, so callers can fall back to
 * defaults.
 *
 * This hook does NOT require authentication — it uses the public
 * getBrandingByOrg query which accepts an explicit organizationId.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export interface LoginBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  brandName: string | null;
  enableWhiteLabel: boolean;
  hidePoweredBy: boolean;
}

export function useLoginBranding(): LoginBranding | null {
  const searchParams = useSearchParams();
  const orgId = searchParams.get('org');

  // Only query when we have an org ID.
  const branding = useQuery(
    api.branding.getBrandingByOrg,
    orgId ? { organizationId: orgId as any } : 'skip',
  );

  return useMemo(() => {
    if (!branding) return null;
    return {
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      logoUrl: branding.logoUrl ?? null,
      brandName: branding.brandName ?? null,
      enableWhiteLabel: branding.enableWhiteLabel,
      hidePoweredBy: branding.hidePoweredBy,
    };
  }, [branding]);
}
