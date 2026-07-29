'use client';

import React from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, TrendingUp, AlertTriangle, Award, Target } from 'lucide-react';
import { motion } from '@/lib/cssMotion';
import { useAuthStore } from '@/store/useAuthStore';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

export function AttendanceDashboard() {
  const { user } = useAuthStore();
  const { t } = useTranslation(['modules', 'common']);
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-02"
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const monthlyStats = useQuery(
    api.timeTracking.getMonthlyStats,
    user?.id ? { userId: user.id as Id<'users'>, month: currentMonth } : 'skip',
  );

  const history = useQuery(
    api.timeTracking.getUserHistory,
    user?.id ? { userId: user.id as Id<'users'>, limit: 10 } : 'skip',
  );

  if (!monthlyStats) {
    return (
      <Card>
        <CardContent className="p-6">
          <ShieldLoader size="md" className="py-8" />
        </CardContent>
      </Card>
    );
  }

  const stats = [
    {
      label: t('attendanceExtra.daysWorked'),
      value: monthlyStats.totalDays,
      icon: Calendar,
      color: 'text-blue-500',
      borderColor: 'border-blue-500/30',
      iconBg: 'bg-blue-500/10',
    },
    {
      label: t('attendanceExtra.totalHours'),
      value: `${monthlyStats.totalWorkedHours}${t('time.h')}`,
      icon: Clock,
      color: 'text-green-500',
      borderColor: 'border-green-500/30',
      iconBg: 'bg-green-500/10',
    },
    {
      label: t('attendanceExtra.punctuality'),
      value: `${monthlyStats.punctualityRate}%`,
      icon: Target,
      color: 'text-sky-400',
      borderColor: 'border-sky-400/30',
      iconBg: 'bg-sky-400/10',
    },
    {
      label: t('attendanceExtra.overtime'),
      value: `${monthlyStats.totalOvertimeHours}${t('time.h')}`,
      icon: Award,
      color: 'text-orange-500',
      borderColor: 'border-orange-500/30',
      iconBg: 'bg-orange-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Monthly Stats */}
      <div>
        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          {t('attendance.monthlyAttendance')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className={`border ${stat.borderColor}`}
                style={{ background: 'var(--background-card)' }}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-(--text-muted) mb-1">{stat.label}</p>
                      <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                    </div>
                    <div className={`p-3 rounded-xl ${stat.iconBg}`}>
                      <stat.icon className={`w-7 h-7 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Issues Alert */}
      {(Number(monthlyStats.lateDays) > 0 || Number(monthlyStats.earlyLeaveDays) > 0) && (
        <Card
          className="border border-orange-500/30"
          style={{ background: 'var(--background-card)' }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-500">
              <AlertTriangle className="w-5 h-5" />
              {t('attendanceIssues.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Number(monthlyStats.lateDays) > 0 && (
                <p style={{ color: 'var(--text-primary)' }}>
                  • {monthlyStats.lateDays} {t('attendanceIssues.lateArrivals')}
                </p>
              )}
              {Number(monthlyStats.earlyLeaveDays) > 0 && (
                <p style={{ color: 'var(--text-primary)' }}>
                  • {monthlyStats.earlyLeaveDays} {t('attendanceIssues.earlyLeaves')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('attendance.recentAttendance')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="text-center text-(--text-muted) py-4">
              {t('attendanceIssues.noRecordsYet')}
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((record) => (
                <div
                  key={record._id}
                  className="flex flex-wrap gap-2 items-center justify-between p-4 rounded-lg border"
                  style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {format(new Date(record.date), 'MMMM dd, yyyy', { locale: dateFnsLocale })}
                      </p>
                      <p className="text-sm text-(--text-muted)">
                        {record.checkInTime
                          ? format(new Date(record.checkInTime), 'HH:mm', { locale: dateFnsLocale })
                          : '—'}{' '}
                        →{' '}
                        {record.checkOutTime
                          ? format(new Date(record.checkOutTime), 'HH:mm', {
                              locale: dateFnsLocale,
                            })
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {record.status === 'checked_in' && (
                      <Badge className="bg-green-500 text-white">
                        {t('taskStatus.inProgress')}
                      </Badge>
                    )}
                    {record.status === 'checked_out' && record.totalWorkedMinutes && (
                      <Badge variant="secondary">
                        {Math.floor(record.totalWorkedMinutes / 60)}
                        {t('attendanceExtra.hoursShort')} {record.totalWorkedMinutes % 60}
                        {t('attendanceExtra.minutesShort')}
                      </Badge>
                    )}
                    {record.isLate && <Badge variant="destructive">{t('statuses.late')}</Badge>}
                    {record.isEarlyLeave && (
                      <Badge className="bg-orange-500 text-white">
                        {t('attendanceIssues.early')}
                      </Badge>
                    )}
                    {record.overtimeMinutes && record.overtimeMinutes > 0 && (
                      <Badge className="bg-sky-400 text-white">
                        +{Math.floor(record.overtimeMinutes / 60)}
                        {t('attendanceExtra.hoursShort')} {t('attendanceExtra.overtimeShort')}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AttendanceDashboard;
