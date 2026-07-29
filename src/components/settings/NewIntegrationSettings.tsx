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
import {
  Check,
  X,
  RefreshCw,
  Clock,
  ExternalLink,
  Trash2,
  SkipForward,
  Copy,
  KeyRound,
} from 'lucide-react';

/** Mirror of the server-side placeholder for stored credentials. */
const SECRET_MASK = '••••••••';

const SECRET_FIELDS = new Set(['apiKey', 'clientSecret', 'apiPassword']);

/**
 * Shared advanced options. Provider payload shapes are not fixed, so an admin
 * can point the sync at the right path and name the fields without a code change.
 */
const MAPPING_FIELDS = [
  {
    key: 'employeesPath',
    label: 'Employees endpoint path',
    type: 'text',
    placeholder: '/api/v1/employees',
  },
  {
    key: 'employeesListKey',
    label: 'Employees list key',
    type: 'text',
    placeholder: 'data.items',
  },
  {
    key: 'fieldMap',
    label: 'Field mapping (JSON)',
    type: 'text',
    placeholder: '{"email":"work_email","name":"full_name"}',
  },
];

const PROVIDERS = [
  {
    id: 'lucky_carrot' as const,
    name: 'Lucky Carrot',
    icon: '🥕',
    desc: 'Employee recognition & rewards platform',
    color: '#f97316',
    docUrl: 'https://luckycarrotapp.com/integrations',
    /** This provider pulls an employee directory. */
    imports: true,
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
    toggles: [
      { key: 'autoSyncEmployees', label: 'Auto-sync employees' },
      { key: 'deactivateMissing', label: 'Deactivate employees missing from the provider' },
      { key: 'webhookEnabled', label: 'Accept inbound webhooks' },
    ],
    extraFields: [
      {
        key: 'syncSchedule',
        label: 'Sync schedule (cron)',
        type: 'text',
        placeholder: '0 3 * * *',
      },
      ...MAPPING_FIELDS,
    ],
  },
  {
    id: 'imid' as const,
    name: 'imID',
    icon: '🆔',
    desc: 'Armenian digital identity & e-signature',
    color: '#3b82f6',
    docUrl: 'https://imid.am/integration',
    imports: false,
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
    extraFields: [
      {
        key: 'tokenPath',
        label: 'OAuth token URL',
        type: 'text',
        placeholder: 'https://api.imid.am/v1/oauth/token',
      },
      {
        key: 'authorizePath',
        label: 'OAuth authorize URL',
        type: 'text',
        placeholder: 'https://api.imid.am/v1/oauth/authorize',
      },
      {
        key: 'userInfoPath',
        label: 'UserInfo URL',
        type: 'text',
        placeholder: 'https://api.imid.am/v1/oauth/userinfo',
      },
      {
        key: 'signingPath',
        label: 'Signing API URL',
        type: 'text',
        placeholder: 'https://api.imid.am/v1/sign',
      },
    ],
  },
  {
    id: 'armsoft' as const,
    name: 'ՀԾ Armsoft',
    icon: '🇦🇲',
    desc: 'Armenian ERP — HR & payroll data sync',
    color: '#dc2626',
    docUrl: 'https://armsoft.am/api',
    imports: true,
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
      { key: 'deactivateMissing', label: 'Deactivate employees missing from the provider' },
    ],
    extraFields: [
      {
        key: 'syncSchedule',
        label: 'Sync schedule (cron)',
        type: 'text',
        placeholder: '0 3 * * *',
      },
      ...MAPPING_FIELDS,
    ],
  },
];

type ProviderId = (typeof PROVIDERS)[number]['id'];

export default function NewIntegrationSettings() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const organizationId = useSelectedOrganization() as Id<'organizations'> | undefined;

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, any>>({});
  /** Secret fields the admin explicitly cleared, keyed `provider_field`. */
  const [clearedSecrets, setClearedSecrets] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [logsProvider, setLogsProvider] = useState<ProviderId | null>(null);
  /**
   * A freshly minted webhook secret. The server returns it exactly once, so it
   * is held here until the admin navigates away — never re-fetchable.
   */
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [rotatingSecret, setRotatingSecret] = useState(false);

  const configs = useQuery(
    api.integrations.getAllIntegrationConfigs,
    organizationId ? { organizationId } : 'skip',
  );
  const saveConfig = useMutation(api.integrations.saveIntegrationConfig);
  const syncIntegration = useAction(api.integrations.syncIntegration);
  const rotateWebhookSecret = useMutation(api.integrations.rotateWebhookSecret);

  // Logs are only fetched for the card whose history is open.
  const syncLogs = useQuery(
    api.integrations.getSyncLogs,
    organizationId && logsProvider ? { organizationId, provider: logsProvider } : 'skip',
  );

  if (!organizationId || !user) return <ShieldLoader />;

  const getConfig = (providerId: string) => {
    return configs?.find((c) => c.provider === providerId)?.config;
  };

  // Secrets never leave the server — the query returns a mask. Show such fields
  // empty and label them as already set, so an untouched field means "keep".
  const isSecretSet = (providerId: string, fieldKey: string) => {
    if (clearedSecrets[`${providerId}_${fieldKey}`]) return false;
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

  // Enablement resolves the same way for the switch and for the save payload, so
  // the card can never show one state and persist another. A provider with no
  // saved config yet defaults to on: filling in credentials and hitting Save
  // should produce a working integration, not a silently disabled one.
  const getIsEnabled = (providerId: string) => {
    const stored = getConfig(providerId) as any;
    return formState[`${providerId}_isEnabled`] ?? stored?.isEnabled ?? !stored;
  };

  const handleExpand = (providerId: string) => {
    const closing = expandedProvider === providerId;
    setExpandedProvider(closing ? null : providerId);
    if (closing) setLogsProvider(null);
    // Discard unsaved edits for the card being left behind.
    setFormState({});
    setClearedSecrets({});
    // Stop showing a one-time secret once the admin leaves the card.
    setNewWebhookSecret(null);
  };

  const handleFieldChange = (providerId: string, fieldKey: string, value: string) => {
    setFormState((prev) => ({ ...prev, [`${providerId}_${fieldKey}`]: value }));
    // Typing a new secret supersedes a pending clear.
    if (value && SECRET_FIELDS.has(fieldKey)) {
      setClearedSecrets((prev) => {
        if (!prev[`${providerId}_${fieldKey}`]) return prev;
        const next = { ...prev };
        delete next[`${providerId}_${fieldKey}`];
        return next;
      });
    }
  };

  const handleClearSecret = (providerId: string, fieldKey: string) => {
    setClearedSecrets((prev) => ({ ...prev, [`${providerId}_${fieldKey}`]: true }));
    setFormState((prev) => ({ ...prev, [`${providerId}_${fieldKey}`]: '' }));
  };

  const handleToggleChange = (providerId: string, toggleKey: string, value: boolean) => {
    setFormState((prev) => ({ ...prev, [`${providerId}_${toggleKey}`]: value }));
  };

  const handleSave = async (providerId: string) => {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;

    setSavingProvider(providerId);
    try {
      const config: any = {
        isEnabled: getIsEnabled(providerId),
      };

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

      const clearSecrets = Object.keys(clearedSecrets)
        .filter((k) => clearedSecrets[k] && k.startsWith(`${providerId}_`))
        .map((k) => k.slice(providerId.length + 1));

      await saveConfig({
        organizationId,
        provider: providerId as any,
        config,
        ...(clearSecrets.length ? { clearSecrets } : {}),
      });
      toast.success(t('admin.integrations.saved', { provider: provider.name }));
      // Drop local edits so freshly saved values come back from the server.
      setFormState({});
      setClearedSecrets({});
    } catch (e: any) {
      toast.error(e?.message ? String(e.message) : String(e));
    } finally {
      setSavingProvider(null);
    }
  };

  const handleSync = async (providerId: string) => {
    setSyncing(providerId);
    try {
      const result = await syncIntegration({
        organizationId,
        provider: providerId as any,
      });
      // The action reports failure in its return value rather than throwing.
      if (result?.success) {
        toast.success(result.message || t('admin.integrations.syncComplete', 'Sync complete'));
      } else {
        toast.error(result?.error || t('admin.integrations.syncFailed', 'Sync failed'));
      }
    } catch (e: any) {
      toast.error(e?.message ? String(e.message) : String(e));
    } finally {
      setSyncing(null);
    }
  };

  /**
   * Webhooks are served by the Convex HTTP router, which lives on `.convex.site`
   * rather than the `.convex.cloud` origin the client talks to.
   */
  const webhookEndpoint = `${(process.env.NEXT_PUBLIC_CONVEX_URL ?? '').replace(
    '.convex.cloud',
    '.convex.site',
  )}/webhooks/lucky-carrot/${organizationId}`;

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('admin.integrations.copied', 'Copied'));
    } catch {
      // Clipboard access can be denied or unavailable outside a secure context;
      // the field is selectable, so a manual copy still works.
      toast.error(
        t('admin.integrations.copyFailed', 'Could not copy — select the text and copy manually'),
      );
    }
  };

  const handleRotateSecret = async () => {
    setRotatingSecret(true);
    try {
      const result = await rotateWebhookSecret({ organizationId });
      setNewWebhookSecret(result.secret);
      toast.success(
        t('admin.integrations.webhookSecretCreated', 'Webhook secret generated — copy it now'),
      );
    } catch (e: any) {
      toast.error(e?.message ? String(e.message) : String(e));
    } finally {
      setRotatingSecret(false);
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
        const isExpanded = expandedProvider === provider.id;
        // What the switch shows and what Save would persist.
        const isEnabled = getIsEnabled(provider.id);
        // A never-saved provider is not "Active" no matter what the switch
        // defaults to, and cannot be synced.
        const isLive = !!config && isEnabled;
        const lastSync = config?.lastSyncAt;
        const syncStatus = config?.syncStatus;
        const isSyncing = syncing === provider.id || syncStatus === 'syncing';

        return (
          <Card
            key={provider.id}
            className={`border-l-4 ${isLive ? '' : 'opacity-70'}`}
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
                  {isLive ? (
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
                {/* Enablement — a disabled integration is never synced */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-(--border)">
                  <div>
                    <Label className="cursor-pointer">
                      {t('admin.integrations.enabled', 'Integration enabled')}
                    </Label>
                    <p className="text-[11px] text-(--text-muted) mt-0.5">
                      {t(
                        'admin.integrations.enabledHint',
                        'Turn off to stop all syncing without deleting the credentials',
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(v) => handleToggleChange(provider.id, 'isEnabled', v)}
                  />
                </div>

                {/* Status & Sync */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-(--background-subtle)">
                  <div className="flex items-center gap-2">
                    {isSyncing ? (
                      <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                    ) : syncStatus === 'success' ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : syncStatus === 'error' ? (
                      <X className="w-4 h-4 text-red-500" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-(--text-muted)" />
                    )}
                    <div className="min-w-0">
                      <span className="text-sm">
                        {isSyncing
                          ? t('admin.integrations.syncing', 'Syncing…')
                          : syncStatus === 'success'
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setLogsProvider(logsProvider === provider.id ? null : provider.id)
                      }
                    >
                      {logsProvider === provider.id
                        ? t('admin.integrations.hideLogs', 'Hide history')
                        : t('admin.integrations.showLogs', 'History')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSync(provider.id)}
                      disabled={isSyncing || !isLive}
                    >
                      {isSyncing ? (
                        <ShieldLoader size="xs" variant="inline" />
                      ) : (
                        <RefreshCw className="w-3 h-3 mr-1" />
                      )}
                      {t('admin.integrations.sync', 'Sync Now')}
                    </Button>
                  </div>
                </div>

                {/* Sync history */}
                {logsProvider === provider.id && (
                  <div className="rounded-lg border border-(--border) divide-y divide-(--border)">
                    {syncLogs === undefined ? (
                      <div className="p-3">
                        <ShieldLoader size="xs" variant="inline" />
                      </div>
                    ) : syncLogs.length === 0 ? (
                      <p className="p-3 text-xs text-(--text-muted)">
                        {t('admin.integrations.noLogs', 'No sync runs recorded yet')}
                      </p>
                    ) : (
                      syncLogs.map((log) => (
                        <div key={log._id} className="p-3 flex items-start gap-2">
                          {log.status === 'success' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                          ) : log.status === 'error' ? (
                            <X className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                          ) : (
                            <SkipForward className="w-3.5 h-3.5 text-(--text-muted) mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs break-words">{log.message}</p>
                            <p className="text-[11px] text-(--text-muted) mt-0.5">
                              {new Date(log.createdAt).toLocaleString()}
                              {log.created !== undefined &&
                                ` · +${log.created} / ~${log.updated ?? 0} / −${
                                  log.deactivated ?? 0
                                } / ⊘${log.skipped ?? 0}`}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Configuration Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {provider.fields.map((field) => {
                    const secretSet =
                      SECRET_FIELDS.has(field.key) && isSecretSet(provider.id, field.key);
                    const pendingClear = clearedSecrets[`${provider.id}_${field.key}`];
                    return (
                      <div key={field.key}>
                        <Label>
                          {t(providerLabelKey(provider.id, `field.${field.key}`), field.label)}
                        </Label>
                        <div className="flex items-center gap-1 mt-1">
                          <Input
                            type={field.type}
                            value={getFieldValue(provider.id, field.key)}
                            onChange={(e) =>
                              handleFieldChange(provider.id, field.key, e.target.value)
                            }
                            placeholder={secretSet ? SECRET_MASK : field.placeholder}
                            autoComplete={field.type === 'password' ? 'new-password' : undefined}
                          />
                          {secretSet && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={t('admin.integrations.clearSecret', 'Remove saved value')}
                              title={t('admin.integrations.clearSecret', 'Remove saved value')}
                              onClick={() => handleClearSecret(provider.id, field.key)}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          )}
                        </div>
                        {secretSet && (
                          <p className="text-[11px] text-(--text-muted) mt-1">
                            {t(
                              'admin.integrations.secretSet',
                              'Saved — leave blank to keep the current value',
                            )}
                          </p>
                        )}
                        {pendingClear && (
                          <p className="text-[11px] text-amber-500 mt-1">
                            {t(
                              'admin.integrations.secretWillClear',
                              'Will be removed when you save',
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

                {/* Inbound webhook — Lucky Carrot pushes changes instead of
                    waiting for the hourly sweep. */}
                {provider.id === 'lucky_carrot' &&
                  getToggleValue(provider.id, 'webhookEnabled') && (
                    <div className="p-3 rounded-lg border border-(--border) space-y-3">
                      <div>
                        <Label>{t('admin.integrations.webhookEndpoint', 'Webhook endpoint')}</Label>
                        <p className="text-[11px] text-(--text-muted) mt-0.5">
                          {t(
                            'admin.integrations.webhookEndpointHint',
                            'Register this URL in Lucky Carrot to receive employee changes immediately.',
                          )}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <Input readOnly value={webhookEndpoint} className="font-mono text-xs" />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t('admin.integrations.copy', 'Copy')}
                            title={t('admin.integrations.copy', 'Copy')}
                            onClick={() => handleCopy(webhookEndpoint)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <Label>{t('admin.integrations.webhookSecret', 'Signing secret')}</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={rotatingSecret || !config}
                            onClick={handleRotateSecret}
                          >
                            {rotatingSecret ? (
                              <ShieldLoader size="xs" variant="inline" />
                            ) : (
                              <KeyRound className="w-3 h-3 mr-1" />
                            )}
                            {config?.hasWebhookSecret
                              ? t('admin.integrations.rotateSecret', 'Rotate')
                              : t('admin.integrations.generateSecret', 'Generate')}
                          </Button>
                        </div>
                        <p className="text-[11px] text-(--text-muted) mt-0.5">
                          {t(
                            'admin.integrations.webhookSecretHint',
                            'Deliveries must be signed HMAC-SHA256 over "<timestamp>.<body>" in the x-luckycarrot-signature header.',
                          )}
                        </p>

                        {newWebhookSecret ? (
                          <div className="mt-2">
                            <div className="flex items-center gap-1">
                              <Input
                                readOnly
                                value={newWebhookSecret}
                                className="font-mono text-xs"
                                onFocus={(e) => e.currentTarget.select()}
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={t('admin.integrations.copy', 'Copy')}
                                title={t('admin.integrations.copy', 'Copy')}
                                onClick={() => handleCopy(newWebhookSecret)}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <p className="text-[11px] text-amber-500 mt-1">
                              {t(
                                'admin.integrations.webhookSecretOnce',
                                'Copy this now — it is shown only once and rotating replaces it.',
                              )}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-(--text-muted) mt-2">
                            {config?.hasWebhookSecret
                              ? t(
                                  'admin.integrations.webhookSecretSet',
                                  'A signing secret is set. Rotating it invalidates the previous one immediately.',
                                )
                              : t(
                                  'admin.integrations.webhookSecretMissing',
                                  'No signing secret yet — generate one to start accepting deliveries.',
                                )}
                          </p>
                        )}

                        {!config && (
                          <p className="text-[11px] text-amber-500 mt-1">
                            {t(
                              'admin.integrations.webhookSaveFirst',
                              'Save the configuration before generating a secret.',
                            )}
                          </p>
                        )}
                      </div>

                      {config?.lastWebhookAt && (
                        <p className="text-[11px] text-(--text-muted)">
                          {t('admin.integrations.lastWebhook', 'Last delivery')}:{' '}
                          {new Date(config.lastWebhookAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

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

                {provider.imports && (
                  <p className="text-[11px] text-(--text-muted)">
                    {t(
                      'admin.integrations.mappingHint',
                      'Leave the advanced fields blank to auto-detect the response shape. Set them if the sync reports it could not find employees.',
                    )}
                  </p>
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
