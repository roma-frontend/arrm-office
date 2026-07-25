/**
 * Tests for stripe-config.ts — plan config and helpers.
 */
import { STRIPE_PLANS, resolvePlanFromPriceId, isValidEmail } from '@/lib/stripe-config';

describe('STRIPE_PLANS', () => {
  it('has all 3 plan tiers', () => {
    expect(STRIPE_PLANS.starter.name).toBe('Starter');
    expect(STRIPE_PLANS.starter.priceMonthly).toBe(29);
    expect(STRIPE_PLANS.professional.name).toBe('Professional');
    expect(STRIPE_PLANS.professional.priceMonthly).toBe(79);
    expect(STRIPE_PLANS.enterprise.name).toBe('Enterprise');
    expect(STRIPE_PLANS.enterprise.priceMonthly).toBe(199);
  });

  it('all plans have priceIdEnv', () => {
    expect(STRIPE_PLANS.starter.priceIdEnv).toBe('STRIPE_PRICE_STARTER');
    expect(STRIPE_PLANS.professional.priceIdEnv).toBe('STRIPE_PRICE_PROFESSIONAL');
    expect(STRIPE_PLANS.enterprise.priceIdEnv).toBe('STRIPE_PRICE_ENTERPRISE');
  });

  it('is a const object (as const)', () => {
    const plans = Object.keys(STRIPE_PLANS);
    expect(plans).toEqual(['starter', 'professional', 'enterprise']);
  });
});

describe('resolvePlanFromPriceId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns starter for matching price ID', () => {
    process.env.STRIPE_PRICE_STARTER = 'price_starter_123';
    expect(resolvePlanFromPriceId('price_starter_123')).toBe('starter');
  });

  it('returns professional for matching price ID', () => {
    process.env.STRIPE_PRICE_PROFESSIONAL = 'price_pro_456';
    expect(resolvePlanFromPriceId('price_pro_456')).toBe('professional');
  });

  it('returns enterprise for matching price ID', () => {
    process.env.STRIPE_PRICE_ENTERPRISE = 'price_ent_789';
    expect(resolvePlanFromPriceId('price_ent_789')).toBe('enterprise');
  });

  it('returns null for unknown price ID', () => {
    process.env.STRIPE_PRICE_STARTER = 'price_starter_123';
    process.env.STRIPE_PRICE_PROFESSIONAL = 'price_pro_456';
    process.env.STRIPE_PRICE_ENTERPRISE = 'price_ent_789';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolvePlanFromPriceId('unknown_price')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null when env vars are not set', () => {
    delete process.env.STRIPE_PRICE_STARTER;
    delete process.env.STRIPE_PRICE_PROFESSIONAL;
    delete process.env.STRIPE_PRICE_ENTERPRISE;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolvePlanFromPriceId('anything')).toBeNull();
    warnSpy.mockRestore();
  });
});

describe('isValidEmail', () => {
  it('accepts valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects missing TLD', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });

  it('accepts subdomain email', () => {
    expect(isValidEmail('user@sub.example.com')).toBe(true);
  });
});
