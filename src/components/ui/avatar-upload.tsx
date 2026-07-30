'use client';

import { useTranslation } from 'react-i18next';
import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Camera, User } from 'lucide-react';
import { ShieldLoader } from './ShieldLoader';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { uploadAvatarToCloudinary } from '@/actions/cloudinary';
import { updateSessionAvatarAction } from '@/actions/auth';
import { toast } from 'sonner';
import Image from 'next/image';
import { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { logger as log } from '@/lib/logger';

interface AvatarUploadProps {
  userId: string;
  currentUrl?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  onSuccess?: (url: string) => void;
  readonly?: boolean;
}

const sizes = {
  sm: 'w-10 h-10 text-sm',
  md: 'w-16 h-16 text-lg',
  lg: 'w-24 h-24 text-2xl',
};

export function AvatarUpload({
  userId,
  currentUrl,
  name,
  size = 'md',
  onSuccess,
  readonly = false,
}: AvatarUploadProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const updateAvatar = useMutation(api.users.mutations.updateAvatar);
  const { user, setUser } = useAuthStore();

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const displayUrl = preview ?? currentUrl;

  const handleFile = async (file: File) => {
    const endTimer = log.time('Avatar Upload');

    log.info('Avatar upload started', {
      component: 'AvatarUpload',
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      userId,
    });

    if (!file.type.startsWith('image/')) {
      log.warn('Invalid file type selected', { fileType: file.type });
      toast.error(t('toasts.pleaseSelectImage'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      log.warn('File size exceeds limit', {
        fileSize: file.size,
        maxSize: 5 * 1024 * 1024,
      });
      toast.error(t('toasts.imageTooLarge'));
      return;
    }

    setUploading(true);
    try {
      log.debug('Converting file to base64', { fileName: file.name });

      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      log.debug('Base64 conversion complete', {
        base64Length: base64.length,
      });
      setPreview(base64);

      log.info('Uploading to Cloudinary', { userId });

      // Upload to Cloudinary
      const url = await uploadAvatarToCloudinary(base64, userId);

      log.info('Cloudinary upload complete', { url, userId });

      log.debug('Saving avatar URL to Convex', { userId });

      // Save URL to Convex
      await updateAvatar({
        userId: userId as Id<'users'>,
        avatarUrl: url,
      });

      log.debug('Avatar URL saved to Convex', { userId });

      log.debug('Updating session cookie', { userId });

      // Update JWT cookie with new avatar (non-blocking - avatar is already saved to DB)
      try {
        await updateSessionAvatarAction(userId, url);
        log.debug('Session cookie updated', { userId });
      } catch (sessionErr) {
        log.warn('Session cookie update failed (avatar is saved, will reflect on refresh)', {
          userId,
          error: sessionErr instanceof Error ? sessionErr.message : String(sessionErr),
        });
      }

      setPreview(null);

      // Update user in store
      if (user && user.id === userId) {
        log.debug('Updating user in store', { userId });
        setUser({ ...user, avatar: url });
      }

      onSuccess?.(url);
      toast.success(t('toasts.avatarUpdated'));

      log.info('Avatar upload completed successfully', {
        userId,
        url,
      });

      endTimer();
    } catch (err) {
      log.error('Avatar upload failed', err as Error, {
        component: 'AvatarUpload',
        userId,
        fileName: file.name,
        errorMessage: err instanceof Error ? err.message : String(err),
      });

      setPreview(null);
      toast.error(err instanceof Error ? err.message : t('toasts.uploadFailed'));
      endTimer();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative inline-block">
      <div
        className={`${sizes[size]} rounded-full relative overflow-hidden shrink-0`}
        style={{ background: 'var(--primary-muted)' }}
      >
        {displayUrl ? (
          <Image src={displayUrl} alt={name} fill className="object-cover" sizes="100%" />
        ) : (
          <div
            className={`${sizes[size]} rounded-full flex items-center justify-center font-bold btn-gradient text-white shadow-md hover:shadow-lg`}
          >
            {initials || <User className="w-1/2 h-1/2" />}
          </div>
        )}

        {/* Uploading overlay */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center rounded-full"
              style={{ background: 'rgba(0,0,0,0.6)' }}
            >
              <ShieldLoader size="md" variant="inline" className="text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Upload button */}
      {!readonly && (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 transition-all hover:scale-110 disabled:opacity-50"
            style={{
              background: 'var(--primary)',
              borderColor: 'var(--background)',
              color: '#fff',
            }}
            title={t('ariaLabels.changeAvatar')}
          >
            <Camera className="w-3 h-3" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </>
      )}
    </div>
  );
}
