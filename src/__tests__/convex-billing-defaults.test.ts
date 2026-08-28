import {
  mapLegacyPlan,
  DEFAULT_PLANS,
  DEFAULT_ENTITLEMENTS,
  buildDefaultEntitlements,
  defaultPlanName,
  type PlanKey,
} from '../../convex/billing/defaults';

describe('mapLegacyPlan', () => {
  it('maps "starter" to "starter"', () => {
    expect(mapLegacyPlan('starter')).toBe('starter');
  });

  it('maps "professional" to "pro"', () => {
    expect(mapLegacyPlan('professional')).toBe('pro');
  });

  it('maps "enterprise" to "enterprise"', () => {
    expect(mapLegacyPlan('enterprise')).toBe('enterprise');
  });

  it('returns undefined for unknown plan', () => {
    expect(mapLegacyPlan('free')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(mapLegacyPlan(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(mapLegacyPlan(undefined)).toBeUndefined();
  });
});

describe('DEFAULT_PLANS', () => {
  it('has 3 plans', () => {
    expect(DEFAULT_PLANS).toHaveLength(3);
  });

  it('has starter, pro, enterprise keys', () => {
    const keys = DEFAULT_PLANS.map((p) => p.key);
    expect(keys).toContain('starter');
    expect(keys).toContain('pro');
    expect(keys).toContain('enterprise');
  });

  it('pro is marked as popular', () => {
    expect(DEFAULT_PLANS.find((p) => p.key === 'pro')?.isPopular).toBe(true);
  });

  it('enterprise is custom-priced', () => {
    const ent = DEFAULT_PLANS.find((p) => p.key === 'enterprise');
    expect(ent?.isCustom).toBe(true);
    expect(ent?.priceMonthly).toBeUndefined();
  });

  it('all plans have name and ctaLabel', () => {
    DEFAULT_PLANS.forEach((p) => {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.ctaLabel.length).toBeGreaterThan(0);
    });
  });

  it('sortOrder is ascending', () => {
    const orders = DEFAULT_PLANS.map((p) => p.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('DEFAULT_ENTITLEMENTS', () => {
  const keys: PlanKey[] = ['starter', 'pro', 'enterprise'];

  it('has entries for all 3 plans', () => {
    keys.forEach((k) => expect(DEFAULT_ENTITLEMENTS[k]).toBeDefined());
  });

  it('all plans include dashboard and profile', () => {
    keys.forEach((k) => {
      expect(DEFAULT_ENTITLEMENTS[k].dashboard?.included).toBe(true);
      expect(DEFAULT_ENTITLEMENTS[k].profile?.included).toBe(true);
    });
  });

  it('starter has fewer seats than pro', () => {
    const starterSeats = DEFAULT_ENTITLEMENTS.starter.employees?.limits?.seats as number;
    const proSeats = DEFAULT_ENTITLEMENTS.pro.employees?.limits?.seats as number;
    expect(starterSeats).toBeLessThan(proSeats);
  });

  it('pro has fewer seats than enterprise', () => {
    const proSeats = DEFAULT_ENTITLEMENTS.pro.employees?.limits?.seats as number;
    const entSeats = DEFAULT_ENTITLEMENTS.enterprise.employees?.limits?.seats as number;
    expect(proSeats).toBeLessThan(entSeats);
  });

  it('starter has documents limit', () => {
    const docs = DEFAULT_ENTITLEMENTS.starter.documents?.limits?.documents as number;
    expect(docs).toBe(100);
  });

  it('enterprise has nearly unlimited documents', () => {
    const docs = DEFAULT_ENTITLEMENTS.enterprise.documents?.limits?.documents as number;
    expect(docs).toBe(99999);
  });
});

describe('buildDefaultEntitlements', () => {
  it('returns entitlements for starter', () => {
    const ents = buildDefaultEntitlements('starter');
    expect(ents.dashboard?.included).toBe(true);
    expect(ents.employees?.included).toBe(true);
    expect(ents.employees?.limits?.seats).toBe(10);
  });

  it('returns entitlements for pro', () => {
    const ents = buildDefaultEntitlements('pro');
    expect(ents.employees?.limits?.seats).toBe(50);
  });

  it('returns entitlements for enterprise', () => {
    const ents = buildDefaultEntitlements('enterprise');
    expect(ents.employees?.limits?.seats).toBe(999999);
  });

  it('defaults overLimit to "block"', () => {
    const ents = buildDefaultEntitlements('starter');
    expect(ents.employees?.overLimit).toBe('block');
  });
});

describe('defaultPlanName', () => {
  it('returns "Starter" for starter', () => {
    expect(defaultPlanName('starter')).toBe('Starter');
  });

  it('returns "Pro" for pro', () => {
    expect(defaultPlanName('pro')).toBe('Pro');
  });

  it('returns "Enterprise" for enterprise', () => {
    expect(defaultPlanName('enterprise')).toBe('Enterprise');
  });

  it('returns the key itself for unknown', () => {
    expect(defaultPlanName('unknown' as PlanKey)).toBe('unknown');
  });
});
