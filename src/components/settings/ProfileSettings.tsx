'use client';

import { Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface ProfileSettingsProps {
  user: any;
  onNameChange: (name: string) => void;
  onEmailChange: (email: string) => void;
  name: string;
  email: string;
}

export function ProfileSettings({
  user,
  onNameChange,
  onEmailChange,
  name,
  email,
}: ProfileSettingsProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-(--primary)" />
          <CardTitle>{t('settingsProfile.profileInformation')}</CardTitle>
        </div>
        <CardDescription>{t('settingsProfile.updateDetails')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar Section */}
        <div className="flex items-center gap-6 pb-6 border-b border-(--border)">
          <AvatarUpload
            userId={user?.id ?? ''}
            currentUrl={user?.avatar}
            name={user?.name ?? 'User'}
            size="lg"
            onSuccess={(url) => {
              toast.success(t('settingsProfile.avatarUpdated'));
            }}
          />
          <div>
            <p className="text-sm font-medium text-(--text-primary)">
              {t('settingsProfile.profilePicture')}
            </p>
            <p className="text-xs text-(--text-muted) mt-1">{t('settingsProfile.clickToUpload')}</p>
            <p className="text-xs text-(--text-muted)">{t('settingsProfile.fileTypes')}</p>
          </div>
        </div>

        {/* Personal Info */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('labels.fullName')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={t('placeholders.enterFullName')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('labels.emailAddress')}</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                type="email"
                placeholder={t('settingsProfile.emailPlaceholder')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">{t('labels.role')}</Label>
              <Input
                id="role"
                value={user?.role || ''}
                disabled
                className="opacity-60 bg-(--surface-hover)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">{t('labels.department')}</Label>
              <Input
                id="department"
                defaultValue={user?.department ?? t('settingsProfile.notAssigned')}
                disabled
                className="opacity-60 bg-(--surface-hover)"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
