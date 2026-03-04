"use client";

import React, { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Search, Plus, Users, MessageCircle } from "lucide-react";
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
}

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

export function ConversationList({ conversations, selectedId, currentUserId, onSelect, onNewConversation }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = conversations.filter((c) => {
    const name = c.type === "direct" ? (c.otherUser?.name ?? "") : (c.name ?? "");
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const totalUnread = conversations.reduce((s, c) => s + (c.membership.unreadCount ?? 0), 0);

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
          onClick={onNewConversation}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105"
          style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)" }}
          title={t('chat.newConversation')}
        >
          <Plus className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
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
          const unread = conv.membership.unreadCount ?? 0;
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

          return (
            <button
              key={conv._id}
              onClick={() => onSelect(conv._id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-left",
                isSelected ? "shadow-sm scale-[1.01]" : "hover:opacity-90"
              )}
              style={{
                background: isSelected ? "var(--sidebar-item-active)" : "transparent",
                color: isSelected ? "var(--sidebar-item-active-text)" : "var(--text-primary)",
                animation: `conv-in 0.25s ease-out ${idx * 0.04}s both`,
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--sidebar-item-hover)"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
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
                  <span className={cn("text-sm truncate", unread > 0 ? "font-semibold" : "font-medium")}>
                    {displayName}
                  </span>
                  {lastTime && (
                    <span className="text-[10px] shrink-0" style={{ color: "var(--text-disabled)" }}>
                      {lastTime}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    {/* Last message sender mini-avatar (groups only, not own) */}
                    {isGroup && conv.lastMessageText && !isOwnLast && (
                      <div className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center text-[7px] font-bold text-white overflow-hidden"
                        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" }}
                      >
                        {lastSenderAvatar
                          ? <img src={lastSenderAvatar} alt="" className="w-full h-full object-cover" />
                          : lastSenderInitial
                        }
                      </div>
                    )}
                    <p className={cn("text-xs truncate", unread > 0 ? "font-medium" : "opacity-70")}
                      style={{ color: isSelected ? "var(--sidebar-item-active-text)" : "var(--text-muted)" }}>
                      {lastMsgPreview}
                    </p>
                  </div>
                  {unread > 0 && !conv.membership.isMuted && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                  {conv.membership.isMuted && (
                    <span className="text-[10px]" title="Muted">🔕</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        @keyframes conv-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
