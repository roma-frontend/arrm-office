'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { KeyRound, Plus, Trash2, Copy, History, Loader2 } from 'lucide-react';
import type { Id } from '@/convex/_generated/dataModel';

/**
 * Org-admin management for enterprise SSO (OIDC) connections.
 *
 * Shows the two values an IdP admin needs (redirect URI + masked client
 * secret handling), plus a recent-login audit log. Secrets are write-only:
 * the server never returns them, only a masked hint.
 */
export function SsoSettings() {
  const { t } = useTranslation();
  const connections = useQuery(api.sso.main.listConnections, {});
  const events = useQuery(api.sso.main.getLoginEvents, { limit: 25 });

  const upsert = useMutation(api.sso.main.upsertConnection);
  const remove = useMutation(api.sso.main.deleteConnection);

  const [editing, setEditing] = useState<null | {
    id?: Id<'ssoConnections'>;
    issuer: string;
    clientId: string;
    clientSecret: string;
    domains: string;
    label: string;
    autoProvision: boolean;
    enabled: boolean;
  }>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Id<'ssoConnections'> | null>(null);
  const [showEvents, setShowEvents] = useState(false);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const callbackUrl = `${appUrl}/api/sso/callback/CONNECTION_ID`;

  const openNew = () =>
    setEditing({
      issuer: '',
      clientId: '',
      clientSecret: '',
      domains: '',
      label: '',
      autoProvision: false,
      enabled: true,
    });

  const openEdit = (row: NonNullable<typeof connections>[number]) =>
    setEditing({
      id: row._id,
      issuer: row.issuer,
      clientId: row.clientId,
      clientSecret: '', // write-only — blank keeps the stored secret
      domains: row.domains.join(', '),
      label: row.label ?? '',
      autoProvision: row.autoProvision,
      enabled: row.enabled,
    });

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await upsert({
        id: editing.id,
        issuer: editing.issuer,
        clientId: editing.clientId,
        clientSecret: editing.clientSecret.trim() || undefined,
        domains: editing.domains
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        label: editing.label || undefined,
        autoProvision: editing.autoProvision,
        enabled: editing.enabled,
      });
      toast.success(t('settingsSso.saved', 'SSO connection saved'));
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: Id<'ssoConnections'>) => {
    setDeleting(id);
    try {
      await remove({ id });
      toast.success(t('settingsSso.deleted', 'SSO connection deleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  };

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(label);
  };

  if (connections === undefined) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              {t('settingsSso.title', 'Single Sign-On (OIDC)')}
            </CardTitle>
            <CardDescription>
              {t(
                'settingsSso.description',
                'Let employees sign in with your company identity provider (Okta, Azure AD, Google Workspace…).',
              )}
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" />
            {t('settingsSso.add', 'Add connection')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.length === 0 && (
            <p className="text-sm text-(--text-muted)">
              {t('settingsSso.empty', 'No SSO connections configured yet.')}
            </p>
          )}
          {connections.map((row) => (
            <div
              key={row._id}
              className="flex items-center justify-between gap-3 rounded-xl border border-(--border) p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{row.label ?? row.issuer}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background: row.enabled ? 'var(--success-bg, #dcfce7)' : 'var(--surface-2)',
                      color: row.enabled ? 'var(--success, #16a34a)' : 'var(--text-muted)',
                    }}
                  >
                    {row.enabled
                      ? t('settingsSso.enabled', 'Enabled')
                      : t('settingsSso.disabled', 'Disabled')}
                  </span>
                </div>
                <p className="text-xs text-(--text-muted) truncate">
                  {row.issuer} ·{' '}
                  {row.domains.length
                    ? row.domains.join(', ')
                    : t('settingsSso.allDomains', 'all domains')}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                  {t('integration.configure', 'Configure')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => del(row._id)}
                  disabled={deleting === row._id}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {connections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('settingsSso.idpSetup', 'Identity-provider setup')}
            </CardTitle>
            <CardDescription>
              {t(
                'settingsSso.idpSetupDesc',
                'Register this redirect URI in your IdP, then copy the callback host into the connection.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-(--surface-2) px-2 py-1">
                {callbackUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(callbackUrl, t('settingsSso.copied', 'Copied'))}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-(--text-muted)">
              {t(
                'settingsSso.idpSetupHint',
                'Each connection gets its own callback: replace CONNECTION_ID with the value shown in the connection.',
              )}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setShowEvents((v) => !v)}>
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="w-4 h-4" />
            {t('settingsSso.loginLog', 'Recent SSO logins')}
          </CardTitle>
        </CardHeader>
        {showEvents && (
          <CardContent className="space-y-1">
            {(events ?? []).length === 0 && (
              <p className="text-sm text-(--text-muted)">
                {t('settingsSso.noEvents', 'No SSO login events yet.')}
              </p>
            )}
            {(events ?? []).map((ev) => (
              <div
                key={ev._id}
                className="flex items-center justify-between text-xs py-1 border-b border-(--border) last:border-0"
              >
                <span className="truncate">{ev.email || '—'}</span>
                <span className="text-(--text-muted)">
                  {ev.result} · {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id
                ? t('settingsSso.editTitle', 'Edit SSO connection')
                : t('settingsSso.addTitle', 'Add SSO connection')}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">
                  {t('settingsSso.issuer', 'Issuer URL')}
                </label>
                <Input
                  value={editing.issuer}
                  onChange={(e) => setEditing({ ...editing, issuer: e.target.value })}
                  placeholder="https://idp.company.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('settingsSso.clientId', 'Client ID')}
                </label>
                <Input
                  value={editing.clientId}
                  onChange={(e) => setEditing({ ...editing, clientId: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('settingsSso.clientSecret', 'Client secret')}
                </label>
                <Input
                  type="password"
                  value={editing.clientSecret}
                  onChange={(e) => setEditing({ ...editing, clientSecret: e.target.value })}
                  placeholder={editing.id ? '••••••••' : ''}
                />
                {editing.id && (
                  <p className="text-xs text-(--text-muted) mt-1">
                    {t('settingsSso.secretHint', 'Leave blank to keep the current secret.')}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('settingsSso.domains', 'Allowed email domains')}
                </label>
                <Input
                  value={editing.domains}
                  onChange={(e) => setEditing({ ...editing, domains: e.target.value })}
                  placeholder="company.com, subsidiary.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('settingsSso.label', 'Label')}</label>
                <Input
                  value={editing.label}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder={t('settingsSso.labelPlaceholder', 'Okta (HQ)')}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editing.autoProvision}
                  onCheckedChange={(v) => setEditing({ ...editing, autoProvision: v })}
                />
                {t('settingsSso.autoProvision', 'Auto-create accounts for new users')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editing.enabled}
                  onCheckedChange={(v) => setEditing({ ...editing, enabled: v })}
                />
                {t('settingsSso.enabledLabel', 'Enabled')}
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
