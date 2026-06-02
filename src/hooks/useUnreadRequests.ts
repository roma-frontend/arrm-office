/**
 * 🔔 useUnreadRequestsCount Hook
 * Real-time unread requests counter with blinking effect
 */

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useEffect, useState } from 'react';
import type { Id } from '@/convex/_generated/dataModel';

export function useUnreadRequestsCount(userId?: Id<'users'> | null) {
  const [isBlinking, setIsBlinking] = useState(false);

  // Get unread count from Convex
  const unreadCount = useQuery(api.leaves.getUnreadCount, userId ? {} : 'skip');

  // Reset blinking when component mounts and unread changes
  useEffect(() => {
    if (unreadCount && unreadCount > 0) {
      setIsBlinking(true);
    } else {
      setIsBlinking(false);
    }
  }, [unreadCount]);

  return {
    count: unreadCount ?? 0,
    isBlinking,
    hasUnread: (unreadCount ?? 0) > 0,
  };
}

/**
 * Hook to update document title with unread count
 * Shows "[3] Dashboard" when 3 unread requests
 */
export function useTitleBadge(count: number, originalTitle = 'Dashboard') {
  useEffect(() => {
    if (count > 0) {
      document.title = `[${count}] ${originalTitle}`;
    } else {
      document.title = originalTitle;
    }

    return () => {
      document.title = originalTitle;
    };
  }, [count, originalTitle]);
}

/**
 * Hook for tab visibility blinking effect
 * Makes the tab title blink when there are unread requests
 */
export function useTabBlink(count: number, enabled = true) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!enabled || count === 0) return;

    const interval = setInterval(() => {
      setIsVisible((prev) => !prev);
    }, 600); // Blink every 600ms

    return () => clearInterval(interval);
  }, [count, enabled]);

  return isVisible;
}
