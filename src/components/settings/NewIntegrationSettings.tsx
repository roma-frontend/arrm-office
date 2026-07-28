'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthUser } from '@/store/useAuthStore';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Check, X, RefreshCw, Clock, ExternalLink } from 'lucide-react';

/** Mirror of the server-side placeholder for stored credentials. */
const SECRET_MASK = '••••••••';

const SECRET_FIELDS = new Set(['apiKey', 'clientSecret', 'apiPassword']);

const PROVIDERS = [
  {
    id: 'lucky_carrot' as const,
    name: 'Lucky Carrot',
    icon: '🥕',
    desc: 'Employee recognition & rewards platform',
    color: '#f97316',
    docUrl: 'https://luckycarrotapp.com/integrations',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'lc_...' },
      { key: 'apiUrl', label: 'API URL', type: 'text', placeholder: 'https://api.luckycarrot.com' },
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'text',
        placeholder: 'https://yourapp.com/webhook/lucky-carrot',
      },
    ],
    toggles: [{ key: 'autoSyncEmployees', label: 'Auto-sync employees' }],
  },
  {
    id: 'imid' as const,
    name: 'imID',
    icon: '🆔',
    desc: 'Armenian digital identity & e-signature',
    color: '#3b82f6',
    docUrl: 'https://imid.am/integration',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'imid_client_...' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: '••••••••' },
      {
        key: 'redirectUri',
        label: 'Redirect URI',
        type: 'text',
        placeholder: 'https://yourapp.com/auth/imid/callback',
      },
    ],
    toggles: [
      { key: 'enableLogin', label: 'Enable login with imID' },
      { key: 'enableSigning', label: 'Enable e-signature (imID Sign)' },
      { key: 'enableVerification', label: 'Enable employee verification' },
    ],
  },
  {
    id: 'armsoft' as const,
    name: 'ՀԾ Armsoft',
    icon: '🇦🇲',
    desc: 'Armenian ERP — HR & payroll data sync',
    color: '#dc2626',
    docUrl: 'https://armsoft.am/api',
    fields: [
      {
        key: 'apiEndpoint',
        label: 'API Endpoint',
        type: 'text',
        placeholder: 'https://api.armsoft.am/v1',
      },
      { key: 'apiUsername', label: 'Username', type: 'text', placeholder: 'org_admin' },
      { key: 'apiPassword', label: 'Password', type: 'password', placeholder: '••••••••' },
    ],
    toggles: [
      { key: 'syncEmployees', label: 'Sync employee directory' },
      { key: 'syncPayroll', label: 'Sync payroll data' },
    ],
    extraFields: [
      {
        key: 'syncSchedule',
        label: 'Sync schedule (cron)',
        type: 'text',
        placeholder: '0 3 * * *',
      },
    ],
  },
];

export default function NewIntegrationSettings() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const organizationId = useSelectedOrganization() as Id<'organizations'> | undefined;

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, any>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);

  const configs = useQuery(
    api.integrations.getAllIntegrationConfigs,
    organizationId ? { organizationId } : 'skip',
  );
  const saveConfig = useMutation(api.integrations.saveIntegrationConfig);
  const syncIntegration = useAction(api.integrations.syncIntegration);

  if (!organizationId || !user) return <ShieldLoader />;

  const getConfig = (providerId: string) => {
    return configs?.find((c) => c.provider === providerId)?.config;
  };

  // Secrets never leave the server — the query returns a mask. Show such fields
  // empty and label them as already set, so an untouched field means "keep".
  const isSecretSet = (providerId: string, fieldKey: string) => {
    const cfg = getConfig(providerId);
    return (cfg as any)?.[fieldKey] === SECRET_MASK;
  };

  const getFieldValue = (providerId: string, fieldKey: string) => {
    const local = formState[`${providerId}_${fieldKey}`];
    if (local !== undefined) return local;
    const stored = (getConfig(providerId) as any)?.[fieldKey];
    return stored === SECRET_MASK ? '' : (stored ?? '');
  };

  const getToggleValue = (providerId: string, toggleKey: string) => {
    const cfg = getConfig(providerId);
    return formState[`${providerId}_${toggleKey}`] ?? (cfg as any)?.[toggleKey] ?? false;
  };

  const handleExpand = (providerId: string) => {
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
    // Reset form state for this provider
    setFormState({});
  };

  const handleFieldChange = (providerId: string, fieldKey: string, value: string) => {
    setFormState((prev) => ({ ...prev, [`${providerId}_${fieldKey}`]: value }));
  };

  const handleToggleChange = (providerId: string, toggleKey: string, value: boolean) => {
    setFormState((prev) => ({ ...prev, [`${providerId}_${toggleKey}`]: value }));
  };

  const handleSave = async (providerId: string) => {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;

    setSavingProvider(providerId);
    try {
      const config: any = { isEnabled: true };

      for (const field of provider.fields) {
        const val = getFieldValue(providerId, field.key);
        if (val) config[field.key] = val;
      }
      for (const toggle of provider.toggles) {
        config[toggle.key] = getToggleValue(providerId, toggle.key);
      }
      if (provider.extraFields) {
        for (const field of provider.extraFields) {
          const val = getFieldValue(providerId, field.key);
          if (val) config[field.key] = val;
        }
      }

      await saveConfig({
        organizationId,
        provider: providerId as any,
        config,
      });
      toast.success(t('admin.integrations.saved', { provider: provider.name }));
      // Drop local edits so freshly saved values come back from the server.
      setFormState({});
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSavingProvider(null);
    }
  };

  const handleSync = async (providerId: string) => {
    setSyncing(providerId);
    try {
      await syncIntegration({
        organizationId,
        provider: providerId as any,
      });
      toast.success(t('admin.integrations.syncStarted', 'Sync started'));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSyncing(null);
    }
  };

  const providerLabelKey = (pId: string, suffix: string) =>
    `admin.integrationProviders.${pId}.${suffix}`;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-(--background)/95 backdrop-blur border-b border-(--border)">
        <h1 className="text-2xl font-bold">{t('admin.integrations.title', 'Integrations')}</h1>
        <p className="text-sm text-(--text-muted) mt-1">
          {t(
            'admin.integrations.subtitle',
            'Connect third-party services to extend platform capabilities',
          )}
        </p>
      </div>

      {PROVIDERS.map((provider) => {
        const config = getConfig(provider.id);
        const isEnabled = config?.isEnabled ?? false;
        const isExpanded = expandedProvider === provider.id;
        const lastSync = config?.lastSyncAt;
        const syncStatus = config?.syncStatus;

        return (
          <Card
            key={provider.id}
            className={`border-l-4 ${isEnabled ? '' : 'opacity-70'}`}
            style={{ borderLeftColor: provider.color }}
          >
            <CardHeader className="pb-3 cursor-pointer" onClick={() => handleExpand(provider.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{provider.icon}</span>
                  <div>
                    <CardTitle className="text-lg">{provider.name}</CardTitle>
                    <p className="text-xs text-(--text-muted)">
                      {t(providerLabelKey(provider.id, 'desc'), provider.desc)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isEnabled ? (
                    <Badge variant="default" className="bg-emerald-500">
                      <Check className="w-3 h-3 mr-1" /> {t('common.active', 'Active')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t('common.inactive', 'Inactive')}</Badge>
                  )}
                  {lastSync && (
                    <span className="text-xs text-(--text-muted) flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(lastSync).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="border-t pt-4 space-y-4">
                {/* Status & Sync */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-(--background-subtle)">
                  <div className="flex items-center gap-2">
                    {syncStatus === 'success' ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : syncStatus === 'error' ? (
                      <X className="w-4 h-4 text-red-500" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-(--text-muted)" />
                    )}
                    <div className="min-w-0">
                      <span className="text-sm">
                        {syncStatus === 'success'
                          ? t('admin.integrations.connected', 'Connected')
                          : syncStatus === 'error'
                            ? t('admin.integrations.error', 'Sync error')
                            : t('admin.integrations.notConnected', 'Not connected')}
                      </span>
                      {syncStatus === 'error' && config?.lastError && (
                        <p className="text-[11px] text-red-500 mt-0.5 line-clamp-2 break-words">
                          {config.lastError}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSync(provider.id)}
                    disabled={syncing === provider.id || !isEnabled}
                  >
                    {syncing === provider.id ? (
                      <ShieldLoader size="xs" variant="inline" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    {t('admin.integrations.sync', 'Sync Now')}
                  </Button>
                </div>

                {/* Configuration Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {provider.fields.map((field) => {
                    const secretSet =
                      SECRET_FIELDS.has(field.key) && isSecretSet(provider.id, field.key);
                    return (
                      <div key={field.key}>
                        <Label>
                          {t(providerLabelKey(provider.id, `field.${field.key}`), field.label)}
                        </Label>
                        <Input
                          type={field.type}
                          value={getFieldValue(provider.id, field.key)}
                          onChange={(e) =>
                            handleFieldChange(provider.id, field.key, e.target.value)
                          }
                          placeholder={secretSet ? SECRET_MASK : field.placeholder}
                          className="mt-1"
                          autoComplete={field.type === 'password' ? 'new-password' : undefined}
                        />
                        {secretSet && (
                          <p className="text-[11px] text-(--text-muted) mt-1">
                            {t(
                              'admin.integrations.secretSet',
                              'Saved — leave blank to keep the current value',
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  {provider.toggles.map((toggle) => (
                    <div key={toggle.key} className="flex items-center justify-between">
                      <Label className="cursor-pointer">
                        {t(providerLabelKey(provider.id, `toggle.${toggle.key}`), toggle.label)}
                      </Label>
                      <Switch
                        checked={getToggleValue(provider.id, toggle.key)}
                        onCheckedChange={(v) => handleToggleChange(provider.id, toggle.key, v)}
                      />
                    </div>
                  ))}
                </div>

                {/* Extra Fields */}
                {provider.extraFields && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {provider.extraFields.map((field) => (
                      <div key={field.key}>
                        <Label>
                          {t(providerLabelKey(provider.id, `extraField.${field.key}`), field.label)}
                        </Label>
                        <Input
                          type={field.type}
                          value={getFieldValue(provider.id, field.key)}
                          onChange={(e) =>
                            handleFieldChange(provider.id, field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                          className="mt-1"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <a
                    href={provider.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />{' '}
                    {t('admin.integrations.viewDocs', 'View documentation')}
                  </a>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={savingProvider === provider.id}
                      onClick={() => handleExpand(provider.id)}
                    >
                      {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button
                      onClick={() => handleSave(provider.id)}
                      disabled={savingProvider === provider.id}
                    >
                      {savingProvider === provider.id
                        ? t('common.saving', 'Saving...')
                        : t('common.save', 'Save Configuration')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
