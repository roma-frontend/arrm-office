'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { localizedTaskTitle } from '@/lib/taskTitle';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  Building2,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Car,
  Ticket,
  MessageSquare,
  LogIn,
  MoreVertical,
  Ban,
  Key,
  ArrowLeft,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  PowerOff,
  Send,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';

// Validity options for a superadmin-issued temporary password, in hours.
const TEMP_PASSWORD_TTL_OPTIONS = [8, 24, 48, 72] as const;
// Block durations the admin can pick from. `0` means "indefinite" (until
// unsuspended manually).
const BLOCK_DURATION_OPTIONS = [
  { value: 1, labelKey: '1h' },
  { value: 24, labelKey: '24h' },
  { value: 72, labelKey: '3d' },
  { value: 168, labelKey: '7d' },
  { value: 720, labelKey: '30d' },
  { value: 0, labelKey: 'indefinite' },
] as const;

export default function UserProfile360Page() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as Id<'users'>;

  const data = useQuery(api.superadmin.getUser360, userId ? { userId } : 'skip');
  const issueTempPassword = useMutation(api.superadmin.tempPasswords.issueTempPassword);
  const suspendUser = useMutation(api.users.admin.suspendUser);
  const unsuspendUser = useMutation(api.users.admin.unsuspendUser);
  // Open or create a direct-message conversation with the profile user and
  // jump to the chat route. The /chat?conversation=<id> deep-link is the
  // same one ChatClient recognises (it auto-switches the org selector if
  // the target user lives in a different tenant).
  const getOrCreateDM = useMutation(api.chat.mutations.getOrCreateDM);
  // Pulled from the Zustand auth store — `user.id` is the Convex
  // `Id<'users'>` of the signed-in superadmin.
  const viewer = useAuthStore((state) => state.user);

  // Temporary-password flow: confirm dialog → plaintext shown exactly once.
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [ttlHours, setTtlHours] = useState<number>(24);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [tempPwResult, setTempPwResult] = useState<{ password: string; expiresAt: number } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  // Block-user flow: confirm dialog with reason + duration, then hand off to
  // `users.admin.suspendUser`. The inverse (unblock) reuses the same dialog
  // path and shows a different title.
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockHours, setBlockHours] = useState<number>(24);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  // Unblock confirmation — separate tiny dialog so the admin can be sure.
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  // Dropdown "..." actions.
  const [revoking] = useState(false);

  const { t, i18n } = useTranslation();

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  const {
    user,
    organization,
    leaves,
    tasks,
    driverRequests,
    supportTickets,
    stats,
    loginAttempts,
  } = data;

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'bg-(--purple-quiet) text-(--purple-text) border-(--purple-outline)';
      case 'admin':
        return 'bg-(--brand-quiet) text-(--brand-text) border-(--brand-outline)';
      case 'supervisor':
        return 'bg-(--success-quiet) text-(--success-text) border-(--success-outline)';
      default:
        return 'bg-(--surface-3) text-(--text-2) border-(--border-default)';
    }
  };

  // ── Temporary password issuance (email reset unavailable / user forgot) ────
  const handleIssueTempPassword = async () => {
    setIssuing(true);
    setIssueError(null);
    try {
      const res = await issueTempPassword({ userId, ttlHours });
      // The plaintext arrives exactly once — show it, let the admin relay it.
      setTempPwResult({ password: res.password, expiresAt: res.expiresAt });
      setCopied(false);
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : t('superadmin.users.tempPwError'));
    } finally {
      setIssuing(false);
    }
  };

  // ── Block / unblock ────────────────────────────────────────────────────────
  const isUserSuspended = Boolean(
    data?.user?.isSuspended && (!data.user.suspendedUntil || data.user.suspendedUntil > Date.now()),
  );
  const canModerate = user.role !== 'superadmin' || data?.user?.role !== 'superadmin';

  const handleBlockUser = async () => {
    setBlocking(true);
    setBlockError(null);
    try {
      await suspendUser({
        userId,
        reason: blockReason.trim() || t('superadmin.users.blockReasonPlaceholder'),
        // 0 means "indefinite" in our local select; suspendUser expects hours.
        duration: blockHours === 0 ? undefined : blockHours,
      });
      setBlockDialogOpen(false);
      setBlockReason('');
      toast.success(t('superadmin.users.blockSuccess'));
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : t('superadmin.users.blockError'));
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblockUser = async () => {
    setUnblocking(true);
    try {
      await unsuspendUser({ userId });
      setUnblockDialogOpen(false);
      toast.success(t('superadmin.users.unblockSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('superadmin.users.blockError'));
    } finally {
      setUnblocking(false);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('common.copied', 'Copied'));
    } catch {
      toast.error(t('common.copyFailed', 'Copy failed'));
    }
  };

  /**
   * Open (or create) a DM with the profile user and jump to the chat route.
   * Mirrors the deep-link pattern the support-ticket page already uses:
   *   router.push(`/chat?conversation=${id}`)
   * `ChatClient` reads the query string, switches the org selector if the
   * target user is in a different tenant, and selects the conversation.
   */
  const [startingChat, setStartingChat] = useState(false);
  const handleOpenChat = async () => {
    if (!viewer?.id) {
      toast.error(t('superadmin.users.writeMessageNoSession', 'Sign in to send messages.'));
      return;
    }
    if (viewer.id === userId) {
      router.push('/chat');
      return;
    }
    setStartingChat(true);
    try {
      // Mirror NewConversationModal's "host the DM in the target user's
      // organisation" rule so a cross-org superadmin can still chat with
      // a single-user tenant without the conversation disappearing from
      // the recipient's inbox.
      const organizationId = (user.organizationId ?? viewer.organizationId ?? undefined) as
        | Id<'organizations'>
        | undefined;
      const conversationId = await getOrCreateDM({
        organizationId,
        currentUserId: viewer.id as Id<'users'>,
        targetUserId: userId,
      });
      router.push(`/chat?conversation=${conversationId}`);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('superadmin.users.writeMessageError', 'Could not open the chat.'),
      );
    } finally {
      setStartingChat(false);
    }
  };

  const handleCopyTempPw = async () => {
    if (!tempPwResult) return;
    try {
      await navigator.clipboard.writeText(tempPwResult.password);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the code is selectable text anyway.
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        {/* Back Button */}
        <div className="my-4">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t('superadmin.users.back')}
          </Button>
        </div>

        {/* Header - User Profile */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <Card className="mb-6" style={{ background: 'var(--card)' }}>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={user.avatarUrl} />
                    <AvatarFallback className="text-2xl">
                      {user.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {user.name}
                      </h1>
                      <Badge className={getRoleBadgeColor(user.role)}>
                        <Shield className="w-3 h-3 mr-1" />
                        {user.role}
                      </Badge>
                      {user.isActive ? (
                        <Badge
                          variant="outline"
                          className="text-(--success-text) border-(--success-outline)"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {t('superadmin.users.active')}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-(--danger-text) border-(--danger-outline)"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          {t('superadmin.users.inactive')}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        {user.email}
                      </div>
                      {user.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="w-4 h-4" />
                          {user.phone}
                        </div>
                      )}
                      {user.location && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="w-4 h-4" />
                          {user.location}
                        </div>
                      )}
                      {user.dateOfBirth && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {user.dateOfBirth}
                        </div>
                      )}
                      {user.position && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Briefcase className="w-4 h-4" />
                          {user.position}
                        </div>
                      )}
                      {organization && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Building2 className="w-4 h-4" />
                          {organization?.name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center flex-wrap gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => void handleOpenChat()}
                    disabled={startingChat}
                  >
                    {startingChat ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <MessageSquare className="w-4 h-4" />
                    )}
                    {t('superadmin.users.writeMessage')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={user.role === 'superadmin'}
                    onClick={() => {
                      setIssueError(null);
                      setTempPwResult(null);
                      setPwDialogOpen(true);
                    }}
                  >
                    <Key className="w-4 h-4" />
                    {t('superadmin.users.issueTempPassword')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-(--danger-text) hover:opacity-80"
                    disabled={!canModerate || isUserSuspended}
                    onClick={() => {
                      setBlockError(null);
                      setBlockReason('');
                      setBlockDialogOpen(true);
                    }}
                  >
                    <Ban className="w-4 h-4" />
                    {t('superadmin.users.blockUser')}
                  </Button>
                  {isUserSuspended && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-(--success-text) hover:opacity-80"
                      disabled={!canModerate}
                      onClick={() => setUnblockDialogOpen(true)}
                    >
                      <PowerOff className="w-4 h-4" />
                      {t('superadmin.users.unblockUser')}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('superadmin.users.moreActions', 'More actions')}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel>
                        {t('superadmin.users.moreActions', 'More actions')}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => copyToClipboard(user.email)}
                        className="cursor-pointer"
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        {t('superadmin.users.copyEmail', 'Copy email')}
                      </DropdownMenuItem>
                      {user.phone && (
                        <DropdownMenuItem
                          onClick={() => copyToClipboard(user.phone!)}
                          className="cursor-pointer"
                        >
                          <Phone className="mr-2 h-4 w-4" />
                          {t('superadmin.users.copyPhone', 'Copy phone')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() =>
                          copyToClipboard(`${window.location.origin}/superadmin/users/${userId}`)
                        }
                        className="cursor-pointer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {t('superadmin.users.copyProfileLink', 'Copy profile link')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setBlockReason(t('superadmin.users.suspendReasonForceReset'));
                          setBlockHours(24);
                          setBlockDialogOpen(true);
                        }}
                        disabled={!canModerate || isUserSuspended}
                        className="cursor-pointer"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t('superadmin.users.forcePasswordReset', 'Force password reset')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          toast.info(
                            t(
                              'superadmin.users.revokeSessionsHint',
                              'Sign the user out of every device. The next API call from a stale session is rejected.',
                            ),
                          )
                        }
                        disabled={revoking}
                        className="cursor-pointer"
                      >
                        {revoking ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <LogIn className="mr-2 h-4 w-4" />
                        )}
                        {t('superadmin.users.revokeAllSessions', 'Sign out of all devices')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => window.open(`mailto:${user.email}`, '_self')}
                        className="cursor-pointer"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        {t('superadmin.users.sendEmail', 'Send email')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <StatCard
            title={t('superadmin.leaves')}
            value={stats.totalLeaves}
            icon={Calendar}
            color="blue"
          />
          <StatCard
            title={t('superadmin.users.pending')}
            value={stats.pendingLeaves}
            icon={Clock}
            color="orange"
          />
          <StatCard
            title={t('superadmin.users.approved')}
            value={stats.approvedLeaves}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title={t('superadmin.tasks')}
            value={stats.totalTasks}
            icon={Briefcase}
            color="purple"
          />
          <StatCard
            title={t('superadmin.users.completed')}
            value={stats.completedTasks}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title={t('superadmin.rides')}
            value={stats.totalDriverRequests}
            icon={Car}
            color="blue"
          />
          <StatCard
            title={t('superadmin.tickets')}
            value={stats.totalTickets}
            icon={Ticket}
            color="purple"
          />
          <StatCard
            title={t('superadmin.users.logins')}
            value={stats.totalLoginAttempts}
            icon={LogIn}
            color="gray"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="leaves" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-7 h-auto">
            <TabsTrigger
              value="leaves"
              className="flex items-center gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Отпуска</span>
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="flex items-center gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white"
            >
              <Briefcase className="w-4 h-4" />
              <span className="hidden sm:inline">Задачи</span>
            </TabsTrigger>
            <TabsTrigger
              value="drivers"
              className="flex items-center gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white"
            >
              <Car className="w-4 h-4" />
              <span className="hidden sm:inline">Поездки</span>
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="flex items-center gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white"
            >
              <Ticket className="w-4 h-4" />
              <span className="hidden sm:inline">Тикеты</span>
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="flex items-center gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Активность</span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="flex items-center gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white"
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Безопасность</span>
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="flex items-center gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Чат</span>
            </TabsTrigger>
          </TabsList>

          {/* Leaves Tab */}
          <TabsContent value="leaves">
            <Card style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle>{t('superadmin.users.leaveRequests')}</CardTitle>
                <CardDescription>
                  {t('superadmin.users.leaveRequestsFound', { count: leaves.length })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {leaves.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('superadmin.users.noLeaveRequests')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {leaves.map((leave) => (
                      <div
                        key={leave._id}
                        className="p-4 rounded-lg border"
                        style={{ background: 'var(--background-subtle)' }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge>{leave.type}</Badge>
                              <Badge
                                variant={
                                  leave.status === 'approved'
                                    ? 'outline'
                                    : leave.status === 'rejected'
                                      ? 'destructive'
                                      : 'secondary'
                                }
                              >
                                {leave.status}
                              </Badge>
                            </div>
                            <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                              {leave.startDate} → {leave.endDate} ({leave.days} дн.)
                            </p>
                            <p className="text-sm text-muted-foreground">{leave.reason}</p>
                            {leave.reviewComment && (
                              <p className="text-xs text-muted-foreground mt-2">
                                💬 {leave.reviewComment}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {new Date(leave.createdAt).toLocaleDateString(
                              i18n.language === 'ru'
                                ? 'ru-RU'
                                : i18n.language === 'hy'
                                  ? 'hy-AM'
                                  : 'en-US',
                            )}
                            {leave.reviewerName && (
                              <div className="mt-1">
                                {t('superadmin.users.reviewedBy', {
                                  name: leave.reviewerName,
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks">
            <Card style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle>{t('superadmin.users.tasksTitle')}</CardTitle>
                <CardDescription>
                  {t('superadmin.users.tasksFound', { count: tasks.length })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('superadmin.users.noTasksFound')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <div
                        key={task._id}
                        className="p-4 rounded-lg border"
                        style={{ background: 'var(--background-subtle)' }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge>{task.priority}</Badge>
                              <Badge
                                variant={
                                  task.status === 'completed'
                                    ? 'outline'
                                    : task.status === 'in_progress'
                                      ? 'default'
                                      : 'secondary'
                                }
                              >
                                {task.status}
                              </Badge>
                            </div>
                            <p
                              className="font-semibold mb-1"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {localizedTaskTitle(t, task)}
                            </p>
                            {task.description && (
                              <p className="text-sm text-muted-foreground">{task.description}</p>
                            )}
                            {task.deadline && (
                              <p className="text-xs text-muted-foreground mt-2">
                                ⏰{' '}
                                {t('superadmin.users.deadline', {
                                  date: new Date(task.deadline).toLocaleDateString(
                                    i18n.language === 'ru'
                                      ? 'ru-RU'
                                      : i18n.language === 'hy'
                                        ? 'hy-AM'
                                        : 'en-US',
                                  ),
                                })}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {new Date(task.createdAt).toLocaleDateString(
                              i18n.language === 'ru'
                                ? 'ru-RU'
                                : i18n.language === 'hy'
                                  ? 'hy-AM'
                                  : 'en-US',
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Drivers Tab */}
          <TabsContent value="drivers">
            <Card style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle>Поездки</CardTitle>
                <CardDescription>{driverRequests.length} поездок найдено</CardDescription>
              </CardHeader>
              <CardContent>
                {driverRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Поездок не найдено</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {driverRequests.map((req) => (
                      <div
                        key={req._id}
                        className="p-4 rounded-lg border"
                        style={{ background: 'var(--background-subtle)' }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge>{req.status}</Badge>
                              {req.priority && (
                                <Badge variant={req.priority === 'P1' ? 'destructive' : 'outline'}>
                                  {req.priority}
                                </Badge>
                              )}
                            </div>
                            <p
                              className="font-semibold mb-1"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {req.tripInfo?.from} → {req.tripInfo?.to}
                            </p>
                            <p className="text-sm text-muted-foreground">{req.tripInfo?.purpose}</p>
                            {req.driverName && (
                              <p className="text-xs text-muted-foreground mt-2">
                                🚗 {req.driverName} {req.driverPhone && `• ${req.driverPhone}`}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {new Date(req.startTime).toLocaleString(
                              i18n.language === 'ru'
                                ? 'ru-RU'
                                : i18n.language === 'hy'
                                  ? 'hy-AM'
                                  : 'en-US',
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tickets Tab */}
          <TabsContent value="tickets">
            <Card style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle>Тикеты поддержки</CardTitle>
                <CardDescription>{supportTickets.length} тикетов найдено</CardDescription>
              </CardHeader>
              <CardContent>
                {supportTickets.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Тикетов не найдено</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {supportTickets.map((ticket) => (
                      <div
                        key={ticket._id}
                        className="p-4 rounded-lg border"
                        style={{ background: 'var(--background-subtle)' }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-mono text-sm">{ticket.ticketNumber}</span>
                              <Badge>{ticket.priority}</Badge>
                              <Badge
                                variant={
                                  ticket.status === 'closed' || ticket.status === 'resolved'
                                    ? 'outline'
                                    : 'default'
                                }
                              >
                                {ticket.status}
                              </Badge>
                            </div>
                            <p
                              className="font-semibold mb-1"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {ticket.title}
                            </p>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {ticket.description}
                            </p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {new Date(ticket.createdAt).toLocaleDateString(
                              i18n.language === 'ru'
                                ? 'ru-RU'
                                : i18n.language === 'hy'
                                  ? 'hy-AM'
                                  : 'en-US',
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle>Последняя активность</CardTitle>
                <CardDescription>Уведомления и действия пользователя</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.notifications?.slice(0, 20).map((notif) => (
                    <div
                      key={notif._id}
                      className={`p-3 rounded-lg border flex items-start gap-3 ${!notif.isRead ? 'bg-(--brand-quiet) border-(--brand-outline)' : ''}`}
                      style={{ background: 'var(--background-subtle)' }}
                    >
                      <div className="w-2 h-2 rounded-full mt-2 bg-(--brand) shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {notif.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{notif.message}</p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(notif.createdAt).toLocaleDateString(
                          i18n.language === 'ru'
                            ? 'ru-RU'
                            : i18n.language === 'hy'
                              ? 'hy-AM'
                              : 'en-US',
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle>История входов</CardTitle>
                <CardDescription>Последние попытки входа в систему</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {loginAttempts?.slice(0, 20).map((attempt) => (
                    <div
                      key={attempt._id}
                      className={`p-3 rounded-lg border flex items-start gap-3 ${!attempt.success ? 'bg-(--danger-quiet) border-(--danger-outline)' : ''}`}
                      style={{ background: 'var(--background-subtle)' }}
                    >
                      {attempt.success ? (
                        <CheckCircle className="w-5 h-5 text-(--success-text) shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-(--danger-text) shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 data-[state=active]:bg-(--brand) data-[state=active]:text-white">
                          <span
                            className="text-sm font-medium"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {attempt.success ? 'Успешный вход' : 'Неудачная попытка'}
                          </span>{' '}
                          <Badge variant="outline">
                            {(attempt as { authMethod?: string }).authMethod || 'password'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          <div>IP: {(attempt as { ipAddress?: string }).ipAddress || 'N/A'}</div>
                          <div>Устройство: {attempt.userAgent || 'N/A'}</div>
                          {attempt.riskScore && (
                            <div>
                              Риск:{' '}
                              <span
                                className={
                                  attempt.riskScore > 50
                                    ? 'text-(--danger-text)'
                                    : 'text-(--success-text)'
                                }
                              >
                                {attempt.riskScore}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(attempt.createdAt).toLocaleString(
                          i18n.language === 'ru'
                            ? 'ru-RU'
                            : i18n.language === 'hy'
                              ? 'hy-AM'
                              : 'en-US',
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Chat Tab */}
          <TabsContent value="chat">
            <Card style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle>{t('superadmin.users.chatMessages')}</CardTitle>
                <CardDescription>{t('superadmin.users.chatDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.chatMessages?.slice(0, 20).map((msg) => (
                    <div
                      key={msg._id}
                      className="p-3 rounded-lg border"
                      style={{ background: 'var(--background-subtle)' }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                            {msg.content}
                          </p>
                          {msg.type === 'system' && (
                            <Badge variant="secondary" className="mt-1">
                              {t('superadmin.users.system')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Temporary password dialog — confirm first, then show the plaintext
            exactly once with copy + expiry info. */}
        <Dialog
          open={pwDialogOpen}
          onOpenChange={(open) => {
            if (!issuing) {
              setPwDialogOpen(open);
              if (!open) setTempPwResult(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            {!tempPwResult ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-(--warning-text)" />
                    {t('superadmin.users.issueConfirmTitle')}
                  </DialogTitle>
                  <DialogDescription>{t('superadmin.users.issueConfirmDesc')}</DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <label className="block text-sm font-medium mb-1.5">
                    {t('superadmin.users.validityLabel')}
                  </label>
                  <select
                    value={ttlHours}
                    onChange={(e) => setTtlHours(Number(e.target.value))}
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--border)' }}
                    disabled={issuing}
                  >
                    {TEMP_PASSWORD_TTL_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {t('superadmin.users.validityHours', { count: h })}
                      </option>
                    ))}
                  </select>
                </div>
                {issueError && <p className="text-sm text-(--danger-text)">{issueError}</p>}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={issuing}
                    onClick={() => setPwDialogOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button size="sm" disabled={issuing} onClick={handleIssueTempPassword}>
                    {issuing
                      ? t('superadmin.users.issuing')
                      : t('superadmin.users.issueConfirmAction')}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" />
                    {t('superadmin.users.tempPwTitle')}
                  </DialogTitle>
                  <DialogDescription>{t('superadmin.users.tempPwDesc')}</DialogDescription>
                </DialogHeader>
                <div
                  className="my-2 flex items-center gap-2 rounded-xl border p-3"
                  style={{ background: 'var(--background-subtle)', borderColor: 'var(--border)' }}
                >
                  <code className="min-w-0 flex-1 select-all break-all text-center font-mono text-lg font-bold tracking-wider">
                    {tempPwResult.password}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyTempPw}
                    className="shrink-0 gap-1.5"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-(--success-text)" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copied ? t('superadmin.users.copied') : t('superadmin.users.copy')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('superadmin.users.validUntil', {
                    date: new Date(tempPwResult.expiresAt).toLocaleString(
                      i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US',
                    ),
                  })}
                </p>
                <DialogFooter>
                  <Button
                    size="sm"
                    onClick={() => {
                      setPwDialogOpen(false);
                      setTempPwResult(null);
                    }}
                  >
                    {t('common.done')}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Block / suspend confirmation. Reuses the same `users.admin` mutation
            the security dashboard uses; reason and duration are recorded on
            the user document and in the audit log. */}
        <AlertDialog
          open={blockDialogOpen}
          onOpenChange={(open) => {
            if (!blocking) setBlockDialogOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('superadmin.users.blockDialogTitle', 'Block this user?')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('superadmin.users.blockDialogDesc', {
                  defaultValue:
                    'The user will be signed out of every device and cannot log in again until the block expires or you unblock them.',
                  name: user.name,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-(--text-3)">
                  {t('superadmin.users.blockDuration', 'Duration')}
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {BLOCK_DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBlockHours(opt.value)}
                      className={
                        'rounded-full border px-3 py-1 text-xs transition ' +
                        (blockHours === opt.value
                          ? 'border-(--brand) bg-(--brand-quiet) text-(--brand-text)'
                          : 'border-(--border-default) bg-(--surface-1) text-(--text-2) hover:bg-(--surface-2)')
                      }
                    >
                      {t(`superadmin.users.blockDurationOption.${opt.labelKey}`, opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-(--text-3)">
                  {t('superadmin.users.blockReasonLabel', 'Reason (for the audit log)')}
                </label>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={t(
                    'superadmin.users.blockReasonPlaceholder',
                    'e.g. suspicious activity, pending HR review',
                  )}
                  className="mt-1.5 w-full resize-none rounded-md border border-(--border-default) bg-(--surface-1) px-3 py-2 text-sm text-(--text-1) outline-none placeholder:text-(--text-4) focus:border-(--brand)"
                />
              </div>
            </div>

            {blockError && (
              <div className="rounded-md border border-(--danger-outline) bg-(--danger-quiet) px-3 py-2 text-xs text-(--danger-text)">
                {blockError}
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={blocking}>
                {t('common.cancel', 'Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={blocking}
                onClick={(event) => {
                  event.preventDefault();
                  void handleBlockUser();
                }}
                className="bg-(--danger) text-white hover:bg-(--danger)/90"
              >
                {blocking && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {t('superadmin.users.blockConfirmAction', 'Block user')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Unblock confirmation. Keeps the action explicit because a stray
            click would lift a security control. */}
        <AlertDialog
          open={unblockDialogOpen}
          onOpenChange={(open) => {
            if (!unblocking) setUnblockDialogOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('superadmin.users.unblockDialogTitle', 'Unblock this user?')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('superadmin.users.unblockDialogDesc', {
                  defaultValue:
                    'The user will be able to sign in again immediately. Existing sessions are not restored — they will need to log in from scratch.',
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={unblocking}>
                {t('common.cancel', 'Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={unblocking}
                onClick={(event) => {
                  event.preventDefault();
                  void handleUnblockUser();
                }}
                className="bg-(--success) text-white hover:bg-(--success)/90"
              >
                {unblocking && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {t('superadmin.users.unblockConfirmAction', 'Unblock user')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'text-(--brand-text)',
    green: 'text-(--success-text)',
    red: 'text-(--danger-text)',
    purple: 'text-(--purple-text)',
    gray: 'text-(--text-3)',
    orange: 'text-(--warning-text)',
  };

  return (
    <Card style={{ background: 'var(--background-subtle)' }}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">{title}</p>
          <Icon className={`w-4 h-4 ${colorClasses[color]}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
