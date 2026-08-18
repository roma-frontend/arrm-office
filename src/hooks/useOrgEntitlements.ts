/**
 * useOrgEntitlements — the signed-in caller's plan rights, live.
 *
 * Backed by the `billing/plans.getMyEntitlements` Convex query: superadmins
 * get every module included; everyone else resolves from their organization's
 * subscription → published plan snapshot (or code defaults before the billing
 * catalog is seeded). Convex keeps the result live, so publishing a new plan
 * version in the constructor updates gated UIs within ~100ms.
 */

'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export interface ModuleEntitlement {
  included: boolean;
  limits?: Record<string, number | boolean>;
  overLimit: 'block' | 'warn' | 'allow';
}

export interface OrgEntitlements {
  planKey: 'starter' | 'pro' | 'enterprise';
  planName: string;
  planVersion: number | null;
  isTrial: boolean;
  source: 'billing' | 'defaults';
  moduleMap: Record<string, ModuleEntitlement>;
}

export function useOrgEntitlements() {
  // The generated return type widens planKey to string; our interface keeps
  // the literal union for callers.
  const data = useQuery(api.billing.plans.getMyEntitlements) as OrgEntitlements | undefined;
  const entitlements: OrgEntitlements | null = data ?? null;

  /** Is a module available to the current caller (plan + not coming)? */
  const hasModule = (moduleKey: string): boolean => {
    if (!entitlements) return true; // unknown yet — be permissive
    const ent = entitlements.moduleMap[moduleKey];
    return ent?.included ?? false;
  };

  /** The numeric limit for a module usage-key, or null when unlimited/unknown. */
  const getLimit = (moduleKey: string, usageKey: string): number | null => {
    const ent = entitlements?.moduleMap[moduleKey];
    const value = ent?.limits?.[usageKey];
    return typeof value === 'number' ? value : null;
  };

  return {
    entitlements,
    isLoading: data === undefined,
    hasModule,
    getLimit,
  };
}
