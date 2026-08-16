'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavBadges } from '@/components/layout/NavBadgesProvider';
import { SmartBanner } from '@/components/ui/SmartBanner';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { playNotificationSound } from '@/lib/notificationSound';
import { notificationMessage, notificationTitle } from '@/lib/notificationText';
import { useTranslation } from 'react-i18next';

const getRouteForType = (type: string): string => {
  const routes: Record<string, string> = {
    leave_request: '/leaves',
    leave_approved: '/leaves',
    leave_rejected: '/leaves',
    driver_request: '/drivers',
    driver_request_approved: '/drivers',
    driver_request_rejected: '/drivers',
    employee_added: '/employees',
    join_request: '/organization',
    join_approved: '/organization',
    join_rejected: '/organization',
    security_alert: '/security',
    status_change: '/drivers',
    message_mention: '/chat',
    system: '/dashboard',
    ticket: '/help',
    task: '/tasks',
    recognition: '/recognition',
    event: '/events',
    birthday: '/employees',
    corporate: '/corporate',
    kudos: '/recognition',
    badge_awarded: '/recognition',
    signature_request: '/signatures',
    signature_completed: '/signatures',
    signature_declined: '/signatures',
  };
  return routes[type] || '/dashboard';
};

/**
 * Real-time notification banner that slides in from top
 * when new unread notifications arrive (chat messages, leave requests, etc.)
 * Shown only for admin users, sound plays only for admin
 */
export function NotificationBanner() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const router = useRouter();
  const _isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // Shared subscription from NavBadgesProvider — the banner used to hold a
  // fourth duplicate subscription to the same notifications list.
  const { notifications } = useNavBadges();

  const [lastSeenCount, setLastSeenCount] = useState<number | null>(null);
  const [newNotification, setNewNotification] = useState<{
    title: string;
    message: string;
    type: string;
    route?: string;
    metadata?: string;
  } | null>(null);

  useEffect(() => {
    if (!notifications) return;

    const unread = notifications.filter((n) => !n.isRead);
    const currentCount = unread.length;

    // On first load, just record the count
    if (lastSeenCount === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- record baseline unread count on first load
      setLastSeenCount(currentCount);
      return;
    }

    // If new unread appeared, show the banner
    if (currentCount > lastSeenCount && unread.length > 0) {
      const latest = unread[0]; // most recent

      // Play sound with sessionStorage to prevent repeats
      const hasPlayed = sessionStorage.getItem(`notif_sound_${currentCount}`);
      if (!hasPlayed) {
        sessionStorage.setItem(`notif_sound_${currentCount}`, '1');
        playNotificationSound('new_request');
      }

      if (latest) {
        setNewNotification({
          title: latest.title,
          message: latest.message,
          type: latest.type,
          route: latest.route || getRouteForType(latest.type),
          metadata: latest.metadata,
        });
      }
    }

    setLastSeenCount(currentCount);
  }, [notifications, lastSeenCount]);

  const handleDismiss = useCallback(() => {
    setNewNotification(null);
  }, []);

  if (!newNotification) return null;

  // Map notification type to banner type
  const bannerType =
    newNotification.type === 'leave_approved'
      ? ('success' as const)
      : newNotification.type === 'leave_rejected'
        ? ('error' as const)
        : newNotification.type === 'security_alert'
          ? ('warning' as const)
          : ('purple' as const);

  return (
    <div className="w-full">
      <SmartBanner
        type={bannerType}
        message={notificationTitle(t, newNotification)}
        suggestion={notificationMessage(t, newNotification)}
        icon={<MessageSquare className="w-5 h-5" />}
        onDismiss={handleDismiss}
        className="rounded-none border-x-0 border-t-0"
        action={{
          label: t('banners.view', 'View'),
          onClick: () => {
            handleDismiss();
            router.push(newNotification.route || '/dashboard');
          },
        }}
      />
    </div>
  );
}
