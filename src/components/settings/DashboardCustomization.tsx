'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, Eye, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { User } from '@/store/useAuthStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface DashboardUser extends User {
  defaultView?: string;
  dataRefreshRate?: string;
  compactMode?: boolean;
  dashboardWidgets?: Record<string, boolean>;
}

interface DashboardCustomizationProps {
  user: DashboardUser | null;
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

export function DashboardCustomization({ user, onSettingsChange }: DashboardCustomizationProps) {
  const { t } = useTranslation();

  const defaultWidgets = useMemo(
    () => ({
      quickStats: true,
      leaveCalendar: true,
      upcomingTasks: true,
      teamActivity: true,
      recentLeaves: false,
      analytics: true,
    }),
    [],
  );

  const [defaultView, setDefaultView] = useState(user?.defaultView ?? 'dashboard');
  const [refreshRate, setRefreshRate] = useState(user?.dataRefreshRate ?? 'realtime');
  const [compactMode, setCompactMode] = useState(user?.compactMode ?? false);

  const [widgets, setWidgets] = useState(user?.dashboardWidgets ?? defaultWidgets);

  // Update parent when settings change
  useEffect(() => {
    onSettingsChange({
      defaultView,
      dataRefreshRate: refreshRate,
      compactMode,
      dashboardWidgets: widgets,
    });
  }, [defaultView, refreshRate, compactMode, widgets, onSettingsChange]);

  // Sync when user data changes
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local settings state when user data loads
      setDefaultView(user.defaultView ?? 'dashboard');
      setRefreshRate(user.dataRefreshRate ?? 'realtime');
      setCompactMode(user.compactMode ?? false);
      setWidgets(user.dashboardWidgets ?? defaultWidgets);
    }
  }, [user, defaultWidgets]);

  const toggleWidget = (key: keyof typeof widgets) => {
    setWidgets((prev: Record<string, boolean>) => ({
      ...prev,
      [key as string]: !prev[key as string],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Default View */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Home className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsDashboard.defaultLandingPage')}</CardTitle>
          </div>
          <CardDescription>{t('settingsDashboard.defaultLandingPageDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="default-view">{t('settingsDashboard.landingPage')}</Label>
            <Select value={defaultView} onValueChange={setDefaultView}>
              <SelectTrigger id="default-view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dashboard">📊 {t('nav.dashboard')}</SelectItem>
                <SelectItem value="tasks">✓ {t('nav.tasks')}</SelectItem>
                <SelectItem value="calendar">📅 {t('nav.calendar')}</SelectItem>
                <SelectItem value="leaves">📋 {t('nav.leaves')}</SelectItem>
                <SelectItem value="attendance">⏰ {t('nav.attendance')}</SelectItem>
                <SelectItem value="analytics">📈 {t('nav.analytics')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-(--text-muted)">
              {t('settingsDashboard.redirectAfterLogin')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Widget Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsDashboard.dashboardWidgets')}</CardTitle>
          </div>
          <CardDescription>{t('settingsDashboard.dashboardWidgetsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(widgets).map(([key, enabled]) => {
            const widgetLabels: Record<string, { name: string; desc: string; emoji: string }> = {
              quickStats: {
                name: t('settingsDashboard.quickStatistics'),
                desc: t('settingsDashboard.quickStatisticsDesc'),
                emoji: '📊',
              },
              leaveCalendar: {
                name: t('settingsDashboard.leaveCalendar'),
                desc: t('settingsDashboard.leaveCalendarDesc'),
                emoji: '📅',
              },
              upcomingTasks: {
                name: t('settingsDashboard.upcomingTasks'),
                desc: t('settingsDashboard.upcomingTasksDesc'),
                emoji: '✓',
              },
              teamActivity: {
                name: t('settingsDashboard.teamActivity'),
                desc: t('settingsDashboard.teamActivityDesc'),
                emoji: '👥',
              },
              recentLeaves: {
                name: t('settingsDashboard.recentLeaves'),
                desc: t('settingsDashboard.recentLeavesDesc'),
                emoji: '📋',
              },
              analytics: {
                name: t('settingsDashboard.analyticsChart'),
                desc: t('settingsDashboard.analyticsChartDesc'),
                emoji: '📈',
              },
            };

            const widget = widgetLabels[key];
            if (!widget) return null;

            return (
              <div key={key}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{widget.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-(--text-primary)">{widget.name}</p>
                      <p className="text-xs text-(--text-muted) mt-0.5">{widget.desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={enabled as boolean}
                    onCheckedChange={() => toggleWidget(key as keyof typeof widgets)}
                  />
                </div>
                {key !== 'analytics' && <div className="border-b border-(--border) mt-3" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Display & Performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsDashboard.displayPerformance')}</CardTitle>
          </div>
          <CardDescription>{t('settingsDashboard.displayPerformanceDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-(--surface-hover) border border-(--border)">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📐</span>
              <div>
                <p className="text-sm font-medium text-(--text-primary)">
                  {t('settingsDashboard.compactMode')}
                </p>
                <p className="text-xs text-(--text-muted) mt-0.5">
                  {t('settingsDashboard.compactModeDesc')}
                </p>
              </div>
            </div>
            <Switch checked={compactMode} onCheckedChange={setCompactMode} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="refresh-rate">{t('settingsDashboard.dataRefreshRate')}</Label>
            <Select value={refreshRate} onValueChange={setRefreshRate}>
              <SelectTrigger id="refresh-rate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realtime">
                  ⚡ {t('settingsDashboard.realtimeUpdates')}
                </SelectItem>
                <SelectItem value="5min">🔄 {t('settingsDashboard.every5Minutes')}</SelectItem>
                <SelectItem value="15min">⏱️ {t('settingsDashboard.every15Minutes')}</SelectItem>
                <SelectItem value="30min">⏰ {t('settingsDashboard.every30Minutes')}</SelectItem>
                <SelectItem value="manual">
                  🤚 {t('settingsDashboard.manualRefreshOnly')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-(--text-muted)">
              {refreshRate === 'realtime'
                ? t('settingsDashboard.dataUpdatesInstantly')
                : refreshRate === 'manual'
                  ? t('settingsDashboard.refreshDataManually')
                  : t('settingsDashboard.dataRefreshesEvery', {
                      interval: refreshRate.replace('min', ' minutes'),
                    })}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
