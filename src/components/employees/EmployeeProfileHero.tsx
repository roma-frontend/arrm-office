'use client';
import Image from 'next/image';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Phone, Building2, Calendar, Edit2, Trash2, Star, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from '@/lib/cssMotion';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

// ── Types ──
interface EmployeeData {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  position?: string;
  department?: string;
  location?: string;
  employeeType?: string;
  isActive?: boolean;
  avatarUrl?: string;
  createdAt: number;
}

interface ScoreData {
  overallScore: number;
  breakdown: {
    performance: number;
    attendance: number;
    behavior: number;
    leaveHistory: number;
  };
}

interface EmployeeProfileHeroProps {
  employee: EmployeeData;
  score?: ScoreData | null;
  monthlyStats?: {
    totalDays: number;
    totalWorkedHours: number;
    punctualityRate: number;
    lateDays: number;
  } | null;
  canEdit: boolean;
  canDelete: boolean;
  isAdminOrSupervisor: boolean;
  showRatingForm: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRate: () => void;
}

// ── Helpers ──
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Theme-aware gradient using CSS variables
function _getRoleGradientStyle(): React.CSSProperties {
  return {
    background:
      'linear-gradient(135deg, rgba(var(--primary-rgb), 0.8), rgba(var(--primary-rgb), 0.35))',
  };
}

// ── Circular Stat ──
function CircularStat({
  value,
  label,
  idx,
}: {
  value: number | string;
  label: string;
  idx: number;
}) {
  // Alternate opacities for visual variety without hardcoded hues
  const opacities = ['70', '55', '40', '25'];
  const opacity = opacities[idx % opacities.length] ?? '50';
  return (
    <div className="text-center">
      <div className="relative w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-1">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-white/10"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 28}`}
            strokeDashoffset={`${
              2 * Math.PI * 28 * (1 - (typeof value === 'number' ? Math.min(value, 100) : 0) / 100)
            }`}
            className={`text-white/${opacity}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm sm:text-base font-bold text-white">{value}</span>
        </div>
      </div>
      <p className="text-[10px] text-white/60 truncate max-w-[80px]">{label}</p>
    </div>
  );
}

// ── EmployeeProfileHero ──
export default function EmployeeProfileHero({
  employee,
  score,
  monthlyStats,
  canEdit,
  canDelete,
  isAdminOrSupervisor,
  showRatingForm,
  onEdit,
  onDelete,
  onRate,
}: EmployeeProfileHeroProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-(--border) shadow-sm">
      {/* Cover gradient */}
      <div className="absolute inset-0 bg-primary opacity-90" />

      {/* Decorative circles */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/[0.06] rounded-full" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-white/[0.04] rounded-full" />
      <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-white/[0.02] rounded-full" />

      {/* Content */}
      <div className="relative z-10 p-6 sm:p-8">
        {/* Top row: Avatar + Name + Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Avatar */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative shrink-0"
            >
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl bg-white/10 backdrop-blur-sm">
                {employee.avatarUrl ? (
                  <Image
                    src={employee.avatarUrl}
                    alt={employee.name}
                    width={96}
                    height={96}
                    unoptimized
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl sm:text-3xl">
                    {getInitials(employee.name)}
                  </div>
                )}
              </div>
              {/* Online indicator */}
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white bg-white/60" />
            </motion.div>

            {/* Name + Role */}
            <div className="text-white">
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="text-2xl sm:text-3xl font-bold tracking-tight"
              >
                {employee.name}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="text-white/70 text-sm mt-1"
              >
                {employee.position || employee.role}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="flex flex-wrap items-center gap-2 mt-2"
              >
                <Badge className="bg-white/15 text-white border-0 hover:bg-white/25 text-[10px] sm:text-xs">
                  {t(`roles.${employee.role}`, employee.role)}
                </Badge>
                <Badge className="bg-white/10 text-white/80 border-0 text-[10px] sm:text-xs">
                  {t(
                    `employeeTypes.${employee.employeeType ?? 'staff'}`,
                    employee.employeeType ?? 'Staff',
                  )}
                </Badge>
                <Badge
                  className={`border-0 text-[10px] sm:text-xs ${
                    employee.isActive !== false
                      ? 'bg-white/15 text-white/90'
                      : 'bg-white/5 text-white/60'
                  }`}
                >
                  {employee.isActive !== false ? t('statuses.active') : t('statuses.inactive')}
                </Badge>
              </motion.div>
            </div>
          </div>

          {/* Action buttons — glassmorphism, theme-neutral */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="flex items-center gap-2 w-full sm:w-auto"
          >
            {canEdit && (
              <Button
                size="sm"
                onClick={onEdit}
                className="bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('common.edit')}</span>
              </Button>
            )}
            {canDelete && (
              <Button
                size="sm"
                onClick={onDelete}
                className="bg-white/10 hover:bg-white/20 text-white/70 hover:text-white border-0 backdrop-blur-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {isAdminOrSupervisor && (
              <Button
                size="sm"
                onClick={onRate}
                className={`gap-1.5 border-0 backdrop-blur-sm ${
                  showRatingForm
                    ? 'bg-white/25 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white/80'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${showRatingForm ? 'text-white' : ''}`} />
                <span className="hidden sm:inline">
                  {showRatingForm
                    ? t('employeeProfile.cancelRating')
                    : t('employeeProfile.ratePerformance')}
                </span>
              </Button>
            )}
          </motion.div>
        </div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
        >
          {score && (
            <CircularStat
              value={score.overallScore}
              label={t('employeeProfile.aiScore', 'AI Score')}
              idx={0}
            />
          )}
          {score && (
            <CircularStat
              value={`${score.breakdown.attendance}%`}
              label={t('employeeProfile.attendance', 'Attendance')}
              idx={1}
            />
          )}
          {monthlyStats && (
            <CircularStat
              value={`${monthlyStats.punctualityRate}%`}
              label={t('employeeProfile.punctuality', 'Punctuality')}
              idx={2}
            />
          )}
          {monthlyStats && (
            <CircularStat
              value={`${monthlyStats.totalWorkedHours}h`}
              label={t('employeeProfile.hoursWorked', 'Hours')}
              idx={3}
            />
          )}
        </motion.div>

        {/* Contact info row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-white/70 text-xs sm:text-sm"
        >
          {[
            { icon: Mail, value: employee.email, href: `mailto:${employee.email}` },
            ...(employee.phone
              ? [{ icon: Phone, value: employee.phone, href: `tel:${employee.phone}` }]
              : []),
            ...(employee.department ? [{ icon: Building2, value: employee.department }] : []),
            ...(employee.location ? [{ icon: MapPin, value: employee.location }] : []),
            {
              icon: Calendar,
              value: format(new Date(employee.createdAt), 'MMM d, yyyy', {
                locale: dateFnsLocale,
              }),
            },
          ].map((item, idx) => {
            const Icon = item.icon;
            const children = (
              <>
                <Icon className="w-3.5 h-3.5 text-white/40" />
                <span className="truncate max-w-[150px]">{item.value}</span>
              </>
            );
            if ('href' in item && item.href) {
              return (
                <a
                  key={idx}
                  href={item.href}
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  {children}
                </a>
              );
            }
            return (
              <div key={idx} className="flex items-center gap-1.5">
                {children}
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
