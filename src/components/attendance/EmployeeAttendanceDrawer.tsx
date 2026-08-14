'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useHydrated } from '@/hooks/useHydrated';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { formatTime as formatTimeUtil } from '@/lib/date-format';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { X, Calendar, LogIn, LogOut, Timer, Building2, UserCog } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

export interface EmployeeInfo {
  _id: Id<'users'>;
  name: string;
  position?: string;
  department?: string;
  avatarUrl?: string;
  supervisorName?: string;
}

interface Props {
  employee: EmployeeInfo | null;
  onClose: () => void;
}

function formatTime(ts: number, lang: string) {
  return formatTimeUtil(ts, lang, { hour: '2-digit', minute: '2-digit' });
}
function _formatDuration(min: number) {
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Months will be translated using i18n in the component

export function EmployeeAttendanceDrawer({ employee, onClose }: Props) {
  const { t, i18n } = useTranslation(['modules', 'common']);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(monthKey(now));
  const mounted = useHydrated();

  const MONTHS = [
    t('months.jan'),
    t('months.feb'),
    t('months.mar'),
    t('months.apr'),
    t('months.may'),
    t('months.jun'),
    t('months.jul'),
    t('months.aug'),
    t('months.sep'),
    t('months.oct'),
    t('months.nov'),
    t('months.dec'),
  ];

  const history = useQuery(
    api.timeTracking.getEmployeeAttendanceHistory,
    employee ? { userId: employee._id, month: selectedMonth } : 'skip',
  );

  const monthlyStats = useQuery(
    api.timeTracking.getMonthlyStats,
    employee ? { userId: employee._id, month: selectedMonth } : 'skip',
  );

  const [year, month] = selectedMonth.split('-').map(Number);
  const monthLabel = `${MONTHS[(month ?? 1) - 1]} ${year ?? new Date().getFullYear()}`;

  // Generate last 12 months for selector
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return monthKey(d);
  });

  return (
    <>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {employee && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                  onClick={onClose}
                />

                {/* Drawer */}
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="fixed right-0 top-0 h-full w-full max-w-lg shadow-2xl z-50 flex flex-col"
                  style={{ background: 'var(--card)' }}
                >
                  {/* Header */}
                  <div className="px-6 py-6 shrink-0">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center text-xl font-bold shrink-0"
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.15)',
                            color: 'var(--text-on-primary)',
                          }}
                        >
                          {employee.avatarUrl ? (
                            <Image
                              src={employee.avatarUrl}
                              alt={employee.name}
                              width={64}
                              height={64}
                              unoptimized
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            employee.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)
                          )}
                        </div>
                        <div>
                          <h2 className="text-xl font-bold">{employee.name}</h2>
                          {employee.position && <p className="text-sm">{employee.position}</p>}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {employee.department && (
                              <span className="flex items-center gap-1 text-xs">
                                <Building2 className="w-3 h-3" /> {employee.department}
                              </span>
                            )}
                            {employee.supervisorName && (
                              <span className="flex items-center gap-1 text-xs">
                                <UserCog className="w-3 h-3" /> {employee.supervisorName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.15)',
                          color: 'var(--text-on-primary)',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)')
                        }
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Month selector */}
                    <div className="mt-4">
                      <CustomSelect
                        value={selectedMonth}
                        onChange={setSelectedMonth}
                        fullWidth
                        options={monthOptions.map((m) => {
                          const [y, mo] = m.split('-').map(Number);
                          return {
                            value: m,
                            label: `${MONTHS[(mo ?? 1) - 1]} ${y ?? new Date().getFullYear()}`,
                          };
                        })}
                        triggerClassName="w-full px-4 py-2 rounded-xl text-sm font-medium focus:outline-none focus:ring-2"
                        dropdownClassName="bg-(--canvas) border border-(--border-strong) text-(--text-1)"
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  {monthlyStats && (
                    <div
                      className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b shrink-0"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {[
                        {
                          label: t('attendance.days'),
                          value: monthlyStats.totalDays,
                          color: 'text-(--brand-text)',
                        },
                        {
                          label: t('attendance.late'),
                          value: monthlyStats.lateDays,
                          color: 'text-(--danger-text)',
                        },
                        {
                          label: t('attendance.hours'),
                          value: monthlyStats.totalWorkedHours + 'h',
                          color: 'text-(--success-text)',
                        },
                        {
                          label: t('attendance.punctuality'),
                          value: monthlyStats.punctualityRate + '%',
                          color: 'text-(--brand-text)',
                        },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="py-4 text-center border-r last:border-0"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {s.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Records list */}
                  <div className="flex-1 overflow-y-auto">
                    {history === undefined ? (
                      <div className="flex items-center justify-center h-40">
                        <ShieldLoader size="sm" variant="inline" />
                      </div>
                    ) : history.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 gap-3">
                        <Calendar className="w-12 h-12" style={{ color: 'var(--border)' }} />
                        <p className="font-medium" style={{ color: 'var(--text-muted)' }}>
                          {t('attendance.noRecordsFor', { month: monthLabel })}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {t('attendance.noAttendanceThisMonth')}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {history.map((record) => {
                          const workedH = record.totalWorkedMinutes
                            ? (record.totalWorkedMinutes / 60).toFixed(1)
                            : null;
                          const dateObj = new Date(record.date + 'T00:00:00');
                          const dayLabel = dateObj.toLocaleDateString(
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
                          );

                          return (
                            <div
                              key={record._id}
                              className="px-6 py-4 transition-colors"
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor = 'var(--background-subtle)')
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor = 'transparent')
                              }
                            >
                              <div className="flex items-start justify-between gap-3">
                                {/* Date + status dot */}
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
                                      record.status === 'checked_in'
                                        ? 'bg-green-500 animate-pulse'
                                        : record.status === 'checked_out'
                                          ? 'bg-blue-500'
                                          : 'bg-rose-400'
                                    }`}
                                  />
                                  <div>
                                    <p
                                      className="font-semibold text-sm"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {dayLabel}
                                    </p>
                                    {record.status === 'absent' ? (
                                      <p className="text-xs text-rose-500 mt-0.5">
                                        {t('statuses.absent')}
                                      </p>
                                    ) : (
                                      <div
                                        className="flex items-center gap-2 mt-0.5 text-xs"
                                        style={{ color: 'var(--text-muted)' }}
                                      >
                                        <span className="flex items-center gap-1">
                                          <LogIn className="w-3 h-3 text-green-500" />
                                          {record.checkInTime
                                            ? formatTime(record.checkInTime, i18n.language)
                                            : '—'}
                                        </span>
                                        <span>→</span>
                                        <span className="flex items-center gap-1">
                                          <LogOut className="w-3 h-3 text-blue-500" />
                                          {record.checkOutTime ? (
                                            formatTime(record.checkOutTime, i18n.language)
                                          ) : (
                                            <span className="text-green-500">
                                              {t('statuses.active')}
                                            </span>
                                          )}
                                        </span>
                                        {workedH && (
                                          <span className="flex items-center gap-1 text-blue-500">
                                            <Timer className="w-3 h-3" />
                                            {workedH}h
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Badges */}
                                <div className="flex flex-wrap gap-1 justify-end">
                                  {record.isLate && (
                                    <span className="text-xs bg-(--danger-quiet) text-(--danger-text) px-2 py-0.5 rounded-full font-medium">
                                      {t('attendance.lateMinutes', { minutes: record.lateMinutes })}
                                    </span>
                                  )}
                                  {record.isEarlyLeave && (
                                    <span className="text-xs bg-(--warning-quiet) text-(--warning-text) px-2 py-0.5 rounded-full font-medium">
                                      {t('attendance.earlyLeave', {
                                        minutes: record.earlyLeaveMinutes,
                                      })}
                                    </span>
                                  )}
                                  {record.overtimeMinutes && record.overtimeMinutes > 0 && (
                                    <span className="text-xs bg-(--brand-quiet) text-(--brand-text) px-2 py-0.5 rounded-full font-medium">
                                      {t('attendance.overtime', {
                                        minutes: record.overtimeMinutes,
                                      })}
                                    </span>
                                  )}
                                  {record.status === 'checked_out' &&
                                    !record.isLate &&
                                    !record.isEarlyLeave && (
                                      <span className="text-xs bg-(--success-quiet) text-(--success-text) px-2 py-0.5 rounded-full font-medium">
                                        {t('attendance.perfect')}
                                      </span>
                                    )}
                                  {record.status === 'checked_in' && (
                                    <span className="text-xs bg-(--success-quiet) text-(--success-text) px-2 py-0.5 rounded-full font-medium animate-pulse">
                                      {t('attendance.active')}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Progress bar for worked hours */}
                              {workedH && record.status === 'checked_out' && (
                                <div className="mt-2 ml-6">
                                  <div
                                    className="h-1.5 rounded-full overflow-hidden"
                                    style={{ backgroundColor: 'var(--background-subtle)' }}
                                  >
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        parseFloat(workedH) >= 9
                                          ? 'bg-emerald-500'
                                          : parseFloat(workedH) >= 6
                                            ? 'bg-blue-500'
                                            : 'bg-amber-500'
                                      }`}
                                      style={{
                                        width: `${Math.min(100, (parseFloat(workedH) / 9) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              )}

                              {record.notes && (
                                <p
                                  className="text-xs mt-1 ml-6 italic"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  "{record.notes}"
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
