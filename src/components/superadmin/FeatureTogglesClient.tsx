/**
 * Feature toggles — full management console.
 *
 * Every shipped feature with its global switch and per-organization
 * overrides. Flip a global toggle to roll a feature out (or back) across the
 * platform; add an org override to enable/disable it for one customer — all
 * without a deployment.
 */

'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Building2, ToggleLeft, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { cn } from '@/lib/utils';
import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';
import type { Id } from '@/convex/_generated/dataModel';

export function FeatureTogglesClient() {
  const { t } = useTranslation();
  const router = useRouter();
  // The org scope is chosen right here on the page (and stays in sync with the
  // sidebar selector via the shared store). No org selected → toggles are
  // platform-global; an org selected → toggles flip that org's override only.
  const selectedOrgId = useOrgSelectorStore((s) => s.selectedOrgId);
  const setSelectedOrgId = useOrgSelectorStore((s) => s.setSelectedOrgId);

  const toggles = useQuery(
    api.superadmin.featureToggles.listFeatureToggles,
    selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : {},
  );
  const setFeatureToggle = useMutation(api.superadmin.featureToggles.setFeatureToggle);
  const setOrgOverride = useMutation(api.superadmin.featureToggles.setOrgFeatureOverride);
  const orgs = useQuery(api.organizations.getAllOrganizations, {});

  const [openFeature, setOpenFeature] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [overrideOrg, setOverrideOrg] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  // Confirming a GLOBAL flip (no org chosen) so an accidental click can't
  // disable a feature for every organization on the platform.
  const [confirmGlobal, setConfirmGlobal] = useState<{ key: string; enabled: boolean } | null>(
    null,
  );

  const selectedOrg = (orgs ?? []).find((o) => o._id === selectedOrgId);

  const applyToggle = async (key: string, enabled: boolean) => {
    setBusyKey(key);
    try {
      if (selectedOrgId) {
        await setOrgOverride({
          key,
          organizationId: selectedOrgId as Id<'organizations'>,
          enabled,
        });
        toast.success(
          t('superadmin.toggles.orgUpdated', 'Updated for {{org}} only', {
            org: selectedOrg?.name ?? '',
          }),
        );
      } else {
        await setFeatureToggle({ key, enabled });
        toast.success(t('superadmin.toggles.updated', 'Toggle updated globally'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the toggle');
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggle = (key: string, enabled: boolean) => {
    if (!selectedOrgId) {
      // Global flip — require explicit confirmation.
      setConfirmGlobal({ key, enabled });
      return;
    }
    void applyToggle(key, enabled);
  };

  if (!toggles) {
    return (
      <div className="flex items-center justify-center py-24">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div>
        <div className="my-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/superadmin')}
            aria-label={t('actions.back', 'Back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--text-primary)' }}>
              {t('superadmin.toggles.title', 'Feature toggles')}
            </h1>
            <p className="mt-0.5 text-sm text-(--text-muted)">
              {t(
                'superadmin.toggles.subtitle',
                'Roll features out and back without a deployment — globally or per organization',
              )}
            </p>
          </div>
          {/* Scope picker — the single most important control on this page.
              No org → global. One org → that org's override only. */}
          <div className="ml-auto shrink-0">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
              {t('superadmin.toggles.scopeLabel', 'Apply to')}
            </label>
            <select
              value={selectedOrgId ?? ''}
              onChange={(e) => setSelectedOrgId(e.target.value || null)}
              className="mt-1 h-9 min-w-[220px] rounded-lg border border-(--input-border) bg-(--input) px-2 text-sm font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--brand-text)"
            >
              <option value="">
                {t('superadmin.toggles.scopeGlobal', '🌍 All organizations (global)')}
              </option>
              {(orgs ?? []).map((org) => (
                <option key={org._id} value={org._id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          {toggles.map((toggle) => (
            <Card key={toggle.key}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-(--text-primary)">
                      {t(toggle.labelKey, toggle.key)}
                    </span>
                    <code className="font-mono text-[11px] text-(--text-muted)">{toggle.key}</code>
                    {toggle.enabled ? (
                      <Badge
                        variant="outline"
                        className="border-(--success-outline) bg-(--success-quiet) text-(--success-text)"
                      >
                        {t('superadmin.toggles.enabled', 'Enabled')}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-(--danger-outline) bg-(--danger-quiet) text-(--danger-text)"
                      >
                        {t('superadmin.toggles.disabled', 'Disabled')}
                      </Badge>
                    )}
                    {selectedOrgId && toggle.isOverridden && (
                      <Badge variant="outline" className="text-[10px]">
                        {t('superadmin.toggles.orgOverrideBadge', 'org override')}
                      </Badge>
                    )}
                    {!selectedOrgId && toggle.isOverridden && (
                      <Badge variant="outline" className="text-[10px]">
                        {t('superadmin.toggles.globalOverride', 'global override')}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-(--text-muted)">
                    {t(toggle.descriptionKey, toggle.description ?? '')}
                  </p>
                  {toggle.orgOverrideCount > 0 && (
                    <p className="mt-0.5 text-[11px] text-(--text-muted)">
                      {t('superadmin.toggles.orgOverrides', '{{count}} organization overrides', {
                        count: toggle.orgOverrideCount,
                      })}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setOpenFeature(toggle.key)}
                  >
                    <Building2 className="h-3.5 w-3.5 mr-1" />
                    {t('superadmin.toggles.orgOverrides', 'Org overrides', {
                      count: toggle.orgOverrideCount,
                    })}
                  </Button>
                  <button
                    type="button"
                    disabled={busyKey === toggle.key}
                    onClick={() => handleToggle(toggle.key, !toggle.enabled)}
                    aria-label={toggle.key}
                    className={cn(
                      'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
                      toggle.enabled ? 'bg-(--brand)' : 'bg-(--text-muted)/30',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                        toggle.enabled ? 'left-[22px]' : 'left-0.5',
                      )}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Org overrides sheet */}
      <Sheet open={openFeature !== null} onOpenChange={(open) => !open && setOpenFeature(null)}>
        <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
          {openFeature && (
            <OrgOverridesPanel
              featureKey={openFeature}
              orgs={orgs ?? []}
              overrideOrg={overrideOrg}
              setOverrideOrg={setOverrideOrg}
              overrideEnabled={overrideEnabled}
              setOverrideEnabled={setOverrideEnabled}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm a GLOBAL flip — no org chosen means every org changes. */}
      {confirmGlobal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-(--border) bg-(--card) p-5 shadow-2xl">
            <h3 className="flex items-center gap-2 text-base font-semibold text-(--danger-text)">
              <AlertTriangle className="h-5 w-5" />
              {t('superadmin.toggles.globalConfirmTitle', 'This affects ALL organizations')}
            </h3>
            <p className="mt-2 text-sm text-(--text-muted)">
              {t(
                'superadmin.toggles.globalConfirmBody',
                'No organization is selected, so this change applies to every organization on the platform. To change just one organization, pick it from the "Apply to" selector first.',
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmGlobal(null)}>
                {t('superadmin.toggles.cancel', 'Cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={busyKey === confirmGlobal.key}
                onClick={() => {
                  const { key, enabled } = confirmGlobal;
                  setConfirmGlobal(null);
                  void applyToggle(key, enabled);
                }}
              >
                {t('superadmin.toggles.confirmGlobalApply', 'Apply to all organizations')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrgOverridesPanel({
  featureKey,
  orgs,
  overrideOrg,
  setOverrideOrg,
  overrideEnabled,
  setOverrideEnabled,
}: {
  featureKey: string;
  orgs: Array<{ _id: string; name: string }>;
  overrideOrg: string;
  setOverrideOrg: (v: string) => void;
  overrideEnabled: boolean;
  setOverrideEnabled: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const listOrgOverrides = useQuery(api.superadmin.featureToggles.listFeatureOrgOverrides, {
    key: featureKey,
  });
  const setOrgOverride = useMutation(api.superadmin.featureToggles.setOrgFeatureOverride);
  const removeOrgOverride = useMutation(api.superadmin.featureToggles.removeOrgFeatureOverride);
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!overrideOrg) return;
    setBusy(true);
    try {
      await setOrgOverride({
        key: featureKey,
        organizationId: overrideOrg as Id<'organizations'>,
        enabled: overrideEnabled,
      });
      toast.success(t('superadmin.toggles.overrideAdded', 'Override added'));
      setOverrideOrg('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the override');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (orgId: string) => {
    setBusy(true);
    try {
      await removeOrgOverride({ key: featureKey, organizationId: orgId as Id<'organizations'> });
      toast.success(t('superadmin.toggles.overrideRemoved', 'Override removed'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the override');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 font-mono text-sm">
          <ToggleLeft className="h-4 w-4 text-(--brand-text)" />
          {featureKey}
          <span className="text-(--text-muted)">
            · {t('superadmin.toggles.orgOverrides', 'Org overrides')}
          </span>
        </SheetTitle>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* Add override */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t('superadmin.toggles.addOverride', 'Add organization override')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={overrideOrg}
              onChange={(e) => setOverrideOrg(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-(--input-border) bg-(--input) px-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--brand-text)"
            >
              <option value="">{t('superadmin.toggles.selectOrg', 'Select organization…')}</option>
              {orgs.map((org) => (
                <option key={org._id} value={org._id}>
                  {org.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-(--text-secondary)">
              <input
                type="checkbox"
                checked={overrideEnabled}
                onChange={(e) => setOverrideEnabled(e.target.checked)}
                className="h-3.5 w-3.5 accent-(--brand)"
              />
              {t('superadmin.toggles.enabled', 'Enabled')}
            </label>
            <Button size="sm" disabled={!overrideOrg || busy} onClick={handleAdd}>
              {t('superadmin.toggles.add', 'Add')}
            </Button>
          </CardContent>
        </Card>

        {/* Existing overrides */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t('superadmin.toggles.existingOverrides', 'Existing overrides')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {listOrgOverrides === undefined ? (
              <div className="flex justify-center py-6">
                <ShieldLoader size="sm" />
              </div>
            ) : listOrgOverrides.length === 0 ? (
              <p className="py-4 text-center text-sm text-(--text-muted)">
                {t('superadmin.toggles.noOverrides', 'No organization overrides')}
              </p>
            ) : (
              listOrgOverrides.map((row) => (
                <div
                  key={row.organizationId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-(--border) px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-(--text-primary)">
                      {row.organizationName}
                    </p>
                    <p className="text-[11px] text-(--text-muted)">
                      {row.enabled
                        ? t('superadmin.toggles.enabled', 'Enabled')
                        : t('superadmin.toggles.disabled', 'Disabled')}
                      {' · '}
                      {new Date(row.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setOrgOverride({
                          key: featureKey,
                          organizationId: row.organizationId as Id<'organizations'>,
                          enabled: !row.enabled,
                        })
                      }
                      className="rounded-md border border-(--border) px-2 py-1 text-[11px] text-(--text-secondary) transition-colors hover:bg-(--background-subtle)"
                    >
                      {row.enabled
                        ? t('superadmin.toggles.disable', 'Disable')
                        : t('superadmin.toggles.enable', 'Enable')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRemove(row.organizationId as Id<'organizations'>)}
                      className="rounded-md p-1.5 text-(--danger-text) transition-colors hover:bg-(--danger-quiet)"
                      aria-label={t('superadmin.toggles.remove', 'Remove override')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default FeatureTogglesClient;
