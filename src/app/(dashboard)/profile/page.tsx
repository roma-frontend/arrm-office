'use client';

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { motion } from '@/lib/cssMotion';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, login } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');

  const updateOwnProfile = useMutation(api.users.mutations.updateOwnProfile);
  const deleteAvatar = useMutation(api.users.mutations.deleteAvatar);
  const userData = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'>, requesterId: user.id as Id<'users'> } : 'skip',
  );
  const userStats = useQuery(
    api.userStats.getUserStats,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Sync when user loads from store or DB
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
    if (!user?.id) {
      console.error('[Profile] No user ID');
      return;
    }

    logger.log('[Profile] Saving...', { user, name, email, phone, location });

    setSaving(true);
    try {
      const newName = name.trim() || user.name;
      const newEmail = email.trim() || user.email;
      const newPhone = phone.trim();
      const newLocation = location.trim();

      logger.log('[Profile] Calling updateOwnProfile...', {
        userId: user.id,
        name: newName,
        email: newEmail,
        phone: newPhone,
        location: newLocation,
      });

      // 1. Save to Convex DB
      await updateOwnProfile({
        userId: user.id as any,
        name: newName,
        email: newEmail,
        phone: newPhone || undefined,
        location: newLocation || undefined,
      });

      logger.log('[Profile] Convex update successful');

      // 2. Update JWT cookie via API route
      logger.log('[Profile] Calling /api/profile/update...');

      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          name: newName,
          email: newEmail,
        }),
        credentials: 'include',
      });

      logger.log('[Profile] API response status:', res.status);

      if (!res.ok) {
        const error = await res.json();
        console.error('[Profile] API error:', error);
        throw new Error(error.error || 'Failed to update session');
      }

      logger.log('[Profile] JWT cookie updated');

      // 3. Update Zustand store (localStorage)
      login({ ...user, name: newName, email: newEmail });
      logger.log('[Profile] Zustand store updated');

      // 4. Update local state to reflect changes immediately
      setName(newName);
      setEmail(newEmail);

      toast.success(t('toasts.profileUpdated'));

      // Don't reload - let Convex revalidate automatically
    } catch (err) {
      console.error('[Profile] Save error:', err);
      toast.error(err instanceof Error ? err.message : t('profile.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!user?.id || !user?.avatar) return;

    setDeleting(true);
    try {
      // 1. Delete from Cloudinary
      const { deleteAvatarFromCloudinary } = await import('@/actions/cloudinary');
      await deleteAvatarFromCloudinary(user.id);

      // 2. Delete from database
      await deleteAvatar({ userId: user.id as any });

      // 3. Update local state
      login({ ...user, avatar: undefined });

      toast.success(t('toasts.profilePictureDeleted'));
      setShowDeleteDialog(false);
    } catch (err) {
      console.error('Delete avatar error:', err);
      toast.error(err instanceof Error ? err.message : t('profile.failedToDeleteAvatar'));
    } finally {
      setDeleting(false);
    }
  };

  // Format date
  const dateFnsLocale = i18n?.language === 'ru' ? ru : i18n?.language === 'hy' ? hy : enUS;
  const joinDate = userData?._creationTime
    ? format(new Date(userData._creationTime), 'd MMMM yyyy', { locale: dateFnsLocale })
    : 'N/A';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
            {t('profileSettings.myProfile')}
          </h2>
          <p className="text-(--text-muted) text-sm mt-1">
            {t('profileSettings.managePersonalInfo')}
          </p>
        </div>
      </div>

      {/* Profile Picture Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-(--primary)" />
            <CardTitle className="text-base">{t('profileSettings.profilePicture')}</CardTitle>
          </div>
          <CardDescription>{t('ui.profilePictureUpload')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative">
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
            </div>

            {/* Info & Actions */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-sm font-medium text-(--text-primary)">
                  {t('ui.clickCameraToUpload')}
                </p>
                <p className="text-xs text-(--text-muted) mt-1">{t('ui.recommendedImageSize')}</p>
              </div>

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

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-(--primary)" />
            <CardTitle className="text-base">{t('ui.personalInformation')}</CardTitle>
          </div>
          <CardDescription>{t('profileSettings.updateDetails')}</CardDescription>
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
        </CardContent>
      </Card>

      {/* Account Information (Read-only) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-(--primary)" />
            <CardTitle className="text-base">{t('ui.accountInformation')}</CardTitle>
          </div>
          <CardDescription>{t('ui.yourAccountDetails')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('labels.role')}</Label>
              <div className="flex items-center gap-2">
                <Badge variant={user?.role === 'admin' ? 'default' : 'secondary'}>
                  {user?.role?.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('employeeInfo.department')}</Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                <Input
                  value={user?.department ?? t('common.notAssigned')}
                  disabled
                  className="pl-10 opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('ui.memberSince')}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                <Input value={joinDate} disabled className="pl-10 opacity-60" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('labels.userId')}</Label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                <Input
                  value={user?.id ? user.id.slice(0, 16) + '...' : 'N/A'}
                  disabled
                  className="pl-10 opacity-60 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm">
            <Shield className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{t('profile.roleManagedByAdmin')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Activity Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-(--primary)" />
            <CardTitle className="text-base">{t('ui.activityStats')}</CardTitle>
          </div>
          <CardDescription>{t('ui.yourActivity')}</CardDescription>
        </CardHeader>
        <CardContent>
          {userStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: t('profile.daysActive'),
                  value: userStats.daysActive.toString(),
                  icon: Clock,
                },
                {
                  label: t('profile.tasksCompleted'),
                  value: userStats.tasksCompleted.toString(),
                  icon: Award,
                },
                {
                  label: t('profile.leavesTaken'),
                  value: userStats.leavesTaken.toString(),
                  icon: Calendar,
                },
                {
                  label: t('profile.projects'),
                  value: userStats.projects.toString(),
                  icon: Briefcase,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-center p-4 rounded-lg border border-(--border) bg-(--background-subtle) hover:border-(--primary) transition-all"
                >
                  <stat.icon className="w-5 h-5 text-(--primary) mb-2" />
                  <p className="text-2xl font-bold text-(--text-primary)">{stat.value}</p>
                  <p className="text-xs text-(--text-muted) text-center mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <ShieldLoader size="sm" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setName(user?.name ?? '');
            setEmail(user?.email ?? '');
            toast.info(t('toasts.changesDiscarded'));
          }}
          className="w-full sm:w-auto"
        >
          {t('ui.discardChanges')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto btn-gradient text-white"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? t('ui.saving') : t('ui.saveChanges')}
        </Button>
      </div>

      {/* Delete Avatar Confirmation Dialog */}
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
                <img
                  src={user.avatar}
                  alt={t('profile.currentAvatar')}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
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
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
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
                  <ShieldLoader size="xs" variant="inline" />
                  {t('ui.deleting') || 'Deleting...'}
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('ui.deletePicture') || 'Delete Picture'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
