'use client';

/**
 * Driver Dashboard - For drivers only
 * Shows: pending requests, today's schedule, shift management
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import {
  Calendar,
  Clock,
  TrendingUp,
  Star,
  ThumbsUp,
  ThumbsDown,
  Users,
  Timer,
  MapPinned,
  CheckCircle,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { toast } from 'sonner';
import { DriverStatsCard } from '@/components/drivers/DriverStatsCard';
import { DriverShiftControls } from '@/components/drivers/DriverShiftControls';
import { ShiftHistory } from '@/components/drivers/ShiftHistory';
import { DriverCalendar } from '@/components/drivers/DriverCalendar';
import {
  NavigatorDropdown,
  InAppCallButton,
  DriverQuickMessage,
} from '@/components/drivers/DriverActions';

export default function DriverDashboardPage() {
  const { t } = useTranslation(['drivers', 'common']);
  const _router = useRouter();
  const user = useAuthStore((state) => state.user);
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const userId = user?.id as Id<'users'> | undefined;
  const orgId = user?.organizationId as Id<'organizations'> | undefined;

  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Check if user is a driver
  const driver = useQuery(api.drivers.queries.getDriverByUserId, userId ? { userId } : 'skip');

  // Data queries
  const pendingRequests = useQuery(
    api.drivers.requests_queries.getDriverRequests,
    driver ? { driverId: driver._id, status: 'pending' as const } : 'skip',
  );

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const todayEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const todaySchedule = useQuery(
    api.drivers.queries.getDriverSchedule,
    driver ? { driverId: driver._id, startTime: todayStart, endTime: todayEnd } : 'skip',
  );

  // Mutations
  const respondToRequest = useMutation(api.drivers.requests_mutations.respondToDriverRequest);
  const updateAvailability = useMutation(api.drivers.driver_registration.updateDriverAvailability);
  const markArrived = useMutation(api.drivers.driver_operations.markDriverArrived);
  const markPickedUp = useMutation(api.drivers.driver_operations.markPassengerPickedUp);

  // Handlers
  const handleRespond = async (requestId: Id<'driverRequests'>, approved: boolean) => {
    if (!driver || !userId) return;
    try {
      await respondToRequest({
        requestId,
        driverId: driver._id,
        userId,
        approved,
        declineReason: approved ? undefined : 'Declined by driver',
      });
      toast.success(
        approved
          ? t('driver.requestApproved', 'Request approved!')
          : t('driver.requestDeclined', 'Request declined!'),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('driver.failedToRespond', 'Failed to respond');
      toast.error(message);
    }
  };

  const handleToggleAvailability = async (checked: boolean) => {
    if (!driver) return;
    try {
      await updateAvailability({ driverId: driver._id, isAvailable: checked });
      toast.success(
        checked
          ? t('driver.youAreNowAvailable', 'You are now available')
          : t('driver.youAreNowUnavailable', 'You are now unavailable'),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('driver.failedToUpdateAvailability', 'Failed to update availability');
      toast.error(message);
    }
  };

  // Loading
  if (driver === undefined || pendingRequests === undefined || todaySchedule === undefined) {
    return (
      <div className="flex items-center justify-center h-full min-h-100">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!driver) {
    return null;
  }

  const todayTrips =
    todaySchedule?.filter((s) => s.type === 'trip' && s.status === 'scheduled').length ?? 0;

  return (
    <div className="max-w-400 mx-auto px-0 sm:px-4 lg:px-6">
      {/* Header */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 mb-4 sm:mb-6 btn-gradient rounded-xl backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="relative p-4 sm:p-6 rounded-xl sm:rounded-2xl overflow-hidden">
          <div
            className="absolute top-[-50%] right-[-10%] w-64 sm:w-125 h-64 sm:h-125 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 60%)',
            }}
          />
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 justify-between">
            <div>
              <h1
                className="text-xl sm:text-2xl lg:text-3xl font-bold text-white"
                style={{ textShadow: '0 2px 20px rgba(0,0,0,0.15)' }}
              >
                {t('driver.dashboard', 'Driver Dashboard')}
              </h1>
              <p className="text-xs sm:text-sm mt-1" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {t('driver.dashboardDesc', 'Manage your trips and availability')}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-xs sm:text-sm text-white/90">
                {driver.isAvailable ? t('driver.available') : t('driver.busy')}
              </span>
              <Switch
                checked={driver.isAvailable}
                onCheckedChange={handleToggleAvailability}
                className="border-0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4 mb-6 sm:mb-8 drivers-stagger">
        <StatCard
          label={t('driver.todayTrips', "Today's Trips")}
          value={todayTrips}
          icon={Calendar}
          color="var(--primary)"
        />
        <StatCard
          label={t('driver.pendingRequests', 'Pending')}
          value={pendingRequests?.length ?? 0}
          icon={Clock}
          color="var(--warning)"
        />
        <StatCard
          label={t('driver.totalCompleted', 'Completed')}
          value={driver.totalTrips ?? 0}
          icon={TrendingUp}
          color="var(--success)"
        />
        <StatCard
          label={t('driver.rating', 'Rating')}
          value={driver.rating?.toFixed(1) ?? '5.0'}
          icon={Star}
          color="var(--warning)"
        />
      </div>

      {/* Shift Management - Only for drivers, not admins */}
      {user?.role !== 'admin' && user?.role !== 'superadmin' && (
        <DriverShiftControls driverId={driver._id} userId={userId!} organizationId={orgId!} />
      )}

      {/* Pending Requests */}
      <Card className="mb-6 sm:mb-8 border-(--border)">
        <CardHeader className="pb-3 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-base sm:text-xl font-semibold">
            {t('driver.pendingRequests', 'Pending Requests')}
          </h2>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          {pendingRequests && pendingRequests.length > 0 ? (
            <div className="space-y-3">
              {pendingRequests.map((request) => {
                const req = request as {
                  _id: string;
                  requesterAvatar?: string;
                  requesterName?: string;
                  tripInfo: {
                    from: string;
                    to: string;
                    pickupCoords?: { lat: number; lng: number };
                  };
                  startTime: number;
                  endTime: number;
                  requesterId?: Id<'users'>;
                  requesterPhone?: string;
                };
                return (
                  <div
                    key={req._id}
                    className="p-3 sm:p-4 rounded-xl border border-(--border) hover:border-(--primary)/30 transition-all duration-300"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <Avatar className="w-9 h-9 sm:w-10 sm:h-10 shrink-0">
                          {req.requesterAvatar && <AvatarImage src={req.requesterAvatar} />}
                          <AvatarFallback className="text-xs">
                            {req.requesterName
                              ?.split(' ')
                              .map((n) => n[0])
                              .join('') ?? '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm sm:text-base truncate">
                            {req.requesterName ?? t('common.unknown')}
                          </h3>
                          <p className="text-xs sm:text-sm text-(--text-muted) truncate">
                            {req.tripInfo.from} → {req.tripInfo.to}
                          </p>
                          <p className="text-xs text-(--text-muted)">
                            {format(new Date(req.startTime), 'MMM dd, HH:mm', {
                              locale: dateFnsLocale,
                            })}{' '}
                            - {format(new Date(req.endTime), 'HH:mm', { locale: dateFnsLocale })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRespond(req._id as Id<'driverRequests'>, false)}
                          className="flex-1 sm:flex-none text-xs"
                        >
                          <ThumbsDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />{' '}
                          {t('driver.decline', 'Decline')}
                        </Button>
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => handleRespond(req._id as Id<'driverRequests'>, true)}
                          className="flex-1 sm:flex-none text-xs"
                        >
                          <ThumbsUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />{' '}
                          {t('driver.approve', 'Approve')}
                        </Button>
                      </div>
                    </div>
                    {/* Quick actions */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {req.requesterId && (
                        <InAppCallButton
                          callerUserId={userId!}
                          callerName={driver.userName || 'Driver'}
                          remoteUserId={req.requesterId}
                          remoteName={req.requesterName || 'Passenger'}
                          remotePhone={req.requesterPhone}
                          organizationId={orgId!}
                        />
                      )}
                      {req.requesterId && (
                        <DriverQuickMessage
                          passengerUserId={req.requesterId}
                          passengerName={req.requesterName}
                          driverUserId={userId!}
                          organizationId={orgId!}
                          tripInfo={req.tripInfo}
                        />
                      )}
                      {req.tripInfo.pickupCoords && (
                        <NavigatorDropdown
                          label={t('driver.pickup', 'Pickup')}
                          coords={req.tripInfo.pickupCoords}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 sm:py-8 text-(--text-muted)">
              <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <p className="text-sm">{t('driver.noRequests', 'No pending requests')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Schedule */}
      <Card className="mb-6 sm:mb-8 border-(--border)">
        <CardHeader className="pb-3 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-base sm:text-xl font-semibold">
            {t('driver.todaySchedule', "Today's Schedule")}
          </h2>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          {todaySchedule && todaySchedule.length > 0 ? (
            <div className="space-y-3">
              {todaySchedule
                .sort((a, b) => a.startTime - b.startTime)
                .map((schedule) => {
                  const s = schedule as {
                    _id: string;
                    status: string;
                    type: string;
                    startTime: number;
                    endTime: number;
                    tripInfo?: { from: string; to: string };
                    userName?: string;
                    arrivedAt?: number;
                    passengerPickedUpAt?: number;
                  };
                  return (
                    <div
                      key={s._id}
                      className="flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border border-(--border) hover:border-(--primary)/30 transition-all duration-300"
                    >
                      <div
                        className={`w-1.5 sm:w-2 shrink-0 rounded-full ${
                          s.status === 'scheduled'
                            ? 'bg-(--primary)'
                            : s.status === 'completed'
                              ? 'bg-(--success)'
                              : 'bg-(--text-disabled)'
                        }`}
                        style={{
                          boxShadow:
                            s.status === 'scheduled'
                              ? '0 0 12px color-mix(in srgb, var(--primary) 50%, transparent)'
                              : s.status === 'completed'
                                ? '0 0 12px color-mix(in srgb, var(--success) 50%, transparent)'
                                : undefined,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs sm:text-sm">
                              {format(new Date(s.startTime), 'HH:mm', { locale: dateFnsLocale })} -{' '}
                              {format(new Date(s.endTime), 'HH:mm', { locale: dateFnsLocale })}
                            </span>
                            <Badge
                              variant={s.type === 'trip' ? 'default' : 'secondary'}
                              className="text-[10px] sm:text-xs"
                            >
                              {s.type}
                            </Badge>
                          </div>
                        </div>
                        {s.tripInfo && (
                          <p className="text-xs sm:text-sm text-(--text-muted) mt-1 truncate">
                            {s.tripInfo.from} → {s.tripInfo.to}
                          </p>
                        )}
                        {s.userName && (
                          <p className="text-xs text-(--text-muted) truncate">
                            {t('driver.passenger', 'Passenger')}: {s.userName}
                          </p>
                        )}
                        {/* Actions */}
                        {s.type === 'trip' &&
                          (s.status === 'scheduled' || s.status === 'in_progress') && (
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              {s.status === 'scheduled' && !s.arrivedAt && (
                                <Button
                                  size="sm"
                                  variant="success"
                                  className="gap-1 h-7 px-2 text-xs flex-1 sm:flex-none"
                                  onClick={async () => {
                                    try {
                                      await markArrived({
                                        scheduleId: s._id as Id<'driverSchedules'>,
                                        userId: userId!,
                                      });
                                      toast.success(
                                        t('driver.markedAsArrived', 'Marked as arrived!'),
                                      );
                                    } catch (e) {
                                      const message =
                                        e instanceof Error
                                          ? e.message
                                          : t('driver.failed', 'Failed');
                                      toast.error(message);
                                    }
                                  }}
                                >
                                  <MapPinned className="w-3 h-3" />
                                  {t('driver.arrived', "I've Arrived")}
                                </Button>
                              )}
                              {s.arrivedAt && !s.passengerPickedUpAt && (
                                <>
                                  <Badge variant="warning" className="text-xs">
                                    <Timer className="w-3 h-3 mr-1" />
                                    {t('driver.waiting', 'Waiting')}:{' '}
                                    {Math.round((currentTime - s.arrivedAt) / 60000)}{' '}
                                    {t('driver.minutes', 'min')}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    className="gap-1 h-7 px-2 text-xs flex-1 sm:flex-none"
                                    onClick={async () => {
                                      try {
                                        await markPickedUp({
                                          scheduleId: s._id as Id<'driverSchedules'>,
                                          userId: userId!,
                                        });
                                        toast.success(
                                          t('driver.passengerPickedUp', 'Passenger picked up!'),
                                        );
                                      } catch (e) {
                                        const message =
                                          e instanceof Error
                                            ? e.message
                                            : t('driver.failed', 'Failed');
                                        toast.error(message);
                                      }
                                    }}
                                  >
                                    <Users className="w-3 h-3" />
                                    {t('driver.passengerIn', 'Passenger In')}
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-6 sm:py-8 text-(--text-muted)">
              <Calendar className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <p className="text-sm">{t('driver.noSchedule', 'No trips scheduled for today')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Calendar */}
      <Card className="mb-6 sm:mb-8 border-(--border)">
        <CardHeader className="pb-3 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-base sm:text-xl font-semibold">
            {t('driver.weeklySchedule', 'Weekly Schedule')}
          </h2>
        </CardHeader>
        <CardContent className="px-2 sm:px-4 py-2 sm:py-4">
          <DriverCalendar
            driverId={driver._id}
            organizationId={orgId!}
            userId={userId}
            role="driver"
          />
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card className="mb-6 sm:mb-8 border-(--border)">
        <CardHeader className="pb-3 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-base sm:text-xl font-semibold">
            {t('driver.tripStatistics', 'Trip Statistics')}
          </h2>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <DriverStatsCard driverId={driver._id} organizationId={orgId!} />
        </CardContent>
      </Card>

      {/* Shift History */}
      <Card className="mb-6 sm:mb-8 border-(--border)">
        <CardHeader className="pb-3 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-base sm:text-xl font-semibold">
            {t('driver.shiftHistory', 'Shift History')}
          </h2>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <ShiftHistory driverId={driver._id} />
        </CardContent>
      </Card>
    </div>
  );
}

// Helper component
function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <Card className="drivers-card-hover relative overflow-hidden border-(--border) bg-(--card-elevated)">
      <div className="drivers-stats-shimmer absolute inset-0 pointer-events-none" />
      <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
        <h3 className="text-sm font-medium text-(--text-muted)">{label}</h3>
        <div className="p-2 rounded-lg" style={{ background: `${color}20`, color }}>
          <Icon className="w-4 h-4" />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-2xl font-bold" style={{ color }}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
