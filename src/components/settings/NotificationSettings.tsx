'use client';

import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

export function NotificationSettings() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const userId = user?.id as Id<'users'> | undefined;

  const settings = useQuery(api.settings.getUserSettings, userId ? {} : 'skip');
  const updateNotificationSettings = useMutation(api.settings.updateNotificationSettings);

  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(false);

  // Sync local state when settings load
  useEffect(() => {
    if (settings) {
      setEmailNotifs(settings.emailNotifications);
      setPushNotifs(settings.pushNotifications);
    }
  }, [settings?.emailNotifications, settings?.pushNotifications]);

  const persist = async (next: { email: boolean; push: boolean }) => {
    if (!userId) return;
    await updateNotificationSettings({
      notificationsEnabled: next.email || next.push,
      emailNotifications: next.email,
      pushNotifications: next.push,
    });
  };

  const handleEmailChange = (value: boolean) => {
    setEmailNotifs(value);
    void persist({ email: value, push: pushNotifs });
  };

  const handlePushChange = (value: boolean) => {
    setPushNotifs(value);
    void persist({ email: emailNotifs, push: value });
  };

  const notifications = [
    {
      label: t('settingsNotifications.emailNotifications'),
      desc: t('settingsNotifications.emailNotificationsDesc'),
      value: emailNotifs,
      onChange: handleEmailChange,
      icon: '📧',
    },
    {
      label: t('settingsNotifications.pushNotifications'),
      desc: t('settingsNotifications.pushNotificationsDesc'),
      value: pushNotifs,
      onChange: handlePushChange,
      icon: '🔔',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-(--warning)" />
          <CardTitle>{t('settingsNotifications.title')}</CardTitle>
        </div>
        <CardDescription>{t('settingsNotifications.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notifications.map((item, idx) => (
          <div key={item.label}>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-(--text-primary)">{item.label}</p>
                  <p className="text-xs text-(--text-muted) mt-0.5">{item.desc}</p>
                </div>
              </div>
              <Switch
                checked={item.value}
                onCheckedChange={item.onChange}
                disabled={!userId || settings === undefined}
              />
            </div>
            {idx < notifications.length - 1 && <div className="border-b border-(--border) mt-3" />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
