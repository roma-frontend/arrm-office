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

type UserStats = NonNullable<ReturnType<typeof useQuery<typeof api.userStats.getUserStats>>>;

// ── Circular Progress Ring ──
function CircularProgress({
  value = 0,
  label,
  color = 'var(--brand)',
  size = 64,
}: {
  value?: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const circumference = 2 * Math.PI * 28;
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  const offset = circumference - (safeValue / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-(--border)"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={String(offset)}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-(--text-primary)">{Math.round(safeValue)}%</span>
        </div>
      </div>
      <span className="text-[11px] text-(--text-muted) text-center">{label}</span>
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
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
          <Icon className="w-5 h-5" style={{ color } as React.CSSProperties} />
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
  const { user } = useAuthStore();
  const userStats = useQuery(
    api.userStats.getUserStats,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );
  const userData = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );
  const updateUser = useMutation(api.users.mutations.updateOwnProfile);

  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'settings'>('overview');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (userStats) {
      setName(userStats.userName ?? '');
    }
    if (user) {
      setEmail(user.email ?? '');
    }
    if (userData) {
      setPhone(userData.phone ?? '');
      setLocation(userData.location ?? '');
      setAvatar(userData.avatarUrl ?? undefined);
    }
  }, [userStats, userData, user]);

  const getLocale = () => {
    switch (i18n.language) {
      case 'ru':
        return ru;
      case 'hy':
        return hy;
      default:
        return enUS;
    }
  };

  const tabs = [
    { id: 'overview' as const, label: t('profile.tabOverview', 'Overview'), icon: Eye },
    { id: 'activity' as const, label: t('profile.tabActivity', 'Activity'), icon: Activity },
    { id: 'settings' as const, label: t('profile.tabSettings', 'Settings'), icon: Settings },
  ];

  const handleSave = async () => {
    if (!user?.id) return;
    try {
      await updateUser({
        userId: user.id as Id<'users'>,
        name: name || undefined,
        phone: phone || undefined,
        location: location || undefined,
      });
      toast.success(t('profile.saved', 'Profile updated successfully'));
    } catch {
      toast.error(t('profile.saveError', 'Failed to update profile'));
    }
  };

  // Compute stats from nested Convex return type
  const totalTasks = userStats?.taskStats?.totalTasks ?? 0;
  const completedTasks = userStats?.taskStats?.completedTasks ?? userStats?.tasksCompleted ?? 0;
  const completionRate = userStats?.taskStats?.completionRate ?? 0;
  const pendingLeaves = userStats?.leaveStats?.pendingLeaves ?? 0;
  const leavesTaken = userStats?.leavesTaken ?? 0;
  const daysActive = userStats?.daysActive ?? 0;
  const productivity = userStats?.productivityScore ?? 0;

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* ════════════════════════════════════════════════════════════════════
          HERO SECTION
          ════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-8"
        style={{ background: 'var(--brand-panel)' }}
      >
        {/* Decorative circles */}
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'var(--brand)' }}
        />
        <div
          className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-5"
          style={{ background: 'var(--brand)' }}
        />

        <div className="relative flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="relative"
          >
            <div className="w-24 h-24 rounded-2xl bg-white/20 flex items-center justify-center text-3xl font-bold text-white overflow-hidden border-2 border-white/30">
              {avatar ? (
                <Image
                  src={avatar}
                  alt={userStats?.userName ?? ''}
                  width={96}
                  height={96}
                  className="object-cover w-full h-full"
                />
              ) : (
                (userStats?.userName ?? 'U').charAt(0).toUpperCase()
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-400 border-2 border-white" />
          </motion.div>

          {/* User info */}
          <div className="flex-1">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold text-white"
            >
              {userStats?.userName ?? 'User'}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="text-white/80 text-sm mt-1"
            >
              {user?.department
                ? `${user.department}`
                : user?.role
                  ? t(`roles.${user.role}` as const, { defaultValue: user.role })
                  : ''}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="flex flex-wrap items-center gap-2 mt-3"
            >
              <Badge className="bg-white/15 text-white border-0 hover:bg-white/25 text-xs">
                {t(`roles.${user?.role}` as const, { defaultValue: user?.role ?? '' })}
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
            <CircularProgress value={completionRate} label={t('profile.tasksCompleted', 'Tasks')} />
            <CircularProgress
              value={productivity}
              label={t('profile.punctuality', 'Punctuality')}
            />
            <CircularProgress
              value={daysActive > 0 ? Math.min(100, daysActive) : 0}
              label={t('profile.daysActive', 'Days Active')}
            />
          </motion.div>
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB NAVIGATION
          ════════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-1 rounded-xl bg-(--background-subtle) p-1 border border-(--border)">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === id
                ? 'bg-(--card) text-(--text-primary) shadow-sm'
                : 'text-(--text-muted) hover:text-(--text-primary)'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB CONTENT
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
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={CheckCircle2}
                label={t('profile.tasksCompleted', 'Tasks Done')}
                value={completedTasks}
                color="#10b981"
              />
              <StatCard
                icon={Calendar}
                label={t('profile.leavesTaken', 'Leaves')}
                value={leavesTaken}
                color="#3b82f6"
              />
              <StatCard
                icon={Briefcase}
                label={t('profile.projects', 'Projects')}
                value={userStats?.projects ?? 0}
                color="#8b5cf6"
              />
              <StatCard
                icon={Clock}
                label={t('profile.totalHours', 'Total Hours')}
                value={daysActive * 8}
                color="#f59e0b"
              />
            </div>

            {/* Personal Info */}
            <Card className="border border-(--border) bg-(--card)">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <UserIcon className="w-4 h-4 text-blue-600" />
                  </div>
                  <CardTitle className="text-base">
                    {t('profile.personalInfo', 'Personal Information')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { icon: Mail, label: t('profile.email', 'Email'), value: user?.email },
                    { icon: Phone, label: t('profile.phone', 'Phone'), value: userData?.phone },
                    {
                      icon: MapPin,
                      label: t('profile.location', 'Location'),
                      value: userData?.location,
                    },
                    {
                      icon: Briefcase,
                      label: t('profile.position', 'Position'),
                      value: userStats?.position,
                    },
                    {
                      icon: Calendar,
                      label: t('profile.joinDate', 'Join Date'),
                      value: userStats?.joinDate
                        ? format(new Date(userStats.joinDate), 'MMM d, yyyy', {
                            locale: getLocale(),
                          })
                        : '—',
                    },
                  ].map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 p-3 rounded-lg bg-(--background-subtle)"
                    >
                      <Icon className="w-4 h-4 text-(--text-muted)" />
                      <div>
                        <p className="text-xs text-(--text-muted)">{label}</p>
                        <p className="text-sm font-medium text-(--text-primary)">{value || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Account Info */}
            <Card className="border border-(--border) bg-(--card)">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-purple-600" />
                  </div>
                  <CardTitle className="text-base">
                    {t('profile.accountInfo', 'Account Information')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-(--background-subtle)">
                    <Shield className="w-4 h-4 text-(--text-muted)" />
                    <div>
                      <p className="text-xs text-(--text-muted)">{t('profile.role', 'Role')}</p>
                      <Badge
                        className="mt-1 text-xs"
                        style={
                          {
                            backgroundColor: 'var(--brand-quiet)',
                            color: 'var(--brand)',
                          } as React.CSSProperties
                        }
                      >
                        {t(`roles.${user?.role}` as const, { defaultValue: user?.role ?? 'N/A' })}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-(--background-subtle)">
                    <Briefcase className="w-4 h-4 text-(--text-muted)" />
                    <div>
                      <p className="text-xs text-(--text-muted)">
                        {t('profile.department', 'Department')}
                      </p>
                      <p className="text-sm font-medium text-(--text-primary)">
                        {userStats?.department || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-(--background-subtle)">
                    <Calendar className="w-4 h-4 text-(--text-muted)" />
                    <div>
                      <p className="text-xs text-(--text-muted)">
                        {t('profile.registered', 'Registered')}
                      </p>
                      <p className="text-sm font-medium text-(--text-primary)">
                        {userStats?.joinDate
                          ? format(new Date(userStats.joinDate), 'MMM d, yyyy', {
                              locale: getLocale(),
                            })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-(--background-subtle)">
                    <FileText className="w-4 h-4 text-(--text-muted)" />
                    <div>
                      <p className="text-xs text-(--text-muted)">
                        {t('profile.userId', 'User ID')}
                      </p>
                      <p className="text-sm font-mono text-(--text-primary)">{userStats?.userId}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

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
                <Card className="border border-(--border) bg-(--card)">
                  <CardHeader>
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
                        value={completionRate}
                        label={t('profile.taskCompletion', 'Task Completion')}
                        color="#10b981"
                      />
                      <CircularProgress
                        value={productivity}
                        label={t('profile.punctuality', 'Punctuality')}
                        color="#3b82f6"
                      />
                      <CircularProgress
                        value={leavesTaken > 0 ? Math.max(0, 100 - leavesTaken * 10) : 100}
                        label={t('profile.attendance', 'Attendance')}
                        color="#f59e0b"
                      />
                      <CircularProgress
                        value={productivity}
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
                      <p className="text-3xl font-bold text-(--text-primary)">{totalTasks}</p>
                      <p className="text-xs text-emerald-600 mt-1">
                        {t('profile.completedOf', '{completed} of {total} completed', {
                          completed: completedTasks,
                          total: totalTasks,
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
                        {leavesTaken} <span className="text-lg text-(--text-muted)">days</span>
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        {t('profile.pendingLeaves', '{count} pending approval', {
                          count: pendingLeaves,
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
                      <p className="text-3xl font-bold text-(--text-primary)">{daysActive * 8}h</p>
                      <p className="text-xs text-blue-600 mt-1">
                        {t('profile.avgDaily', '~{hours}h / day', {
                          hours: daysActive > 0 ? ((daysActive * 8) / daysActive).toFixed(1) : '0',
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

        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Avatar Upload */}
            <Card className="border border-(--border) bg-(--card)">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
                    <Upload className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {t('profile.avatar', 'Profile Photo')}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {t('profile.avatarDesc', 'Upload a new profile picture')}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <AvatarUpload
                  userId={user.id}
                  currentUrl={avatar}
                  name={name || user.name || 'User'}
                  size="lg"
                  readonly
                />
                {avatar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setAvatar(undefined)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {t('profile.removeAvatar', 'Remove')}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Edit Form */}
            <Card className="border border-(--border) bg-(--card)">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Edit2 className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {t('profile.editInfo', 'Edit Information')}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {t('profile.editInfoDesc', 'Update your personal details')}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('profile.fullName', 'Full Name')}</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('profile.namePlaceholder', 'Enter your full name')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('profile.email', 'Email')}</Label>
                    <Input id="email" value={email} disabled className="opacity-60" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('profile.phone', 'Phone')}</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('profile.phonePlaceholder', '+1 (555) 000-0000')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">{t('profile.location', 'Location')}</Label>
                    <Input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={t('profile.locationPlaceholder', 'City, Country')}
                    />
                  </div>
                </div>
              </CardContent>
              <CardContent className="border-t border-(--border) pt-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {t('profile.deleteAccount', 'Delete Account')}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setName(userStats?.userName ?? '');
                        setPhone(userData?.phone ?? '');
                        setLocation(userData?.location ?? '');
                        setAvatar(userData?.avatarUrl ?? undefined);
                      }}
                    >
                      {t('profile.discard', 'Discard')}
                    </Button>
                    <Button
                      onClick={handleSave}
                      className="text-white"
                      style={{ background: 'var(--brand)' } as React.CSSProperties}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {t('profile.save', 'Save Changes')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {t('profile.deleteConfirmTitle', 'Delete Account')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'profile.deleteConfirmDesc',
                'This action cannot be undone. All your data will be permanently removed.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive">{t('profile.deleteForever', 'Delete Forever')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
