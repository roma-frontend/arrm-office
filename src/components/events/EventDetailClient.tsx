'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  Users,
  Bell,
  Pencil,
  Trash2,
  Building2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

const EventTypeBadge = ({ type }: { type: string }) => {
  const { t } = useTranslation();
  const variants: Record<string, string> = {
    meeting: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    conference: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    training: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    team_building: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    holiday: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    deadline: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    other: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  };

  return (
    <Badge className={`${variants[type] || variants.other} border-0`}>
      {t(`eventTypes.${type}`, type)}
    </Badge>
  );
};

const PriorityBadge = ({ priority }: { priority?: string }) => {
  const { t } = useTranslation();
  if (!priority) return null;

  const variants: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <Badge className={`${variants[priority] || variants.medium} border-0`}>
      {t(`priority.${priority}`, priority.charAt(0).toUpperCase() + priority.slice(1))}
    </Badge>
  );
};

export default function EventDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const eventId = params.id as Id<'companyEvents'>;

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const event = useQuery(api.events.getEventById, { eventId });
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );
  const attendance = useQuery(
    api.events.getEventAttendanceStatus,
    event ? { organizationId: event.organizationId as Id<'organizations'>, eventId } : 'skip',
  );

  const [isDeleting, setIsDeleting] = useState(false);

  const deleteEvent = useMutation(api.events.deleteCompanyEvent);

  const handleDelete = async () => {
    if (!currentUser) return;
    setIsDeleting(true);
    try {
      await deleteEvent({ eventId, userId: currentUser._id });
      toast.success(t('events.eventDeleted'));
      router.push('/events');
    } catch {
      toast.error(t('events.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!event) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  const isPast = endDate < new Date();
  const isUpcoming = startDate > new Date();
  const daysUntilEvent = Math.ceil((startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const confirmedCount = attendance?.attendanceStatus?.filter((s) => !s.hasConflict).length || 0;
  const totalRequired = attendance?.totalRequired || 0;
  const conflictCount = attendance?.hasConflicts || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/events')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{event.name}</h1>
            <p className="text-muted-foreground">
              {event.creatorName
                ? t('events.createdBy', { name: event.creatorName })
                : t('events.created')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/events/${eventId}/edit`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('events.status')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isPast ? (
              <Badge variant="secondary">{t('events.past')}</Badge>
            ) : isUpcoming ? (
              <Badge variant="default">{t('events.upcoming')}</Badge>
            ) : (
              <Badge variant="outline">{t('events.ongoing')}</Badge>
            )}
            {isUpcoming && (
              <p className="text-xs text-muted-foreground mt-2">
                {daysUntilEvent} {t('events.daysUntil')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('events.attendance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{confirmedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('events.confirmed')} / {totalRequired} {t('events.invited')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('events.typeLabel')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EventTypeBadge type={event.eventType} />
            <PriorityBadge priority={event.priority} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('events.datetime')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('events.startDate')}</span>
              <span className="font-medium">
                {format(startDate, 'dd MMM yyyy HH:mm', { locale: dateLocale })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('events.endDate')}</span>
              <span className="font-medium">
                {format(endDate, 'dd MMM yyyy HH:mm', { locale: dateLocale })}
              </span>
            </div>
            {event.isAllDay && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('events.allDay')}</span>
                <Badge variant="outline">{t('events.yes')}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('events.requirements')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {event.requiredDepartments && event.requiredDepartments.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">{t('events.departments')}</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {event.requiredDepartments.map((dept: string, index: number) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {dept}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {event.requiredEmployeeIds && event.requiredEmployeeIds.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('events.requiredEmployees')}
                </span>
                <span className="font-medium">{event.requiredEmployeeIds.length}</span>
              </div>
            )}
            {event.notifyDaysBefore && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('events.notifyBefore')}</span>
                <div className="flex items-center gap-1">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {event.notifyDaysBefore} {t('events.days')}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {event.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('events.description')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{event.description}</p>
          </CardContent>
        </Card>
      )}

      {attendance && conflictCount > 0 && attendance.attendanceStatus && (
        <Card className="border-yellow-200 dark:border-yellow-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              {t('events.conflicts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attendance.attendanceStatus
                .filter((s) => s.hasConflict)
                .map((conflict, index: number) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
                  >
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <div>
                      <p className="font-medium">{conflict.userName}</p>
                      <p className="text-sm text-muted-foreground">{conflict.department}</p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
