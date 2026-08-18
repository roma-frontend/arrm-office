'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { moduleKeyForPath, usePlanGatedNav } from '@/lib/planGating';
import { ModuleLockedScreen } from '@/components/billing/ModuleLockedScreen';

/**
 * Route-level plan gate, mounted around the dashboard's main content.
 *
 * For every route that maps to a billing module (see planGating.ts), it checks
 * the caller's entitlements live: when the module is not included in the plan,
 * the page content is replaced by a "No access" screen instead of loading the
 * module and failing with a server error on the first write.
 *
 * Permissive while entitlements are still loading and for routes without a
 * module mapping, so nothing flashes for core/ungated pages.
 */
export function PlanRouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { entitlements } = usePlanGatedNav();

  const moduleKey = moduleKeyForPath(pathname ?? '');
  if (!moduleKey || !entitlements) return <>{children}</>;

  const included = entitlements.moduleMap[moduleKey]?.included ?? false;
  if (included) return <>{children}</>;

  return <ModuleLockedScreen moduleKey={moduleKey} planName={entitlements.planName} />;
}

export default PlanRouteGate;
