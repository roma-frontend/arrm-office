'use client';

import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Coffee } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  subscribeToPushNotifications,
  sendLocalPushNotification,
  isPushNotificationSupported,
  requestNotificationPermission,
} from '@/lib/pushNotifications';

interface BreakReminderServiceProps {
  enabled: boolean;
  intervalMinutes: number;
  workHoursStart?: string;
  workHoursEnd?: string;
}

export default function BreakReminderService({
  enabled,
  intervalMinutes,
  workHoursStart = '09:00',
  workHoursEnd = '18:00',
}: BreakReminderServiceProps) {
  const { t } = useTranslation();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastReminderRef = useRef<number>(Date.now());

  // Create energizing sound using Web Audio API
  const playBreakSound = () => {
    try {
      if (!audioContextRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      const now = ctx.currentTime;

      // Create oscillators for a pleasant "ding-dong" sound
      const createTone = (frequency: number, startTime: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        // Envelope for smooth sound
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      // Pleasant notification melody (C-E-G chord progression)
      createTone(523.25, now, 0.15); // C5
      createTone(659.25, now + 0.1, 0.15); // E5
      createTone(783.99, now + 0.2, 0.3); // G5

      // Second chord for emphasis
      createTone(523.25, now + 0.4, 0.1); // C5
      createTone(659.25, now + 0.45, 0.1); // E5
      createTone(783.99, now + 0.5, 0.2); // G5
    } catch (error) {
      console.error('Failed to play break sound:', error);
    }
  };

  // Check if current time is within work hours
  const isWithinWorkHours = () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentTime >= workHoursStart && currentTime <= workHoursEnd;
  };

  // Show break reminder notification
  const showBreakReminder = async () => {
    if (!enabled || !isWithinWorkHours()) return;

    const timeSinceLastReminder = Date.now() - lastReminderRef.current;
    const intervalMs = intervalMinutes * 60 * 1000;

    // Only show if enough time has passed
    if (timeSinceLastReminder < intervalMs) return;

    lastReminderRef.current = Date.now();

    // Play energizing sound
    playBreakSound();

    // Show toast notification for desktop
    toast(
      <div className="flex items-center gap-4 p-2">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-(--primary) flex items-center justify-center shadow-lg">
            <Coffee className="w-6 h-6 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
        </div>
        <div className="flex-1">
          <p className="font-semibold text-(--foreground) text-base">
            {t('productivity.breakTime')}
          </p>
          <p className="text-sm text-(--text-muted) mt-0.5 leading-relaxed">
            {intervalMinutes === 1
              ? t('productivity.breakTestMode')
              : t('productivity.breakBody', { minutes: intervalMinutes })}
          </p>
        </div>
      </div>,
      {
        duration: 10000,
        position: 'top-center',
        className: 'break-reminder-toast',
      },
    );

    // Send push notification for mobile (works even when app is in background)
    if (isPushNotificationSupported()) {
      try {
        await sendLocalPushNotification(t('productivity.breakTime'), {
          body: t('productivity.breakBody', { minutes: intervalMinutes }),
          tag: `break-reminder-${Date.now()}`, // Unique tag to ensure it always shows
          requireInteraction: false, // Better for iOS - auto dismiss after some time
          silent: false, // Play sound
        });
      } catch (error) {
        console.error('Failed to send push notification:', error);
      }
    }
  };

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Initialize push notifications
    const initPushNotifications = async () => {
      if (isPushNotificationSupported()) {
        const permission = await requestNotificationPermission();
        if (permission === 'granted') {
          // Subscribe to push notifications for mobile
          await subscribeToPushNotifications();
          logger.log('✅ Push notifications enabled for mobile!');
        }
      }
    };

    initPushNotifications();

    // Check every minute if it's time for a break
    timerRef.current = setInterval(() => {
      showBreakReminder();
    }, 60000); // Check every minute

    // Initial check
    showBreakReminder();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [enabled, intervalMinutes, workHoursStart, workHoursEnd]);

  // This component doesn't render anything
  return null;
}
