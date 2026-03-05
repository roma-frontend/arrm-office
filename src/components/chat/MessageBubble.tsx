"use client";

import React, { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Reply, Edit2, Trash2, Trash, Pin, Copy, MoreHorizontal, Phone, Video, FileText, Download, X, CheckCheck, Check, MessageSquare } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { SmartReply } from "./SmartReply";
import { LinkPreview, extractUrl } from "./LinkPreview";

// ── i18n labels for delivered / seen ──────────────────────────────────────────
type Lang = "en" | "ru" | "hy";

function getLang(): Lang {
  if (typeof window === "undefined") return "en";
  const l = document.documentElement.lang || navigator.language || "en";
  if (l.startsWith("ru")) return "ru";
  if (l.startsWith("hy") || l.startsWith("am")) return "hy";
  return "en";
}

const RECEIPT_LABELS: Record<Lang, { delivered: string; seen: string }> = {
  en: { delivered: "Delivered", seen: "Seen" },
  ru: { delivered: "Доставлено", seen: "Просмотрено" },
  hy: { delivered: "Հասցված է", seen: "Դիտված է" },
};

// ── UI labels by language ─────────────────────────────────────────────────────
const UI_LABELS: Record<Lang, {
  deleted: string; pollClosed: string; votes: string; closePoll: string;
  copy: string; pin: string; unpin: string; edit: string;
  deleteForMe: string; deleteForEveryone: string; deleteMsg: string;
  deleteDesc: string; canOnlyDelete: string; cancel: string;
  missed: string; declined: string; download: string; reply: string;
}> = {
  en: {
    deleted: "This message was deleted", pollClosed: "Poll closed", votes: "votes",
    closePoll: "Close poll", copy: "Copy", pin: "Pin", unpin: "Unpin", edit: "Edit",
    deleteForMe: "Delete for me", deleteForEveryone: "Delete for everyone",
    deleteMsg: "Delete message", deleteDesc: "Choose how to delete this message.",
    canOnlyDelete: "⏱ Can only delete for everyone within 5 minutes", cancel: "Cancel",
    missed: "Missed", declined: "Declined", download: "Download", reply: "Reply",
  },
  ru: {
    deleted: "Это сообщение было удалено", pollClosed: "Опрос закрыт", votes: "голосов",
    closePoll: "Закрыть опрос", copy: "Копировать", pin: "Закрепить", unpin: "Открепить", edit: "Редактировать",
    deleteForMe: "Удалить у меня", deleteForEveryone: "Удалить у всех",
    deleteMsg: "Удалить сообщение", deleteDesc: "Выберите способ удаления этого сообщения.",
    canOnlyDelete: "⏱ Удалить у всех можно только в течение 5 минут", cancel: "Отмена",
    missed: "Пропущен", declined: "Отклонён", download: "Скачать", reply: "Ответить",
  },
  hy: {
    deleted: "Այս հաղորդագրությունը ջնջված է", pollClosed: "Հարցումը փակված է", votes: "ձայն",
    closePoll: "Փակել հարցումը", copy: "Պատճենել", pin: "Ամրացնել", unpin: "Ապամրացնել", edit: "Խմբագրել",
    deleteForMe: "Ջնջել ինձ համար", deleteForEveryone: "Ջնջել բոլորի համար",
    deleteMsg: "Ջնջել հաղորդագրությունը", deleteDesc: "Ընտրեք, թե ինչպես ջնջել այս հաղորդագրությունը:",
    canOnlyDelete: "⏱ Կարելի է ջնջել բոլորի համար միայն 5 րոպեի ընթացքում", cancel: "Չեղարկել",
    missed: "Բաց թողնված", declined: "Մերժված", download: "Ներբեռնել", reply: "Պատասխանել",
  },
};

function getLabelLang(lang?: string): Lang {
  if (!lang) return "en";
  if (lang.startsWith("ru")) return "ru";
  if (lang.startsWith("hy") || lang.startsWith("am")) return "hy";
  return "en";
}

// ── Emoji Key Conversion Helpers for Reactions ────────────────────────────────
/**
 * Convert emoji to ASCII-safe key format using Unicode code points
 * Example: 👍 → "u1f44d", ❤️ → "u2764_ufe0f"
 */
function emojiToKey(emoji: string): string {
  const codePoints: string[] = [];
  for (const char of emoji) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined) {
      codePoints.push('u' + codePoint.toString(16).toLowerCase());
    }
  }
  return codePoints.join('_');
}

/**
 * Convert ASCII-safe key back to emoji using Unicode code points
 * Example: "u1f44d" → 👍, "u2764_ufe0f" → ❤️
 */
function keyToEmoji(key: string): string {
  return key
    .split('_')
    .map(part => {
      const codePoint = parseInt(part.substring(1), 16);
      return String.fromCodePoint(codePoint);
    })
    .join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReadEntry { userId: string; readAt: number }

interface PollOption { id: string; text: string; votes: string[] }
interface Poll { question: string; options: PollOption[]; closedAt?: number }
interface LinkPreviewData { url: string; title?: string; description?: string; image?: string; siteName?: string }

interface Message {
  _id: Id<"chatMessages">;
  senderId: Id<"users">;
  type: string;
  content: string;
  createdAt: number;
  isEdited?: boolean;
  isDeleted?: boolean;
  isPinned?: boolean;
  replyToContent?: string;
  replyToSenderName?: string;
  reactions?: Record<string, string[]>;
  attachments?: Array<{ url: string; name: string; type: string; size: number }>;
  readBy?: ReadEntry[];
  poll?: Poll;
  threadCount?: number;
  threadLastAt?: number;
  linkPreview?: LinkPreviewData;
  callType?: string;
  callStatus?: string;
  callDuration?: number;
  sender?: { _id: Id<"users">; name: string; avatarUrl?: string } | null;
}

interface Props {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showName: boolean;
  currentUserId: Id<"users">;
  currentUserAvatar?: string;
  currentUserName?: string;
  onReply: (id: Id<"chatMessages">, content: string, senderName: string) => void;
  onOpenThread: (id: Id<"chatMessages">, content: string) => void;
  onSendMessage?: (text: string) => void;
  lang?: string;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function isImage(type: string) { return type.startsWith("image/"); }
function isPDF(type: string) { return type === "application/pdf"; }
function canDeleteForEveryone(createdAt: number) { return Date.now() - createdAt < 5 * 60 * 1000; }

// ── Read receipt status ───────────────────────────────────────────────────────
const RECEIPT_LABELS_SENT: Record<Lang, string> = {
  en: "Sent", ru: "Отправлено", hy: "Ուղարկված է",
};

function ReadReceipt({ readBy, isOwn, lang = "en" }: { readBy?: ReadEntry[]; isOwn: boolean; isDirect: boolean; lang?: string }) {
  if (!isOwn) return null;
  const effectiveLang: Lang = lang.startsWith("ru") ? "ru" : lang.startsWith("hy") || lang.startsWith("am") ? "hy" : "en";
  const labels = RECEIPT_LABELS[effectiveLang];
  const entries = readBy ?? [];

  // seen = readAt > 0 means recipient actually opened the conversation
  const seenEntries = entries.filter((r) => r.readAt > 0);
  // delivered = readAt === -1 means message reached recipient but not yet read
  const deliveredEntries = entries.filter((r) => r.readAt === -1);

  if (seenEntries.length > 0) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] transition-all duration-300" style={{ color: "var(--primary)" }}>
        <CheckCheck className="w-3 h-3" />
        {labels.seen}
      </span>
    );
  }
  if (deliveredEntries.length > 0) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] transition-all duration-300" style={{ color: "var(--text-muted)" }}>
        <CheckCheck className="w-3 h-3 opacity-60" />
        {labels.delivered}
      </span>
    );
  }
  // Sent — always show for own messages
  return (
    <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--text-disabled)" }}>
      <Check className="w-3 h-3" />
      {RECEIPT_LABELS_SENT[effectiveLang]}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MessageBubble({ message, isOwn, showAvatar, showName, currentUserId, currentUserAvatar, currentUserName, onReply, onOpenThread, onSendMessage, lang = "en" }: Props) {
  const L = UI_LABELS[getLabelLang(lang)];
  const [showActions, setShowActions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuOpenDown, setMenuOpenDown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggleReaction = useMutation(api.chat.toggleReaction);
  const editMessage = useMutation(api.chat.editMessage);
  const deleteMessage = useMutation(api.chat.deleteMessage);
  const deleteMessageForMe = useMutation(api.chat.deleteMessageForMe);
  const pinMessage = useMutation(api.chat.pinMessage);
  const votePoll = useMutation(api.chat.votePoll);
  const closePoll = useMutation(api.chat.closePoll);

  // Extract URL from content for link preview
  const urlInContent = message.content ? extractUrl(message.content) : null;

  // Detect if conversation is direct (single receipt entry possible)
  const isDirect = true; // passed from parent ideally; assume true for now

  if (message.isDeleted) {
    return (
      <div className={cn("flex items-end gap-2 my-0.5", isOwn ? "flex-row-reverse" : "flex-row")}>
        <div className="w-8 shrink-0" />
        <div
          className="px-3 py-2 rounded-2xl text-xs italic animate-fade-in"
          style={{ background: "var(--background-subtle)", color: "var(--text-disabled)" }}
        >
          🗑 {L.deleted}
        </div>
      </div>
    );
  }

  if (message.type === "system") {
    // Service broadcast: official company-wide announcement
    if (message.isServiceBroadcast) {
      const icon = message.broadcastIcon || "ℹ️";
      const senderIcon = "🔧"; // System icon
      
      return (
        <div className="flex justify-center my-4 animate-fade-in px-4">
          <div className="max-w-lg w-full">
            {/* Sender info */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 dark:from-orange-500 dark:to-red-600 flex items-center justify-center text-white text-sm font-bold">
                {senderIcon}
              </div>
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 tracking-wide">
                СИСТЕМА
              </span>
            </div>

            {/* Message card */}
            <div 
              className="border-l-4 rounded-lg p-4 shadow-md animate-fade-in"
              style={{
                borderLeftColor: "var(--warning, #f59e0b)",
                background: "var(--background-elevated)",
                color: "var(--text-primary)",
              }}
            >
              {/* Header with icon and title */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{icon}</span>
                <span className="font-semibold text-sm tracking-wide" style={{ color: "var(--warning, #f59e0b)" }}>
                  {message.broadcastTitle || "СЕРВИСНОЕ ОБЪЯВЛЕНИЕ"}
                </span>
              </div>
              
              {/* Message content */}
              <p className="text-sm leading-relaxed">
                {message.content}
              </p>
              
              {/* Timestamp */}
              <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {format(new Date(message.createdAt), "HH:mm, dd MMM")}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Regular system message (e.g., "John joined the chat")
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <span className="px-3 py-1 rounded-full text-[11px]" style={{ background: "var(--background-subtle)", color: "var(--text-muted)" }}>
          {message.content}
        </span>
      </div>
    );
  }

  if (message.type === "call") {
    const icon = message.callType === "video" ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />;
    const statusColor = message.callStatus === "answered" ? "text-green-500" : "text-red-500";
    const statusText = message.callStatus === "answered"
      ? `${message.callDuration ? Math.floor(message.callDuration / 60) + "m " + (message.callDuration % 60) + "s" : ""}`
      : message.callStatus === "missed" ? L.missed : L.declined;
    return (
      <div className={cn("flex items-end gap-2 my-0.5 animate-fade-in", isOwn ? "flex-row-reverse" : "flex-row")}>
        <div className="w-8 shrink-0" />
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs" style={{ background: "var(--background-subtle)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span style={{ color: "var(--primary)" }}>{icon}</span>
          <span>{message.content}</span>
          <span className={statusColor}>{statusText}</span>
        </div>
      </div>
    );
  }

  const handleReaction = (emoji: string) => {
    // Sanitize emoji to remove spaces and control characters
    const sanitizedEmoji = emoji.replace(/[\s\x00-\x1F\x7F]/g, '');
    if (!sanitizedEmoji) return; // Skip if emoji becomes empty after sanitization
    toggleReaction({ messageId: message._id, userId: currentUserId, emoji: sanitizedEmoji });
  };

  const handleEdit = async () => {
    if (editContent.trim() === message.content) { setEditing(false); return; }
    await editMessage({ messageId: message._id, userId: currentUserId, content: editContent.trim() });
    setEditing(false);
  };

  const handleDeleteForEveryone = async () => {
    await deleteMessage({ messageId: message._id, userId: currentUserId });
    setShowDeleteDialog(false);
    setShowMenu(false);
  };

  const handleDeleteForMe = async () => {
    await deleteMessageForMe({ messageId: message._id, userId: currentUserId });
    setShowDeleteDialog(false);
    setShowMenu(false);
  };

  const handlePin = () => {
    pinMessage({ messageId: message._id, userId: currentUserId, pin: !message.isPinned });
    setShowMenu(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setShowMenu(false);
  };

  const totalReactions = Object.values(message.reactions ?? {}).reduce((s, arr) => s + arr.length, 0);
  const withinFiveMin = canDeleteForEveryone(message.createdAt);

  return (
    <>
      {/* Image lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-110"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl transition-all duration-300 scale-100"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Delete dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div
            className="rounded-2xl shadow-2xl border p-5 w-72 flex flex-col gap-3 animate-slide-up"
            style={{ background: "var(--background)", borderColor: "var(--border)" }}
          >
            <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{L.deleteMsg}</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{L.deleteDesc}</p>
            <button
              onClick={handleDeleteForMe}
              className="w-full px-3 py-2 rounded-xl text-sm font-medium border transition-all duration-200 hover:opacity-80 active:scale-95"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {L.deleteForMe}
            </button>
            {isOwn && withinFiveMin && (
              <button
                onClick={handleDeleteForEveryone}
                className="w-full px-3 py-2 rounded-xl text-sm font-medium text-white transition-all duration-200 hover:opacity-80 active:scale-95"
                style={{ background: "#ef4444" }}
              >
                {L.deleteForEveryone}
              </button>
            )}
            {isOwn && !withinFiveMin && (
              <p className="text-[11px] text-center" style={{ color: "var(--text-disabled)" }}>
                {L.canOnlyDelete}
              </p>
            )}
            <button onClick={() => setShowDeleteDialog(false)} className="text-xs text-center hover:opacity-70 transition-opacity" style={{ color: "var(--text-muted)" }}>
              {L.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Message row */}
      <div
        className={cn(
          "flex items-end gap-2 my-0.5 group animate-msg-in",
          isOwn ? "flex-row-reverse" : "flex-row"
        )}
        onMouseEnter={() => {
          setShowActions(true);
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        }}
        onMouseLeave={() => {
          // Delay closing to allow moving to menu
          hoverTimeoutRef.current = setTimeout(() => {
            setShowActions(false);
            setShowMenu(false);
          }, 100);
        }}
      >
        {/* Avatar */}
        <div className="w-8 shrink-0 mb-1">
          {showAvatar && !isOwn && message.sender?._id ? (
            // Other person's avatar → clickable profile link
            <Link
              href={`/employees/${message.sender._id}`}
              className="block rounded-full transition-transform duration-200 hover:scale-110 focus:outline-none"
              title={`View ${message.sender?.name}'s profile`}
              onClick={(e) => e.stopPropagation()}
            >
              <Avatar className="w-7 h-7 ring-2 ring-transparent hover:ring-[var(--primary)] transition-all duration-200">
                {message.sender?.avatarUrl && <AvatarImage src={message.sender.avatarUrl} />}
                <AvatarFallback className="text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" }}>
                  {getInitials(message.sender?.name ?? "?")}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : showAvatar && isOwn ? (
            // Own avatar on the right
            <Avatar className="w-7 h-7">
              {currentUserAvatar && <AvatarImage src={currentUserAvatar} />}
              <AvatarFallback className="text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" }}>
                {getInitials(currentUserName ?? "Me")}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8" />
          )}
        </div>

        <div className={cn("flex flex-col max-w-[75%] min-w-0", isOwn ? "items-end" : "items-start")}>
          {showName && (
            <span className="text-[11px] font-medium mb-0.5 px-1" style={{ color: "var(--text-muted)" }}>
              {message.sender?.name}
            </span>
          )}

          {/* Reply preview */}
          {message.replyToContent && (
            <div className="mb-1 px-2 py-1 rounded-lg border-l-2 text-xs max-w-full transition-all duration-200" style={{ borderColor: "var(--primary)", background: "var(--background-subtle)", color: "var(--text-muted)" }}>
              <span className="font-medium" style={{ color: "var(--primary)" }}>{message.replyToSenderName}</span>
              <p className="truncate">{message.replyToContent}</p>
            </div>
          )}

          {/* Bubble */}
          <div
            className="relative rounded-2xl px-3 py-2 text-sm break-words transition-all duration-200 hover:brightness-105"
            style={{
              background: isOwn
                ? "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)"
                : "var(--background-subtle)",
              color: isOwn ? "white" : "var(--text-primary)",
              borderBottomRightRadius: isOwn ? "4px" : undefined,
              borderBottomLeftRadius: !isOwn ? "4px" : undefined,
            }}
          >
            {editing ? (
              <div className="flex items-end gap-2 min-w-[180px]">
                <textarea
                  autoFocus
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 bg-transparent outline-none resize-none text-sm"
                  style={{ color: isOwn ? "white" : "var(--text-primary)" }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEdit(); } if (e.key === "Escape") setEditing(false); }}
                  rows={1}
                />
                <button onClick={handleEdit} className="text-xs opacity-80 hover:opacity-100 transition-opacity">✓</button>
                <button onClick={() => setEditing(false)} className="text-xs opacity-80 hover:opacity-100 transition-opacity">✕</button>
              </div>
            ) : (
              message.content && <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className={cn("space-y-2", message.content ? "mt-2" : "")}>
                {message.attachments.map((att, i) => {
                  if (isImage(att.type)) {
                    return (
                      <div key={i} className="relative group/img">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={att.url}
                          alt={att.name}
                          className="rounded-xl max-w-[240px] max-h-[200px] object-cover cursor-pointer transition-all duration-200 hover:opacity-90 hover:scale-[1.02]"
                          onClick={() => setLightboxSrc(att.url)}
                        />
                        <a
                          href={att.url}
                          download={att.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all duration-200 hover:scale-110"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-3.5 h-3.5 text-white" />
                        </a>
                        <p className="sm:text-[10px] text-xs mt-0.5 opacity-70 truncate max-w-[240px]">{att.name}</p>
                      </div>
                    );
                  }
                  if (isPDF(att.type)) {
                    return (
                      <div key={i} className="rounded-xl overflow-hidden" style={{ maxWidth: 260 }}>
                        <div className="flex items-center gap-2 px-2 py-1.5 text-xs" style={{ background: isOwn ? "rgba(255,255,255,0.15)" : "var(--border)" }}>
                          <FileText className="w-4 h-4 shrink-0 text-red-400" />
                          <span className="truncate flex-1">{att.name}</span>
                          <span className="shrink-0 opacity-70">{formatFileSize(att.size)}</span>
                        </div>
                        <iframe src={att.url + "#toolbar=0&navpanes=0&scrollbar=0"} className="w-full" style={{ height: 180 }} title={att.name} />
                        <a href={att.url} download={att.name} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1 py-1.5 text-xs hover:opacity-80 transition-opacity"
                          style={{ background: isOwn ? "rgba(255,255,255,0.1)" : "var(--background-subtle)", color: isOwn ? "white" : "var(--text-muted)" }}>
                          <Download className="w-3 h-3" /> {L.download}
                        </a>
                      </div>
                    );
                  }
                  return (
                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:opacity-80 transition-all duration-200 hover:scale-[1.01]"
                      style={{ background: isOwn ? "rgba(255,255,255,0.15)" : "var(--border)" }}>
                      <span>📎</span>
                      <span className="truncate flex-1">{att.name}</span>
                      <span className="shrink-0 opacity-70">{formatFileSize(att.size)}</span>
                    </a>
                  );
                })}
              </div>
            )}

            {/* Link Preview */}
            {urlInContent && !message.poll && (
              <LinkPreview url={urlInContent} isOwn={isOwn} />
            )}

            {message.isEdited && <span className="sm:text-[9px] text-xs opacity-60 ml-1">(edited)</span>}
            {message.isPinned && <span className="absolute -top-2 -right-1 sm:text-[10px] text-xs">📌</span>}
          </div>

          {/* Poll UI */}
          {message.poll && (
            <div
              className="mt-1 rounded-xl overflow-hidden border w-full max-w-[280px] animate-fade-in"
              style={{ borderColor: "var(--border)", background: "var(--background-subtle)" }}
            >
              <div className="px-3 sm:py-2 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <p className="sm:text-xs text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  📊 {message.poll.question}
                </p>
                {message.poll.closedAt && (
                  <p className="sm:text-[10px] text-xs mt-1" style={{ color: "var(--text-disabled)" }}>{L.pollClosed}</p>
                )}
              </div>
              <div className="px-3 sm:py-2 py-3 space-y-2 sm:space-y-1.5">
                {(() => {
                  const totalVotes = message.poll.options.reduce((s, o) => s + o.votes.length, 0);
                  const userVote = message.poll.options.find((o) => o.votes.includes(currentUserId))?.id;
                  return message.poll.options.map((opt) => {
                    const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                    const isVoted = opt.id === userVote;
                    const isClosed = !!message.poll!.closedAt;
                    return (
                      <button
                        key={opt.id}
                        disabled={isClosed}
                        onClick={() => votePoll({ messageId: message._id, userId: currentUserId, optionId: opt.id })}
                        className="w-full text-left relative rounded-lg overflow-hidden transition-all duration-200 hover:opacity-80 disabled:cursor-default"
                        style={{ background: "var(--background)" }}
                      >
                        {/* Progress bar */}
                        <div
                          className="absolute inset-0 rounded-lg transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: isVoted ? "var(--primary)" : "var(--border)",
                            opacity: 0.25,
                          }}
                        />
                        <div className="relative flex items-center justify-between sm:px-2.5 px-3 sm:py-1.5 py-2 min-h-[40px] sm:min-h-[32px]">
                          <span className="sm:text-[11px] text-sm font-medium flex items-center gap-1.5" style={{ color: isVoted ? "var(--primary)" : "var(--text-primary)" }}>
                            {isVoted && <span className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--primary)" }} />}
                            {opt.text}
                          </span>
                          <span className="sm:text-[10px] text-xs font-bold shrink-0" style={{ color: "var(--text-muted)" }}>
                            {pct}% · {opt.votes.length}
                          </span>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
              <div className="px-3 sm:py-1.5 py-2 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                <span className="sm:text-[10px] text-xs" style={{ color: "var(--text-disabled)" }}>
                  {message.poll.options.reduce((s, o) => s + o.votes.length, 0)} {L.votes}
                </span>
                {isOwn && !message.poll.closedAt && (
                  <button
                    onClick={() => closePoll({ messageId: message._id, userId: currentUserId })}
                    className="sm:text-[10px] text-xs hover:opacity-70 transition-opacity py-1 px-2 hover:bg-opacity-50 rounded"
                    style={{ color: "var(--primary)" }}
                  >
                    {L.closePoll}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Thread count */}
          {(message.threadCount ?? 0) > 0 && (
            <button
              onClick={() => onOpenThread(message._id, message.content)}
              className="flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full sm:text-[10px] text-xs font-medium border transition-all duration-200 hover:scale-105"
              style={{ borderColor: "var(--primary)", color: "var(--primary)", background: "transparent" }}
            >
              <MessageSquare className="w-2.5 h-2.5" />
              {message.threadCount} repl{message.threadCount === 1 ? "y" : "ies"}
            </button>
          )}

          {/* Smart Reply — only for incoming messages */}
          {!isOwn && !message.isDeleted && message.type !== "system" && message.type !== "call" && message.content && (
            <SmartReply
              message={message.content}
              lang={lang}
              onSelect={(reply) => onSendMessage ? onSendMessage(reply) : onReply(message._id, message.content, message.sender?.name ?? "Someone")}
            />
          )}

          {/* Timestamp + read receipt */}
          <div className={cn("flex items-center gap-1 mt-1 px-1", isOwn ? "flex-row-reverse" : "flex-row")}>
            <span className="sm:text-[10px] text-xs opacity-60" style={{ color: "var(--text-muted)" }}>
              {format(new Date(message.createdAt), "HH:mm")}
            </span>
            {isOwn && (
              <ReadReceipt readBy={message.readBy} isOwn={isOwn} isDirect={isDirect} lang={lang} />
            )}
          </div>

          {/* Reactions */}
          {totalReactions > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 px-1">
              {Object.entries(message.reactions ?? {}).map(([emojiKey, users]) => {
                // Convert ASCII-safe key back to emoji for display
                const displayEmoji = keyToEmoji(emojiKey);
                return users.length > 0 ? (
                  <button
                    key={emojiKey}
                    onClick={() => handleReaction(displayEmoji)}
                    className="flex items-center gap-0.5 sm:px-1.5 px-2 sm:py-0.5 py-1 rounded-full sm:text-xs text-sm border transition-all duration-200 hover:scale-110 min-h-[28px] sm:min-h-auto"
                    style={{
                      background: users.includes(currentUserId) ? "var(--primary)" : "var(--background-subtle)",
                      borderColor: users.includes(currentUserId) ? "var(--primary)" : "var(--border)",
                      color: users.includes(currentUserId) ? "white" : "var(--text-primary)",
                    }}
                    title={users.join(", ")}
                  >
                    {displayEmoji} {users.length}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Action bar — disabled for service broadcasts unless sender is superadmin */}
        {(!message.isServiceBroadcast || (message.isServiceBroadcast && isOwn)) && (
          <div
            ref={actionBarRef}
            className={cn(
              "flex items-center gap-0.5 shrink-0 transition-all duration-200 relative",
              showActions ? "opacity-100 scale-100 z-40" : "opacity-0 scale-95 pointer-events-none"
            )}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              setShowActions(true);
            }}
            onMouseLeave={() => {
              hoverTimeoutRef.current = setTimeout(() => {
                setShowActions(false);
                setShowMenu(false);
              }, 100);
            }}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-sm sm:text-xs hover:scale-125 transition-transform duration-150 min-h-[36px]"
                style={{ background: "var(--background-subtle)" }}
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={() => onReply(message._id, message.content, message.sender?.name ?? "Someone")}
              className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-full hover:scale-110 transition-transform duration-150 min-h-[36px]"
              style={{ background: "var(--background-subtle)", color: "var(--text-muted)" }}
              title={L.reply}
            >
              <Reply className="sm:w-3 sm:h-3 w-4 h-4" />
            </button>
            <div className="relative">
              <button
                ref={menuBtnRef}
                onClick={() => {
                  // Detect if there's enough space below; if not, open upward
                  if (menuBtnRef.current) {
                    const rect = menuBtnRef.current.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    setMenuOpenDown(spaceBelow > 200);
                  }
                  setShowMenu(!showMenu);
                }}
                className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center rounded-full hover:scale-110 transition-transform duration-150 min-h-[36px]"
                style={{ background: "var(--background-subtle)", color: "var(--text-muted)" }}
              >
                <MoreHorizontal className="sm:w-3 sm:h-3 w-4 h-4" />
              </button>
              {showMenu && (
                <div
                  ref={menuRef}
                  className={cn(
                    "absolute z-[9999] rounded-xl shadow-2xl border py-1 min-w-[160px] animate-slide-up",
                    // Smart vertical: open down if space below, else up
                    menuOpenDown ? "top-full mt-1" : "bottom-full mb-1",
                    // Horizontal: align to edge
                    isOwn ? "right-0" : "left-0"
                  )}
                  style={{ background: "var(--background)", borderColor: "var(--border)" }}
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                    setShowActions(true);
                  }}
                  onMouseLeave={() => {
                    hoverTimeoutRef.current = setTimeout(() => {
                      setShowActions(false);
                      setShowMenu(false);
                    }, 50);
                  }}
                >
                  <MenuItem icon={<Copy className="w-3.5 h-3.5" />} label={L.copy} onClick={handleCopy} />
                  <MenuItem icon={<Pin className="w-3.5 h-3.5" />} label={message.isPinned ? L.unpin : L.pin} onClick={handlePin} />
                  {isOwn && <MenuItem icon={<Edit2 className="w-3.5 h-3.5" />} label={L.edit} onClick={() => { setEditing(true); setShowMenu(false); }} />}
                  <MenuItem icon={<Trash className="w-3.5 h-3.5" />} label={L.deleteForMe} onClick={() => { setShowDeleteDialog(true); setShowMenu(false); }} danger />
                  {isOwn && withinFiveMin && (
                    <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label={L.deleteForEveryone} onClick={() => { setShowDeleteDialog(true); setShowMenu(false); }} danger />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes msg-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-msg-in {
          animation: msg-in 0.2s ease-out both;
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.18s ease-out both;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out both;
        }
      `}</style>
    </>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all duration-150 hover:opacity-80"
      style={{ color: danger ? "#ef4444" : "var(--text-primary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-item-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      {label}
    </button>
  );
}
