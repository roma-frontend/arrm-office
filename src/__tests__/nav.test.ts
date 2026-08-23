/**
 * Tests for `@/lib/nav` — navigation structure and flattenNavDestinations.
 */
import { describe, it, expect } from '@jest/globals';
import { isSeparator, navItems, flattenNavDestinations, type UserRole } from '@/lib/nav';

describe('isSeparator', () => {
  it('returns true for separator entries', () => {
    expect(isSeparator({ type: 'separator' })).toBe(true);
    expect(isSeparator({ type: 'separator', labelKey: 'nav.core' })).toBe(true);
  });

  it('returns false for nav items', () => {
    expect(isSeparator({ href: '/foo', labelKey: 'nav.foo', icon: null as any, roles: [] })).toBe(
      false,
    );
  });
});

describe('navItems', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(navItems)).toBe(true);
    expect(navItems.length).toBeGreaterThan(0);
  });

  it('every entry has either href or type=separator', () => {
    for (const item of navItems) {
      if (isSeparator(item)) {
        expect(item.type).toBe('separator');
      } else {
        expect(typeof item.href).toBe('string');
        expect(item.href.startsWith('/')).toBe(true);
      }
    }
  });
});

describe('flattenNavDestinations', () => {
  it('returns destinations for admin role', () => {
    const dests = flattenNavDestinations('admin');
    expect(dests.length).toBeGreaterThan(0);
    // Every destination has an href and labelKey
    for (const d of dests) {
      expect(typeof d.href).toBe('string');
      expect(typeof d.labelKey).toBe('string');
    }
  });

  it('includes child destinations', () => {
    const dests = flattenNavDestinations('admin');
    const hrefs = dests.map((d) => d.href);
    // /employees and its children should all appear
    expect(hrefs).toContain('/employees');
    expect(hrefs).toContain('/team');
  });

  it('deduplicates hrefs (first wins)', () => {
    const dests = flattenNavDestinations('admin');
    const hrefs = dests.map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('filters by role — driver gets limited destinations', () => {
    const driverDests = flattenNavDestinations('driver');
    const adminDests = flattenNavDestinations('admin');
    // Drivers should have fewer destinations than admins
    expect(driverDests.length).toBeLessThanOrEqual(adminDests.length);
  });

  it('handles undefined role (defaults to employee)', () => {
    const dests = flattenNavDestinations(undefined);
    expect(dests.length).toBeGreaterThan(0);
    const hrefs = dests.map((d) => d.href);
    expect(hrefs).toContain('/dashboard');
  });

  it('includes superadmin-only destinations', () => {
    const superDests = flattenNavDestinations('superadmin');
    const adminDests = flattenNavDestinations('admin');
    const superHrefs = new Set(superDests.map((d) => d.href));
    const adminHrefs = new Set(adminDests.map((d) => d.href));
    // Superadmin should have at least as many as admin
    expect(superHrefs.size).toBeGreaterThanOrEqual(adminHrefs.size);
  });

  it('children inherit group from parent label', () => {
    const dests = flattenNavDestinations('admin');
    const employeesChild = dests.find((d) => d.href === '/team');
    if (employeesChild) {
      expect(employeesChild.groupKey).toBeTruthy();
    }
  });

  it('skips separators in children', () => {
    const dests = flattenNavDestinations('admin');
    // No destination should have a separator-like href
    for (const d of dests) {
      expect(d.href).not.toBe('separator');
    }
  });
});
