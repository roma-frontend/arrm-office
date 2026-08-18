'use client';

import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BILLING_MODULE_MAP } from '../../../convex/billing/modules';

/**
 * Full-page "No access" screen for plan-gated routes.
 *
 * When a user opens a module page whose billing module is not included in
 * their plan (direct URL, stale bookmark, sidebar link), the dashboard shell
 * renders this instead of the module — no server round-trip needed, and the
 * user sees *what* is locked and where to upgrade.
 */
export function ModuleLockedScreen({
  moduleKey,
  planName,
}: {
  moduleKey: string;
  planName?: string;
}) {
  const { t } = useTranslation();
  const moduleName = BILLING_MODULE_MAP[moduleKey]?.name ?? moduleKey;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-r from-(--warning-solid) to-(--brand) text-white shadow-lg">
        <Lock className="h-8 w-8" />
      </div>

      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {t('plan.accessDenied.title', 'No access')}
        </h1>
        <p className="mx-auto max-w-md text-sm text-(--text-muted)">
          {t('plan.upgradeModal.moduleBlocked', {
            module: moduleName,
            plan: planName ?? '',
            defaultValue: `The "${moduleName}" module is not included in your ${
              planName ?? ''
            } plan.`,
          })}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/dashboard">
          <Button variant="outline" className="w-full gap-2 sm:w-auto">
            <ArrowLeft className="h-4 w-4" />
            {t('plan.accessDenied.back', 'Back to dashboard')}
          </Button>
        </Link>
        <Link href="/pricing">
          <Button className="w-full gap-2 bg-linear-to-r from-(--brand) to-(--cyan) text-white sm:w-auto">
            {t('plan.upgradeModal.cta', 'View plans & pricing')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default ModuleLockedScreen;
