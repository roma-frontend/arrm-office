/**
 * Superadmin Sessions console — who is logged in right now, across every
 * organization, with one-click remote logout. The kill switch revokes every
 * session in the system at once (for a leaked credential or a security event).
 */

'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LogOut, ShieldAlert, Monitor, Globe } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '@/convex/_generated/dataModel';

export function SessionsClient() {
  const { t, i18n } = useTranslation();
  const sessions = useQuery(api.superadmin.sessions.listActiveSessions, {});
  const revokeSession = useMutation(api.superadmin.sessions.revokeSession);
  const revokeAllSessions = useMutation(api.superadmin.sessions.revokeAllSessions);

  const [revokingId, setRevokingId] = useState<Id<'users'> | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleRevoke = async (userId: Id<'users'>) => {
    setRevokingId(userId);
    try {
      await revokeSession({ userId });
      toast.success(t('superadmin.sessions.revoked', 'Session revoked'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.sessions.revokeFailed', 'Could not revoke the session'),
      );
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      const result = await revokeAllSessions({});
      toast.success(
        t('superadmin.sessions.revokedAll', '{{count}} sessions revoked', {
          count: result.revoked,
        }),
      );
      setConfirmAll(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.sessions.revokeFailed', 'Could not revoke sessions'),
      );
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1
                className="text-3xl md:text-4xl font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('superadmin.sessions.title', 'Active sessions')}
              </h1>
              <p className="text-muted-foreground">
                {t(
                  'superadmin.sessions.subtitle',
                  'Every user currently logged in, with remote logout and an emergency kill switch',
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {confirmAll ? (
                <div className="flex items-center gap-2 rounded-xl border border-(--danger-outline) bg-(--danger-quiet) px-3 py-1.5">
                  <ShieldAlert className="h-4 w-4 text-(--danger-text)" />
                  <span className="text-sm text-(--danger-text)">
                    {t('superadmin.sessions.confirmAll', 'Revoke every session?')}
                  </span>
                  <Button
                    size="sm"
                    className="h-7 bg-(--danger-solid) text-white hover:bg-(--danger-solid)"
                    disabled={revokingAll}
                    onClick={handleRevokeAll}
                  >
                    {revokingAll
                      ? t('superadmin.sessions.revoking', 'Revoking…')
                      : t('actions.confirm', 'Confirm')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={revokingAll}
                    onClick={() => setConfirmAll(false)}
                  >
                    {t('actions.cancel', 'Cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="flex items-center gap-2 border-(--danger-outline) text-(--danger-text) hover:bg-(--danger-quiet)"
                  onClick={() => setConfirmAll(true)}
                >
                  <ShieldAlert className="h-4 w-4" />
                  {t('superadmin.sessions.revokeAll', 'Revoke all sessions')}
                </Button>
              )}
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {sessions === undefined ? (
              <div className="flex justify-center py-20">
                <ShieldLoader size="lg" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-20 text-center">
                <Monitor className="mx-auto mb-3 h-12 w-12 text-(--text-muted) opacity-30" />
                <p className="text-(--text-secondary) font-medium">
                  {t('superadmin.sessions.noSessions', 'No active sessions')}
                </p>
                <p className="mt-1 text-sm text-(--text-muted)">
                  {t('superadmin.sessions.noSessionsHint', 'Nobody is logged in right now')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--border) bg-(--background-subtle)">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted)">
                        {t('superadmin.sessions.userCol', 'User')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted)">
                        {t('superadmin.sessions.roleCol', 'Role')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted)">
                        {t('superadmin.sessions.orgCol', 'Organization')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted)">
                        {t('superadmin.sessions.expiresCol', 'Session expires')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-(--text-muted)"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr
                        key={session.userId}
                        className="border-b border-(--border) last:border-0 hover:bg-(--background-subtle) transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-(--text-primary)">{session.name}</p>
                          <p className="font-mono text-xs text-(--text-muted)">{session.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">
                            {session.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-(--text-secondary)">
                            <Globe className="h-3.5 w-3.5 text-(--text-muted)" />
                            {session.organizationName ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-(--text-muted)">
                          {formatDate(session.sessionExpiry)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-(--danger-text) hover:bg-(--danger-quiet)"
                            disabled={revokingId === session.userId}
                            onClick={() => handleRevoke(session.userId)}
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            {t('superadmin.sessions.revoke', 'Log out')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SessionsClient;
