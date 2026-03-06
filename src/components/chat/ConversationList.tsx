"use client";

import React, { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { Search, Plus, Users, MessageCircle, Pin, Archive, Trash2, RotateCcw, Volume2, VolumeX, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";

interface Conversation {
  _id: Id<"chatConversations">;
  type: "direct" | "group";
  name?: string;
  avatarUrl?: string;
  lastMessageAt?: number;
  lastMessageText?: string;
  lastMessageSenderId?: Id<"users">;
  isPinned?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  membership: { unreadCount: number; isMuted: boolean };
  otherUser?: { _id: Id<"users">; name: string; avatarUrl?: string; presenceStatus?: string } | null;
  memberCount?: number;
  members?: Array<{ userId: Id<"users">; user?: { name: string; avatarUrl?: string } | null }>;
}

interface Props {
  conversations: Conversation[];
  selectedId: Id<"chatConversations"> | null;
  currentUserId: Id<"users">;
  onSelect: (id: Id<"chatConversations">) => void;
  onNewConversation: () => void;
  onTogglePin?: (convId: Id<"chatConversations">) => Promise<void>;
  onDelete?: (convId: Id<"chatConversations">) => Promise<void>;
  onRestore?: (convId: Id<"chatConversations">) => Promise<void>;
  onToggleArchive?: (convId: Id<"chatConversations">) => Promise<void>;
  onToggleMute?: (convId: Id<"chatConversations">) => Promise<void>;
}

type FilterType = "all" | "unread" | "groups" | "pinned" | "archived";

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function PresenceDot({ status }: { status?: string }) {
  const color =
    status === "available" ? "bg-green-500" :
    status === "busy" ? "bg-yellow-500" :
    status === "in_call" || status === "in_meeting" ? "bg-red-500" :
    status === "out_of_office" ? "bg-gray-400" :
    "bg-gray-400";
  return (
    <span className={cn("absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white", color)} />
  );
}

export function ConversationList({ 
  conversations, 
  selectedId, 
  currentUserId, 
  onSelect, 
  onNewConversation,
  onTogglePin,
  onDelete,
  onRestore,
  onToggleArchive,
  onToggleMute,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [loadingOpId, setLoadingOpId] = useState<string | null>(null);

  console.log(`[ConversationList] Rendering ${conversations?.length ?? 0} conversations, selected: ${selectedId}`);
  if (conversations && conversations.length > 0) {
    conversations.forEach((c, idx) => {
      console.log(`  [${idx}] ${c.name || c.otherUser?.name || 'DM'} (unread: ${c.membership.unreadCount})`);
    });
  }

  // Apply filters
  const filtered = conversations.filter((c) => {
    const name = c.type === "direct" ? (c.otherUser?.name ?? "") : (c.name ?? "");
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    switch (filter) {
      case "unread":
        return c.membership.unreadCount > 0;
      case "groups":
        return c.type === "group";
      case "pinned":
        return c.isPinned;
      case "archived":
        return c.isArchived;
      default:
        return !c.isArchived; // "all" shows non-archived only
    }
  });

  const totalUnread = conversations.reduce((s, c) => s + (c.membership.unreadCount ?? 0), 0);

  const handleOperation = async (operation: () => Promise<void>, convId: Id<"chatConversations">) => {
    try {
      setLoadingOpId(convId);
      await operation();
    } catch (error) {
      console.error("Operation failed:", error);
    } finally {
      setLoadingOpId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" style={{ color: "var(--primary)" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            {t('chat.messages')}
          </h2>
          {totalUnread > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            console.log("[ConversationList] Plus button clicked, calling onNewConversation");
            onNewConversation();
          }}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{ 
            background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)",
            cursor: "pointer",
            zIndex: 10,
            position: "relative",
          }}
          title={t('chat.newConversation')}
        >
          <Plus className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-disabled)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('chat.searchConversations')}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none transition-all"
            style={{
              background: "var(--background-subtle)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="px-3 pb-2 flex gap-1 overflow-x-auto scrollbar-hide">
        {(["all", "unread", "groups", "pinned", "archived"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all shrink-0",
              filter === f
                ? "text-white"
                : "text-gray-500 opacity-60 hover:opacity-100"
            )}
            style={{
              background: filter === f ? "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)" : "transparent",
            }}
          >
            {f === "all" && "All"}
            {f === "unread" && `Unread ${conversations.filter(c => c.membership.unreadCount > 0).length > 0 ? `(${conversations.filter(c => c.membership.unreadCount > 0).length})` : ""}`}
            {f === "groups" && "Groups"}
            {f === "pinned" && "Pinned"}
            {f === "archived" && "Archived"}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 custom-scrollbar">
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: "var(--text-muted)" }} />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {search ? t('chat.noResults') : t('chat.noConversations')}
            </p>
          </div>
        )}

        {filtered.map((conv, idx) => {
          const isSelected = conv._id === selectedId;
          const isGroup = conv.type === "group";
          const displayName = isGroup ? (conv.name ?? "Group") : (conv.otherUser?.name ?? "Unknown");
          const avatarUrl = isGroup ? conv.avatarUrl : conv.otherUser?.avatarUrl;
          // If conversation is selected, hide the unread count (client-side optimization)
          const unread = isSelected ? 0 : (conv.membership.unreadCount ?? 0);
          const lastTime = conv.lastMessageAt
            ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false })
            : "";

          // Sender prefix for last message
          const isOwnLast = conv.lastMessageSenderId === currentUserId;
          const senderName = isOwnLast
            ? t('chat.youPrefix')
            : conv.type === "direct"
              ? ""
              : conv.lastMessageSenderId
                ? (conv.members?.find((m) => m.userId === conv.lastMessageSenderId)?.user?.name?.split(" ")[0] ?? "")
                : "";
          const rawLastText = conv.lastMessageText === "This message was deleted" ? "" : conv.lastMessageText;
          const lastMsgPreview = rawLastText
            ? (senderName ? `${senderName}: ${rawLastText}` : rawLastText)
            : (isGroup ? `${conv.memberCount ?? 2} ${t('chat.members')}` : t('chat.startConversationHint'));

          // Last message sender avatar (for groups)
          const lastSenderMember = isGroup && conv.lastMessageSenderId
            ? conv.members?.find((m) => m.userId === conv.lastMessageSenderId)
            : null;
          const lastSenderAvatar = isOwnLast ? null : lastSenderMember?.user?.avatarUrl;
          const lastSenderInitial = isOwnLast ? null : (lastSenderMember?.user?.name?.[0]?.toUpperCase() ?? null);

          const isLoading = loadingOpId === conv._id;

          return (
            <ContextMenu key={conv._id}>
              <ContextMenuTrigger asChild>
                <div
                  onClick={() => onSelect(conv._id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-left relative cursor-pointer",
                    isSelected ? "shadow-sm scale-[1.01]" : "hover:opacity-90",
                  )}
                  style={{
                    background: isSelected ? "var(--sidebar-item-active)" : "transparent",
                    color: isSelected ? "var(--sidebar-item-active-text)" : "var(--text-primary)",
                    animation: `conv-in 0.25s ease-out ${idx * 0.04}s both`,
                    opacity: conv.isDeleted ? 0.5 : 1,
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--sidebar-item-hover)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                {isLoading && <Loader2 className="absolute top-3 left-3 w-5 h-5 animate-spin" style={{ color: "var(--primary)" }} />}
                
                {/* Conversation avatar */}
                <div className="relative shrink-0">
                  <Avatar className="w-10 h-10">
                    {avatarUrl && <AvatarImage src={avatarUrl} />}
                    <AvatarFallback
                      className="text-xs font-bold text-white"
                      style={{ background: isGroup ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" }}
                    >
                      {isGroup ? <Users className="w-4 h-4" /> : getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  {!isGroup && conv.otherUser?.presenceStatus && (
                    <PresenceDot status={conv.otherUser.presenceStatus} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className={cn("sm:text-sm text-base truncate", unread > 0 ? "font-semibold" : "font-medium")}>
                        {displayName}
                      </span>
                      {conv.isPinned && <Pin className="sm:w-3 sm:h-3 w-4 h-4 shrink-0" style={{ color: "var(--primary)" }} />}
                    </div>
                    {lastTime && (
                      <span className="sm:text-[10px] text-xs shrink-0" style={{ color: "var(--text-disabled)" }}>
                        {lastTime}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-1 sm:mt-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      {/* Last message sender mini-avatar (groups only, not own) */}
                      {isGroup && conv.lastMessageText && !isOwnLast && (
                        <div className="sm:w-3.5 sm:h-3.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center sm:text-[7px] text-[8px] font-bold text-white overflow-hidden"
                          style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" }}
                        >
                          {lastSenderAvatar
                            ? <img src={lastSenderAvatar} alt="" className="w-full h-full object-cover" />
                            : lastSenderInitial
                          }
                        </div>
                      )}
                      <p className={cn("sm:text-xs text-sm truncate", unread > 0 ? "font-medium" : "opacity-70")}
                        style={{ color: isSelected ? "var(--sidebar-item-active-text)" : "var(--text-muted)" }}>
                        {conv.isDeleted ? "[Удалено]" : lastMsgPreview}
                      </p>
                    </div>
                    {unread > 0 && !conv.membership.isMuted && (
                      <span className="min-w-[20px] sm:min-w-[18px] h-[20px] sm:h-[18px] px-1 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white sm:text-[9px] text-[10px] font-bold flex items-center justify-center shrink-0">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                    {conv.membership.isMuted && (
                      <VolumeX className="w-3 h-3 shrink-0 opacity-50" />
                    )}
                  </div>
                </div>
              </div>
              </ContextMenuTrigger>

              {/* Context Menu */}
              <ContextMenuContent className="w-48" side="right">
                {!conv.isDeleted && (
                  <>
                    <ContextMenuLabel className="text-xs" style={{ color: "var(--text-muted)" }}>{displayName}</ContextMenuLabel>
                    <ContextMenuSeparator />
                  </>
                )}
                
                {conv.isDeleted ? (
                  <ContextMenuItem
                    onClick={() => handleOperation(() => onRestore?.(conv._id) || Promise.resolve(), conv._id)}
                    disabled={isLoading}
                    className="flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Восстановить
                  </ContextMenuItem>
                ) : (
                  <>
                    <ContextMenuItem
                      onClick={() => handleOperation(() => onTogglePin?.(conv._id) || Promise.resolve(), conv._id)}
                      disabled={isLoading}
                      className="flex items-center gap-2"
                    >
                      <Pin className="w-4 h-4" />
                      {conv.isPinned ? "Открепить" : "Закрепить"}
                    </ContextMenuItem>
                    
                    <ContextMenuItem
                      onClick={() => handleOperation(() => onToggleMute?.(conv._id) || Promise.resolve(), conv._id)}
                      disabled={isLoading}
                      className="flex items-center gap-2"
                    >
                      {conv.membership.isMuted ? (
                        <>
                          <Volume2 className="w-4 h-4" />
                          Включить звук
                        </>
                      ) : (
                        <>
                          <VolumeX className="w-4 h-4" />
                          Отключить звук
                        </>
                      )}
                    </ContextMenuItem>
                    
                    <ContextMenuItem
                      onClick={() => handleOperation(() => onToggleArchive?.(conv._id) || Promise.resolve(), conv._id)}
                      disabled={isLoading}
                      className="flex items-center gap-2"
                    >
                      <Archive className="w-4 h-4" />
                      {conv.isArchived ? "Разархивировать" : "Архивировать"}
                    </ContextMenuItem>
                    
                    <ContextMenuSeparator />
                    
                    <ContextMenuItem
                      onClick={() => handleOperation(() => onDelete?.(conv._id) || Promise.resolve(), conv._id)}
                      disabled={isLoading}
                      className="flex items-center gap-2 text-red-500 focus:text-red-500 focus:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Удалить
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        @keyframes conv-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
