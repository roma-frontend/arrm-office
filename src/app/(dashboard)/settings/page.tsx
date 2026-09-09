'use client';

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from '@/lib/cssMotion';
import {
  Save,
  Bell,
  Shield,
  Palette,
  CreditCard,
  Settings as SettingsIcon,
  Zap,
  Globe,
  LayoutDashboard,
  Link2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Building2,
  Bot,
  Clock,
  KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import dynamic from 'next/dynamic';
import { SubscriptionPlanCard } from '@/components/subscription/SubscriptionPlanCard';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { logger } from '@/lib/logger';

const CookiePreferences = dynamic(
  () =>
    import('@/components/settings/CookiePreferences').then((m) => ({
      default: m.CookiePreferences,
    })),
  { ssr: false },
);
const NotificationSettings = dynamic(
  () =>
    import('@/components/settings/NotificationSettings').then((m) => ({
      default: m.NotificationSettings,
    })),
  { ssr: false },
);
const SecuritySettings = dynamic(
  () =>
    import('@/components/settings/SecuritySettings').then((m) => ({ default: m.SecuritySettings })),
  { ssr: false },
);
const SsoSettings = dynamic(
  () => import('@/components/settings/SsoSettings').then((m) => ({ default: m.SsoSettings })),
  { ssr: false },
);
const AppearanceSettings = dynamic(
  () =>
    import('@/components/settings/AppearanceSettings').then((m) => ({
      default: m.AppearanceSettings,
    })),
  { ssr: false },
);
const ProductivitySettings = dynamic(
  () =>
    import('@/components/settings/ProductivitySettings').then((m) => ({
      default: m.ProductivitySettings,
    })),
  { ssr: false },
);
const LocalizationSettings = dynamic(
  () =>
    import('@/components/settings/LocalizationSettings').then((m) => ({
      default: m.LocalizationSettings,
    })),
  { ssr: false },
);
const DashboardCustomization = dynamic(
  () =>
    import('@/components/settings/DashboardCustomization').then((m) => ({
      default: m.DashboardCustomization,
    })),
  { ssr: false },
);
const AdvancedSecuritySettings = dynamic(
  () =>
    import('@/components/settings/AdvancedSecuritySettings').then((m) => ({
      default: m.AdvancedSecuritySettings,
    })),
  { ssr: false },
);
const IntegrationSettings = dynamic(
  () =>
    import('@/components/settings/IntegrationSettings').then((m) => ({
      default: m.IntegrationSettings,
    })),
  { ssr: false },
);
const SLASettings = dynamic(() => import('@/components/admin/SLASettings'), { ssr: false });
const BrandingSettings = dynamic(() => import('@/components/settings/BrandingSettings'), {
  ssr: false,
});
const AIGovernancePanel = dynamic(() => import('@/components/ai/AIGovernancePanel'), {
  ssr: false,
});
const MeetingRoomSettings = dynamic(
  () =>
    import('@/components/settings/MeetingRoomSettings').then((m) => ({
      default: m.MeetingRoomSettings,
    })),
  { ssr: false },
);

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, login } = useAuthStore();
  const [activeTab, setActiveTab] = useState('productivity');
  const [saving, setSaving] = useState(false);
  const [productivitySettings, setProductivitySettings] = useState({});
  const [localizationSettings, setLocalizationSettings] = useState({});
  const [dashboardSettings, setDashboardSettings] = useState({});

  // Tabs scroll state
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Mouse drag scroll state
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ x: 0, scrollLeft: 0, hasMoved: false });

  // Block Radix pointerdown from activating tab during potential drag
  const handlePointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const tab = (e.target as HTMLElement).closest("[role='tab']");
    if (tab) {
      // Prevent Radix from switching tab on pointerdown — we'll do it on mouseup if no drag
      e.stopPropagation();
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = tabsScrollRef.current;
    if (!el) return;

    setIsDragging(true);
    dragRef.current = {
      x: e.pageX,
      scrollLeft: el.scrollLeft,
      hasMoved: false,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const el = tabsScrollRef.current;
      if (!el) return;

      const dx = e.pageX - dragRef.current.x;
      if (Math.abs(dx) > 3) {
        dragRef.current.hasMoved = true;
      }
      el.scrollLeft = dragRef.current.scrollLeft - dx;
    },
    [isDragging],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(false);
    // If no drag happened, treat as a click — activate the tab
    if (!dragRef.current.hasMoved) {
      const tab = (e.target as HTMLElement).closest("[role='tab']");
      if (tab) {
        const value = tab.getAttribute('data-value') || tab.getAttribute('value');
        if (value) setActiveTab(value);
      }
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState]);

  // Debug: log user data on mount
  useEffect(() => {
    // Debug removed - breakInterval/breakRemindersEnabled not on User type
  }, [user]);

  const updateOwnProfile = useMutation(api.users.mutations.updateOwnProfile);
  const migrateFaceToAvatar = useMutation(api.users.admin.migrateFaceToAvatar);

  // Auto-migrate: copy faceImageUrl → avatarUrl for users who registered face but have no avatar
  useEffect(() => {
    if (user?.role === 'admin') {
      void migrateFaceToAvatar({}).catch(() => {});
    }
  }, [user?.role, migrateFaceToAvatar]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const allSettings = {
        ...productivitySettings,
        ...localizationSettings,
        ...dashboardSettings,
      };

      // 1. Save all settings to Convex DB
      await updateOwnProfile({
        userId: user.id as Id<'users'>,
        ...allSettings,
      });

      // 2. Update Zustand store (localStorage)
      login({
        ...user,
        ...allSettings,
      });

      toast.success(t('toasts.settingsSaved'));
    } catch (err) {
      logger.error('Failed to save settings:', err);
      toast.error(err instanceof Error ? err.message : t('settings.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    {
      value: 'productivity',
      label: t('settings.productivity'),
      icon: Zap,
      description: t('settings.productivityDesc'),
    },
    {
      value: 'notifications',
      label: t('settings.notifications'),
      icon: Bell,
      description: t('settings.notificationsDesc'),
    },
    {
      value: 'security',
      label: t('settings.security'),
      icon: Shield,
      description: t('settings.securityDesc'),
    },
    {
      value: 'advanced-security',
      label: t('settings.privacy'),
      icon: ShieldCheck,
      description: t('settings.privacyDesc'),
    },
    {
      value: 'appearance',
      label: t('settings.appearance'),
      icon: Palette,
      description: t('settings.appearanceDesc'),
    },
    {
      value: 'dashboard',
      label: t('nav.dashboard'),
      icon: LayoutDashboard,
      description: t('settings.dashboardDesc'),
    },
    {
      value: 'localization',
      label: t('settings.regional'),
      icon: Globe,
      description: t('settings.regionalDesc'),
    },
    {
      value: 'integrations',
      label: t('settings.integrations'),
      icon: Link2,
      description: t('settings.integrationsDesc'),
    },
    ...(user?.role === 'admin'
      ? [
          {
            value: 'billing',
            label: t('settings.billing'),
            icon: CreditCard,
            description: t('settings.billingDesc'),
          },
        ]
      : []),
    ...(user?.role === 'admin'
      ? [
          {
            value: 'admin',
            label: t('settings.admin'),
            icon: SettingsIcon,
            description: t('settings.adminDesc'),
          },
          {
            value: 'branding',
            label: t('settings.branding', 'Branding'),
            icon: Building2,
            description: t('settings.brandingDesc', 'White-label & branding'),
          },
          {
            value: 'ai-governance',
            label: t('settings.aiGovernance', 'AI Governance'),
            icon: Bot,
            description: t('settings.aiGovernanceDesc', 'AI agent oversight & guardrails'),
          },
          {
            value: 'meeting-rooms',
            label: t('settings.meetingRooms.tab', 'Meeting Rooms'),
            icon: Clock,
            description: t('settings.meetingRooms.tabDesc', 'Room reminders & video links'),
          },
          {
            value: 'sso',
            label: t('settingsSso.tab', 'Single Sign-On'),
            icon: KeyRound,
            description: t('settingsSso.tabDesc', 'Enterprise OIDC sign-in'),
          },
        ]
      : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-8"
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('nav.settings')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-2">{t('dashboard.settingsSubtitle')}</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Navigation Tabs - Scrollable with arrow buttons */}
        <div className="relative group">
          <button
            onClick={() => {
              const el = tabsScrollRef.current;
              if (el) el.scrollBy({ left: -200, behavior: 'smooth' });
            }}
            className="absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center w-8 bg-linear-to-r from-(--surface-1) via-(--surface-1) to-transparent rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ display: canScrollLeft ? undefined : 'none' }}
            aria-label={t('settings.scrollLeft')}
          >
            <ChevronLeft className="w-4 h-4 text-(--text-muted)" />
          </button>
          <div
            ref={tabsScrollRef}
            onScroll={updateScrollState}
            onPointerDownCapture={handlePointerDownCapture}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            className="bg-(--surface-1) p-1.5 rounded-xl border border-(--border) overflow-x-auto scrollbar-hide"
          >
            <TabsList className="inline-flex w-auto min-w-full gap-1 bg-transparent h-auto flex-nowrap">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    data-value={tab.value}
                    className="data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:text-(--text-muted) data-[state=inactive]:hover:text-(--text-secondary) transition-all rounded-lg py-2.5 px-3 h-auto whitespace-nowrap"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{tab.label}</span>
                    </div>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          <button
            onClick={() => {
              const el = tabsScrollRef.current;
              if (el) el.scrollBy({ left: 200, behavior: 'smooth' });
            }}
            className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center w-8 bg-linear-to-l from-(--surface-1) via-(--surface-1) to-transparent rounded-r-xl opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ display: canScrollRight ? undefined : 'none' }}
            aria-label={t('settings.scrollRight')}
          >
            <ChevronRight className="w-4 h-4 text-(--text-muted)" />
          </button>
        </div>

        {/* Tab Content */}
        {/* Tab Content */}
        <div className="animate-in fade-in duration-150">
          <TabsContent value="productivity" className="space-y-6 mt-0">
            <ProductivitySettings user={user} onSettingsChange={setProductivitySettings} />
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 mt-0">
            <NotificationSettings />
          </TabsContent>

          <TabsContent value="security" className="space-y-6 mt-0">
            {user?.id && user.id !== '' && <SecuritySettings userId={user.id as Id<'users'>} />}
          </TabsContent>

          <TabsContent value="advanced-security" className="space-y-6 mt-0">
            <AdvancedSecuritySettings />
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6 mt-0">
            <AppearanceSettings />
          </TabsContent>

          <TabsContent value="dashboard" className="space-y-6 mt-0">
            <DashboardCustomization user={user} onSettingsChange={setDashboardSettings} />
          </TabsContent>

          <TabsContent value="localization" className="space-y-6 mt-0">
            <LocalizationSettings
              userId={user?.id as Id<'users'>}
              user={user}
              onSettingsChange={setLocalizationSettings}
            />
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 mt-0">
            <IntegrationSettings />
          </TabsContent>

          {user?.role === 'admin' && (
            <TabsContent value="sso" className="space-y-6 mt-0">
              <SsoSettings />
            </TabsContent>
          )}

          {user?.role === 'admin' && (
            <TabsContent value="billing" className="space-y-6 mt-0">
              <SubscriptionPlanCard />
              <CookiePreferences />
            </TabsContent>
          )}

          {user?.role === 'admin' && (
            <TabsContent value="admin" className="space-y-6 mt-0">
              <SLASettings />
            </TabsContent>
          )}

          {user?.role === 'admin' && (
            <TabsContent value="branding" className="space-y-6 mt-0">
              <BrandingSettings />
            </TabsContent>
          )}

          {user?.role === 'admin' && (
            <>
              <TabsContent value="ai-governance" className="space-y-6 mt-0">
                <AIGovernancePanel />
              </TabsContent>

              <TabsContent value="meeting-rooms" className="space-y-6 mt-0">
                <MeetingRoomSettings />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>

      {/* Save Button - Fixed at bottom */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end sticky bottom-6 z-10"
      >
        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className="shadow-lg shadow-(--primary)/20 w-full sm:w-auto btn-gradient text-white"
        >
          {saving ? (
            <>
              <ShieldLoader size="xs" variant="inline" className="mr-2" />
              {t('ui.saving')}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {t('ui.saveAllChanges')}
            </>
          )}
        </Button>
      </motion.div>
    </motion.div>
  );
}
