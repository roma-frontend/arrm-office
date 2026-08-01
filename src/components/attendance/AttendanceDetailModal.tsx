'use client';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { formatTime as formatTimeUtil } from '@/lib/date-format';
import React from 'react';
import { useHydrated } from '@/hooks/useHydrated';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  X,
  Clock,
  LogIn,
  LogOut,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Timer,
  TrendingUp,
  User,
  Building2,
} from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '../../../convex/_generated/dataModel';

export interface AttendanceRecord {
  _id: string;
  userId: Id<'users'>;
  date: string;
  checkInTime: number;
  checkOutTime?: number;
  totalWorkedMinutes?: number;
  status: 'checked_in' | 'checked_out' | 'absent';
  isLate?: boolean;
  lateMinutes?: number;
  isEarlyLeave?: boolean;
  earlyLeaveMinutes?: number;
  overtimeMinutes?: number;
  user?: {
    name?: string;
    email?: string;
    department?: string;
    position?: string;
    role?: string;
    avatarUrl?: string;
    supervisorName?: string;
  };
}

interface AttendanceDetailModalProps {
  record: AttendanceRecord | null;
  open: boolean;
  onClose: () => void;
}

function formatTime(timestamp: number, lang: string) {
  return formatTimeUtil(timestamp, lang, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function AttendanceDetailModal({ record, open, onClose }: AttendanceDetailModalProps) {
  const { t, i18n } = useTranslation(['modules', 'common']);
  const mounted = useHydrated();
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-02"
  const monthlyStats = useQuery(
    api.timeTracking.getMonthlyStats,
    record?.userId ? { userId: record.userId, month: currentMonth } : 'skip',
  );

  const recentRecords = useQuery(
    api.timeTracking.getRecentAttendance,
    record?.userId ? { userId: record.userId, limit: 7 } : 'skip',
  );

  if (!record) return null;

  const workedHours = record.totalWorkedMinutes
    ? (record.totalWorkedMinutes / 60).toFixed(1)
    : null;
  const expectedHours = 9; // 9:00 to 18:00
  const workCompletion = workedHours
    ? Math.min(100, (parseFloat(workedHours) / expectedHours) * 100)
    : 0;

  if (monthlyStats === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <ShieldLoader size="md" />
      </div>
    );

  return (
    <>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={onClose}
                />

                {/* Modal */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-border bg-background"
                >
                  {/* Header gradient */}
                  <div className="relative h-28 bg-gradient-to-r from-primary to-primary/80 flex items-end px-6 pb-4">
                    <Button
                      onClick={onClose}
                      variant="ghost"
                      size="icon"
                      className="absolute! top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                    >
                      <X className="w-4 h-4 text-white" />
                    </Button>

                    {/* Avatar */}
                    <div className="flex items-end gap-4">
                      <div className="w-16 h-16 rounded-full shrink-0 overflow-hidden shadow-lg bg-gradient-to-r from-primary to-primary/80 flex items-center justify-center text-white text-2xl font-bold">
                        {record.user?.avatarUrl ? (
                          <Image
                            src={record.user.avatarUrl}
                            alt={record.user.name ?? ''}
                            width={64}
                            height={64}
                            unoptimized
                            className="w-full h-full object-cover scale-110"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          (record.user?.name
                            ?.split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2) ?? '?')
                        )}
                      </div>
                      <div className="pb-1">
                        <h2 className="text-xl font-bold text-white">
                          {record.user?.name ?? t('common.unknownUser', 'Unknown')}
                        </h2>
                        <p className="text-white/70 text-sm">
                          {record.user?.position ?? record.user?.role ?? 'Employee'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="bg-background p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                    {/* Date & Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {new Date(record.date).toLocaleDateString(
                          i18n?.language === 'ru'
                            ? 'ru-RU'
                            : i18n?.language === 'hy'
                              ? 'hy-AM'
                              : 'en-GB',
                          {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          },
                        )}
                      </div>
                      <div className="flex gap-2">
                        {record.status === 'checked_in' && (
                          <Badge className="bg-green-500 text-white">{t('common.active')}</Badge>
                        )}
                        {record.status === 'checked_out' && (
                          <Badge className="bg-blue-500 text-white">{t('common.done')}</Badge>
                        )}
                        {record.status === 'absent' && (
                          <Badge variant="destructive">{t('statuses.absent')}</Badge>
                        )}
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="rounded-xl p-4 space-y-4 border border-border bg-muted/30 shadow-sm">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        {t('attendance.timeLine')}
                      </h3>
                      <div className="flex items-center gap-3">
                        {/* Check In */}
                        <div className="flex-1 rounded-lg p-3 bg-muted/30 border border-border">
                          <div className="flex items-center gap-2 mb-1">
                            <LogIn className="w-4 h-4 text-green-500" />
                            <span className="text-xs text-muted-foreground">
                              {t('attendance.checkIn')}
                            </span>
                          </div>
                          <p className="text-lg font-bold text-green-600 dark:text-green-400">
                            {record.checkInTime
                              ? formatTime(record.checkInTime, i18n.language)
                              : '—'}
                          </p>
                          {record.isLate && (
                            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {t('attendance.lateBy', { minutes: record.lateMinutes })}
                            </p>
                          )}
                          {!record.isLate && record.checkInTime && (
                            <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              {t('attendance.onTime')}
                            </p>
                          )}
                        </div>

                        {/* Arrow */}
                        <div className="text-muted-foreground text-lg">→</div>

                        {/* Check Out */}
                        <div className="flex-1 rounded-lg p-3 bg-muted/30 border border-border">
                          <div className="flex items-center gap-2 mb-1">
                            <LogOut className="w-4 h-4 text-blue-500" />
                            <span className="text-xs text-muted-foreground">
                              {t('attendance.checkOut')}
                            </span>
                          </div>
                          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {record.checkOutTime
                              ? formatTime(record.checkOutTime, i18n.language)
                              : '—'}
                          </p>
                          {record.isEarlyLeave && record.earlyLeaveMinutes && (
                            <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {t('attendance.earlyLeave', { minutes: record.earlyLeaveMinutes })}
                            </p>
                          )}
                          {record.checkOutTime && !record.isEarlyLeave && (
                            <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              {t('attendance.fullDay')}
                            </p>
                          )}
                          {!record.checkOutTime && record.status === 'checked_in' && (
                            <p className="text-xs text-green-500 mt-1">
                              {t('attendance.stillWorking')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Work duration */}
                      {workedHours && (
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span className="flex items-center gap-1">
                              <Timer className="w-3 h-3" /> {t('attendance.worked')}
                            </span>
                            <span className="font-semibold text-foreground">
                              {workedHours}h / {expectedHours}h
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${workCompletion}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className={`h-full rounded-full ${workCompletion >= 100 ? 'bg-green-500' : workCompletion >= 70 ? 'bg-blue-500' : 'bg-orange-500'}`}
                            />
                          </div>
                          {record.overtimeMinutes && record.overtimeMinutes > 0 && (
                            <p className="text-xs text-sky-500 mt-1">
                              +{formatDuration(record.overtimeMinutes)}{' '}
                              {t('attendanceExtra.overtime')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Department + Supervisor */}
                    <div className="flex flex-wrap gap-4">
                      {record.user?.department && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg">
                          <Building2 className="w-4 h-4" />
                          {record.user.department} {t('common.department')}
                        </div>
                      )}
                      {record.user?.supervisorName && (
                        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-muted/30 px-3 py-2 rounded-lg">
                          <User className="w-4 h-4" />
                          Supervisor:{' '}
                          <span className="font-semibold">{record.user.supervisorName}</span>
                        </div>
                      )}
                    </div>

                    {/* Monthly Stats */}
                    {monthlyStats && (
                      <div className="rounded-xl p-4 bg-muted/30 border border-border shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                          <TrendingUp className="w-4 h-4 text-sky-500" />
                          {t('attendance.thisMonth')}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="text-center p-3 bg-background rounded-lg">
                            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                              {monthlyStats.totalDays}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('attendanceExtra.daysWorked')}
                            </p>
                          </div>
                          <div className="text-center p-3 bg-background rounded-lg">
                            <p className="text-xl font-bold text-green-600 dark:text-green-400">
                              {monthlyStats.punctualityRate}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('attendanceExtra.punctuality')}
                            </p>
                          </div>
                          <div className="text-center p-3 bg-background rounded-lg">
                            <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                              {monthlyStats.lateDays}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('attendanceExtra.lateDays')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Recent 7 days */}
                    {recentRecords && recentRecords.length > 0 && (
                      <div className="rounded-xl p-4 bg-muted/30 border border-border shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                          <Calendar className="w-4 h-4 text-blue-500" />
                          {t('attendance.last7Days')}
                        </h3>
                        <div className="space-y-2">
                          {recentRecords.map((r) => (
                            <div
                              key={r._id}
                              className="flex items-center justify-between text-sm p-2 bg-background rounded-lg"
                            >
                              <span className="text-muted-foreground">
                                {new Date(r.date).toLocaleDateString(
                                  i18n?.language === 'ru'
                                    ? 'ru-RU'
                                    : i18n?.language === 'hy'
                                      ? 'hy-AM'
                                      : 'en-GB',
                                  {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                  },
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                {r.checkInTime ? (
                                  <span className="text-xs text-muted-foreground">
                                    {formatTime(r.checkInTime, i18n.language)} →{' '}
                                    {r.checkOutTime
                                      ? formatTime(r.checkOutTime, i18n.language)
                                      : '...'}
                                  </span>
                                ) : null}
                                {r.isLate && (
                                  <Badge variant="destructive" className="text-xs py-0">
                                    {t('statuses.late')}
                                  </Badge>
                                )}
                                {r.status === 'checked_out' && !r.isLate && (
                                  <Badge className="bg-green-500 text-white text-xs py-0">✓</Badge>
                                )}
                                {r.status === 'checked_in' && (
                                  <Badge className="bg-green-500 text-white text-xs py-0">
                                    {t('statuses.active')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
