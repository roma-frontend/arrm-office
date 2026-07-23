'use client';

import { useState, useEffect } from 'react';
import { Zap, Clock, Target, Keyboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProductivitySettingsProps {
  user: any;
  onSettingsChange: (settings: any) => void;
}

export function ProductivitySettings({ user, onSettingsChange }: ProductivitySettingsProps) {
  const { t } = useTranslation();

  const [focusMode, setFocusMode] = useState(user?.focusModeEnabled ?? false);
  const [breakReminders, setBreakReminders] = useState(user?.breakRemindersEnabled ?? true);
  const [workHoursStart, setWorkHoursStart] = useState(user?.workHoursStart ?? '09:00');
  const [workHoursEnd, setWorkHoursEnd] = useState(user?.workHoursEnd ?? '18:00');
  const [breakInterval, setBreakInterval] = useState(String(user?.breakInterval ?? 120));
  const [dailyGoal, setDailyGoal] = useState(String(user?.dailyTaskGoal ?? 5));

  // Update parent when settings change
  useEffect(() => {
    const settings = {
      focusModeEnabled: focusMode,
      workHoursStart,
      workHoursEnd,
      breakRemindersEnabled: breakReminders,
      breakInterval: parseInt(breakInterval) || 120,
      dailyTaskGoal: parseInt(dailyGoal) || 5,
    };
    logger.log('ProductivitySettings updating:', settings);
    onSettingsChange(settings);
  }, [
    focusMode,
    workHoursStart,
    workHoursEnd,
    breakReminders,
    breakInterval,
    dailyGoal,
    onSettingsChange,
  ]);

  // Sync when user data changes
  useEffect(() => {
    if (user) {
      setFocusMode(user.focusModeEnabled ?? false);
      setBreakReminders(user.breakRemindersEnabled ?? true);
      setWorkHoursStart(user.workHoursStart ?? '09:00');
      setWorkHoursEnd(user.workHoursEnd ?? '18:00');
      setBreakInterval(String(user.breakInterval ?? 120));
      setDailyGoal(String(user.dailyTaskGoal ?? 5));
    }
  }, [
    user?.focusModeEnabled,
    user?.breakRemindersEnabled,
    user?.workHoursStart,
    user?.workHoursEnd,
    user?.breakInterval,
    user?.dailyTaskGoal,
  ]);

  return (
    <div className="space-y-6">
      {/* Focus Mode */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-(--warning)" />
            <CardTitle>{t('settingsProductivity.focusMode')}</CardTitle>
          </div>
          <CardDescription>{t('settingsProductivity.focusModeDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-(--surface-hover) border border-(--border)">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎯</span>
              <div>
                <p className="text-sm font-medium text-(--text-primary)">
                  {t('settingsProductivity.focusModeToggle')}
                </p>
                <p className="text-xs text-(--text-muted) mt-0.5">
                  {t('settingsProductivity.focusModeHelp')}
                </p>
              </div>
            </div>
            <Switch checked={focusMode} onCheckedChange={setFocusMode} />
          </div>

          {focusMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-(--primary)/20 bg-(--primary)/5">
              <div className="space-y-2">
                <Label htmlFor="work-start">{t('settingsProductivity.workHoursStart')}</Label>
                <Input
                  id="work-start"
                  type="time"
                  value={workHoursStart}
                  onChange={(e) => setWorkHoursStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="work-end">{t('settingsProductivity.workHoursEnd')}</Label>
                <Input
                  id="work-end"
                  type="time"
                  value={workHoursEnd}
                  onChange={(e) => setWorkHoursEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Break Reminders */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsProductivity.breakReminders')}</CardTitle>
          </div>
          <CardDescription>{t('settingsProductivity.breakRemindersDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-(--surface-hover) border border-(--border)">
            <div className="flex items-start gap-3">
              <span className="text-2xl">☕</span>
              <div>
                <p className="text-sm font-medium text-(--text-primary)">
                  {t('settingsProductivity.breakNotifications')}
                </p>
                <p className="text-xs text-(--text-muted) mt-0.5">
                  {t('settingsProductivity.getReminded')}
                </p>
              </div>
            </div>
            <Switch checked={breakReminders} onCheckedChange={setBreakReminders} />
          </div>

          {breakReminders && (
            <div className="space-y-2 p-4 rounded-lg border border-(--primary)/20 bg-(--primary)/5">
              <Label htmlFor="break-interval">{t('labels.breakInterval')}</Label>
              <Select value={breakInterval} onValueChange={setBreakInterval}>
                <SelectTrigger id="break-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t('settingsProductivity.every1min')}</SelectItem>
                  <SelectItem value="60">{t('settingsProductivity.every60min')}</SelectItem>
                  <SelectItem value="90">{t('settingsProductivity.every90min')}</SelectItem>
                  <SelectItem value="120">{t('settingsProductivity.every2hours')}</SelectItem>
                  <SelectItem value="180">{t('settingsProductivity.every3hours')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-(--text-muted) mt-2">
                {parseInt(breakInterval) === 1
                  ? t('settingsProductivity.breakTestingMode')
                  : t('settingsProductivity.breakReminderMessage', {
                      minutes: parseInt(breakInterval),
                    })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Goals */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-(--success)" />
            <CardTitle>{t('settingsProductivity.dailyGoals')}</CardTitle>
          </div>
          <CardDescription>{t('settingsProductivity.setTargets')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="daily-tasks">{t('labels.dailyTaskGoal')}</Label>
              <Input
                id="daily-tasks"
                type="number"
                min="1"
                max="20"
                value={dailyGoal}
                onChange={(e) => setDailyGoal(e.target.value)}
              />
              <p className="text-xs text-(--text-muted)">{t('settingsProductivity.tasksPerDay')}</p>
            </div>
            <div className="flex items-center justify-center p-6 rounded-lg bg-linear-to-br from-(--primary)/10 to-(--success)/10 border border-(--border)">
              <div className="text-center">
                <p className="text-3xl font-bold text-(--primary)">{dailyGoal}</p>
                <p className="text-xs text-(--text-muted) mt-1">
                  {t('settingsProductivity.tasksDay')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsProductivity.keyboardShortcuts')}</CardTitle>
          </div>
          <CardDescription>{t('settingsProductivity.keyboardShortcutsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                key: '⌘ K',
                action: t('settingsProductivity.commandPalette'),
                desc: t('settingsProductivity.quickSearch'),
              },
              {
                key: '⌘ T',
                action: t('settingsProductivity.newTaskShortcut'),
                desc: t('settingsProductivity.createInstantly'),
              },
              {
                key: '⌘ L',
                action: t('settingsProductivity.requestLeaveShortcut'),
                desc: t('settingsProductivity.requestInstantly'),
              },
              {
                key: '⌘ A',
                action: t('nav.attendance'),
                desc: t('settingsProductivity.clockInOut'),
              },
              {
                key: '⌘ /',
                action: t('settingsProductivity.toggleSidebar'),
                desc: t('settingsProductivity.showHideNav'),
              },
              {
                key: '⌘ B',
                action: t('nav.notifications'),
                desc: t('settingsProductivity.openNotifications'),
              },
            ].map((shortcut, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <kbd className="px-2 py-1 text-xs font-semibold bg-(--surface-hover) border border-(--border) rounded">
                      {shortcut.key}
                    </kbd>
                    <div>
                      <p className="text-sm font-medium text-(--text-primary)">{shortcut.action}</p>
                      <p className="text-xs text-(--text-muted)">{shortcut.desc}</p>
                    </div>
                  </div>
                </div>
                {idx < 5 && <div className="border-b border-(--border) mt-2" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
