'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '../../../convex/_generated/dataModel';
import { Focus, Bell, BellOff, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface FocusModeProps {
  currentPresence: string;
  onFocusChange?: (isFocus: boolean) => void;
}

export function FocusMode({ currentPresence, onFocusChange }: FocusModeProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isFocusMode, setIsFocusMode] = useState(currentPresence === 'busy');
  const updatePresence = useMutation(api.users.mutations.updatePresenceStatus);

  const toggleFocusMode = async () => {
    if (!user?.id) return;

    try {
      const newFocusState = !isFocusMode;

      // Update presence status
      await updatePresence({
        userId: user.id as Id<'users'>,
        presenceStatus: newFocusState ? 'busy' : 'available',
      });

      setIsFocusMode(newFocusState);
      onFocusChange?.(newFocusState);

      if (newFocusState) {
        toast.success(t('focusMode.activated'), {
          description: t('focusMode.statusBusy'),
        });
      } else {
        toast.info(t('focusMode.deactivated'), {
          description: t('focusMode.backToNormal'),
        });
      }
    } catch (_error) {
      toast.error(t('focusMode.toggleFailed'));
    }
  };

  return (
    <div className="px-2 py-3">
      <div className="mb-3 px-2">
        <h3 className="text-xs font-semibold text-(--text-muted) flex items-center gap-2">
          <Focus className="w-3.5 h-3.5" />
          {t('focusMode.title')}
        </h3>
        <p className="text-[10px] text-(--text-muted) mt-0.5">{t('focusMode.description')}</p>
      </div>

      {/* Focus Mode Toggle */}
      <div
        className={`rounded-xl border p-4 transition-all ${
          isFocusMode
            ? 'border-(--primary)/50 bg-(--primary)/5'
            : 'border-(--border) bg-(--background-subtle)'
        }`}
      >
        <div className="flex items-start gap-3 mb-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
              isFocusMode
                ? 'btn-gradient shadow-lg'
                : 'bg-(--background-subtle) border border-(--border)'
            }`}
          >
            {isFocusMode ? (
              <Zap className="h-5 w-5 text-white" />
            ) : (
              <Focus className="h-5 w-5 text-(--text-muted)" />
            )}
          </div>

          <div className="flex-1">
            <h4 className="text-sm font-semibold text-(--text-primary)">
              {isFocusMode ? t('focusMode.modeActive') : t('focusMode.title')}
            </h4>
            <p className="text-xs text-(--text-muted) mt-0.5">
              {isFocusMode ? t('focusMode.deepWorkMode') : t('focusMode.enterDeepWork')}
            </p>
          </div>

          <button
            onClick={toggleFocusMode}
            className={`relative h-6 w-11 rounded-full transition-all shrink-0 ${
              isFocusMode ? 'btn-gradient' : 'bg-(--surface-3) dark:bg-(--surface-3)'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                isFocusMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Features list */}
        <div className="space-y-1.5 border-t border-(--border) pt-3">
          <div className="flex items-center gap-2 text-xs">
            {isFocusMode ? (
              <BellOff className="w-3.5 h-3.5 text-(--primary)" />
            ) : (
              <Bell className="w-3.5 h-3.5 text-(--text-muted)" />
            )}
            <span className={isFocusMode ? 'text-(--text-primary)' : 'text-(--text-muted)'}>
              {isFocusMode ? t('focusMode.notificationsMuted') : t('focusMode.muteNotifications')}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div
              className={`w-2 h-2 rounded-full ${isFocusMode ? 'bg-(--danger-solid)' : 'bg-(--text-muted)'}`}
            />
            <span className={isFocusMode ? 'text-(--text-primary)' : 'text-(--text-muted)'}>
              {isFocusMode ? t('focusMode.statusBusy') : t('focusMode.setStatusBusy')}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Zap
              className={`w-3.5 h-3.5 ${isFocusMode ? 'text-(--primary)' : 'text-(--text-muted)'}`}
            />
            <span className={isFocusMode ? 'text-(--text-primary)' : 'text-(--text-muted)'}>
              {isFocusMode ? t('focusMode.deepWorkEnabled') : t('focusMode.enableDeepWork')}
            </span>
          </div>
        </div>

        {isFocusMode && (
          <div className="mt-3 pt-3 border-t border-(--border)">
            <p className="text-xs text-center text-(--primary) font-medium">
              {t('focusMode.stayFocused')}
            </p>
          </div>
        )}
      </div>

      {!isFocusMode && (
        <Button onClick={toggleFocusMode} className="w-full mt-3" size="sm">
          <Zap className="w-4 h-4 mr-2" />
          {t('focusMode.activateFocusMode')}
        </Button>
      )}
    </div>
  );
}
