'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { useAuthStore, type User } from '@/store/useAuthStore';
import type { Id } from '@/convex/_generated/dataModel';
import {
  User as UserIcon,
  Search,
  Shield,
  Clock,
  AlertTriangle,
  LogOut,
  History,
  Eye,
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';

interface SearchUser {
  id: Id<'users'>;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  organizationId?: string;
}

interface ImpersonationSession {
  _id: Id<'impersonationSessions'>;
  isActive: boolean;
  superadminName: string;
  targetUserName: string;
  targetUserEmail: string;
  organizationName: string;
  reason: string;
  startedAt: string | number | Date;
  endedAt?: string | number | Date;
  duration: number;
  targetUser?: {
    name: string;
    email: string;
  };
  expiresAt?: string | number | Date;
  sessionId: Id<'impersonationSessions'>;
}

interface ImpersonationSessionPayload {
  userId: string;
  name: string;
  email: string;
  role: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  isApproved?: boolean;
  department?: string;
  position?: string;
  employeeType?: string;
  avatar?: string;
  impersonation?: {
    active: boolean;
    sessionId: string;
    expiresAt: number;
    superadminName: string;
    superadminEmail: string;
  };
}

interface ImpersonationApiResponse {
  session?: ImpersonationSessionPayload;
  error?: string;
}

export default function ImpersonationClient() {
  const router = useRouter();
  const { user, login } = useAuthStore();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const isImpersonating = !!user?.impersonation?.active;
  const canManageImpersonation = user?.role === 'superadmin' && !isImpersonating;

  const searchResults = useQuery(
    api.superadmin.searchUsersByPrefix,
    canManageImpersonation && searchQuery.length >= 2 ? { prefix: searchQuery } : 'skip',
  ) as SearchUser[] | undefined;

  const activeSession = useQuery(
    api.superadmin.getActiveImpersonation,
    canManageImpersonation ? {} : 'skip',
  ) as ImpersonationSession | undefined;

  const impersonationHistory = useQuery(
    api.superadmin.getImpersonationHistory,
    canManageImpersonation ? { superadminId: user.id as Id<'users'>, limit: 20 } : 'skip',
  ) as ImpersonationSession[] | undefined;

  const startImpersonation = useMutation(api.superadmin.startImpersonation);

  const handleStartImpersonation = async () => {
    if (!selectedUser || !reason.trim()) {
      toast.error(t('superadmin.impersonate.alerts.selectUserAndReason'));
      return;
    }

    try {
      const startResult = await startImpersonation({
        targetUserId: selectedUser.id,
        reason: reason.trim(),
      });

      const response = await fetch('/api/auth/impersonation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: startResult.sessionId,
          token: startResult.token,
        }),
      });

      const payload = (await response.json()) as ImpersonationApiResponse;
      if (!response.ok || !payload?.session) {
        throw new Error(payload?.error || 'Failed to activate impersonation session');
      }

      login({
        id: payload.session.userId,
        name: payload.session.name,
        email: payload.session.email,
        role: payload.session.role as User['role'],
        organizationId: payload.session.organizationId,
        organizationSlug: payload.session.organizationSlug,
        organizationName: payload.session.organizationName,
        isApproved: payload.session.isApproved,
        department: payload.session.department,
        position: payload.session.position,
        employeeType: payload.session.employeeType as User['employeeType'],
        avatar: payload.session.avatar,
        impersonation: payload.session.impersonation,
      });

      toast.success(
        t('superadmin.impersonate.alerts.impersonationStarted', { name: selectedUser.name }),
      );
      setStartDialogOpen(false);
      setSelectedUser(null);
      setReason('');
      router.push('/dashboard');
    } catch (error) {
      toast.error(t('superadmin.impersonate.alerts.impersonationError'));
      logger.error(error);
    }
  };

  const handleEndImpersonation = async () => {
    if (!isImpersonating && !activeSession) return;

    try {
      const response = await fetch('/api/auth/impersonation/end', {
        method: 'POST',
      });

      const payload = (await response.json()) as ImpersonationApiResponse;
      if (!response.ok || !payload?.session) {
        throw new Error(payload?.error || 'Failed to end impersonation');
      }

      login({
        id: payload.session.userId,
        name: payload.session.name,
        email: payload.session.email,
        role: payload.session.role as User['role'],
        organizationId: payload.session.organizationId,
        organizationSlug: payload.session.organizationSlug,
        organizationName: payload.session.organizationName,
        isApproved: payload.session.isApproved,
        department: payload.session.department,
        position: payload.session.position,
        employeeType: payload.session.employeeType as User['employeeType'],
        avatar: payload.session.avatar,
      });

      toast.success(t('superadmin.impersonate.alerts.impersonationEnded'));
      router.push('/superadmin/impersonate');
    } catch (error) {
      toast.error(t('superadmin.impersonate.alerts.endImpersonationError'));
      logger.error(error);
    }
  };

  if (!user) {
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
                {t('superadmin.impersonate.title')}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                {t('superadmin.impersonate.subtitle')}
              </p>
            </div>
            {(activeSession || isImpersonating) && (
              <Button
                variant="destructive"
                onClick={handleEndImpersonation}
                className="gap-2 w-full sm:w-auto"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">{t('superadmin.impersonate.exitMode')}</span>
                <span className="sm:hidden">Exit</span>
              </Button>
            )}
          </div>
        </div>

        {(activeSession || isImpersonating) && (
          <Card
            className="mb-6 border-orange-500/50 bg-orange-500/5"
            style={{ background: 'var(--card)' }}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <AlertTriangle className="w-8 h-8 text-orange-500" />
                <div className="flex-1">
                  <h3 className="font-bold text-orange-500 mb-1">
                    {t('superadmin.impersonate.activeSession')}
                  </h3>
                  {isImpersonating ? (
                    <p className="text-sm text-muted-foreground">
                      {t('superadmin.impersonate.activeSessionDesc')} <strong>{user?.name}</strong>{' '}
                      ({user?.email})
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t('superadmin.impersonate.activeSessionDesc')}{' '}
                      <strong>{activeSession?.targetUser?.name}</strong> (
                      {activeSession?.targetUser?.email})
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {isImpersonating ? (
                      <>
                        {t('impersonate.superadmin')}:{' '}
                        {user?.impersonation?.superadminName || 'Superadmin'}
                      </>
                    ) : (
                      <>
                        {t('superadmin.impersonate.sessionInfo.reason')}: {activeSession?.reason} •{' '}
                        {activeSession?.expiresAt && (
                          <>
                            {t('superadmin.impersonate.sessionInfo.expiresAt')}:{' '}
                            {new Date(activeSession.expiresAt).toLocaleString()}
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
                {!isImpersonating && (
                  <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
                    <Eye className="w-4 h-4 mr-2" />
                    {t('superadmin.impersonate.goToDashboard')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {canManageImpersonation && (
          <Card className="mb-6" style={{ background: 'var(--card)' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                {t('superadmin.impersonate.searchUser')}
              </CardTitle>
              <CardDescription>{t('superadmin.impersonate.searchDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('superadmin.impersonate.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {searchResults && searchResults.length > 0 && (
                <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                  {searchResults?.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 transition-colors"
                      style={{ background: 'var(--background-subtle)' }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={u.avatarUrl ?? ''} />
                          <AvatarFallback>
                            {u.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {u.name}
                          </p>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              <Shield className="w-3 h-3 mr-1" />
                              {u.role}
                            </Badge>
                            {u.organizationId && (
                              <span className="text-xs text-muted-foreground">
                                Org: {u.organizationId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedUser(u);
                          setStartDialogOpen(true);
                        }}
                      >
                        {t('impersonate.loginAs')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && (!searchResults || searchResults.length === 0) && (
                <div className="mt-4 text-center py-8 text-muted-foreground">
                  <UserIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('impersonate.usersNotFound')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canManageImpersonation && (
          <Card style={{ background: 'var(--card)' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                {t('impersonate.history')}
              </CardTitle>
              <CardDescription>{t('impersonate.historyDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {impersonationHistory === undefined ? (
                <div className="flex items-center justify-center py-8">
                  <ShieldLoader />
                </div>
              ) : impersonationHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('impersonate.historyEmpty')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {impersonationHistory?.map((session) => (
                    <div
                      key={session._id}
                      className="p-3 sm:p-4 rounded-lg border"
                      style={{ background: 'var(--background-subtle)' }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge
                              variant={session.isActive ? 'default' : 'outline'}
                              className="text-xs"
                            >
                              {session.isActive
                                ? t('impersonate.active')
                                : t('impersonate.completed')}
                            </Badge>
                            {session.isActive && (
                              <Badge variant="destructive" className="text-xs">
                                {t('impersonate.now')}
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                            <div>
                              <span className="text-muted-foreground">
                                {t('impersonate.superadmin')}
                              </span>{' '}
                              <span className="font-medium truncate block">
                                {session.superadminName}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t('impersonate.user')}</span>{' '}
                              <span className="font-medium truncate block">
                                {session.targetUserName}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                {t('impersonate.email')}
                              </span>{' '}
                              <span className="font-mono text-xs truncate block">
                                {session.targetUserEmail}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                {t('impersonate.organization')}
                              </span>{' '}
                              <span className="font-medium truncate block">
                                {session.organizationName}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 p-2 sm:p-3 rounded bg-muted">
                            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
                              {t('impersonate.reason')}
                            </p>
                            <p className="text-xs sm:text-sm">{session.reason}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] sm:text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              {t('impersonate.started')}{' '}
                              {new Date(session.startedAt).toLocaleString()}
                            </span>
                            {session.endedAt && (
                              <span>
                                {t('impersonate.duration')} {Math.round(session.duration / 60000)}{' '}
                                {t('impersonate.min')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet open={startDialogOpen && canManageImpersonation} onOpenChange={setStartDialogOpen}>
        <SheetContent side="right" size="sm" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {t('impersonate.loginAsUser')}
            </SheetTitle>
            <SheetDescription>{t('impersonate.fullAccessDesc')}</SheetDescription>
          </SheetHeader>

          {selectedUser && (
            <SheetBody>
              <div className="flex items-center gap-4 mb-4 p-4 rounded-lg bg-muted">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={selectedUser.avatarUrl} />
                  <AvatarFallback>
                    {selectedUser.name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{selectedUser.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('impersonate.role')} {selectedUser.role}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="reason">{t('impersonate.reasonRequired')}</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('impersonate.reasonPlaceholder')}
                  rows={4}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('impersonate.auditLogWarning')}
                </p>
              </div>

              <div className="mt-4 p-3 rounded bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div className="text-xs text-(--warning-text)">
                    <p className="font-semibold mb-1">{t('impersonate.important')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('impersonate.sessionExpires')}</li>
                      <li>{t('impersonate.userNotified')}</li>
                      <li>{t('impersonate.actionsLogged')}</li>
                      <li>{t('impersonate.cannotChangePassword')}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </SheetBody>
          )}

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setStartDialogOpen(false);
                setSelectedUser(null);
                setReason('');
              }}
            >
              {t('impersonate.cancel')}
            </Button>
            <Button onClick={handleStartImpersonation} disabled={!reason.trim()}>
              <Shield className="w-4 h-4 mr-2" />
              {t('impersonate.startSession')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
