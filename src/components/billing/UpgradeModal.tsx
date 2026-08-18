'use client';

import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { ArrowRight, Crown, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUpgradeModalStore } from '@/store/useUpgradeModalStore';
import { BILLING_MODULE_MAP } from '../../../convex/billing/modules';

/**
 * Global upgrade modal — the client-side counterpart of the server-side plan
 * gates. When a mutation is rejected with "Module X is not included in your
 * plan" or "Quota exceeded", the Convex client interceptor (src/lib/convex.tsx)
 * opens this dialog instead of leaving the user with a bare error message.
 *
 * It shows what was blocked, the caller's current plan and a CTA to /pricing.
 */
export function UpgradeModal() {
  const { t } = useTranslation();
  const { open, info, close } = useUpgradeModalStore();

  if (!info) return null;

  const moduleName = info.moduleKey
    ? (BILLING_MODULE_MAP[info.moduleKey]?.name ?? info.moduleKey)
    : undefined;
  const blockedLabel = moduleName ?? info.usageKey ?? '';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md" allowFullscreen={false}>
        <DialogHeader className="px-0 pt-2 text-left">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-r from-(--warning-solid) to-(--brand) text-white shadow-lg">
            <Lock className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl font-bold text-(--text-primary)">
            {t('plan.upgradeModal.title', 'Upgrade required')}
          </DialogTitle>
          <DialogDescription className="text-sm text-(--text-muted)">
            {info.kind === 'module'
              ? t('plan.upgradeModal.moduleBlocked', {
                  module: blockedLabel,
                  plan: info.planName,
                  defaultValue: `The "${blockedLabel}" module is not included in your ${info.planName} plan.`,
                })
              : t('plan.upgradeModal.quotaReached', {
                  usage: info.usageKey ?? '',
                  limit: info.limit ?? 0,
                  plan: info.planName,
                  defaultValue: `Your ${info.planName} plan has reached its ${info.usageKey ?? ''} limit (${
                    info.limit ?? 0
                  }).`,
                })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="px-0 pb-2 gap-2 sm:gap-2">
          <Button variant="outline" onClick={close} className="flex-1">
            {t('plan.upgradeModal.later', 'Maybe later')}
          </Button>
          <Link href="/pricing" className="flex-1" onClick={close}>
            <Button className="w-full gap-2 bg-linear-to-r from-(--brand) to-(--cyan) text-white">
              <Crown className="h-4 w-4" />
              {t('plan.upgradeModal.cta', 'View plans & pricing')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpgradeModal;
