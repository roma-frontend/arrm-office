/**
 * Plan gating for navigation.
 *
 * Maps app routes to billing module keys (the catalog in convex/billing/
 * modules.ts). The sidebars consult `usePlanGatedNav` and hide entries whose
 * module is not included in the caller's published plan. Superadmins and
 * callers before the catalog is seeded always see everything (the engine is
 * permissive until a tariff is published).
 */

'use client';

import { useOrgEntitlements, type OrgEntitlements } from '@/hooks/useOrgEntitlements';

/** Route → billing module key. Routes not listed are never plan-gated. */
export const NAV_HREF_TO_MODULE: Record<string, string> = {
  // Core people
  '/employees': 'employees',
  '/employees/departments': 'departments',
  '/employees/positions': 'positions',
  '/team': 'employees',
  '/org-chart': 'orgchart',
  '/drivers': 'drivers',
  // Time & attendance
  '/attendance': 'attendance',
  '/leaves': 'leaves',
  '/calendar': 'calendar',
  '/admin/events': 'calendar',
  '/rooms': 'meetingRooms',
  // Work
  '/tasks': 'tasks',
  '/tasks/recurring': 'tasks',
  '/projects': 'tasks',
  '/chat': 'chat',
  // Performance
  '/performance': 'performance',
  '/goals': 'goals',
  '/strategy': 'goals',
  '/signatures': 'signatures',
  '/recognition': 'recognition',
  // Talent
  '/recruitment': 'recruitment',
  '/onboarding': 'onboarding',
  '/offboarding': 'offboarding',
  '/learning': 'learning',
  // Finance
  '/payroll': 'payroll',
  '/compensation': 'compensation',
  '/expenses': 'expenses',
  '/assets': 'assets',
  '/reports': 'reports',
  '/analytics': 'analytics',
  // Communication
  '/news': 'news',
  '/approvals': 'approvals',
  '/surveys': 'surveys',
  // Documents & platform
  '/documents': 'documents',
  '/documents/library': 'documents',
  '/compliance': 'compliance',
  '/admin/integrations': 'integrations',
  // Admin sub-pages that belong to a gated module
  '/admin/leave-settings': 'leaves',
  '/admin/leave-balances': 'leaves',
  '/admin/holidays': 'calendar',
  '/admin/ai-governance': 'aiAssistant',
  '/analytics/reports': 'analytics',
  // AI
  '/ai-chat': 'aiAssistant',
  '/ai-site-editor': 'aiSiteEditor',
};

/**
 * Resolve the billing-module key for a route path, longest match first so
 * child routes fall back to their parent module ('/employees/123' → employees;
 * '/employees/departments' → departments). Pure — usable in tests.
 */
export function moduleKeyForPath(pathname: string): string | undefined {
  const parts = pathname.split('/').filter(Boolean);
  for (let i = parts.length; i >= 1; i--) {
    const key = `/${parts.slice(0, i).join('/')}`;
    const moduleKey = NAV_HREF_TO_MODULE[key];
    if (moduleKey) return moduleKey;
  }
  return undefined;
}

/** Pure predicate — usable inside useMemo without unstable closures. */
export function isHrefAllowed(entitlements: OrgEntitlements | null, href: string): boolean {
  const moduleKey = NAV_HREF_TO_MODULE[href];
  if (!moduleKey) return true;
  if (!entitlements) return true; // loading — be permissive
  return entitlements.moduleMap[moduleKey]?.included ?? false;
}

/**
 * True when the route is plan-gated and the caller's tariff does NOT include
 * it. The sidebar and module menu show these as locked (lock icon + Upgrade
 * badge) instead of hiding them, so users see what a higher plan unlocks.
 */
export function isHrefLocked(entitlements: OrgEntitlements | null, href: string): boolean {
  const moduleKey = NAV_HREF_TO_MODULE[href];
  if (!moduleKey) return false;
  if (!entitlements) return false; // loading — be permissive
  return !(entitlements.moduleMap[moduleKey]?.included ?? false);
}

/**
 * Live "is this route allowed by my plan?" — hidden routes disappear from the
 * sidebar in real time when the superadmin publishes a plan change.
 */
export function usePlanGatedNav() {
  const { entitlements, hasModule } = useOrgEntitlements();
  const isNavAllowed = (href: string): boolean => {
    const moduleKey = NAV_HREF_TO_MODULE[href];
    return !moduleKey || hasModule(moduleKey);
  };
  return { isNavAllowed, entitlements };
}
