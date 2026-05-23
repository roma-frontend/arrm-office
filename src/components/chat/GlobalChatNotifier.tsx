'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { usePathname } from 'next/navigation';
import { api } from '../../../convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import { playChatMessageSound, sendBrowserNotification } from '@/lib/notificationSound';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import React from 'react';

/**
 * Global chat notification listener — plays sound + shows toast
 * when new messages arrive and user is NOT on the chat page.
 */
export function GlobalChatNotifier() {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const prevCountRef = useRef<number | null>(null);

  const isChatPage = pathname?.startsWith('/chat');

  const totalUnread = useQuery(
    api.chat.queries.getTotalUnread,
    user?.id && user?.organizationId
      ? {
          userId: user.id as Id<'users'>,
          organizationId: user.organizationId as Id<'organizations'>,
        }
      : 'skip',
  );

  useEffect(() => {
    if (totalUnread === undefined) return;

    if (prevCountRef.current === null) {
      prevCountRef.current = totalUnread;
      return;
    }

    // New message arrived and user is NOT on chat page
    if (totalUnread > prevCountRef.current && !isChatPage) {
      playChatMessageSound();
      toast('New message', {
        icon: React.createElement(MessageCircle, { className: 'w-4 h-4 text-blue-500' }),
        duration: 4000,
      });
    }

    prevCountRef.current = totalUnread;
  }, [totalUnread, isChatPage]);

  return null;
}
