'use client';

/**
 * useOrgBranding — fetches branding for any organization by ID.
 *
 * Unlike useLoginBranding (which reads ?org from the URL), this hook
 * accepts an explicit organizationId and returns branding data directly.
 * Uses the public getBrandingByOrg query (no auth required).
 */

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

export interface OrgBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  brandName: string | null;
  enableWhiteLabel: boolean;
  hidePoweredBy: boolean;
}

export function useOrgBranding(
  organizationId: Id<'organizations'> | null | undefined,
): OrgBranding | null {
  const branding = useQuery(
    api.branding.getBrandingByOrg,
    organizationId ? { organizationId } : 'skip',
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
