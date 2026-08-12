'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthStore } from '@/store/useAuthStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Loader2, Settings } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  TAX_RULES,
  type CountryCode,
  type TaxRuleOverride,
} from '../../../../../convex/lib/taxRules';
import { DEFAULT_TRAVEL_ALLOWANCE_POLICY, type TravelAllowancePolicy } from '@/lib/travelAllowance';
import { TaxRuleEditor } from '@/components/payroll/TaxRuleEditor';

type TaxCountry = CountryCode;
type PayFrequency = 'monthly' | 'biweekly' | 'weekly';

export default function PayrollSettingsPage() {
  const { t } = useTranslation();
  const selectedOrgId = useSelectedOrganization();
  const { user } = useAuthStore();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  // Admin-only, matching saveSalarySettings (convex/payroll/mutations.ts). The
  // read query allows supervisors, but this whole page is an editor: letting a
  // supervisor in only got them a filled-in form that failed on save.
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const settings = useQuery(
    api.payroll.queries.getSalarySettings,
    orgId && user?.id && isAdmin ? { organizationId: orgId } : 'skip',
  );
  const saveSettings = useMutation(api.payroll.mutations.saveSalarySettings);

  const [form, setForm] = useState({
    taxCountry: 'armenia' as TaxCountry,
    taxRegion: '',
    payFrequency: 'monthly' as PayFrequency,
    currency: 'AMD',
    minimumWage: 0,
    maximumOvertime: 0,
    emailNotifications: true,
    notifyOnCreate: false,
    notifyOnApprove: true,
    notifyOnPay: true,
    notifyEmployee: false,
    accountingSystem: '',
    paymentMethod: '',
    bankName: '',
  });
  const [taxRuleOverride, setTaxRuleOverride] = useState<TaxRuleOverride | null>(null);
  const [travelAllowance, setTravelAllowance] = useState<TravelAllowancePolicy>(
    DEFAULT_TRAVEL_ALLOWANCE_POLICY,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        taxCountry: settings.taxCountry,
        taxRegion: settings.taxRegion ?? '',
        payFrequency: settings.payFrequency,
        currency: settings.currency ?? 'AMD',
        minimumWage: settings.minimumWage ?? 0,
        maximumOvertime: settings.maximumOvertime ?? 0,
        emailNotifications: settings.emailNotifications ?? true,
        notifyOnCreate: settings.notifyOnCreate ?? false,
        notifyOnApprove: settings.notifyOnApprove ?? true,
        notifyOnPay: settings.notifyOnPay ?? true,
        notifyEmployee: settings.notifyEmployee ?? false,
        accountingSystem: settings.accountingSystem ?? '',
        paymentMethod: settings.paymentMethod ?? '',
        bankName: settings.bankName ?? '',
      });
      setTaxRuleOverride(settings.taxRuleOverride ?? null);
      setTravelAllowance(settings.travelAllowance ?? DEFAULT_TRAVEL_ALLOWANCE_POLICY);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!orgId || !user?.id) return;
    setSaving(true);
    try {
      await saveSettings({
        organizationId: orgId,
        taxCountry: form.taxCountry,
        taxRegion: form.taxRegion || undefined,
        payFrequency: form.payFrequency,
        currency: form.currency || undefined,
        minimumWage: form.minimumWage || undefined,
        maximumOvertime: form.maximumOvertime || undefined,
        emailNotifications: form.emailNotifications,
        notifyOnCreate: form.notifyOnCreate,
        notifyOnApprove: form.notifyOnApprove,
        notifyOnPay: form.notifyOnPay,
        notifyEmployee: form.notifyEmployee,
        accountingSystem: form.accountingSystem || undefined,
        paymentMethod: form.paymentMethod || undefined,
        bankName: form.bankName || undefined,
        taxRuleOverride: taxRuleOverride ?? undefined,
        travelAllowance,
      });
      toast.success(t('payroll.settingsSaved') || 'Settings saved');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('payroll.errorSavingSettings') || 'Error saving',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-(--text-muted)">
        {t('errors.unauthorized') || 'Access denied'}
      </div>
    );
  }

  if (settings === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="p-0 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/payroll">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary) flex items-center gap-2">
            <Settings className="w-6 h-6" />
            {t('payroll.settings') || 'Payroll Settings'}
          </h1>
          <p className="text-(--text-muted) mt-1">
            {t('payroll.settingsSubtitle') || 'Tax country, currency and payroll preferences'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('payroll.taxAndPayment') || 'Tax & Payment'}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('payroll.countryLabel')}</Label>
            <Select
              value={form.taxCountry}
              onValueChange={(v) => {
                setForm((p) => ({
                  ...p,
                  taxCountry: v as TaxCountry,
                  // Default the currency to the country's currency when switching.
                  currency: TAX_RULES[v as CountryCode]?.currency ?? p.currency,
                }));
                // Brackets/contributions are country-specific — drop any custom
                // override so the editor starts from the new country's defaults.
                setTaxRuleOverride(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="armenia">{t('payroll.armenia')}</SelectItem>
                <SelectItem value="russia">{t('payroll.russia')}</SelectItem>
                <SelectItem value="germany">{t('payroll.germany') || 'Germany'}</SelectItem>
                <SelectItem value="uk">{t('payroll.uk') || 'United Kingdom'}</SelectItem>
                <SelectItem value="poland">{t('payroll.poland') || 'Poland'}</SelectItem>
                <SelectItem value="usa">{t('payroll.usa') || 'United States'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('payroll.taxRegion') || 'Tax region (optional)'}</Label>
            <Input
              value={form.taxRegion}
              onChange={(e) => setForm((p) => ({ ...p, taxRegion: e.target.value }))}
              placeholder="—"
            />
          </div>

          <div className="space-y-2">
            <Label>{t('payroll.currency') || 'Currency'}</Label>
            <Select
              value={form.currency}
              onValueChange={(v) => setForm((p) => ({ ...p, currency: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AMD">AMD</SelectItem>
                <SelectItem value="RUB">RUB</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="PLN">PLN</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('payroll.payFrequency') || 'Pay frequency'}</Label>
            <Select
              value={form.payFrequency}
              onValueChange={(v) => setForm((p) => ({ ...p, payFrequency: v as PayFrequency }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t('payroll.monthly') || 'Monthly'}</SelectItem>
                <SelectItem value="biweekly">{t('payroll.biweekly') || 'Biweekly'}</SelectItem>
                <SelectItem value="weekly">{t('payroll.weekly') || 'Weekly'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('payroll.minimumWage') || 'Minimum wage'}</Label>
            <Input
              type="number"
              min={0}
              value={form.minimumWage || ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, minimumWage: parseFloat(e.target.value) || 0 }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>{t('payroll.maxOvertime') || 'Max overtime hours/month'}</Label>
            <Input
              type="number"
              min={0}
              value={form.maximumOvertime || ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, maximumOvertime: parseFloat(e.target.value) || 0 }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <TaxRuleEditor
        country={form.taxCountry}
        value={taxRuleOverride}
        onChange={setTaxRuleOverride}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('payroll.travelAllowance') || 'Travel allowance'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-(--text-muted)">
            {t('payroll.travelAllowanceHint') ||
              'A monthly transport allowance applied to new employees of this organization. Leave it off if your organization does not pay one.'}
          </p>

          <div className="flex items-center justify-between">
            <Label htmlFor="travel-allowance-enabled">
              {t('payroll.travelAllowanceEnabled') || 'Pay a travel allowance'}
            </Label>
            <Switch
              id="travel-allowance-enabled"
              checked={travelAllowance.enabled}
              onCheckedChange={(v) => setTravelAllowance((p) => ({ ...p, enabled: v }))}
            />
          </div>

          {travelAllowance.enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="travel-allowance-staff">
                  {t('employeeTypes.staff') || 'Staff'} ({form.currency})
                </Label>
                <Input
                  id="travel-allowance-staff"
                  type="number"
                  min={0}
                  value={travelAllowance.staffAmount || ''}
                  onChange={(e) =>
                    setTravelAllowance((p) => ({
                      ...p,
                      staffAmount: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="travel-allowance-contractor">
                  {t('employeeTypes.contractor') || 'Contractor'} ({form.currency})
                </Label>
                <Input
                  id="travel-allowance-contractor"
                  type="number"
                  min={0}
                  value={travelAllowance.contractorAmount || ''}
                  onChange={(e) =>
                    setTravelAllowance((p) => ({
                      ...p,
                      contractorAmount: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="opacity-70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('payroll.notifications') || 'Notifications'}
            <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded bg-(--background-subtle) text-(--text-muted)">
              {t('common.comingSoon') || 'Coming soon'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-(--text-muted)">
            {t('payroll.notificationsDisabledHint') ||
              'Email delivery is not yet wired up. Toggles will be enabled once integration is complete.'}
          </p>
          {[
            {
              key: 'emailNotifications',
              label: t('payroll.emailNotifications') || 'Email notifications',
            },
            {
              key: 'notifyOnCreate',
              label: t('payroll.notifyOnCreate') || 'Notify on run created',
            },
            { key: 'notifyOnApprove', label: t('payroll.notifyOnApprove') || 'Notify on approval' },
            { key: 'notifyOnPay', label: t('payroll.notifyOnPay') || 'Notify on payment' },
            { key: 'notifyEmployee', label: t('payroll.notifyEmployee') || 'Notify employee' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label className="text-(--text-muted)">{label}</Label>
              <Switch
                checked={form[key as keyof typeof form] as boolean}
                onCheckedChange={(v) => setForm((p) => ({ ...p, [key]: v }))}
                disabled
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('payroll.paymentDetails') || 'Payment details'}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('payroll.accountingSystem') || 'Accounting system'}</Label>
            <Input
              value={form.accountingSystem}
              onChange={(e) => setForm((p) => ({ ...p, accountingSystem: e.target.value }))}
              placeholder="1C, QuickBooks…"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('payroll.paymentMethod') || 'Payment method'}</Label>
            <Input
              value={form.paymentMethod}
              onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
              placeholder={t('payroll.bankTransfer') || 'Bank transfer'}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t('payroll.bankName') || 'Bank name'}</Label>
            <Input
              value={form.bankName}
              onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !orgId}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {t('common.save') || 'Save'}
        </Button>
      </div>
    </div>
  );
}
