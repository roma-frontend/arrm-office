'use client';

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { Shield, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { WebAuthnButton } from '@/components/auth/WebAuthnButton';
import { FaceRegistration } from '@/components/auth/FaceRegistration';
import { toast } from 'sonner';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';

import type { Id } from '@/convex/_generated/dataModel';

interface SecuritySettingsProps {
  userId: Id<'users'>;
}

export function SecuritySettings({ userId }: SecuritySettingsProps) {
  const { t, i18n } = useTranslation();
  const [showFaceRegistration, setShowFaceRegistration] = useState(false);
  const safeUserId = userId && userId !== '' ? userId : null;

  // Get face descriptor status (requester must be self or superadmin)
  const faceData = useQuery(
    api.faceRecognition.getFaceDescriptor,
    safeUserId ? { userId: safeUserId } : 'skip',
  );
  const removeFaceRegistration = useMutation(api.faceRecognition.removeFaceRegistration);

  if (faceData === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Touch ID / Fingerprint */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsSecurity.touchId')}</CardTitle>
          </div>
          <CardDescription>{t('settingsSecurity.touchIdDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-(--surface-hover) border border-(--border)">
              <span className="text-3xl">🔐</span>
              <div className="flex-1">
                <p className="text-sm text-(--text-muted)">{t('settingsSecurity.touchIdEnable')}</p>
              </div>
            </div>
            <WebAuthnButton
              mode="register"
              userId={userId}
              onSuccess={() => {
                toast.success(t('settingsSecurity.biometricRegistered'));
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Face ID Registration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-(--primary)" />
            <CardTitle>{t('settingsSecurity.faceId')}</CardTitle>
          </div>
          <CardDescription>{t('settingsSecurity.faceIdDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {faceData?.faceDescriptor ? (
              <>
                <div className="flex items-center gap-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20 overflow-hidden">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-(--surface-hover) border-2 border-green-500/30 shrink-0">
                    {faceData.faceImageUrl ? (
                      <img
                        src={faceData.faceImageUrl}
                        alt="Registered face"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">
                        ✓
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-600 dark:text-green-400 truncate">
                      {t('settingsSecurity.faceIdRegistered')}
                    </p>
                    <p className="text-xs text-(--text-muted) mt-1 truncate">
                      {t('settingsSecurity.registeredOn')}{' '}
                      {new Date(faceData.faceRegisteredAt || 0).toLocaleDateString(
                        i18n.language === 'ru'
                          ? 'ru-RU'
                          : i18n.language === 'hy'
                            ? 'hy-AM'
                            : 'en-US',
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (confirm(t('settingsSecurity.removeFaceIdConfirm'))) {
                      await removeFaceRegistration({
                        userId: userId,
                      });
                      toast.success(t('settingsSecurity.faceIdRemoved'));
                    }
                  }}
                  className="w-full"
                >
                  {t('settingsSecurity.removeFaceId')}
                </Button>
              </>
            ) : (
              <>
                {!showFaceRegistration ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-(--surface-hover) border border-(--border)">
                      <span className="text-3xl">📸</span>
                      <div className="flex-1">
                        <p className="text-sm text-(--text-muted)">
                          {t('settingsSecurity.registerFaceDesc')}
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => setShowFaceRegistration(true)} className="w-full">
                      <ScanFace className="w-4 h-4 mr-2" />
                      {t('settingsSecurity.registerFaceId')}
                    </Button>
                  </div>
                ) : (
                  <FaceRegistration
                    userId={userId}
                    onSuccess={() => {
                      setShowFaceRegistration(false);
                      toast.success(t('settingsSecurity.faceIdSuccess'));
                    }}
                    onCancel={() => setShowFaceRegistration(false)}
                  />
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
