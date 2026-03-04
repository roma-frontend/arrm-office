"use client";

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "@/lib/lazy-imports";
import {
  Save,
  Bell,
  Shield,
  Palette,
  CreditCard,
  Settings as SettingsIcon,
  Lock,
  Zap,
  Globe,
  LayoutDashboard,
  Link2,
  ShieldCheck,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/useAuthStore";
import { updateSessionProfileAction } from "@/actions/auth";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import dynamic from "next/dynamic";
import { SubscriptionPlanCard } from "@/components/subscription/SubscriptionPlanCard";
import { CookiePreferences } from "@/components/settings/CookiePreferences";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { ProductivitySettings } from "@/components/settings/ProductivitySettings";
import { LocalizationSettings } from "@/components/settings/LocalizationSettings";
import { DashboardCustomization } from "@/components/settings/DashboardCustomization";
import { AdvancedSecuritySettings } from "@/components/settings/AdvancedSecuritySettings";
import { IntegrationSettings } from "@/components/settings/IntegrationSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";

const SLASettings = dynamic(() => import("@/components/admin/SLASettings"), { ssr: false });

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, login } = useAuthStore();
  const [activeTab, setActiveTab] = useState("profile");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [productivitySettings, setProductivitySettings] = useState({});
  const [localizationSettings, setLocalizationSettings] = useState({});
  const [dashboardSettings, setDashboardSettings] = useState({});

  // Debug: log user data on mount
  useEffect(() => {
    // Debug removed - breakInterval/breakRemindersEnabled not on User type
  }, [user]);

  const updateOwnProfile = useMutation(api.users.updateOwnProfile);
  const migrateFaceToAvatar = useMutation(api.users.migrateFaceToAvatar);

  // Sync when user loads from store (async)
  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
  }, [user?.name, user?.email]);

  // Auto-migrate: copy faceImageUrl → avatarUrl for users who registered face but have no avatar
  useEffect(() => {
    if (user?.role === "admin") {
      migrateFaceToAvatar({}).catch(() => { });
    }
  }, [user?.role]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const newName = name.trim() || user.name;
      const newEmail = email.trim() || user.email;

      const allSettings = {
        name: newName,
        email: newEmail,
        ...productivitySettings,
        ...localizationSettings,
        ...dashboardSettings,
      };

      console.log('Saving settings:', allSettings);

      // 1. Save all settings to Convex DB
      await updateOwnProfile({
        userId: user.id as any,
        ...allSettings,
      });

      // 2. Update JWT cookie (so data persists after page refresh)
      await updateSessionProfileAction(user.id, newName, newEmail);

      // 3. Update Zustand store (localStorage)
      login({
        ...user,
        ...allSettings,
      });

      toast.success("Settings saved successfully!");
      console.log('Settings saved to store:', { ...user, ...allSettings });
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    {
      value: "profile",
      label: t('settings.profile'),
      icon: User,
      description: t('settings.profileDesc'),
    },
    {
      value: "productivity",
      label: t('settings.productivity'),
      icon: Zap,
      description: t('settings.productivityDesc'),
    },
    {
      value: "notifications",
      label: t('settings.notifications'),
      icon: Bell,
      description: t('settings.notificationsDesc'),
    },
    {
      value: "security",
      label: t('settings.security'),
      icon: Shield,
      description: t('settings.securityDesc'),
    },
    {
      value: "advanced-security",
      label: t('settings.privacy'),
      icon: ShieldCheck,
      description: t('settings.privacyDesc'),
    },
    {
      value: "appearance",
      label: t('settings.appearance'),
      icon: Palette,
      description: t('settings.appearanceDesc'),
    },
    {
      value: "dashboard",
      label: t('nav.dashboard'),
      icon: LayoutDashboard,
      description: t('settings.dashboardDesc'),
    },
    {
      value: "localization",
      label: t('settings.regional'),
      icon: Globe,
      description: t('settings.regionalDesc'),
    },
    {
      value: "integrations",
      label: t('settings.integrations'),
      icon: Link2,
      description: t('settings.integrationsDesc'),
    },
    {
      value: "billing",
      label: t('settings.billing'),
      icon: CreditCard,
      description: t('settings.billingDesc'),
    },
    ...(user?.role === "admin"
      ? [
        {
          value: "admin",
          label: t('settings.admin'),
          icon: SettingsIcon,
          description: t('settings.adminDesc'),
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] flex items-center gap-2 md:gap-3">
            <SettingsIcon className="w-6 h-6 md:w-8 md:h-8 text-[var(--primary)]" />{t('nav.settings')}</h2>
          <p className="text-[var(--text-muted)] text-sm mt-2">
            {t('dashboard.settingsSubtitle')}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Navigation Tabs - Scrollable on mobile */}
        <div className="bg-[var(--surface)] p-1.5 rounded-xl border border-[var(--border)] overflow-x-auto">
          <TabsList className="inline-flex w-auto min-w-full gap-1 bg-transparent h-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="data-[state=active]:bg-[var(--primary)] data-[state=active]:text-white data-[state=inactive]:text-[var(--text-muted)] transition-colors rounded-lg py-2.5 px-3 h-auto whitespace-nowrap"
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

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6 mt-0">
              <ProfileSettings
                user={user}
                name={name}
                email={email}
                onNameChange={setName}
                onEmailChange={setEmail}
              />
            </TabsContent>

            {/* Productivity Tab */}
            <TabsContent value="productivity" className="space-y-6 mt-0">
              <ProductivitySettings
                user={user}
                onSettingsChange={setProductivitySettings}
              />
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6 mt-0">
              <NotificationSettings
                emailNotifs={emailNotifs}
                pushNotifs={pushNotifs}
                weeklyReport={weeklyReport}
                onEmailNotifsChange={setEmailNotifs}
                onPushNotifsChange={setPushNotifs}
                onWeeklyReportChange={setWeeklyReport}
              />
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6 mt-0">
              <SecuritySettings userId={user?.id ?? ""} />
            </TabsContent>

            {/* Advanced Security Tab */}
            <TabsContent value="advanced-security" className="space-y-6 mt-0">
              <AdvancedSecuritySettings />
            </TabsContent>

            {/* Appearance Tab */}
            <TabsContent value="appearance" className="space-y-6 mt-0">
              <AppearanceSettings />
            </TabsContent>

            {/* Dashboard Customization Tab */}
            <TabsContent value="dashboard" className="space-y-6 mt-0">
              <DashboardCustomization
                user={user}
                onSettingsChange={setDashboardSettings}
              />
            </TabsContent>

            {/* Localization Tab */}
            <TabsContent value="localization" className="space-y-6 mt-0">
              <LocalizationSettings
                user={user}
                onSettingsChange={setLocalizationSettings}
              />
            </TabsContent>

            {/* Integrations Tab */}
            <TabsContent value="integrations" className="space-y-6 mt-0">
              <IntegrationSettings />
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing" className="space-y-6 mt-0">
              <SubscriptionPlanCard />
              <CookiePreferences />
            </TabsContent>

            {/* Admin Tab */}
            {user?.role === "admin" && (
              <TabsContent value="admin" className="space-y-6 mt-0">
                <SLASettings />
              </TabsContent>
            )}
          </motion.div>
        </AnimatePresence>
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
          className="shadow-lg shadow-[var(--primary)]/20"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? t('ui.saving') : t('ui.saveAllChanges')}
        </Button>
      </motion.div>
    </motion.div>
  );
}
