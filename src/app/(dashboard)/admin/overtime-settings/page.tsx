'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { api } from '../../../../../convex/_generated/api';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthUser } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { Power, UserCheck, BellRing, Mail, Timer, Wallet } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PaymentType = 'double_rate' | 'compensatory_leave' | 'policy';

interface OtForm {
  enabled: boolean;
  requireApproval: boolean;
  notifySupervisor: boolean;
  notifyHR: boolean;
  maxHoursPerDay: string;
  maxHoursPerWeek: string;
  maxHoursPerMonth: string;
  paymentType: PaymentType;
  overtimeRate: string;
}

const toNum = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function OvertimeSettingsPage() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const organizationId = useSelectedOrganization();

  const settings = useQuery(api.overtime.getOvertimeSettings, {});
  const updateSettings = useMutation(api.overtime.updateOvertimeSettings);

  const [form, setForm] = useState<OtForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings || form) return;
    setForm({
      enabled: settings.enabled,
      requireApproval: settings.requireApproval,
      notifySupervisor: settings.notifySupervisor,
      notifyHR: settings.notifyHR,
      maxHoursPerDay: settings.maxHoursPerDay != null ? String(settings.maxHoursPerDay) : '',
      maxHoursPerWeek: settings.maxHoursPerWeek != null ? String(settings.maxHoursPerWeek) : '',
      maxHoursPerMonth: settings.maxHoursPerMonth != null ? String(settings.maxHoursPerMonth) : '',
      paymentType: settings.paymentType,
      overtimeRate: settings.overtimeRate != null ? String(settings.overtimeRate) : '',
    });
  }, [settings, form]);

  if (!organizationId || !user) return <ShieldLoader />;
  if (!form) return <ShieldLoader />;

  const set = <K extends keyof OtForm>(key: K, value: OtForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = async () => {
    const rate = toNum(form.overtimeRate);
    if (rate !== null && (rate < 1 || rate > 10)) {
      toast.error(t('admin.overtimeSettings.invalidRate', 'Rate must be between 1 and 10'));
      return;
    }
    for (const [key, val] of [
      ['maxHoursPerDay', form.maxHoursPerDay],
      ['maxHoursPerWeek', form.maxHoursPerWeek],
      ['maxHoursPerMonth', form.maxHoursPerMonth],
    ] as const) {
      const n = toNum(val);
      if (val.trim() !== '' && (n === null || n <= 0)) {
        toast.error(t('admin.overtimeSettings.invalidLimit', 'Limits must be positive numbers'));
        logger.warn(`Invalid overtime limit ${key}: ${val}`);
        return;
      }
    }
    setSaving(true);
    try {
      await updateSettings({
        enabled: form.enabled,
        requireApproval: form.requireApproval,
        notifySupervisor: form.notifySupervisor,
        notifyHR: form.notifyHR,
        maxHoursPerDay: toNum(form.maxHoursPerDay),
        maxHoursPerWeek: toNum(form.maxHoursPerWeek),
        maxHoursPerMonth: toNum(form.maxHoursPerMonth),
        paymentType: form.paymentType,
        overtimeRate: rate,
      });
      toast.success(t('admin.overtimeSettings.saved', 'Overtime settings saved'));
    } catch (e) {
      toast.error(String(e));
      logger.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleRow = (
    icon: React.ElementType,
    label: string,
    desc: string,
    checked: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--brand)/10 text-(--brand-text)">
          {React.createElement(icon, { className: 'h-4 w-4' })}
        </span>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-(--text-muted)">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-(--background)/95 backdrop-blur border-b border-(--border)">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {t('admin.overtimeSettings.title', 'Overtime Settings')}
            </h1>
            <p className="text-sm text-(--text-muted) mt-1">
              {t(
                'admin.overtimeSettings.subtitle',
                'Configure overtime limits, payment and approvals — synced with requests and payroll',
              )}
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {t('common.save', 'Save')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {t('admin.overtimeSettings.general', 'General')}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-(--border-subtle)">
            {toggleRow(
              Power,
              t('admin.overtimeSettings.enabled', 'Overtime enabled'),
              t(
                'admin.overtimeSettings.enabledDesc',
                'When off, employees cannot submit overtime requests',
              ),
              form.enabled,
              (v) => set('enabled', v),
            )}
            {toggleRow(
              UserCheck,
              t('admin.overtimeSettings.requireApproval', 'Require approval'),
              t(
                'admin.overtimeSettings.requireApprovalDesc',
                'When off, requests are approved automatically',
              ),
              form.requireApproval,
              (v) => set('requireApproval', v),
            )}
            {toggleRow(
              BellRing,
              t('admin.overtimeSettings.notifySupervisor', 'Notify supervisor'),
              t(
                'admin.overtimeSettings.notifySupervisorDesc',
                'Send a notification to the supervisor on new requests',
              ),
              form.notifySupervisor,
              (v) => set('notifySupervisor', v),
            )}
            {toggleRow(
              Mail,
              t('admin.overtimeSettings.notifyHR', 'Notify HR'),
              t('admin.overtimeSettings.notifyHRDesc', 'Copy HR on new overtime requests'),
              form.notifyHR,
              (v) => set('notifyHR', v),
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Timer className="h-4 w-4 text-(--brand-text)" />
                {t('admin.overtimeSettings.limits', 'Hour limits')}
              </CardTitle>
              <p className="text-xs text-(--text-muted)">
                {t('admin.overtimeSettings.limitsDesc', 'Empty = unlimited')}
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              {(
                [
                  ['maxHoursPerDay', t('admin.overtimeSettings.perDay', 'Per day')],
                  ['maxHoursPerWeek', t('admin.overtimeSettings.perWeek', 'Per week')],
                  ['maxHoursPerMonth', t('admin.overtimeSettings.perMonth', 'Per month')],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    className="mt-1"
                    placeholder="∞"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-4 w-4 text-(--brand-text)" />
                {t('admin.overtimeSettings.payment', 'Payment')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t('admin.overtimeSettings.paymentType', 'Payment type')}</Label>
                <Select
                  value={form.paymentType}
                  onValueChange={(v) => set('paymentType', v as PaymentType)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="double_rate">
                      {t('admin.overtimeSettings.payDoubleRate', 'Paid at overtime rate')}
                    </SelectItem>
                    <SelectItem value="compensatory_leave">
                      {t('admin.overtimeSettings.payCompLeave', 'Compensatory leave (unpaid)')}
                    </SelectItem>
                    <SelectItem value="policy">
                      {t('admin.overtimeSettings.payPolicy', 'According to company policy')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.paymentType !== 'compensatory_leave' && (
                <div>
                  <Label>{t('admin.overtimeSettings.overtimeRate', 'Overtime rate (×)')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    step={0.1}
                    value={form.overtimeRate}
                    onChange={(e) => set('overtimeRate', e.target.value)}
                    className="mt-1"
                    placeholder="1.5"
                  />
                  <p className="mt-1 text-xs text-(--text-muted)">
                    {t(
                      'admin.overtimeSettings.rateHint',
                      'Multiplier applied to the hourly rate in payroll (empty = organization default)',
                    )}
                  </p>
                </div>
              )}
              {form.paymentType === 'compensatory_leave' && (
                <p className="text-xs text-(--text-muted)">
                  {t(
                    'admin.overtimeSettings.compLeaveHint',
                    'Overtime is compensated with time off — payroll adds no overtime pay.',
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
