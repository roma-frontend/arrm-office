'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavBadges } from '@/components/layout/NavBadgesProvider';
import { SmartBanner } from '@/components/ui/SmartBanner';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { playNotificationSound } from '@/lib/notificationSound';
import {
  notificationMessage,
  notificationSoundType,
  notificationTitle,
  parseNotificationMeta,
} from '@/lib/notificationText';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { EventInviteButtons } from '@/components/calendar/EventInviteActions';
import { notificationTarget } from '@/lib/notificationTarget';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/**
 * Real-time notification banner that slides in from top
 * when new unread notifications arrive (chat messages, leave requests, etc.)
 * Shown only for admin users, sound plays only for admin
 */
export function NotificationBanner() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const router = useRouter();
  const markRead = useMutation(api.notifications.markAsRead);
  const _isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // Shared subscription from NavBadgesProvider — the banner used to hold a
  // fourth duplicate subscription to the same notifications list.
  const { notifications } = useNavBadges();

  const [lastSeenCount, setLastSeenCount] = useState<number | null>(null);
  const [newNotification, setNewNotification] = useState<{
    id: string;
    title: string;
    message: string;
    type: string;
    route?: string;
    metadata?: string;
    relatedId?: string;
  } | null>(null);

  useEffect(() => {
    if (!notifications) return;

    const unread = notifications.filter((n) => !n.isRead);
    const currentCount = unread.length;

    // On first load, just record the count
    if (lastSeenCount === null) {
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
        if (latest) playNotificationSound(notificationSoundType(latest));
      }

      if (latest) {
        setNewNotification({
          id: latest._id,
          title: latest.title,
          message: latest.message,
          type: latest.type,
          route: latest.route,
          metadata: latest.metadata,
          relatedId: latest.relatedId,
        });
      }
    }

    setLastSeenCount(currentCount);
  }, [notifications, lastSeenCount]);

  const handleDismiss = useCallback(() => {
    setNewNotification(null);
  }, []);

  /**
   * Follow the notification: mark it read first, then navigate.
   *
   * The read patch is what makes the counters settle — `notificationsUnread`,
   * `taskUnread` and `calendarUnread` are all derived from `isRead` over the
   * shared subscription, so they drop as soon as the mutation lands. The banner
   * used to navigate without it, which left the bell (and the mobile dock)
   * showing a notification the user had just acted on.
   */
  const handleView = useCallback(async () => {
    if (!newNotification) return;
    const target = notificationTarget(newNotification, user?.role) ?? '/dashboard';
    handleDismiss();
    try {
      await markRead({ notificationId: newNotification.id as Id<'notifications'> });
    } catch (err) {
      // Navigating matters more than the read patch — log and continue.
      logger.error('Failed to mark notification read before navigating', err);
    }
    router.push(target);
  }, [newNotification, user?.role, handleDismiss, markRead, router]);

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

  const meta = parseNotificationMeta(newNotification.metadata);
  const isInvite = meta.type === 'calendar_invite';

  return (
    <div className="w-full">
      <SmartBanner
        type={bannerType}
        message={notificationTitle(t, newNotification)}
        suggestion={notificationMessage(t, newNotification)}
        icon={<MessageSquare className="w-5 h-5" />}
        onDismiss={handleDismiss}
        className="rounded-none border-x-0 border-t-0"
        actions={
          isInvite && meta.eventId ? (
            <EventInviteButtons
              eventId={meta.eventId}
              onResponded={async () => {
                // Same bug as in the bell dropdown: the RSVP itself
                // succeeds, but without an awaited read-patch the bell
                // count stays wrong until the user clicks the row or the
                // list re-validates. Await, then swallow any failure
                // (dismissing the banner is more important than nagging
                // about a read-patch hiccup), and only fall back to a
                // toast on real failure.
                try {
                  await markRead({
                    notificationId: newNotification.id as Id<'notifications'>,
                  });
                } catch (err) {
                  logger.error('Failed to mark invite notification read after RSVP', err);
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : t('notifications.markReadFailed', {
                          defaultValue: 'Could not update the notification',
                        }),
                  );
                } finally {
                  handleDismiss();
                }
              }}
            />
          ) : undefined
        }
        action={{
          label: t('banners.view', 'View'),
          onClick: () => {
            void handleView();
          },
        }}
      />
    </div>
  );
}
