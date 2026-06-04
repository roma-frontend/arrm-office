'use client';

import { useSubscription, type Plan } from './useSubscription';

// ── Feature matrix per plan ────────────────────────────────────────────────────
// Add new features here as the product grows
export interface PlanFeatures {
  analytics: boolean;
  advancedAnalytics: boolean;
  reports: boolean;
  exportReports: boolean;
  aiChat: boolean;
  aiInsights: boolean;
  aiLeaveAssistant: boolean;
  aiSiteEditor: boolean;
  aiSiteEditorDesignChanges: number;
  aiSiteEditorContentChanges: number;
  aiSiteEditorLayoutChanges: number;
  aiSiteEditorLogicChanges: boolean;
  aiSiteEditorFullControl: boolean;
  sla: boolean;
  slaSettings: boolean;
  apiAccess: boolean;
  customPolicies: boolean;
  calendarSync: boolean;
  integrations: boolean;
  employeeBackups: boolean;
  maxEmployees: number | null;
}

const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  free: {
    analytics: true,
    advancedAnalytics: false,
    reports: true,
    exportReports: false,
    aiChat: false,
    aiInsights: false,
    aiLeaveAssistant: false,
    aiSiteEditor: true,
    aiSiteEditorDesignChanges: 3,
    aiSiteEditorContentChanges: 5,
    aiSiteEditorLayoutChanges: 1,
    aiSiteEditorLogicChanges: false,
    aiSiteEditorFullControl: false,
    sla: false,
    slaSettings: false,
    apiAccess: false,
    customPolicies: false,
    calendarSync: false,
    integrations: false,
    employeeBackups: false,
    maxEmployees: 10,
  },
  starter: {
    analytics: true,
    advancedAnalytics: false,
    reports: true,
    exportReports: true,
    aiChat: true,
    aiInsights: false,
    aiLeaveAssistant: true,
    aiSiteEditor: true,
    aiSiteEditorDesignChanges: 5,
    aiSiteEditorContentChanges: 10,
    aiSiteEditorLayoutChanges: 2,
    aiSiteEditorLogicChanges: false,
    aiSiteEditorFullControl: false,
    sla: true,
    slaSettings: true,
    apiAccess: true,
    customPolicies: true,
    calendarSync: true,
    integrations: false,
    employeeBackups: false,
    maxEmployees: 10,
  },
  professional: {
    analytics: true,
    advancedAnalytics: true,
    reports: true,
    exportReports: true,
    aiChat: true,
    aiInsights: true,
    aiLeaveAssistant: true,
    aiSiteEditor: true,
    aiSiteEditorDesignChanges: Infinity,
    aiSiteEditorContentChanges: Infinity,
    aiSiteEditorLayoutChanges: Infinity,
    aiSiteEditorLogicChanges: true,
    aiSiteEditorFullControl: true,
    sla: true,
    slaSettings: true,
    apiAccess: true,
    customPolicies: true,
    calendarSync: true,
    integrations: false,
    employeeBackups: false,
    maxEmployees: 50,
  },
  enterprise: {
    analytics: true,
    advancedAnalytics: true,
    reports: true,
    exportReports: true,
    aiChat: true,
    aiInsights: true,
    aiLeaveAssistant: true,
    aiSiteEditor: true,
    aiSiteEditorDesignChanges: Infinity,
    aiSiteEditorContentChanges: Infinity,
    aiSiteEditorLayoutChanges: Infinity,
    aiSiteEditorLogicChanges: true,
    aiSiteEditorFullControl: true,
    sla: true,
    slaSettings: true,
    apiAccess: true,
    customPolicies: true,
    calendarSync: true,
    integrations: true,
    employeeBackups: true,
    maxEmployees: null,
  },
};

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

export const PLAN_PRICES: Record<Plan, string> = {
  free: '$0/mo',
  starter: '$29/mo',
  professional: '$79/mo',
  enterprise: 'Custom',
};

export const UPGRADE_PLAN: Record<Plan, Plan | null> = {
  free: 'starter',
  starter: 'professional',
  professional: 'enterprise',
  enterprise: null,
};

export function usePlanFeatures() {
  const { subscription, loading } = useSubscription();

  // If subscription is active (paid), use plan features
  // If not active (canceled, past_due, free), fall back to free tier
  const effectivePlan: Plan = subscription.isActive ? subscription.plan : 'free';
  const features = PLAN_FEATURES[effectivePlan];

  function hasFeature(feature: keyof PlanFeatures): boolean {
    return !!features[feature];
  }

  return {
    loading,
    plan: effectivePlan,
    rawPlan: subscription.plan,
    features,
    hasFeature,
    subscription,
  };
}
