'use client';

import { useTranslation } from 'react-i18next';
import type { User } from '@/store/useAuthStore';
import { useAuthStore } from '@/store/useAuthStore';
import React, { useState, useEffect } from 'react';
import { Globe, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import type { Id } from '@/convex/_generated/dataModel';

interface LocalizationSettingsProps {
  userId: Id<'users'>;
  user: User | null;
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

const DEFAULT_SETTINGS = {
  language: 'en',
  timezone: 'UTC',
  dateFormat: 'DD/MM/YYYY',
  firstDayOfWeek: 'monday',
  timeFormat: '24h',
} as const;

/**
 * Render the selected date/time format verbatim, so the preview reflects the
 * dropdown choices instead of the locale's default format.
 */
function formatDatePreview(language: string, dateFormat: string): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'DD.MM.YYYY':
      return `${day}.${month}.${year}`;
    default:
      return `${day}/${month}/${year}`;
  }
}

function formatTimePreview(language: string, timeFormat: string): string {
  const locale = language === 'ru' ? 'ru-RU' : language === 'hy' ? 'hy-AM' : 'en-US';
  return new Date().toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

export function LocalizationSettings({ user, onSettingsChange }: LocalizationSettingsProps) {
  const { t, i18n } = useTranslation();
  const { login } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);

  const [language, setLanguage] = useState<string>(DEFAULT_SETTINGS.language);
  const [timezone, setTimezone] = useState<string>(DEFAULT_SETTINGS.timezone);
  const [dateFormat, setDateFormat] = useState<string>(DEFAULT_SETTINGS.dateFormat);
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<string>(DEFAULT_SETTINGS.firstDayOfWeek);
  const [timeFormat, setTimeFormat] = useState<string>(DEFAULT_SETTINGS.timeFormat);

  const updateSettings = useMutation(api.settings.updateLocalizationSettings);

  // Real-time source of truth: subscribe to the saved settings instead of the
  // session user (the JWT never carries localization fields, so the store
  // would reset the tab to defaults after every reload). Convex re-delivers
  // this query after any save, on any device.
  const savedSettings = useQuery(api.settings.getUserSettings, user?.id ? {} : 'skip');

  // Sync local state when saved settings arrive or change
  useEffect(() => {
    if (savedSettings) {
      setLanguage(savedSettings.language ?? DEFAULT_SETTINGS.language);
      setTimezone(savedSettings.timezone ?? DEFAULT_SETTINGS.timezone);
      setDateFormat(savedSettings.dateFormat ?? DEFAULT_SETTINGS.dateFormat);
      setFirstDayOfWeek(savedSettings.firstDayOfWeek ?? DEFAULT_SETTINGS.firstDayOfWeek);
      setTimeFormat(savedSettings.timeFormat ?? DEFAULT_SETTINGS.timeFormat);
    }
  }, [savedSettings]);

  // Update parent when settings change (local only)
  useEffect(() => {
    onSettingsChange({
      language,
      timezone,
      dateFormat,
      timeFormat,
      firstDayOfWeek,
    });
  }, [language, timezone, dateFormat, timeFormat, firstDayOfWeek, onSettingsChange]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        language,
        timezone,
        dateFormat,
        timeFormat,
        firstDayOfWeek,
      });

      // Mirror into the auth store so the current session reflects the change
      // immediately (the JWT is not refreshed, but nothing reads localization
      // off it — the DB query above is the source of truth).
      if (user) {
        login({ ...user, language, timezone, dateFormat, timeFormat, firstDayOfWeek });
      }

      // Always persist language to cookie and localStorage
      localStorage.setItem('i18nextLng', language);
      document.cookie = `i18nextLng=${language};path=/;max-age=${365 * 24 * 60 * 60}`;

      // Change language if it differs from current
      if (language !== i18n.language) {
        logger.log('[LocalizationSettings] Changing language from', i18n.language, 'to', language);

        await i18n.changeLanguage(language);

        toast.success(t('settings.saved'), {
          description: `${t('settings.localizationSaved')} ${t('settings.reloadingPage')}`,
          duration: 2000,
        });

        // Force page reload to apply language everywhere after short delay
        setTimeout(() => {
          window.location.reload();
        }, 1500);

        return; // Exit early, reload will handle the rest
      }

      toast.success(t('settings.saved'), {
        description: t('settings.localizationSaved'),
      });
    } catch (error) {
      logger.error('Failed to save localization settings:', error);
      toast.error(t('settings.saveFailed'), {
        description: t('settings.tryAgain'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Language & Region */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsLocalization.languageRegion')}</CardTitle>
          </div>
          <CardDescription>{t('settingsLocalization.customizeLanguage')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="language">{t('labels.displayLanguage')}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">🇬🇧 English</SelectItem>
                  <SelectItem value="ru">🇷🇺 Русский</SelectItem>
                  <SelectItem value="hy">🇦🇲 Հայերեն</SelectItem>
                  <SelectItem value="de">🇩🇪 Deutsch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">{t('labels.timeZone')}</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">{t('localizationSettings.utc')}</SelectItem>
                  <SelectItem value="America/New_York">
                    {t('localizationSettings.eastern')}
                  </SelectItem>
                  <SelectItem value="America/Chicago">
                    {t('localizationSettings.central')}
                  </SelectItem>
                  <SelectItem value="America/Los_Angeles">
                    {t('localizationSettings.pacific')}
                  </SelectItem>
                  <SelectItem value="Europe/London">{t('localizationSettings.london')}</SelectItem>
                  <SelectItem value="Europe/Paris">{t('localizationSettings.paris')}</SelectItem>
                  <SelectItem value="Europe/Moscow">{t('localizationSettings.moscow')}</SelectItem>
                  <SelectItem value="Asia/Dubai">{t('localizationSettings.dubai')}</SelectItem>
                  <SelectItem value="Asia/Kolkata">{t('localizationSettings.india')}</SelectItem>
                  <SelectItem value="Asia/Shanghai">{t('localizationSettings.china')}</SelectItem>
                  <SelectItem value="Asia/Tokyo">{t('localizationSettings.tokyo')}</SelectItem>
                  <SelectItem value="Australia/Sydney">
                    {t('localizationSettings.sydney')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Date & Time Format */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsLocalization.dateTimeFormat')}</CardTitle>
          </div>
          <CardDescription>{t('settingsLocalization.configureDatetime')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date-format">{t('labels.dateFormat')}</Label>
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger id="date-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">
                    {t('localizationSettings.dateFormatDDMM')}
                  </SelectItem>
                  <SelectItem value="MM/DD/YYYY">
                    {t('localizationSettings.dateFormatMMDD')}
                  </SelectItem>
                  <SelectItem value="YYYY-MM-DD">
                    {t('localizationSettings.dateFormatYYYY')}
                  </SelectItem>
                  <SelectItem value="DD.MM.YYYY">
                    {t('localizationSettings.dateFormatDDMMYY')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-(--text-muted)">
                Preview: {formatDatePreview(i18n.language, dateFormat)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time-format">{t('labels.timeFormat')}</Label>
              <Select value={timeFormat} onValueChange={setTimeFormat}>
                <SelectTrigger id="time-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{t('settingsLocalization.hour24')}</SelectItem>
                  <SelectItem value="12h">{t('settingsLocalization.hour12')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-(--text-muted)">
                Preview: {formatTimePreview(i18n.language, timeFormat)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsLocalization.calendarPreferences')}</CardTitle>
          </div>
          <CardDescription>{t('settingsLocalization.customizeCalendar')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="first-day">{t('labels.firstDayOfWeek')}</Label>
            <Select value={firstDayOfWeek} onValueChange={setFirstDayOfWeek}>
              <SelectTrigger id="first-day">
                <SelectValue placeholder={t(`weekdays.${firstDayOfWeek}`)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sunday">{t('weekdays.sunday')}</SelectItem>
                <SelectItem value="monday">{t('weekdays.monday')}</SelectItem>
                <SelectItem value="saturday">{t('weekdays.saturday')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 rounded-lg bg-(--surface-hover) border border-(--border)">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📅</span>
              <div>
                <p className="text-sm font-medium text-(--text-primary)">
                  {t('localizationSettings.weekStartsOn')} {t(`weekdays.${firstDayOfWeek}`)}
                </p>
                <p className="text-xs text-(--text-muted) mt-0.5">
                  {t('settingsLocalization.weekStartNote')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? (
            <>
              <ShieldLoader size="xs" variant="inline" />
              {t('buttons.saving')}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              {t('buttons.save')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
