/**
 * 🔔 UnreadRequestsBadge Component
 * Shows a blinking badge with unread requests count
 */

import React from "react";
import { Bell } from "lucide-react";
import { useUnreadRequestsCount, useTabBlink } from "@/hooks/useUnreadRequests";
import type { Id } from "@/convex/_generated/dataModel";

interface UnreadRequestsBadgeProps {
  userId?: Id<"users"> | null;
  className?: string;
}

export function UnreadRequestsBadge({
  userId,
  className = "",
}: UnreadRequestsBadgeProps) {
  const { count, hasUnread, isBlinking } = useUnreadRequestsCount(userId);
  const isVisible = useTabBlink(count, hasUnread);

  if (!hasUnread) return null;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full 
        ${isVisible ? "bg-red-500/20 border border-red-500/40" : "bg-red-500/5 border border-red-500/20"}
        transition-all duration-300 ${className}`}
    >
      <Bell
        className={`w-4 h-4 ${
          isVisible ? "text-red-500 animate-bounce" : "text-red-400"
        }`}
      />
      <span
        className={`text-xs font-bold ${
          isVisible ? "text-red-500" : "text-red-400"
        }`}
      >
        {count} {count === 1 ? "request" : "requests"}
      </span>
    </div>
  );
}

/**
 * Inline badge for tab labels (smaller version)
 */
export function UnreadTabBadge({
  userId,
  className = "",
}: UnreadRequestsBadgeProps) {
  const { count, hasUnread, isBlinking } = useUnreadRequestsCount(userId);
  const isVisible = useTabBlink(count, hasUnread);

  if (!hasUnread) return null;

  return (
    <span
      className={`inline-flex items-center justify-center
        w-5 h-5 rounded-full text-xs font-bold
        ${isVisible ? "bg-red-500 text-white animate-pulse" : "bg-red-400 text-white"}
        transition-all duration-300 ${className}`}
    >
      {count}
    </span>
  );
}

/**
 * Full notification banner component
 */
export function UnreadRequestsBanner({
  userId,
  className = "",
}: UnreadRequestsBadgeProps) {
  const { count, hasUnread } = useUnreadRequestsCount(userId);

  if (!hasUnread) return null;

  return (
    <div
      className={`w-full px-4 py-3 rounded-lg border
        bg-red-500/10 border-red-500/20 flex items-center gap-3 
        animate-pulse ${className}`}
    >
      <Bell className="w-5 h-5 text-red-500 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {count} pending {count === 1 ? "request" : "requests"} awaiting review
        </p>
      </div>
    </div>
  );
}
