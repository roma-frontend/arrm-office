'use client';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import type { Id } from '../../../../convex/_generated/dataModel';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import {
  Save,
  User as UserIcon,
  Mail,
  Briefcase,
  Calendar,
  Shield,
  MapPin,
  Phone,
  Trash2,
  Upload,
  Clock,
  Award,
  Settings,
  Activity,
  BarChart3,
  CheckCircle2,
  FileText,
  Target,
  TrendingUp,
  Edit2,
  Star,
  Eye,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { logger } from '@/lib/logger';

// ── Helpers ──
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ── Circular Progress ──
type CircularProgressVariant = 'default' | 'light';

function CircularProgress({
  value = 0,
  label,
  color = 'var(--brand)',
  variant = 'default',
}: {
  value?: number;
  label: string;
  color?: string;
  variant?: CircularProgressVariant;
}) {
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference * (1 - Math.min(safeValue, 100) / 100);

  // `light` variant is used on the blue gradient hero where white rings and
  // white text are needed.  `default` is for cards on a light background.
  const trackClass = variant === 'light' ? 'text-white/15' : 'text-(--border)';
  const textClass = variant === 'light' ? 'text-white' : 'text-(--text-primary)';
  const labelClass = variant === 'light' ? 'text-white/60' : 'text-(--text-muted)';
  // Scale up slightly inside the hero for visual prominence
  const sizeClass = variant === 'light' ? 'w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem]' : 'w-16 h-16';
  const progressStroke = variant === 'light' ? 'rgba(255,255,255,0.85)' : color;

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${sizeClass} mb-2`}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={trackClass}
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke={progressStroke}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-sm font-bold ${textClass}`}>{Math.round(safeValue)}%</span>
        </div>
      </div>
      <span className={`text-[11px] text-center ${labelClass}`}>{label}</span>
    </div>
  );
}

// ── Stat Card ──
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border border-(--border) bg-(--card) p-4 hover:shadow-md transition-all"
    >
      <div
        className="absolute top-0 right-0 w-16 h-16 opacity-5"
        style={{ background: `radial-gradient(circle at top right, ${color}, transparent)` }}
      />
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-bold text-(--text-primary)">{value}</p>
          <p className="text-xs text-(--text-muted)">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, login } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');

  const updateOwnProfile = useMutation(api.users.mutations.updateOwnProfile);
  const deleteAvatar = useMutation(api.users.mutations.deleteAvatar);
  const userData = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );
  const userStats = useQuery(
    api.userStats.getUserStats,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
  }, [user?.name, user?.email]);

  useEffect(() => {
    if (userData) {
      setPhone(userData.phone ?? '');
      setLocation(userData.location ?? '');
    }
  }, [userData]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const newName = name.trim() || user.name;
      const newEmail = email.trim() || user.email;
      const newPhone = phone.trim();
      const newLocation = location.trim();

      await updateOwnProfile({
        userId: user.id as Id<'users'>,
        name: newName,
        email: newEmail,
        phone: newPhone || undefined,
        location: newLocation || undefined,
      });

      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, name: newName, email: newEmail }),
        credentials: 'include',
      });

      if (!res.ok) {
        const error = (await res.json()) as { error?: string };
        throw new Error(error.error || 'Failed to update session');
      }

      login({ ...user, name: newName, email: newEmail });
      setName(newName);
      setEmail(newEmail);
      toast.success(t('toasts.profileUpdated'));
    } catch (err) {
      logger.error('[Profile] Save error:', err);
      toast.error(err instanceof Error ? err.message : t('profile.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!user?.id || !user?.avatar) return;
    setDeleting(true);
    try {
      const { deleteAvatarFromCloudinary } = await import('@/actions/cloudinary');
      await deleteAvatarFromCloudinary(user.id);
      await deleteAvatar({ userId: user.id as Id<'users'> });
      login({ ...user, avatar: undefined });
      toast.success(t('toasts.profilePictureDeleted'));
      setShowDeleteDialog(false);
    } catch (err) {
      logger.error('Delete avatar error:', err);
      toast.error(err instanceof Error ? err.message : t('profile.failedToDeleteAvatar'));
    } finally {
      setDeleting(false);
    }
  };

  const dateFnsLocale = i18n?.language === 'ru' ? ru : i18n?.language === 'hy' ? hy : enUS;
  const joinDate = userData?._creationTime
    ? format(new Date(userData._creationTime), 'd MMMM yyyy', { locale: dateFnsLocale })
    : 'N/A';

  const tabs = [
    { id: 'overview', label: t('profile.tabOverview', 'Overview'), icon: Eye },
    { id: 'activity', label: t('profile.tabActivity', 'Activity'), icon: Activity },
    { id: 'settings', label: t('profile.tabSettings', 'Settings'), icon: Settings },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* ════════════════════════════════════════════════════════════════════
          HERO SECTION
          ════════════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-(--border) shadow-sm">
        {/* Gradient background */}
        <div className="brand-panel absolute inset-0" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/[0.06] rounded-full" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-white/[0.04] rounded-full" />
        <div className="absolute top-1/3 left-1/2 w-32 h-32 bg-white/[0.03] rounded-full" />

        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="relative shrink-0"
            >
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl bg-white/10 backdrop-blur-sm">
                {user?.avatar ? (
                  <Image
                    src={user.avatar}
                    alt={user.name || ''}
                    width={112}
                    height={112}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-3xl sm:text-4xl">
                    {getInitials(user?.name || 'U')}
                  </div>
                )}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white bg-emerald-400" />
            </motion.div>

            {/* Name + Info */}
            <div className="flex-1 text-white">
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="text-2xl sm:text-3xl font-bold tracking-tight"
              >
                {user?.name}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="text-white/70 text-sm mt-1"
              >
                {user?.department
                  ? `${user.department}`
                  : user?.role
                    ? t(`roles.${user.role}`, user.role)
                    : ''}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="flex flex-wrap items-center gap-2 mt-3"
              >
                <Badge className="bg-white/15 text-white border-0 hover:bg-white/25 text-xs">
                  {t(`roles.${user?.role ?? 'undefined'}`, { defaultValue: user?.role ?? '' })}
                </Badge>
                <Badge className="bg-white/10 text-white/80 border-0 text-xs flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {user?.email}
                </Badge>
                {userData?.phone && (
                  <Badge className="bg-white/10 text-white/80 border-0 text-xs flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {userData.phone}
                  </Badge>
                )}
                {userData?.location && (
                  <Badge className="bg-white/10 text-white/80 border-0 text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {userData.location}
                  </Badge>
                )}
              </motion.div>
            </div>

            {/* Quick stats in hero */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="flex gap-6 sm:gap-8"
            >
              <CircularProgress
                value={userStats?.taskCompletionRate ?? 0}
                label={t('profile.tasksCompleted', 'Tasks')}
                variant="light"
              />
              <CircularProgress
                value={userStats?.punctualityRate ?? 0}
                label={t('profile.punctuality', 'Punctuality')}
                variant="light"
              />
              <CircularProgress
                value={userStats?.daysActive ?? 0}
                label={t('profile.daysActive', 'Days Active')}
                variant="light"
              />
            </motion.div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB NAVIGATION
          ════════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-1 rounded-xl bg-(--background-subtle) p-1 border border-(--border)">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === id
                ? 'bg-(--brand) text-white shadow-md'
                : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-(--card)'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: OVERVIEW
          ════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={CheckCircle2}
                label={t('profile.tasksCompleted', 'Tasks Done')}
                value={userStats?.tasksCompleted ?? 0}
                color="#10b981"
              />
              <StatCard
                icon={Calendar}
                label={t('profile.leavesTaken', 'Leaves')}
                value={userStats?.leavesTaken ?? 0}
                color="#f59e0b"
              />
              <StatCard
                icon={Briefcase}
                label={t('profile.projects', 'Projects')}
                value={userStats?.projects ?? 0}
                color="#3b82f6"
              />
              <StatCard
                icon={Clock}
                label={t('profile.totalHours', 'Total Hours')}
                value={userStats?.totalWorkedHours ?? 0}
                color="#8b5cf6"
              />
            </div>

            {/* Personal info + Account info side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Personal Info Card */}
              <Card className="border border-(--border) bg-(--card)">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-(--brand-quiet) flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-(--brand-text)" />
                    </div>
                    <CardTitle className="text-base">{t('ui.personalInformation')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { icon: UserIcon, label: t('labels.fullName'), value: user?.name },
                    { icon: Mail, label: t('labels.emailAddress'), value: user?.email },
                    { icon: Phone, label: t('labels.phoneNumber'), value: userData?.phone || '—' },
                    { icon: MapPin, label: t('labels.location'), value: userData?.location || '—' },
                  ].map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 py-2 border-b border-(--border) last:border-0 last:pb-0"
                    >
                      <Icon className="w-4 h-4 text-(--text-muted) shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-(--text-muted)">{label}</p>
                        <p className="text-sm font-medium text-(--text-primary) truncate">
                          {value}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Account Info Card */}
              <Card className="border border-(--border) bg-(--card)">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-(--purple-quiet) flex items-center justify-center">
                      <Shield className="w-4 h-4 text-(--purple-text)" />
                    </div>
                    <CardTitle className="text-base">{t('ui.accountInformation')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { icon: Shield, label: t('labels.role'), value: user?.role?.toUpperCase() },
                    {
                      icon: Briefcase,
                      label: t('employeeInfo.department'),
                      value: user?.department || t('common.notAssigned'),
                    },
                    { icon: Calendar, label: t('ui.memberSince'), value: joinDate },
                    {
                      icon: FileText,
                      label: t('labels.userId'),
                      value: user?.id ? user.id.slice(0, 16) + '...' : 'N/A',
                    },
                  ].map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 py-2 border-b border-(--border) last:border-0 last:pb-0"
                    >
                      <Icon className="w-4 h-4 text-(--text-muted) shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-(--text-muted)">{label}</p>
                        {label === t('labels.role') ? (
                          <Badge
                            variant={user?.role === 'admin' ? 'default' : 'secondary'}
                            className="mt-0.5"
                          >
                            {value}
                          </Badge>
                        ) : (
                          <p className="text-sm font-medium text-(--text-primary) truncate">
                            {value}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-(--brand-quiet) border border-(--brand-outline) text-(--brand-text) text-xs mt-2">
                    <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <p>{t('profile.roleManagedByAdmin')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB: ACTIVITY
            ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'activity' && (
          <motion.div
            key="activity"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {userStats ? (
              <>
                {/* Performance ring */}
                <Card className="border border-(--border) bg-(--card)">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                      </div>
                      <CardTitle className="text-base">
                        {t('profile.performanceOverview', 'Performance Overview')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                      <CircularProgress
                        value={userStats.taskCompletionRate}
                        label={t('profile.taskCompletion', 'Task Completion')}
                        color="#10b981"
                      />
                      <CircularProgress
                        value={userStats.punctualityRate}
                        label={t('profile.punctuality', 'Punctuality')}
                        color="#3b82f6"
                      />
                      <CircularProgress
                        value={
                          userStats.leavesTaken > 0
                            ? Math.max(0, 100 - userStats.leavesTaken * 10)
                            : 100
                        }
                        label={t('profile.attendance', 'Attendance')}
                        color="#f59e0b"
                      />
                      <CircularProgress
                        value={Math.min(100, userStats.totalWorkedHours / 2)}
                        label={t('profile.productivity', 'Productivity')}
                        color="#8b5cf6"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Detailed stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Card className="border border-(--border) bg-(--card)">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-(--text-primary)">
                          {t('profile.totalTasks', 'Total Tasks')}
                        </p>
                        <Target className="w-4 h-4 text-(--text-muted)" />
                      </div>
                      <p className="text-3xl font-bold text-(--text-primary)">
                        {userStats.totalTasks ?? 0}
                      </p>
                      <p className="text-xs text-emerald-600 mt-1">
                        {t('profile.completedOf', '{completed} of {total} completed', {
                          completed: userStats.tasksCompleted ?? 0,
                          total: userStats.totalTasks ?? 0,
                        })}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border border-(--border) bg-(--card)">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-(--text-primary)">
                          {t('profile.leaveBalance', 'Leave Balance')}
                        </p>
                        <Calendar className="w-4 h-4 text-(--text-muted)" />
                      </div>
                      <p className="text-3xl font-bold text-(--text-primary)">
                        {userStats.leavesTaken ?? 0}{' '}
                        <span className="text-lg text-(--text-muted)">days</span>
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        {t('profile.pendingLeaves', '{count} pending approval', {
                          count: userStats.pendingLeaves ?? 0,
                        })}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border border-(--border) bg-(--card)">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-(--text-primary)">
                          {t('profile.workHours', 'Work Hours')}
                        </p>
                        <Clock className="w-4 h-4 text-(--text-muted)" />
                      </div>
                      <p className="text-3xl font-bold text-(--text-primary)">
                        {userStats.totalWorkedHours ?? 0}h
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        {t('profile.avgDaily', '~{hours}h / day', {
                          hours:
                            userStats.daysActive > 0
                              ? ((userStats.totalWorkedHours ?? 0) / userStats.daysActive).toFixed(
                                  1,
                                )
                              : '0',
                        })}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-16">
                <ShieldLoader size="md" />
              </div>
            )}
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB: SETTINGS
            ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Avatar */}
            <Card className="border border-(--border) bg-(--card)">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-(--brand-quiet) flex items-center justify-center">
                    <Upload className="w-4 h-4 text-(--brand-text)" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {t('profileSettings.profilePicture')}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {t('ui.profilePictureUpload')}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <AvatarUpload
                    userId={user?.id ?? ''}
                    currentUrl={user?.avatar}
                    name={user?.name ?? 'User'}
                    size="lg"
                    onSuccess={(url) => {
                      toast.success(t('toasts.profilePictureUpdated'));
                      login({ ...user!, avatar: url });
                    }}
                  />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-(--text-primary)">{t('ui.clickCameraToUpload')}</p>
                    <p className="text-xs text-(--text-muted)">{t('ui.recommendedImageSize')}</p>
                    {user?.avatar && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={deleting}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('ui.deletePicture')}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Edit form */}
            <Card className="border border-(--border) bg-(--card)">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-(--purple-quiet) flex items-center justify-center">
                    <Edit2 className="w-4 h-4 text-(--purple-text)" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t('ui.personalInformation')}</CardTitle>
                    <CardDescription className="text-xs">
                      {t('profileSettings.updateDetails')}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">
                      {t('labels.fullName')} {t('forms.required')}
                    </Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-10"
                        placeholder={t('placeholders.johnDoe')}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">
                      {t('labels.emailAddress')} {t('forms.required')}
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                      <Input
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        className="pl-10"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">{t('labels.phoneNumber')}</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        type="tel"
                        className="pl-10"
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="location">{t('labels.location')}</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                      <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="pl-10"
                        placeholder={t('placeholders.newYorkUSA')}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 border-t border-(--border)">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setName(user?.name ?? '');
                      setEmail(user?.email ?? '');
                      toast.info(t('toasts.changesDiscarded'));
                    }}
                  >
                    {t('ui.discardChanges')}
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-gradient text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? t('ui.saving') : t('ui.saveChanges')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Avatar Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent
          className="sm:max-w-md"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2"
              style={{ color: 'var(--destructive)' }}
            >
              <Trash2 className="w-5 h-5" />
              {t('profile.deleteAvatarTitle') || 'Delete Profile Picture?'}
            </DialogTitle>
            <DialogDescription className="pt-3" style={{ color: 'var(--text-muted)' }}>
              {t('profile.deleteAvatarWarning') ||
                'Are you sure you want to delete your profile picture? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex items-center gap-3 p-4 rounded-lg border"
            style={{
              background: 'var(--destructive-bg, rgba(239, 68, 68, 0.1))',
              borderColor: 'var(--destructive-border, rgba(239, 68, 68, 0.3))',
            }}
          >
            <div className="shrink-0">
              {user?.avatar ? (
                <Image
                  src={user.avatar}
                  alt={t('profile.currentAvatar')}
                  width={64}
                  height={64}
                  unoptimized
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-linear-to-br from-(--brand) to-(--purple) flex items-center justify-center text-white text-2xl font-bold">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {user?.name}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {user?.email}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              {t('ui.cancel') || 'Cancel'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAvatar}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <ShieldLoader size="xs" variant="inline" /> {t('ui.deleting') || 'Deleting...'}
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" /> {t('ui.deletePicture') || 'Delete Picture'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
