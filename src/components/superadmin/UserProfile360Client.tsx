'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import {
  User,
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
  Eye,
  ArrowLeft,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';

export default function UserProfile360Page() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as Id<'users'>;

  const data = useQuery(api.superadmin.getUser360, userId ? { userId } : 'skip');

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
        return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
      case 'admin':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'supervisor':
        return 'bg-green-500/10 text-green-600 border-green-500/30';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-7xl">
        {/* Back Button */}
        <div className="mb-4">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t('superadmin.users.back') as any}
          </Button>
        </div>

        {/* Header - User Profile */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <Card className="mb-6" style={{ background: 'var(--card)' }}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={user.avatarUrl} />
                    <AvatarFallback className="text-2xl">
                      {user.name
                        .split(' ')
                        .map((n: any) => n[0])
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
                        <Badge variant="outline" className="text-green-600 border-green-500/30">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {t('superadmin.users.active') as any}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-500/30">
                          <XCircle className="w-3 h-3 mr-1" />
                          {t('superadmin.users.inactive') as any}
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
                          {(organization as any)?.name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white">
                  <Button variant="outline" size="sm" className="gap-2">
                    <MessageSquare className="w-4 h-4" />
                    {t('superadmin.users.writeMessage') as any}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Key className="w-4 h-4" />
                    {t('superadmin.users.impersonate') as any}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-red-600 hover:text-red-700"
                  >
                    <Ban className="w-4 h-4" />
                    {t('superadmin.users.blockUser') as any}
                  </Button>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <StatCard
            title={t('superadmin.leaves') as any}
            value={stats.totalLeaves}
            icon={Calendar}
            color="blue"
          />
          <StatCard
            title={t('superadmin.users.pending') as any}
            value={stats.pendingLeaves}
            icon={Clock}
            color="orange"
          />
          <StatCard
            title={t('superadmin.users.approved') as any}
            value={stats.approvedLeaves}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title={t('superadmin.tasks') as any}
            value={stats.totalTasks}
            icon={Briefcase}
            color="purple"
          />
          <StatCard
            title={t('superadmin.users.completed') as any}
            value={stats.completedTasks}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title={t('superadmin.rides') as any}
            value={stats.totalDriverRequests}
            icon={Car}
            color="blue"
          />
          <StatCard
            title={t('superadmin.tickets') as any}
            value={stats.totalTickets}
            icon={Ticket}
            color="purple"
          />
          <StatCard
            title={t('superadmin.users.logins') as any}
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
              className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Отпуска</span>
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Briefcase className="w-4 h-4" />
              <span className="hidden sm:inline">Задачи</span>
            </TabsTrigger>
            <TabsTrigger
              value="drivers"
              className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Car className="w-4 h-4" />
              <span className="hidden sm:inline">Поездки</span>
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Ticket className="w-4 h-4" />
              <span className="hidden sm:inline">Тикеты</span>
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Активность</span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Безопасность</span>
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Чат</span>
            </TabsTrigger>
          </TabsList>

          {/* Leaves Tab */}
          <TabsContent value="leaves">
            <Card style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle>{t('superadmin.users.leaveRequests') as any}</CardTitle>
                <CardDescription>
                  {t('superadmin.users.leaveRequestsFound', { count: leaves.length }) as any}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {leaves.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('superadmin.users.noLeaveRequests') as any}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {leaves.map((leave: any) => (
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
                                {
                                  t('superadmin.users.reviewedBy', {
                                    name: leave.reviewerName,
                                  }) as any
                                }
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
                <CardTitle>{t('superadmin.users.tasksTitle') as any}</CardTitle>
                <CardDescription>
                  {t('superadmin.users.tasksFound', { count: tasks.length }) as any}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('superadmin.users.noTasksFound') as any}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasks.map((task: any) => (
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
                              {task.title}
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
                    {driverRequests.map((req: any) => (
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
                    {supportTickets.map((ticket: any) => (
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
                  {data.notifications?.slice(0, 20).map((notif: any) => (
                    <div
                      key={notif._id}
                      className={`p-3 rounded-lg border flex items-start gap-3 ${!notif.isRead ? 'bg-blue-500/5 border-blue-500/30' : ''}`}
                      style={{ background: 'var(--background-subtle)' }}
                    >
                      <div className="w-2 h-2 rounded-full mt-2 bg-blue-500 shrink-0" />
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
                  {loginAttempts?.slice(0, 20).map((attempt: any) => (
                    <div
                      key={attempt._id}
                      className={`p-3 rounded-lg border flex items-start gap-3 ${!attempt.success ? 'bg-red-500/5 border-red-500/30' : ''}`}
                      style={{ background: 'var(--background-subtle)' }}
                    >
                      {attempt.success ? (
                        <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white">
                          <span
                            className="text-sm font-medium"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {attempt.success ? 'Успешный вход' : 'Неудачная попытка'}
                          </span>
                          <Badge variant="outline">{attempt.authMethod || 'password'}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          <div>IP: {attempt.ipAddress || 'N/A'}</div>
                          <div>Устройство: {attempt.userAgent || 'N/A'}</div>
                          {attempt.riskScore && (
                            <div>
                              Риск:{' '}
                              <span
                                className={
                                  attempt.riskScore > 50 ? 'text-red-500' : 'text-green-500'
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
                <CardTitle>{t('superadmin.users.chatMessages') as any}</CardTitle>
                <CardDescription>{t('superadmin.users.chatDesc') as any}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.chatMessages?.slice(0, 20).map((msg: any) => (
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
                              {t('superadmin.users.system') as any}
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
  icon: any;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    red: 'text-red-500',
    purple: 'text-purple-500',
    gray: 'text-gray-500',
    orange: 'text-orange-500',
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
