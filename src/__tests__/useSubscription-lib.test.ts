/**
 * Tests for the lib/ hooks — src/lib/hooks/useSubscription.ts and
 * src/lib/hooks/usePlanFeatures.ts (the plan feature-matrix used by billing).
 *
 * These live alongside the older src/hooks/ variants and have their own
 * fallback/derivation logic, so they get their own tests.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('convex/react', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../../convex/_generated/api', () => ({
  api: { subscriptions: { getSubscriptionForContext: 'subscriptions:getSubscriptionForContext' } },
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: jest.fn(() => ({ user: null })),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: jest.fn(() => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useQuery } = require('convex/react') as { useQuery: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require('@/store/useAuthStore') as { useAuthStore: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useSelectedOrganization } = require('@/hooks/useSelectedOrganization') as {
  useSelectedOrganization: jest.Mock;
};

import { useSubscription } from '@/lib/hooks/useSubscription';
import {
  usePlanFeatures,
  PLAN_LABELS,
  PLAN_PRICES,
  UPGRADE_PLAN,
} from '@/lib/hooks/usePlanFeatures';

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as jest.Mock).mockReturnValue({ user: null });
  (useSelectedOrganization as jest.Mock).mockReturnValue(undefined);
});

describe('lib/hooks/useSubscription', () => {
  it('returns the free fallback while loading for an anonymous user', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ user: null });
    (useQuery as jest.Mock).mockReturnValue(undefined);

    const { subscription, loading } = useSubscription();

    expect(loading).toBe(false); // no email/org → nothing to fetch
    expect(subscription).toEqual({
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
    });
  });

  it('queries by organizationId when the user has one but no selected org', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useQuery as jest.Mock).mockReturnValue(undefined);

    const { loading } = useSubscription();

    expect(useQuery).toHaveBeenCalledWith('subscriptions:getSubscriptionForContext', {
      organizationId: 'org-1',
      email: 'a@a.com',
    });
    expect(loading).toBe(true);
  });

  it('uses the selected organization over the user organization', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useSelectedOrganization as jest.Mock).mockReturnValue('org-2');

    useSubscription();

    expect(useQuery).toHaveBeenCalledWith('subscriptions:getSubscriptionForContext', {
      organizationId: 'org-2',
      email: 'a@a.com',
    });
  });

  it('passes skip when there is neither an email nor an org', () => {
    (useQuery as jest.Mock).mockReturnValue(undefined);

    useSubscription();

    expect(useQuery).toHaveBeenCalledWith('subscriptions:getSubscriptionForContext', 'skip');
  });

  it('maps an active subscription to the derived flags', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useQuery as jest.Mock).mockReturnValue({
      plan: 'professional',
      status: 'active',
      trialEnd: 100,
      currentPeriodEnd: 200,
      cancelAtPeriodEnd: false,
      stripeCustomerId: 'cus_x',
      stripeSubscriptionId: 'sub_x',
    });

    const { subscription, loading } = useSubscription();

    expect(loading).toBe(false);
    expect(subscription.plan).toBe('professional');
    expect(subscription.status).toBe('active');
    expect(subscription.isActive).toBe(true);
    expect(subscription.isTrial).toBe(false);
    expect(subscription.isPastDue).toBe(false);
    expect(subscription.isCanceled).toBe(false);
    expect(subscription.stripeCustomerId).toBe('cus_x');
  });

  it('maps a trialing subscription as active + trial', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useQuery as jest.Mock).mockReturnValue({
      plan: 'starter',
      status: 'trialing',
      cancelAtPeriodEnd: false,
    });

    const { subscription } = useSubscription();

    expect(subscription.isActive).toBe(true);
    expect(subscription.isTrial).toBe(true);
  });

  it('maps past_due as not active but past-due', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useQuery as jest.Mock).mockReturnValue({
      plan: 'starter',
      status: 'past_due',
      cancelAtPeriodEnd: false,
    });

    const { subscription } = useSubscription();

    expect(subscription.isActive).toBe(false);
    expect(subscription.isPastDue).toBe(true);
  });

  it('maps canceled with nulls for optional fields', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useQuery as jest.Mock).mockReturnValue({
      plan: 'enterprise',
      status: 'canceled',
      cancelAtPeriodEnd: true,
    });

    const { subscription } = useSubscription();

    expect(subscription.isCanceled).toBe(true);
    expect(subscription.cancelAtPeriodEnd).toBe(true);
    expect(subscription.trialEnd).toBeNull();
    expect(subscription.currentPeriodEnd).toBeNull();
  });
});

describe('lib/hooks/usePlanFeatures', () => {
  it('falls back to free features when the subscription is not active', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useQuery as jest.Mock).mockReturnValue({
      plan: 'professional',
      status: 'canceled',
      cancelAtPeriodEnd: false,
    });

    const result = usePlanFeatures();

    expect(result.plan).toBe('free');
    expect(result.rawPlan).toBe('professional');
    expect(result.features.maxEmployees).toBe(10);
    expect(result.features.strategyMaps).toBe(false);
    expect(result.hasFeature('reports')).toBe(true);
    expect(result.hasFeature('aiChat')).toBe(false);
  });

  it('uses the active plan features', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useQuery as jest.Mock).mockReturnValue({
      plan: 'enterprise',
      status: 'active',
      cancelAtPeriodEnd: false,
    });

    const result = usePlanFeatures();

    expect(result.plan).toBe('enterprise');
    expect(result.features.maxEmployees).toBeNull();
    expect(result.hasFeature('integrations')).toBe(true);
    expect(result.hasFeature('employeeBackups')).toBe(true);
  });

  it('reports the loading state through', () => {
    (useAuthStore as jest.Mock).mockReturnValue({
      user: { email: 'a@a.com', organizationId: 'org-1' },
    });
    (useQuery as jest.Mock).mockReturnValue(undefined);

    const result = usePlanFeatures();

    expect(result.loading).toBe(true);
    expect(result.plan).toBe('free');
  });

  it('exposes plan labels, prices and upgrade paths', () => {
    expect(PLAN_LABELS.enterprise).toBe('Enterprise');
    expect(PLAN_PRICES.free).toBe('$0/mo');
    expect(UPGRADE_PLAN.free).toBe('starter');
    expect(UPGRADE_PLAN.starter).toBe('professional');
    expect(UPGRADE_PLAN.professional).toBe('enterprise');
    expect(UPGRADE_PLAN.enterprise).toBeNull();
  });
});
