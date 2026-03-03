"use client";

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Save, User as UserIcon, Mail, Briefcase, Calendar, 
  Shield, MapPin, Phone, Trash2, Upload, Clock, Award 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/store/useAuthStore";
import { updateSessionProfileAction } from "@/actions/auth";
import { toast } from "sonner";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, login } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");

  const updateOwnProfile = useMutation(api.users.updateOwnProfile);
  const deleteAvatar = useMutation(api.users.deleteAvatar);
  const userData = useQuery(api.users.getUserById, 
    user?.id ? { userId: user.id as any, requesterId: user.id as any } : "skip"
  );
  const userStats = useQuery(api.userStats.getUserStats,
    user?.id ? { userId: user.id as any } : "skip"
  );

  // Sync when user loads from store or DB
  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
  }, [user?.name, user?.email]);

  useEffect(() => {
    if (userData) {
      setPhone(userData.phone ?? "");
      setLocation(userData.location ?? "");
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

      // 1. Save to Convex DB
      await updateOwnProfile({
        userId: user.id as any,
        name: newName,
        email: newEmail,
        phone: newPhone || undefined,
        location: newLocation || undefined,
      });

      // 2. Update JWT cookie (so data persists after page refresh)
      await updateSessionProfileAction(user.id, newName, newEmail);

      // 3. Update Zustand store (localStorage)
      login({ ...user, name: newName, email: newEmail });

      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!user?.id || !user?.avatar) return;
    
    if (!confirm("Are you sure you want to delete your profile picture? This action cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      // 1. Delete from Cloudinary
      const { deleteAvatarFromCloudinary } = await import("@/actions/cloudinary");
      await deleteAvatarFromCloudinary(user.id);
      
      // 2. Delete from database
      await deleteAvatar({ userId: user.id as any });
      
      // 3. Update local state
      login({ ...user, avatar: undefined });
      
      toast.success("Profile picture deleted successfully!");
    } catch (err) {
      console.error("Delete avatar error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete avatar");
    } finally {
      setDeleting(false);
    }
  };

  // Format date
  const joinDate = user?.createdAt 
    ? new Date(user.createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : "N/A";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('profileSettings.myProfile')}</h2>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {t('profileSettings.managePersonalInfo')}
        </p>
      </div>

      {/* Profile Picture Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[var(--primary)]" />
            <CardTitle className="text-base">{t('profileSettings.profilePicture')}</CardTitle>
          </div>
          <CardDescription>
            {t('ui.profilePictureUpload')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              <AvatarUpload
                userId={user?.id ?? ""}
                currentUrl={user?.avatar}
                name={user?.name ?? "User"}
                size="lg"
                onSuccess={(url) => {
                  toast.success("Profile picture updated!");
                  login({ ...user!, avatar: url });
                }}
              />
            </div>

            {/* Info & Actions */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t('ui.clickCameraToUpload')}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {t('ui.recommendedImageSize')}
                </p>
              </div>

              {user?.avatar && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAvatar}
                  disabled={deleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? t('ui.deleting') : t('ui.deletePicture')}
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
            <UserIcon className="w-4 h-4 text-[var(--primary)]" />
            <CardTitle className="text-base">{t('ui.personalInformation')}</CardTitle>
          </div>
          <CardDescription>{t('profileSettings.updateDetails')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t('labels.fullName')} {t('forms.required')}</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
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
              <Label htmlFor="email">{t('labels.emailAddress')} {t('forms.required')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
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
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
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
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
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
            <Shield className="w-4 h-4 text-[var(--primary)]" />
            <CardTitle className="text-base">Account Information</CardTitle>
          </div>
          <CardDescription>{t('ui.yourAccountDetails')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('labels.role')}</Label>
              <div className="flex items-center gap-2">
                <Badge variant={user?.role === "admin" ? "default" : "secondary"}>
                  {user?.role?.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('employeeInfo.department')}Department</Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <Input 
                  value={user?.department ?? "Not assigned"} 
                  disabled 
                  className="pl-10 opacity-60" 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Member Since</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <Input 
                  value={joinDate} 
                  disabled 
                  className="pl-10 opacity-60" 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>User ID</Label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <Input 
                  value={user?.id?.slice(0, 16) + "..." ?? "N/A"} 
                  disabled 
                  className="pl-10 opacity-60 font-mono text-xs" 
                />
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm">
            <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Your role and department are managed by your administrator. 
              Contact them to request changes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Activity Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[var(--primary)]" />
            <CardTitle className="text-base">Activity Stats</CardTitle>
          </div>
          <CardDescription>{t('ui.yourActivity')}</CardDescription>
        </CardHeader>
        <CardContent>
          {userStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: t('profile.daysActive'), value: userStats.daysActive.toString(), icon: Clock },
                { label: t('profile.tasksCompleted'), value: userStats.tasksCompleted.toString(), icon: Award },
                { label: t('profile.leavesTaken'), value: userStats.leavesTaken.toString(), icon: Calendar },
                { label: t('profile.projects'), value: userStats.projects.toString(), icon: Briefcase },
              ].map((stat) => (
                <div 
                  key={stat.label}
                  className="flex flex-col items-center p-4 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] hover:border-[var(--primary)] transition-all"
                >
                  <stat.icon className="w-5 h-5 text-[var(--primary)] mb-2" />
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
                  <p className="text-xs text-[var(--text-muted)] text-center mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="text-center text-[var(--text-muted)]">
                <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading stats...
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => {
          setName(user?.name ?? "");
          setEmail(user?.email ?? "");
          toast.info("Changes discarded");
        }}>
          Discard Changes
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? t('ui.saving') : t('ui.saveChanges')}
        </Button>
      </div>
    </motion.div>
  );
}
