'use client';

import React, { useState } from 'react';
import { Lock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlanFeatures, PLAN_LABELS, type PlanFeatures, type PlanType } from '@/hooks/usePlanFeatures';
import { UpgradeModal } from './UpgradeModal';
import { useTranslation } from 'react-i18next';

interface PlanGateProps {
  /** Feature key from PlanFeatures to check */
  feature: keyof PlanFeatures;
  /** Content to render when access is granted */
  children: React.ReactNode;
  /** Title shown in the upgrade modal header (e.g. "Advanced Analytics") */
  title?: string;
  /** Description shown in the upgrade modal */
  description?: string;
  /**
   * 'overlay' — renders children blurred with an upgrade overlay
   * 'replace'  — hides children entirely and shows upgrade card (default)
   */
  mode?: 'overlay' | 'replace';
  /** Optional custom fallback instead of the default upgrade card */
  fallback?: React.ReactNode;
}

// ── Upgrade card (shown when access is denied) ────────────────────────────────

function UpgradeCard({
  title,
  description,
  requiredPlan,
  onUpgradeClick,
}: {
  title: string;
  description: string;
  requiredPlan: PlanType;
  onUpgradeClick: () => void;
}) {
  const { t } = useTranslation();
  const planLabel = PLAN_LABELS[requiredPlan];

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] gap-4 min-h-[220px]">
      <div className="w-14 h-14 rounded-2xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center">
        <Lock className="w-6 h-6 text-[var(--primary)]" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-[var(--text-primary)]">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xs mx-auto">{description}</p>
      </div>
      <Button size="sm" className="gap-1.5" onClick={onUpgradeClick}>
        <Zap className="w-4 h-4" />
        {t('planGate.upgradeTo')} {planLabel}
      </Button>
    </div>
  );
}

// ── PlanGate ──────────────────────────────────────────────────────────────────

export function PlanGate({
  feature,
  children,
  title,
  description,
  mode = 'replace',
  fallback,
}: PlanGateProps) {
  const { t } = useTranslation();
  const { canAccess, requiresPlan, isLoading } = usePlanFeatures();
  const [modalOpen, setModalOpen] = useState(false);
  
  // Use translations as defaults
  const finalTitle = title || t('planGate.upgradeRequired');
  const finalDescription = description || t('planGate.featureNotAvailable');

  // While loading — render children to avoid flash of upgrade screen
  if (isLoading) return <>{children}</>;

  if (canAccess(feature)) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  const needed = requiresPlan(feature) ?? 'professional';

  const modal = (
    <UpgradeModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      featureTitle={title}
      featureDescription={description}
      recommendedPlan={needed === 'starter' ? 'professional' : needed as Exclude<PlanType, 'starter'>}
    />
  );

  if (mode === 'overlay') {
    return (
      <>
        <div className="relative">
          <div className="pointer-events-none select-none blur-sm opacity-40">
            {children}
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--background)]/60 backdrop-blur-sm rounded-2xl">
            <UpgradeCard
              title={title}
              description={description}
              requiredPlan={needed}
              onUpgradeClick={() => setModalOpen(true)}
            />
          </div>
        </div>
        {modal}
      </>
    );
  }

  // mode === 'replace'
  return (
    <>
      <UpgradeCard
        title={title}
        description={description}
        requiredPlan={needed}
        onUpgradeClick={() => setModalOpen(true)}
      />
      {modal}
    </>
  );
}

// ── UpgradeBadge — inline badge for sidebar/buttons ──────────────────────────

export function UpgradeBadge({ requiredPlan = 'professional' }: { requiredPlan?: PlanType }) {
  return (
    <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white leading-tight">
      {PLAN_LABELS[requiredPlan]}
    </span>
  );
}

// ── useUpgradeModal — hook for manually triggering the modal ─────────────────

export function useUpgradeModal() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<{
    featureTitle?: string;
    featureDescription?: string;
    recommendedPlan?: Exclude<PlanType, 'starter'>;
  }>({});

  const openModal = (opts?: typeof config) => {
    if (opts) setConfig(opts);
    setOpen(true);
  };

  const modal = (
    <UpgradeModal
      open={open}
      onClose={() => setOpen(false)}
      {...config}
    />
  );

  return { openModal, modal };
}
