'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';

export type Plan = 'starter' | 'professional' | 'enterprise' | 'free';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export interface SubscriptionData {
  plan: Plan;
  status: SubscriptionStatus | null;
  trialEnd: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean; // trialing or active
  isTrial: boolean;
  isPastDue: boolean;
  isCanceled: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export function useSubscription(): { subscription: SubscriptionData; loading: boolean } {
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const raw = useQuery(
    api.subscriptions.getSubscriptionForContext,
    user?.email || organizationId ? { organizationId, email: user?.email ?? undefined } : 'skip',
  );

  // loading state — raw is undefined while Convex is fetching
  const loading = raw === undefined && !!(user?.email || organizationId);

  if (!raw) {
    return {
      loading,
      subscription: {
        plan: 'free',
        status: null,
        trialEnd: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        isActive: false,
        isTrial: false,
        isPastDue: false,
        isCanceled: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    };
  }

  const isActive = raw.status === 'active' || raw.status === 'trialing';

  return {
    loading: false,
    subscription: {
      plan: raw.plan as Plan,
      status: raw.status as SubscriptionStatus,
      trialEnd: raw.trialEnd ?? null,
      currentPeriodEnd: raw.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: raw.cancelAtPeriodEnd,
      isActive,
      isTrial: raw.status === 'trialing',
      isPastDue: raw.status === 'past_due',
      isCanceled: raw.status === 'canceled',
      stripeCustomerId: raw.stripeCustomerId,
      stripeSubscriptionId: raw.stripeSubscriptionId,
    },
  };
}
