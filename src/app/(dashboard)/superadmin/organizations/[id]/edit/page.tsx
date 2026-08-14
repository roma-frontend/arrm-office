'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Save, ArrowLeft, Snowflake, Trash2 } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { CustomSelect } from '@/components/ui/CustomSelect';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export default function EditOrganizationPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const { user } = useAuthStore();
  const orgId = params.id as string;
  const isSuperadmin = user?.role === 'superadmin';

  // Check if admin is trying to access their own organization
  const isOwnOrganization = user?.organizationId === orgId;
  const canAccess = isSuperadmin || (user?.role === 'admin' && isOwnOrganization);

  const organization = useQuery(
    api.organizations.getOrganizationById,
    user?.id && orgId && canAccess
      ? { callerUserId: user.id as Id<'users'>, organizationId: orgId as Id<'organizations'> }
      : 'skip',
  );

  const updateOrg = useMutation(api.organizations.updateOrganization);
  const freezeOrg = useMutation(api.superadmin.freezeOrganization);
  const unfreezeOrg = useMutation(api.superadmin.unfreezeOrganization);
  const deleteOrg = useMutation(api.superadmin.secureDeleteOrganization);

  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [dangerBusy, setDangerBusy] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    plan: 'starter' as 'starter' | 'professional' | 'enterprise',
    isActive: true,
    timezone: 'UTC',
    country: '',
    industry: '',
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name,
        plan: organization.plan,
        isActive: organization.isActive,
        timezone: organization.timezone || 'UTC',
        country: organization.country || '',
        industry: organization.industry || '',
      });
    }
  }, [organization]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!isSuperadmin && !canAccess) {
      router.push('/dashboard');
    }
  }, [user, isSuperadmin, canAccess, router]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!isSuperadmin && !canAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('ui.accessDenied')}</h1>
          <p className="text-muted-foreground">You can only manage your own organization</p>
          <p className="text-xs text-muted-foreground mt-2">
            {t('common.superadmin')}: {user.role} | {t('common.organization')}:{' '}
            {user.organizationId} | {t('common.requestedBy')}: {orgId}
          </p>
        </div>
      </div>
    );
  }

  if (organization === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('common.organization')} Not Found</h1>
          <p className="text-muted-foreground">{t('common.noOrgFound')}</p>
          <button
            onClick={() => router.push('/superadmin/organizations')}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white"
          >
            {t('ui.backToOrganizations')}
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await updateOrg({
        superadminUserId: user.id as Id<'users'>,
        organizationId: orgId as Id<'organizations'>,
        name: formData.name,
        plan: formData.plan,
        isActive: formData.isActive,
        timezone: formData.timezone,
        country: formData.country || undefined,
        industry: formData.industry || undefined,
      });

      toast.success(t('toasts.orgUpdated'));
      router.push('/superadmin/organizations');
    } catch (error) {
      logger.error('Failed to update organization:', error);
      toast.error(error instanceof Error ? error.message : t('toasts.orgUpdateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="mb-8">
            <button
              onClick={() => router.push('/superadmin/organizations')}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('ui.backToOrganizations')}
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl btn-gradient text-white">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {t('organization.editPageTitle')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t('organization.slugLabel')}:{' '}
                  <span className="font-mono">{organization.slug}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-xl border space-y-6 animate-fade-in"
          style={{ background: 'var(--card)' }}
        >
          {/* Organization Name */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('organization.nameLabel')} *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              style={{
                background: 'var(--input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              placeholder={t('placeholders.auraMedicalCenter')}
            />
          </div>

          {/* Plan */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('organization.planLabel')} *
            </label>
            <CustomSelect
              value={formData.plan}
              onChange={(v) =>
                setFormData({ ...formData, plan: v as 'starter' | 'professional' | 'enterprise' })
              }
              fullWidth
              options={[
                { value: 'starter', label: t('organization.planStarter') },
                { value: 'professional', label: t('organization.planProfessional') },
                { value: 'enterprise', label: t('organization.planEnterprise') },
              ]}
              triggerClassName="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              dropdownClassName="bg-[var(--input)] border-[var(--border)] text-[var(--text-primary)]"
            />
          </div>

          {/* Status */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-5 h-5 rounded border-(--border-strong) text-primary focus:ring-primary"
              />
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('organization.statusLabel')}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t('organization.statusActiveDesc')}
                </p>
              </div>
            </label>
          </div>

          {/* Timezone */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('organization.timezoneLabel')}
            </label>
            <CustomSelect
              value={formData.timezone}
              onChange={(v) => setFormData({ ...formData, timezone: v })}
              fullWidth
              options={[
                { value: 'UTC', label: t('organization.timezoneUTC') },
                { value: 'America/New_York', label: t('organization.timezoneET') },
                { value: 'America/Chicago', label: t('organization.timezoneCT') },
                { value: 'America/Denver', label: t('organization.timezoneMT') },
                { value: 'America/Los_Angeles', label: t('organization.timezonePT') },
                { value: 'Europe/London', label: t('organization.timezoneGMT') },
                { value: 'Europe/Paris', label: t('organization.timezoneCET') },
                { value: 'Asia/Dubai', label: t('organization.timezoneGST') },
                { value: 'Asia/Tokyo', label: t('organization.timezoneJST') },
                { value: 'Australia/Sydney', label: t('organization.timezoneAEST') },
              ]}
              triggerClassName="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              dropdownClassName="bg-[var(--input)] border-[var(--border)] text-[var(--text-primary)]"
            />
          </div>

          {/* Country */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('organization.countryLabel')}
            </label>
            <input
              type="text"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              style={{
                background: 'var(--input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              placeholder={t('placeholders.unitedStates')}
            />
          </div>

          {/* Industry */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('organization.industryLabel')}
            </label>
            <input
              type="text"
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              style={{
                background: 'var(--input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              placeholder={t('placeholders.healthcareTechnology')}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30">
            <div>
              <p className="text-xs text-muted-foreground">{t('organization.totalEmployees')}</p>
              <p className="text-lg font-semibold">{organization.employeeCount || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('organization.activeEmployees')}</p>
              <p className="text-lg font-semibold text-(--success-text)">
                {organization.employeeCount || 0}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.push('/superadmin/organizations')}
              className="flex-1 px-6 py-2.5 rounded-lg border font-semibold transition-all hover:bg-muted"
              style={{ borderColor: 'var(--border)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-6 py-2.5 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 btn-gradient text-white"
            >
              {isLoading ? (
                <>
                  <ShieldLoader size="xs" variant="inline" />
                  {t('buttons.saving')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {t('buttons.saveChanges')}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Danger zone — superadmin only: freeze or permanently delete */}
        {isSuperadmin && (
          <div
            className="mt-6 space-y-4 rounded-xl border border-red-500/30 p-6 animate-fade-in"
            style={{ background: 'var(--card)' }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('organization.dangerZone')}
            </h2>

            {organization.frozenAt && (
              <p
                className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                <Snowflake className="mr-1 inline h-4 w-4 text-blue-500" />
                {t('organization.frozenBanner', { reason: organization.frozenReason ?? '' })}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              {organization.frozenAt ? (
                <button
                  type="button"
                  disabled={dangerBusy}
                  onClick={async () => {
                    setDangerBusy(true);
                    try {
                      await unfreezeOrg({ organizationId: orgId as Id<'organizations'> });
                      toast.success(t('organization.unfrozenToast'));
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Failed');
                    } finally {
                      setDangerBusy(false);
                    }
                  }}
                  className="flex-1 rounded-lg border border-blue-500/40 px-4 py-2.5 font-semibold text-blue-500 transition-all hover:bg-blue-500/10 disabled:opacity-50"
                >
                  {t('organization.unfreeze')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={dangerBusy}
                  onClick={() => {
                    setFreezeReason('');
                    setFreezeOpen(true);
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-500/40 px-4 py-2.5 font-semibold text-amber-500 transition-all hover:bg-amber-500/10 disabled:opacity-50"
                >
                  <Snowflake className="h-4 w-4" />
                  {t('organization.freeze')}
                </button>
              )}

              <button
                type="button"
                disabled={dangerBusy}
                onClick={() => {
                  setConfirmSlug('');
                  setDeleteOpen(true);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {t('organization.delete')}
              </button>
            </div>
          </div>
        )}

        {/* Freeze dialog — reason is mandatory and shown to employees */}
        <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('organization.freezeTitle')}</DialogTitle>
              <DialogDescription>{t('organization.freezeDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('organization.freezeReasonLabel')}
              </label>
              <Textarea
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                placeholder={t('organization.freezeReasonPlaceholder')}
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => setFreezeOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={dangerBusy || !freezeReason.trim()}
                onClick={async () => {
                  setDangerBusy(true);
                  try {
                    await freezeOrg({
                      organizationId: orgId as Id<'organizations'>,
                      reason: freezeReason,
                    });
                    toast.success(t('organization.frozenToast'));
                    setFreezeOpen(false);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Failed');
                  } finally {
                    setDangerBusy(false);
                  }
                }}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t('organization.freeze')}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Hard delete dialog — slug confirmation */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('organization.deleteTitle')}</DialogTitle>
              <DialogDescription>{t('organization.deleteDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('organization.deleteConfirmLabel')}:{' '}
                <span className="font-mono">{organization.slug}</span>
              </label>
              <input
                type="text"
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                className="w-full rounded-lg border px-4 py-2 outline-none"
                style={{
                  background: 'var(--input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => setDeleteOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={dangerBusy || confirmSlug.trim() !== organization.slug}
                onClick={async () => {
                  setDangerBusy(true);
                  try {
                    await deleteOrg({
                      organizationId: orgId as Id<'organizations'>,
                      confirmSlug,
                    });
                    toast.success(t('organization.deleteToast'));
                    router.push('/superadmin/organizations');
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Failed');
                    setDangerBusy(false);
                  }
                }}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t('organization.delete')}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
