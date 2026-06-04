'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Palette, Sun, Moon, Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTheme } from '@/components/ThemeProvider';

export function AppearanceSettings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const themes = [
    {
      value: 'dark' as const,
      label: t('settings.theme.dark'),
      icon: Moon,
      description: t('settingsExtended.darkThemeDesc'),
    },
    {
      value: 'light' as const,
      label: t('settings.theme.light'),
      icon: Sun,
      description: t('settingsExtended.lightThemeDesc'),
    },
    {
      value: 'system' as const,
      label: t('settings.theme.system'),
      icon: Monitor,
      description: t('settingsExtended.systemThemeDesc'),
    },
  ];

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsExtended.appearance')}</CardTitle>
          </div>
          <CardDescription>{t('settingsExtended.customizeInterface')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-(--text-primary) mb-3">
                {t('settingsExtended.theme')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {themes.map((t) => (
                  <div
                    key={t.value}
                    className="relative px-4 py-4 rounded-lg border-2 border-(--border) text-left"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-lg bg-(--surface-hover)">
                        <t.icon className="w-5 h-5 text-(--text-muted)" />
                      </div>
                      <span className="text-sm font-medium text-(--text-muted)">{t.label}</span>
                    </div>
                    <p className="text-xs text-(--text-muted)">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentTheme = theme || 'system';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-(--primary)" />
          <CardTitle>{t('settingsExtended.appearance')}</CardTitle>
        </div>
        <CardDescription>{t('settingsExtended.customizeInterface')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-(--text-primary) mb-3">
              {t('settingsExtended.theme')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {themes.map((t) => {
                const Icon = t.icon;
                const isActive = currentTheme === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    className={`relative px-4 py-4 rounded-lg border-2 text-left transition-colors ${
                      isActive
                        ? 'border-(--primary) bg-(--primary)/10'
                        : 'border-(--border) hover:border-(--primary)/30'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full btn-gradient flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`p-2 rounded-lg ${isActive ? 'bg-(--primary)/20' : 'bg-(--surface-hover)'}`}
                      >
                        <Icon
                          className={`w-5 h-5 ${isActive ? 'text-(--primary)' : 'text-(--text-muted)'}`}
                        />
                      </div>
                      <span
                        className={`text-sm font-medium ${isActive ? 'text-(--text-primary)' : 'text-(--text-muted)'}`}
                      >
                        {t.label}
                      </span>
                    </div>
                    <p className="text-xs text-(--text-muted)">{t.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
