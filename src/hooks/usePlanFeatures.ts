'use client';

import { useSubscription, type PlanType } from './useSubscription';
export type { PlanType };

// ── Определение функций по плану ─────────────────────────────────────────────
export interface PlanFeatures {
  // Аналитика
  analytics: boolean;
  advancedAnalytics: boolean; // professional+

  // Strategy Maps
  strategyMaps: boolean; // basic on starter, full on professional+

  // Отчёты
  reports: boolean;
  exportReports: boolean; // professional+

  // AI функции
  aiChat: boolean; // professional+
  aiInsights: boolean; // professional+
  aiLeaveAssistant: boolean; // professional+

  // AI Site Editor - NEW
  aiSiteEditor: boolean; // all plans
  aiSiteEditorDesignChanges: number; // starter: 5/month, pro: unlimited
  aiSiteEditorContentChanges: number; // starter: 10/month, pro: unlimited
  aiSiteEditorLayoutChanges: number; // starter: 2/month, pro: unlimited
  aiSiteEditorLogicChanges: boolean; // professional+ only
  aiSiteEditorFullControl: boolean; // professional+ only

  // SLA
  slaSettings: boolean; // professional+

  // Сотрудники
  maxEmployees: number; // starter: 50, professional: 200, enterprise: unlimited

  // Calendar sync
  calendarSync: boolean; // professional+

  // Telegram/интеграции
  integrations: boolean; // enterprise only
}

export const PLAN_FEATURES: Record<PlanType, PlanFeatures> = {
  starter: {
    analytics: true,
    advancedAnalytics: true,
    strategyMaps: false, // Professional+ feature
    reports: true,
    exportReports: true,
    aiChat: true,
    aiInsights: true,
    aiLeaveAssistant: true,
    // AI Site Editor - Limited for Starter
    aiSiteEditor: true,
    aiSiteEditorDesignChanges: 5, // 5 design changes per month
    aiSiteEditorContentChanges: 10, // 10 content changes per month
    aiSiteEditorLayoutChanges: 2, // 2 layout changes per month
    aiSiteEditorLogicChanges: false, // No logic changes
    aiSiteEditorFullControl: false, // No full control
    slaSettings: true,
    maxEmployees: 50,
    calendarSync: true,
    integrations: true,
  },
  professional: {
    analytics: true,
    advancedAnalytics: true,
    strategyMaps: true, // Full interactive strategy map
    reports: true,
    exportReports: true,
    aiChat: true,
    aiInsights: true,
    aiLeaveAssistant: true,
    // AI Site Editor - Unlimited for Professional
    aiSiteEditor: true,
    aiSiteEditorDesignChanges: Infinity, // Unlimited design changes
    aiSiteEditorContentChanges: Infinity, // Unlimited content changes
    aiSiteEditorLayoutChanges: Infinity, // Unlimited layout changes
    aiSiteEditorLogicChanges: true, // Logic changes allowed
    aiSiteEditorFullControl: true, // Full control allowed
    slaSettings: true,
    maxEmployees: 200,
    calendarSync: true,
    integrations: false,
  },
  enterprise: {
    analytics: true,
    advancedAnalytics: true,
    strategyMaps: true, // Full strategy map with custom frameworks
    reports: true,
    exportReports: true,
    aiChat: true,
    aiInsights: true,
    aiLeaveAssistant: true,
    // AI Site Editor - Unlimited for Enterprise
    aiSiteEditor: true,
    aiSiteEditorDesignChanges: Infinity, // Unlimited design changes
    aiSiteEditorContentChanges: Infinity, // Unlimited content changes
    aiSiteEditorLayoutChanges: Infinity, // Unlimited layout changes
    aiSiteEditorLogicChanges: true, // Logic changes allowed
    aiSiteEditorFullControl: true, // Full control allowed
    slaSettings: true,
    maxEmployees: Infinity,
    calendarSync: true,
    integrations: true,
  },
};

export const PLAN_LABELS: Record<PlanType, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

export const PLAN_PRICES: Record<PlanType, string> = {
  starter: '$29/mo',
  professional: '$79/mo',
  enterprise: 'Custom',
};

export const PLAN_UPGRADE_URL: Record<PlanType, string> = {
  starter: '/api/stripe/checkout',
  professional: '/api/stripe/checkout',
  enterprise: '/contact',
};

// Возвращает true, если requiredPlan <= currentPlan
export function planIncludes(currentPlan: PlanType, requiredPlan: PlanType): boolean {
  const order: PlanType[] = ['starter', 'professional', 'enterprise'];
  return order.indexOf(currentPlan) >= order.indexOf(requiredPlan);
}

export function usePlanFeatures() {
  const { plan, isActive, isLoading } = useSubscription();

  const features = isActive ? PLAN_FEATURES[plan] : PLAN_FEATURES.starter;

  function canAccess(feature: keyof PlanFeatures): boolean {
    if (isLoading) return false;
    const val = features[feature];
    if (typeof val === 'boolean') return val;
    return true; // числовые значения — всегда доступны, но ограничены
  }

  function requiresPlan(feature: keyof PlanFeatures): PlanType | null {
    for (const p of ['starter', 'professional', 'enterprise'] as PlanType[]) {
      if (
        PLAN_FEATURES[p][feature] === true ||
        (typeof PLAN_FEATURES[p][feature] === 'number' && (PLAN_FEATURES[p][feature] as number) > 0)
      ) {
        return p;
      }
    }
    return null;
  }

  return {
    features,
    canAccess,
    requiresPlan,
    plan,
    isLoading,
  };
}
