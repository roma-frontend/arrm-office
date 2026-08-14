'use client';

import { useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '@/convex/_generated/dataModel';
import {
  Key,
  Shield,
  Clock,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Plus,
  History,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface AccessToken {
  _id: Id<'superadminAccessTokens'>;
  name: string;
  email: string;
  reason: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  isRevoked: boolean;
  revokedAt?: number;
  tempUserIsActive: boolean;
  isExpired: boolean;
  status: 'active' | 'expired' | 'revoked';
}

const DURATIONS = [
  { key: 'duration15m', value: 900000 },
  { key: 'duration30m', value: 1800000 },
  { key: 'duration1h', value: 3600000 },
  { key: 'duration6h', value: 21600000 },
  { key: 'duration12h', value: 43200000 },
  { key: 'duration24h', value: 86400000 },
  { key: 'duration48h', value: 172800000 },
  { key: 'duration7d', value: 604800000 },
];

export default function AccessTokensClient() {
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newDuration, setNewDuration] = useState(86400000);

  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    password: string;
    name: string;
    expiresAt: number;
  } | null>(null);
  const [copied, setCopied] = useState<'email' | 'password' | null>(null);

  const tokens = useQuery(
    api.superadmin.listAccessTokens,
    user?.role === 'superadmin' ? {} : 'skip',
  ) as AccessToken[] | undefined;

  const generateAccessToken = useMutation(api.superadmin.generateAccessToken);
  const revokeAccessToken = useMutation(api.superadmin.revokeAccessToken);

  const handleGenerate = async () => {
    if (!newName.trim() || !newEmail.trim() || !newReason.trim()) {
      toast.error(t('admin:accessTokens.alertFieldsRequired'));
      return;
    }

    try {
      const result = await generateAccessToken({
        name: newName.trim(),
        email: newEmail.trim(),
        reason: newReason.trim(),
        durationMs: newDuration,
      });

      setCreatedCredentials({
        email: result.email,
        password: result.password,
        name: result.name,
        expiresAt: result.expiresAt,
      });

      setCreateDialogOpen(false);
      setNewName('');
      setNewEmail('');
      setNewReason('');
      setNewDuration(86400000);

      toast.success(t('admin:accessTokens.alertGenerateSuccess'));
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : t('admin:accessTokens.alertError', { action: t('admin:accessTokens.actionGenerate') });
      toast.error(msg);
    }
  };

  const handleRevoke = async (tokenId: Id<'superadminAccessTokens'>) => {
    try {
      await revokeAccessToken({ tokenId });
      toast.success(t('admin:accessTokens.alertRevokeSuccess'));
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : t('admin:accessTokens.alertError', { action: t('admin:accessTokens.actionRevoke') });
      toast.error(msg);
    }
  };

  const copyToClipboard = async (text: string, field: 'email' | 'password') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const now = useNow();

  const formatExpiry = (ts: number) => {
    const remaining = ts - now;
    if (remaining <= 0) return t('admin:accessTokens.statusExpired');
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (!user || user.role !== 'superadmin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
            <div>
              <h1
                className="text-2xl sm:text-3xl font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('admin:accessTokens.title')}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                {t('admin:accessTokens.subtitle')}
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 w-full sm:w-auto">
              <Plus className="w-4 h-4" />
              {t('admin:accessTokens.generate')}
            </Button>
          </div>
        </div>

        {/* Credentials display dialog */}
        <Sheet
          open={!!createdCredentials}
          onOpenChange={(open) => {
            if (!open) setCreatedCredentials(null);
          }}
        >
          <SheetContent side="right" size="sm" closeLabel={t('common.close', 'Close')}>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-destructive" />
                {t('admin:accessTokens.credentialsTitle')}
              </SheetTitle>
              <SheetDescription>{t('admin:accessTokens.credentialsDesc')}</SheetDescription>
            </SheetHeader>

            {createdCredentials && (
              <SheetBody className="space-y-4">
                <div className="p-4 rounded-lg border-2 border-destructive/30 bg-destructive/5">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div className="text-sm text-destructive">
                      <p className="font-semibold mb-1">
                        {t('admin:accessTokens.credentialsImportant')}
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li>{t('admin:accessTokens.credLine1')}</li>
                        <li>{t('admin:accessTokens.credLine2')}</li>
                        <li>{t('admin:accessTokens.credLine3')}</li>
                        <li>{t('admin:accessTokens.credLine4')}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {t('admin:accessTokens.name')}
                    </Label>
                    <p className="font-medium">{createdCredentials.name}</p>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {t('admin:accessTokens.email')}
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 p-2 rounded bg-muted text-sm font-mono break-all">
                        {createdCredentials.email}
                      </code>
                      <Button
                        size="icon"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => copyToClipboard(createdCredentials.email, 'email')}
                      >
                        {copied === 'email' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {t('admin:accessTokens.password')}
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 p-2 rounded bg-muted text-sm font-mono break-all">
                        {createdCredentials.password}
                      </code>
                      <Button
                        size="icon"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => copyToClipboard(createdCredentials.password, 'password')}
                      >
                        {copied === 'password' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {t('admin:accessTokens.expires')}
                    </Label>
                    <p className="font-mono text-sm">
                      {new Date(createdCredentials.expiresAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded bg-muted">
                  <p className="text-xs text-muted-foreground">
                    {t('admin:accessTokens.credLoginUrl')}
                  </p>
                </div>
              </SheetBody>
            )}

            <SheetFooter>
              <Button onClick={() => setCreatedCredentials(null)} className="w-full">
                {t('admin:accessTokens.credSaved')}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Tokens list */}
        <Card style={{ background: 'var(--card)' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {t('admin:accessTokens.listTitle')}
            </CardTitle>
            <CardDescription>{t('admin:accessTokens.listDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {tokens === undefined ? (
              <div className="flex items-center justify-center py-8">
                <ShieldLoader />
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t('admin:accessTokens.listEmpty')}</p>
                <p className="text-sm mt-1">{t('admin:accessTokens.listEmptyHint')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tokens.map((token) => (
                  <div
                    key={token._id}
                    className="p-4 rounded-lg border"
                    style={{ background: 'var(--background-subtle)' }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge
                            variant={
                              token.status === 'active'
                                ? 'default'
                                : token.status === 'expired'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="text-xs"
                          >
                            {token.status === 'active' && <Shield className="w-3 h-3 mr-1" />}
                            {token.status === 'expired' && <Clock className="w-3 h-3 mr-1" />}
                            {token.status === 'revoked' && <XCircle className="w-3 h-3 mr-1" />}
                            {token.status === 'active'
                              ? t('admin:accessTokens.statusActive')
                              : token.status === 'expired'
                                ? t('admin:accessTokens.statusExpired')
                                : t('admin:accessTokens.statusRevoked')}
                          </Badge>
                          {token.status === 'active' && (
                            <span className="text-xs font-medium text-(--success-text)">
                              {t('admin:accessTokens.expiresIn', {
                                time: formatExpiry(token.expiresAt),
                              })}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">
                              {t('admin:accessTokens.name')}
                            </span>{' '}
                            <span className="font-medium">{token.name}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t('admin:accessTokens.email')}
                            </span>{' '}
                            <span className="font-mono text-xs">{token.email}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t('admin:accessTokens.created')}
                            </span>{' '}
                            <span>{new Date(token.createdAt).toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t('admin:accessTokens.expires')}
                            </span>{' '}
                            <span className={token.isExpired ? 'text-destructive' : ''}>
                              {new Date(token.expiresAt).toLocaleString()}
                            </span>
                          </div>
                          {token.lastUsedAt && (
                            <div>
                              <span className="text-muted-foreground">
                                {t('admin:accessTokens.lastUsed')}
                              </span>{' '}
                              <span>{new Date(token.lastUsedAt).toLocaleString()}</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-2 p-2 rounded bg-muted">
                          <p className="text-xs text-muted-foreground mb-1">
                            {t('admin:accessTokens.reason')}
                          </p>
                          <p className="text-sm">{token.reason}</p>
                        </div>
                      </div>

                      {token.status === 'active' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevoke(token._id)}
                          className="shrink-0 gap-1"
                        >
                          <Trash2 className="w-4 h-4" />
                          {t('admin:accessTokens.revokeBtn')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create dialog */}
      <Sheet open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {t('admin:accessTokens.createTitle')}
            </SheetTitle>
            <SheetDescription>{t('admin:accessTokens.createDesc')}</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            <div>
              <Label htmlFor="spec-name">{t('admin:accessTokens.formName')}</Label>
              <Input
                id="spec-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('admin:accessTokens.formNamePlaceholder')}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="spec-email">{t('admin:accessTokens.formEmail')}</Label>
              <Input
                id="spec-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t('admin:accessTokens.formEmailPlaceholder')}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('admin:accessTokens.formEmailHint')}
              </p>
            </div>

            <div>
              <Label htmlFor="access-duration">{t('admin:accessTokens.formDuration')}</Label>
              <Select
                value={String(newDuration)}
                onValueChange={(val) => setNewDuration(Number(val))}
              >
                <SelectTrigger id="access-duration" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {t(`admin:accessTokens.${opt.key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reason">{t('admin:accessTokens.formReason')}</Label>
              <Textarea
                id="reason"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder={t('admin:accessTokens.formReasonPlaceholder')}
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                <div className="text-xs text-(--warning-text)">
                  <p className="font-semibold mb-1">{t('admin:accessTokens.securityNotice')}</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>{t('admin:accessTokens.securityLine1')}</li>
                    <li>{t('admin:accessTokens.securityLine2')}</li>
                    <li>{t('admin:accessTokens.securityLine3')}</li>
                    <li>{t('admin:accessTokens.securityLine4')}</li>
                    <li>{t('admin:accessTokens.securityLine5')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </SheetBody>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setNewName('');
                setNewEmail('');
                setNewReason('');
                setNewDuration(86400000);
              }}
            >
              {t('admin:accessTokens.cancel')}
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!newName.trim() || !newEmail.trim() || !newReason.trim()}
            >
              <Key className="w-4 h-4 mr-2" />
              {t('admin:accessTokens.generate')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
