/**
 * Tests for usePlanFeatures hook.
 *
 * Mocks: useSubscription.
 */
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(),
}));

import {
  usePlanFeatures,
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_PRICES,
  PLAN_UPGRADE_URL,
  planIncludes,
} from '@/hooks/usePlanFeatures';
import { useSubscription } from '@/hooks/useSubscription';

describe('PLAN_FEATURES', () => {
  it('starter plan has limited features', () => {
    expect(PLAN_FEATURES.starter.analytics).toBe(true);
    expect(PLAN_FEATURES.starter.strategyMaps).toBe(false);
    expect(PLAN_FEATURES.starter.maxEmployees).toBe(50);
    expect(PLAN_FEATURES.starter.aiSiteEditorDesignChanges).toBe(5);
    expect(PLAN_FEATURES.starter.aiSiteEditorLogicChanges).toBe(false);
  });

  it('professional plan has full features', () => {
    expect(PLAN_FEATURES.professional.strategyMaps).toBe(true);
    expect(PLAN_FEATURES.professional.maxEmployees).toBe(200);
    expect(PLAN_FEATURES.professional.aiSiteEditorDesignChanges).toBe(Infinity);
    expect(PLAN_FEATURES.professional.aiSiteEditorLogicChanges).toBe(true);
  });

  it('enterprise plan has unlimited employees', () => {
    expect(PLAN_FEATURES.enterprise.maxEmployees).toBe(Infinity);
    expect(PLAN_FEATURES.enterprise.strategyMaps).toBe(true);
    expect(PLAN_FEATURES.enterprise.integrations).toBe(true);
  });

  it('starter has integrations: true (source data has it on all except professional)', () => {
    expect(PLAN_FEATURES.starter.integrations).toBe(true);
    expect(PLAN_FEATURES.professional.integrations).toBe(false);
    expect(PLAN_FEATURES.enterprise.integrations).toBe(true);
  });

  it('all plans have analytics: true', () => {
    expect(PLAN_FEATURES.starter.analytics).toBe(true);
    expect(PLAN_FEATURES.professional.analytics).toBe(true);
    expect(PLAN_FEATURES.enterprise.analytics).toBe(true);
  });
});

describe('planIncludes', () => {
  it('starter includes starter', () => {
    expect(planIncludes('starter', 'starter')).toBe(true);
  });

  it('enterprise includes starter', () => {
    expect(planIncludes('enterprise', 'starter')).toBe(true);
  });

  it('starter does NOT include professional', () => {
    expect(planIncludes('starter', 'professional')).toBe(false);
  });

  it('professional does NOT include enterprise', () => {
    expect(planIncludes('professional', 'enterprise')).toBe(false);
  });

  it('all plans include themselves', () => {
    expect(planIncludes('starter', 'starter')).toBe(true);
    expect(planIncludes('professional', 'professional')).toBe(true);
    expect(planIncludes('enterprise', 'enterprise')).toBe(true);
  });
});

describe('PLAN_LABELS', () => {
  it('has correct labels', () => {
    expect(PLAN_LABELS.starter).toBe('Starter');
    expect(PLAN_LABELS.professional).toBe('Professional');
    expect(PLAN_LABELS.enterprise).toBe('Enterprise');
  });
});

describe('PLAN_PRICES', () => {
  it('has prices for all plans', () => {
    expect(PLAN_PRICES.starter).toContain('$');
    expect(PLAN_PRICES.professional).toContain('$');
    expect(PLAN_PRICES.enterprise).toContain('Custom');
  });
});

describe('PLAN_UPGRADE_URL', () => {
  it('has upgrade URLs for all plans', () => {
    expect(PLAN_UPGRADE_URL.starter).toContain('/api/stripe/checkout');
    expect(PLAN_UPGRADE_URL.professional).toContain('/api/stripe/checkout');
    expect(PLAN_UPGRADE_URL.enterprise).toContain('/contact');
  });
});

describe('usePlanFeatures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSubscription as jest.Mock).mockReturnValue({
      plan: 'professional',
      isActive: true,
      isLoading: false,
    });
  });

  it('returns professional features when on professional plan', () => {
    const result = usePlanFeatures();
    expect(result.plan).toBe('professional');
    expect(result.features.strategyMaps).toBe(true);
    expect(result.features.maxEmployees).toBe(200);
  });

  it('returns starter features when plan is not active', () => {
    (useSubscription as jest.Mock).mockReturnValue({
      plan: 'professional',
      isActive: false,
      isLoading: false,
    });

    const result = usePlanFeatures();
    expect(result.features.maxEmployees).toBe(50); // starter limit
    expect(result.features.strategyMaps).toBe(false); // starter: no strategy maps
  });

  it('returns starter features when no subscription data', () => {
    (useSubscription as jest.Mock).mockReturnValue({
      plan: 'starter',
      isActive: false,
      isLoading: true,
    });

    const result = usePlanFeatures();
    expect(result.features.maxEmployees).toBe(50);
  });

  describe('canAccess', () => {
    it('returns true for feature that exists on current plan', () => {
      (useSubscription as jest.Mock).mockReturnValue({
        plan: 'professional',
        isActive: true,
        isLoading: false,
      });
      const result = usePlanFeatures();
      expect(result.canAccess('strategyMaps')).toBe(true);
      expect(result.canAccess('analytics')).toBe(true);
    });

    it('returns false for feature not on current plan', () => {
      (useSubscription as jest.Mock).mockReturnValue({
        plan: 'starter',
        isActive: true,
        isLoading: false,
      });
      const result = usePlanFeatures();
      expect(result.canAccess('strategyMaps')).toBe(false);
    });

    it('returns false while loading', () => {
      (useSubscription as jest.Mock).mockReturnValue({
        plan: 'starter',
        isActive: true,
        isLoading: true,
      });
      const result = usePlanFeatures();
      expect(result.canAccess('analytics')).toBe(false);
    });
  });

  describe('requiresPlan', () => {
    it('returns minimum plan for strategyMaps', () => {
      (useSubscription as jest.Mock).mockReturnValue({
        plan: 'professional',
        isActive: true,
        isLoading: false,
      });
      const result = usePlanFeatures();
      const minPlan = result.requiresPlan('strategyMaps');
      expect(minPlan).toBe('professional');
    });

    it('returns minimum plan for analytics', () => {
      (useSubscription as jest.Mock).mockReturnValue({
        plan: 'professional',
        isActive: true,
        isLoading: false,
      });
      const result = usePlanFeatures();
      const minPlan = result.requiresPlan('analytics');
      // analytics is true on starter, so min plan is starter
      expect(minPlan).toBe('starter');
    });

    it('returns null for nonexistent feature', () => {
      (useSubscription as jest.Mock).mockReturnValue({
        plan: 'professional',
        isActive: true,
        isLoading: false,
      });
      const result = usePlanFeatures();
      const minPlan = result.requiresPlan('nonexistent' as any);
      expect(minPlan).toBeNull();
    });
  });
});
