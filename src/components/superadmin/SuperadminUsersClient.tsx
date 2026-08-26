'use client';

/**
 * Superadmin users index — searchable list of every user across all
 * organizations. Selecting a row opens the User 360 profile
 * (/superadmin/users/[userId]) where operator tools such as temporary
 * password issuance live.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Users,
  ArrowRight,
  XCircle,
  CheckCircle,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

type RedactedUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  organizationId?: string;
  organizationName?: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
  isActive: boolean;
};

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'admin':
      return 'bg-(--brand-quiet) text-(--brand-text) border-(--brand-outline)';
    case 'supervisor':
      return 'bg-(--success-quiet) text-(--success-text) border-(--success-outline)';
    case 'driver':
      return 'bg-(--warning-quiet) text-(--warning-text) border-(--warning-outline)';
    default:
      return 'bg-(--surface-3) text-(--text-2) border-(--border-default)';
  }
}

export default function SuperadminUsersClient() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');

  // getAllUsers serves a superadmin the whole platform (up to 100, redacted);
  // org admins only ever see their own organization.
  const users = useQuery(api.users.getAllUsers, { limit: 100 });
  const pending = useQuery(api.superadmin.tempPasswords.listPendingTempPasswords, {});
  const clearMustChangePassword = useMutation(api.superadmin.tempPasswords.clearMustChangePassword);

  // Two-step revoke: first click arms the row, second click confirms.
  const [revokeArmed, setRevokeArmed] = useState<Id<'users'> | null>(null);
  const [revoking, setRevoking] = useState<Id<'users'> | null>(null);

  const handleRevoke = async (userId: Id<'users'>) => {
    if (revokeArmed !== userId) {
      setRevokeArmed(userId);
      return;
    }
    setRevoking(userId);
    try {
      await clearMustChangePassword({ userId });
      setRevokeArmed(null);
    } finally {
      setRevoking(null);
    }
  };

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString(
      i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US',
    );

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users as RedactedUser[];
    return (users as RedactedUser[]).filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.position?.toLowerCase().includes(q),
    );
  }, [users, query]);

  if (!users) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl space-y-4 my-4">
        {/* Pending temporary passwords — who has not rotated yet and when it expires */}
        {pending && pending.length > 0 && (
          <Card style={{ background: 'var(--card)' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-(--warning-text)" />
                {t('superadmin.pendingTemp.title')}
                <Badge
                  variant="outline"
                  className="text-(--warning-text) border-(--warning-outline)"
                >
                  {pending.length}
                </Badge>
              </CardTitle>
              <CardDescription>{t('superadmin.pendingTemp.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map((row) => (
                <div
                  key={row.userId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <button
                    onClick={() => router.push(`/superadmin/users/${row.userId}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p
                      className="truncate text-sm font-medium hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {row.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('superadmin.users.validUntil', { date: fmtDate(row.expiresAt) })}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.isExpired ? (
                      <Badge
                        variant="outline"
                        className="gap-1 text-(--danger-text) border-(--danger-outline)"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {t('superadmin.pendingTemp.expired')}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 text-(--warning-text) border-(--warning-outline)"
                      >
                        {t('superadmin.pendingTemp.awaiting')}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant={revokeArmed === row.userId ? 'destructive' : 'outline'}
                      disabled={revoking === row.userId}
                      onClick={() => handleRevoke(row.userId)}
                    >
                      {revoking === row.userId
                        ? t('superadmin.pendingTemp.revoking')
                        : revokeArmed === row.userId
                          ? t('superadmin.pendingTemp.revokeConfirm')
                          : t('superadmin.pendingTemp.revoke')}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      tabIndex={-1}
                      onClick={() => router.push(`/superadmin/users/${row.userId}`)}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card style={{ background: 'var(--card)' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('nav.users360')}
            </CardTitle>
            <CardDescription>{t('superadmin.usersIndex.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--text-muted)' }}
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('superadmin.usersIndex.searchPlaceholder')}
                className="pl-9"
              />
            </div>

            {/* List */}
            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('superadmin.usersIndex.noResults')}
                </p>
              )}
              {filtered.map((user) => (
                // A div with button semantics — the row contains real <button>s
                // (arrow affordance), and nested buttons break hydration.
                <div
                  key={user._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/superadmin/users/${user._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/superadmin/users/${user._id}`);
                    }
                  }}
                  className="w-full flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarImage src={user.avatarUrl} />
                      <AvatarFallback className="text-sm">
                        {user.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>

                  <div className="hidden sm:flex shrink-0 items-center gap-2">
                    <Badge className={getRoleBadgeColor(user.role)} variant="outline">
                      {user.role}
                    </Badge>
                    {user.isActive ? (
                      <Badge
                        variant="outline"
                        className="gap-1 text-(--success-text) border-(--success-outline)"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {t('superadmin.users.active')}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 text-(--danger-text) border-(--danger-outline)"
                      >
                        <XCircle className="w-3 h-3" />
                        {t('superadmin.users.inactive')}
                      </Badge>
                    )}
                  </div>

                  <Button variant="ghost" size="icon" className="shrink-0">
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {t('superadmin.usersIndex.count', { count: filtered.length })}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
