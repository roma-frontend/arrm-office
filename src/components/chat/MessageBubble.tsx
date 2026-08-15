'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { decodeSystemMessage } from '../../../convex/lib/systemMessage';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Reply,
  Edit2,
  Trash2,
  Trash,
  Pin,
  Copy,
  MoreHorizontal,
  Phone,
  Video,
  FileText,
  Download,
  X,
  CheckCheck,
  Check,
  MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { getDateFnsLocale } from '@/lib/date-format';
import { useTranslation } from 'react-i18next';
import { SmartReply } from './SmartReply';
import { LinkPreview, extractUrl } from './LinkPreview';
import { createPortal } from 'react-dom';
import { useOptimisticReaction } from '@/hooks/useOptimisticActions';
import { logger } from '@/lib/logger';

// ── i18n labels for delivered / seen ──────────────────────────────────────────
type Lang = 'en' | 'ru' | 'hy' | 'de';

function _getLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const l = document.documentElement.lang || navigator.language || 'en';
  if (l.startsWith('ru')) return 'ru';
  if (l.startsWith('hy') || l.startsWith('am')) return 'hy';
  if (l.startsWith('de')) return 'de';
  return 'en';
}

const RECEIPT_LABELS: Record<Lang, { delivered: string; seen: string }> = {
  en: { delivered: 'Delivered', seen: 'Seen' },
  ru: { delivered: 'Доставлено', seen: 'Просмотрено' },
  hy: { delivered: 'Հասցված է', seen: 'Դիտված է' },
  de: { delivered: 'Zugestellt', seen: 'Gelesen' },
};

// ── UI labels by language ─────────────────────────────────────────────────────
const UI_LABELS: Record<
  Lang,
  {
    deleted: string;
    pollClosed: string;
    votes: string;
    closePoll: string;
    copy: string;
    pin: string;
    unpin: string;
    edit: string;
    deleteForMe: string;
    deleteForEveryone: string;
    deleteMsg: string;
    deleteDesc: string;
    canOnlyDelete: string;
    cancel: string;
    missed: string;
    declined: string;
    download: string;
    reply: string;
    preview: string;
    me: string;
    unknown: string;
  }
> = {
  en: {
    deleted: 'This message was deleted',
    pollClosed: 'Poll closed',
    votes: 'votes',
    closePoll: 'Close poll',
    copy: 'Copy',
    pin: 'Pin',
    unpin: 'Unpin',
    edit: 'Edit',
    deleteForMe: 'Delete for me',
    deleteForEveryone: 'Delete for everyone',
    deleteMsg: 'Delete message',
    deleteDesc: 'Choose how to delete this message.',
    canOnlyDelete: '⏱ Can only delete for everyone within 5 minutes',
    cancel: 'Cancel',
    missed: 'Missed',
    declined: 'Declined',
    download: 'Download',
    reply: 'Reply',
    preview: 'Preview',
    me: 'Me',
    unknown: 'Unknown',
  },
  ru: {
    deleted: 'Это сообщение было удалено',
    pollClosed: 'Опрос закрыт',
    votes: 'голосов',
    closePoll: 'Закрыть опрос',
    copy: 'Копировать',
    pin: 'Закрепить',
    unpin: 'Открепить',
    edit: 'Редактировать',
    deleteForMe: 'Удалить у меня',
    deleteForEveryone: 'Удалить у всех',
    deleteMsg: 'Удалить сообщение',
    deleteDesc: 'Выберите способ удаления этого сообщения.',
    canOnlyDelete: '⏱ Удалить у всех можно только в течение 5 минут',
    cancel: 'Отмена',
    missed: 'Пропущен',
    declined: 'Отклонён',
    download: 'Скачать',
    reply: 'Ответить',
    preview: 'Предпросмотр',
    me: 'Я',
    unknown: 'Неизвестно',
  },
  hy: {
    deleted: 'Այս հաղորդագրությունը ջնջված է',
    pollClosed: 'Հարցումը փակված է',
    votes: 'ձայն',
    closePoll: 'Փակել հարցումը',
    copy: 'Պատճենել',
    pin: 'Ամրացնել',
    unpin: 'Ապամրացնել',
    edit: 'Խմբագրել',
    deleteForMe: 'Ջնջել ինձ համար',
    deleteForEveryone: 'Ջնջել բոլորի համար',
    deleteMsg: 'Ջնջել հաղորդագրությունը',
    deleteDesc: 'Ընտրեք, թե ինչպես ջնջել այս հաղորդագրությունը:',
    canOnlyDelete: '⏱ Կարելի է ջնջել բոլորի համար միայն 5 րոպեի ընթացքում',
    cancel: 'Չեղարկել',
    missed: 'Բաց թողնված',
    declined: 'Մերժված',
    download: 'Ներբեռնել',
    reply: 'Պատասխանել',
    preview: 'Նախադիտում',
    me: 'Ես',
    unknown: 'Անհայտ',
  },
  de: {
    deleted: 'Diese Nachricht wurde gelöscht',
    pollClosed: 'Umfrage geschlossen',
    votes: 'Stimmen',
    closePoll: 'Umfrage schließen',
    copy: 'Kopieren',
    pin: 'Anpinnen',
    unpin: 'Loslösen',
    edit: 'Bearbeiten',
    deleteForMe: 'Für mich löschen',
    deleteForEveryone: 'Für alle löschen',
    deleteMsg: 'Nachricht löschen',
    deleteDesc: 'Wählen Sie, wie diese Nachricht gelöscht werden soll.',
    canOnlyDelete: '⏱ Für alle löschen ist nur innerhalb von 5 Minuten möglich',
    cancel: 'Abbrechen',
    missed: 'Verpasst',
    declined: 'Abgelehnt',
    download: 'Herunterladen',
    reply: 'Antworten',
    preview: 'Vorschau',
    me: 'Ich',
    unknown: 'Unbekannt',
  },
};

function getLabelLang(lang?: string): Lang {
  if (!lang) return 'en';
  if (lang.startsWith('ru')) return 'ru';
  if (lang.startsWith('hy') || lang.startsWith('am')) return 'hy';
  if (lang.startsWith('de')) return 'de';
  return 'en';
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
    .map((part) => {
      const codePoint = parseInt(part.substring(1), 16);
      return String.fromCodePoint(codePoint);
    })
    .join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReadEntry {
  userId: string;
  readAt: number;
}

interface PollOption {
  id: string;
  text: string;
  votes: string[];
}
interface Poll {
  question: string;
  options: PollOption[];
  closedAt?: number;
}
interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

interface Message {
  _id: Id<'chatMessages'>;
  senderId: Id<'users'>;
  type: string;
  content: string;
  createdAt: number;
  isEdited?: boolean;
  isDeleted?: boolean;
  isPinned?: boolean;
  isServiceBroadcast?: boolean;
  broadcastIcon?: string;
  broadcastTitle?: string;
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
  sender?: { _id: Id<'users'>; name: string; avatarUrl?: string } | null;
}

interface Props {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showName: boolean;
  currentUserId: Id<'users'>;
  currentUserAvatar?: string;
  currentUserName?: string;
  onReply: (id: Id<'chatMessages'>, content: string, senderName: string) => void;
  onOpenThread: (id: Id<'chatMessages'>, content: string) => void;
  onSendMessage?: (text: string) => void;
  lang?: string;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function isImage(type: string) {
  return type.startsWith('image/');
}
function isPDF(type: string) {
  return type === 'application/pdf';
}
/**
 * Cloudinary URLs are cross-origin, so the HTML `download` attribute is
 * ignored and the browser would navigate to the file (landing on an error page
 * for PDFs blocked under the image resource type). The `fl_attachment` flag
 * makes Cloudinary send `Content-Disposition: attachment`, forcing a real
 * download. Non-Cloudinary URLs are returned untouched.
 */
function asDownloadUrl(url: string): string {
  return url.replace(/(\/(?:image|video|raw)\/upload\/)/, '$1fl_attachment/');
}
function canDeleteForEveryone(createdAt: number) {
  return Date.now() - createdAt < 5 * 60 * 1000;
}

// ── Read receipt status ───────────────────────────────────────────────────────
const RECEIPT_LABELS_SENT: Record<Lang, string> = {
  en: 'Sent',
  ru: 'Отправлено',
  hy: 'Ուղարկված է',
  de: 'Gesendet',
};

function ReadReceipt({
  readBy,
  isOwn,
  lang = 'en',
}: {
  readBy?: ReadEntry[];
  isOwn: boolean;
  isDirect: boolean;
  lang?: string;
}) {
  if (!isOwn) return null;
  const labels = RECEIPT_LABELS[getLabelLang(lang)];
  const entries = readBy ?? [];

  // seen = readAt > 0 means recipient actually opened the conversation
  const seenEntries = entries.filter((r) => r.readAt > 0);
  // delivered = readAt === -1 means message reached recipient but not yet read
  const deliveredEntries = entries.filter((r) => r.readAt === -1);

  if (seenEntries.length > 0) {
    return (
      <span
        className="flex items-center gap-0.5 text-[10px] transition-all duration-300"
        style={{ color: 'var(--primary)' }}
      >
        <CheckCheck className="w-3 h-3" />
        {labels.seen}
      </span>
    );
  }
  if (deliveredEntries.length > 0) {
    return (
      <span
        className="flex items-center gap-0.5 text-[10px] transition-all duration-300"
        style={{ color: 'var(--text-muted)' }}
      >
        <CheckCheck className="w-3 h-3 opacity-60" />
        {labels.delivered}
      </span>
    );
  }
  // Sent — always show for own messages
  return (
    <span
      className="flex items-center gap-0.5 text-[10px]"
      style={{ color: 'var(--text-disabled)' }}
    >
      <Check className="w-3 h-3" />
      {RECEIPT_LABELS_SENT[getLabelLang(lang)]}
    </span>
  );
}

/**
 * Render a system message body in the reader's language.
 *
 * Bodies written by the server are translation tokens, so the ticket reporter,
 * the assignee and the support agent each see the notice in their own language.
 * Anything else — free-form text, and messages stored before tokens existed — is
 * passed through untouched.
 */
function systemMessageText(
  t: (key: string, params?: Record<string, string>) => string,
  content: string,
): string {
  const token = decodeSystemMessage(content);
  if (!token) return content;
  // A deleted or unreadable actor leaves `name` empty; naming them "someone" in
  // the reader's language beats interpolating a blank into the sentence.
  const params =
    token.params.name === '' ? { ...token.params, name: t('chatSystem.someone') } : token.params;
  const translated = t(token.key, params);
  // i18next echoes the key back when it cannot resolve it; a raw key on screen is
  // worse than no notice, so drop it.
  return translated === token.key ? '' : translated;
}

// ── Main component ────────────────────────────────────────────────────────────
export const MessageBubble = React.memo(function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName,
  currentUserId,
  currentUserAvatar,
  currentUserName,
  onReply,
  onOpenThread,
  onSendMessage,
  lang = 'en',
}: Props) {
  const L = UI_LABELS[getLabelLang(lang)];
  const { t } = useTranslation();
  const dateFnsLocale = getDateFnsLocale(lang);
  const [showActions, setShowActions] = useState(false);
  const [_actionBarBelow, setActionBarBelow] = useState(false);
  const [actionBarPos, setActionBarPos] = useState<{ top: number; left: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuOpenDown, setMenuOpenDown] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left?: number;
    right?: number;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editFocused, setEditFocused] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const msgRowRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const _toggleReaction = useMutation(api.chat.mutations.toggleReaction);
  const editMessage = useMutation(api.chat.mutations.editMessage);
  const deleteMessage = useMutation(api.chat.mutations.deleteMessage);
  const _deleteMessageForMe = useMutation(api.chat.mutations.deleteMessageForMe);
  const pinMessage = useMutation(api.chat.mutations.pinMessage);
  const votePoll = useMutation(api.chat.mutations.votePoll);
  const closePoll = useMutation(api.chat.mutations.closePoll);
  const { toggleOptimistic: toggleOptimisticReaction } = useOptimisticReaction(
    message._id,
    currentUserId,
  );

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Escape closes the lightbox — the backdrop click is not discoverable when the
  // image fills the viewport.
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightboxSrc]);

  // Extract URL from content for link preview
  const urlInContent = message.content ? extractUrl(message.content) : null;

  // Detect if conversation is direct (single receipt entry possible)
  const isDirect = true;

  if (message.isDeleted) {
    return (
      <div className={cn('flex items-end gap-2 my-0.5', isOwn ? 'flex-row-reverse' : 'flex-row')}>
        <div className="w-8 shrink-0" />
        <div
          className="px-3 py-2 rounded-2xl text-xs italic animate-fade-in"
          style={{ background: 'var(--secondary)', color: 'var(--text-disabled)' }}
        >
          🗑 {L.deleted}
        </div>
      </div>
    );
  }

  if (message.type === 'system') {
    // Service broadcast: official company-wide announcement
    if (message.isServiceBroadcast) {
      const icon = message.broadcastIcon || 'ℹ️';
      const _senderIcon = '🔧'; // System icon

      // Remove sender name prefix (e.g., "Roman: ") from content for system announcements
      let cleanContent = message.content;
      if (message.sender?.name && cleanContent.startsWith(message.sender.name + ':')) {
        cleanContent = cleanContent.substring(message.sender.name.length + 1).trim();
      }

      return (
        <div className="flex justify-center my-4 animate-fade-in px-4">
          <div className="max-w-lg w-full">
            {/* Message card - no sender info for System Announcements */}
            <div
              className="border-l-4 rounded-lg p-4 shadow-md animate-fade-in"
              style={{
                borderLeftColor: 'var(--warning, #f59e0b)',
                background: 'var(--background-elevated)',
                color: 'var(--text-primary)',
              }}
            >
              {/* Header with icon and title */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{icon}</span>
                <span
                  className="font-semibold text-sm tracking-wide"
                  style={{ color: 'var(--warning, var(--warning-solid))' }}
                >
                  {message.broadcastTitle || 'СЕРВИСНОЕ ОБЪЯВЛЕНИЕ'}
                </span>
              </div>

              {/* Message content */}
              <p className="text-sm leading-relaxed">{cleanContent}</p>

              {/* Timestamp */}
              <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {format(new Date(message.createdAt), 'HH:mm, dd MMM', { locale: dateFnsLocale })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Regular system message (e.g., "John joined the chat")
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <span
          className="px-3 py-1 rounded-full text-[11px]"
          style={{ background: 'var(--background-subtle)', color: 'var(--text-muted)' }}
        >
          {systemMessageText(t, message.content)}
        </span>
      </div>
    );
  }

  if (message.type === 'call') {
    const icon =
      message.callType === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />;
    const statusColor =
      message.callStatus === 'answered' ? 'text-(--success-text)' : 'text-(--danger-text)';
    const statusText =
      message.callStatus === 'answered'
        ? `${message.callDuration ? Math.floor(message.callDuration / 60) + 'm ' + (message.callDuration % 60) + 's' : ''}`
        : message.callStatus === 'missed'
          ? L.missed
          : L.declined;
    return (
      <div
        className={cn(
          'flex items-end gap-2 my-0.5 animate-fade-in',
          isOwn ? 'flex-row-reverse' : 'flex-row',
        )}
      >
        <div className="w-8 shrink-0" />
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs"
          style={{
            background: 'var(--background-subtle)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          <span style={{ color: 'var(--primary)' }}>{icon}</span>
          <span>{message.content}</span>
          <span className={statusColor}>{statusText}</span>
        </div>
      </div>
    );
  }

  const handleReaction = async (emoji: string) => {
    // Sanitize emoji to remove spaces and control characters
    const sanitizedEmoji = emoji.replace(/[\s\x00-\x1F\x7F]/g, '');
    if (!sanitizedEmoji) return; // Skip if emoji becomes empty after sanitization

    try {
      await toggleOptimisticReaction(
        sanitizedEmoji,
        (message.reactions?.[emojiToKey(sanitizedEmoji)] ?? []) as Id<'users'>[],
      );
    } catch (err) {
      logger.error('Reaction failed:', err);
    }
  };

  const handleEdit = async () => {
    if (editContent.trim() === message.content) {
      setEditing(false);
      return;
    }
    await editMessage({
      messageId: message._id,
      userId: currentUserId,
      content: editContent.trim(),
    });
    setEditing(false);
  };

  const handleDeleteForEveryone = async () => {
    await deleteMessage({ messageId: message._id, userId: currentUserId, deleteForEveryone: true });
    setShowDeleteDialog(false);
    setShowMenu(false);
  };

  const handleDeleteForMe = async () => {
    await deleteMessage({ messageId: message._id, userId: currentUserId });
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

  const totalReactions = Object.values(message.reactions ?? {}).reduce(
    (s, arr) => s + arr.length,
    0,
  );
  const withinFiveMin = canDeleteForEveryone(message.createdAt);

  return (
    <>
      {/* Image lightbox — portalled for the same reason as the delete dialog:
          every bubble is rendered inside a virtual row that carries a
          `translateY` transform, and a transformed ancestor becomes the
          containing block for `position: fixed`. Left in place, `inset-0`
          resolved to that one row instead of the viewport, so the backdrop
          covered a thin band while the 90vw/95vh image hung out of it. */}
      {lightboxSrc &&
        createPortal(
          <div
            className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => setLightboxSrc(null)}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all hover:box-shadow-lg"
              onClick={() => setLightboxSrc(null)}
            >
              <X className="w-5 h-5" />
            </Button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxSrc}
              alt={L.preview}
              className="max-w-full max-h-full w-auto h-auto rounded-xl object-contain shadow-2xl transition-all duration-300"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}

      {/* Delete dialog - use portal to render outside virtual list */}
      {showDeleteDialog &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in overflow-auto">
            <div
              className="rounded-2xl shadow-2xl border p-5 w-72 max-h-[95vh] overflow-auto flex flex-col gap-3 animate-slide-up my-4"
              style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
            >
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {L.deleteMsg}
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {L.deleteDesc}
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={handleDeleteForMe} variant="outline" className="w-full text-sm">
                  {L.deleteForMe}
                </Button>
                {isOwn && withinFiveMin && (
                  <Button
                    onClick={handleDeleteForEveryone}
                    variant="destructive"
                    className="w-full text-sm"
                  >
                    {L.deleteForEveryone}
                  </Button>
                )}
                {isOwn && !withinFiveMin && (
                  <p className="text-[11px] text-center" style={{ color: 'var(--text-disabled)' }}>
                    {L.canOnlyDelete}
                  </p>
                )}
              </div>
              <Button
                onClick={() => setShowDeleteDialog(false)}
                variant="ghost"
                className="text-xs hover:opacity-70 transition-opacity"
              >
                {L.cancel}
              </Button>
            </div>
          </div>,
          document.body,
        )}

      {/* Message row */}
      <div
        ref={msgRowRef}
        data-msg-row
        className={cn(
          'relative flex items-end gap-2.5 my-1 group animate-msg-in',
          isOwn ? 'flex-row-reverse' : 'flex-row',
          showActions ? 'z-10' : 'z-0',
        )}
        onMouseEnter={() => {
          const rowEl = msgRowRef.current;
          if (rowEl) {
            const rect = rowEl.getBoundingClientRect();
            const below = rect.top < 120;
            setActionBarBelow(below);
            setActionBarPos({
              top: below ? rect.bottom + 4 : rect.top - 40,
              left: isOwn ? rect.right - 320 : rect.left + 40,
            });
          }
          setShowActions(true);
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        }}
        onMouseLeave={() => {
          // Don't hide if menu is open — let the menu's own handlers control visibility
          if (showMenu) return;
          hoverTimeoutRef.current = setTimeout(() => {
            setShowActions(false);
          }, 100);
        }}
        onTouchStart={() => {
          setShowActions((prev) => !prev);
        }}
      >
        {/* Avatar */}
        <div className="w-8 shrink-0 mb-1">
          {showAvatar && !isOwn && message.sender?._id ? (
            // Other person's avatar → clickable profile link
            <Link
              href={`/employees/${message.sender._id}`}
              className="block rounded-full transition-transform duration-200 hover:scale-105 focus:outline-none"
              title={`View ${message.sender?.name}'s profile`}
              onClick={(e) => e.stopPropagation()}
            >
              <Avatar className="w-7 h-7 ring-2 ring-transparent hover:ring-(--primary) transition-all duration-200">
                {message.sender?.avatarUrl && <AvatarImage src={message.sender.avatarUrl} />}
                <AvatarFallback className="btn-gradient text-[11px] font-bold text-white">
                  {getInitials(message.sender?.name ?? '?')}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : showAvatar && isOwn ? (
            // Own avatar on the right
            <Avatar className="w-7 h-7">
              {currentUserAvatar && <AvatarImage src={currentUserAvatar} />}
              <AvatarFallback className="btn-gradient text-[11px] font-bold text-white">
                {getInitials(currentUserName ?? L.me)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8" />
          )}
        </div>

        <div className="flex flex-col max-w-[75%] sm:max-w-[65%] md:max-w-[55%]">
          {showName && (
            <span
              className="text-[11px] font-medium mb-0.5 px-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {message.sender?.name ?? L.unknown}
            </span>
          )}

          {/* Reply preview */}
          {message.replyToContent && (
            <div
              className="mb-1 px-2 py-1 rounded-lg border-l-2 text-xs max-w-full transition-all duration-200"
              style={{
                borderColor: 'var(--primary)',
                background: 'var(--background-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <span className="font-medium" style={{ color: 'var(--primary)' }}>
                {message.replyToSenderName}
              </span>
              <p className="truncate">{message.replyToContent}</p>
            </div>
          )}

          {/* Bubble.
              `--chat-own` rather than `--primary`: the accent is tuned for a
              36px control, and a thread of it at bubble size reads as a light
              source — the same reason `--brand-panel` exists. */}
          <div
            className="relative rounded-2xl border px-3.5 py-2.5 text-[14px] leading-[1.45] wrap-break-words transition-all duration-200"
            style={{
              background: isOwn ? 'var(--chat-own)' : 'var(--chat-other)',
              borderColor: isOwn ? 'transparent' : 'var(--chat-other-border)',
              color: isOwn ? 'var(--chat-own-contrast)' : 'var(--text-primary)',
              borderBottomRightRadius: isOwn ? '6px' : undefined,
              borderBottomLeftRadius: !isOwn ? '6px' : undefined,
            }}
          >
            {editing ? (
              <div className="space-y-2">
                {/* Edit header */}
                <div className="flex items-center gap-1.5 text-[10px] font-medium opacity-60">
                  <Edit2 className="w-3 h-3" />
                  {L.edit}
                </div>
                {/* Edit textarea */}
                <textarea
                  autoFocus
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onFocus={() => setEditFocused(true)}
                  onBlur={() => setEditFocused(false)}
                  className="w-full bg-transparent outline-none resize-none text-sm leading-relaxed min-h-[60px] max-h-[200px]"
                  style={{
                    color: isOwn ? 'var(--chat-own-contrast)' : 'var(--text-primary)',
                    borderColor: editFocused ? 'var(--primary)' : 'transparent',
                    borderBottom: `1px solid ${editFocused ? 'var(--primary)' : 'var(--border)'}`,
                    paddingBottom: '4px',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleEdit();
                    }
                    if (e.key === 'Escape') setEditing(false);
                  }}
                />
                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 hover:opacity-80"
                    style={{
                      background: 'transparent',
                      color: isOwn ? 'var(--chat-own-contrast)' : 'var(--text-muted)',
                      opacity: isOwn ? 0.7 : 1,
                    }}
                  >
                    {L.cancel}
                  </button>
                  <button
                    onClick={handleEdit}
                    disabled={!editContent.trim()}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: isOwn ? 'var(--chat-own-inset-border)' : 'var(--primary)',
                      color: isOwn ? 'var(--chat-own-contrast)' : 'white',
                    }}
                  >
                    {L.edit}
                  </button>
                </div>
              </div>
            ) : (
              message.content && (
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              )
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className={cn('space-y-2', message.content ? 'mt-2' : '')}>
                {message.attachments.map((att, i) => {
                  // Voice/Audio message
                  if (att.type.startsWith('audio/') || message.type === 'audio') {
                    const duration = message.callDuration || 0;
                    const formatDuration = (secs: number) => {
                      const m = Math.floor(secs / 60);
                      const s = Math.floor(secs % 60);
                      return `${m}:${s.toString().padStart(2, '0')}`;
                    };
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 p-2 rounded-xl min-w-50 max-w-70"
                        style={{
                          background: isOwn ? 'var(--chat-own-inset)' : 'var(--background-subtle)',
                        }}
                      >
                        {/* Play icon */}
                        <button
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                          style={{
                            background: isOwn ? 'rgba(255,255,255,0.2)' : 'var(--primary)',
                            color: 'white',
                          }}
                        >
                          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>

                        {/* Waveform visualization placeholder */}
                        <div className="flex-1 flex items-center gap-0.5 h-8">
                          {Array.from({ length: 20 }).map((_, j) => (
                            <div
                              key={j}
                              className="w-1 rounded-full"
                              style={{
                                height: `${Math.random() * 20 + 8}px`,
                                background: isOwn ? 'rgba(255,255,255,0.6)' : 'var(--primary)',
                              }}
                            />
                          ))}
                        </div>

                        {/* Duration */}
                        <span
                          className="text-xs font-mono"
                          style={{ color: isOwn ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}
                        >
                          {formatDuration(duration)}
                        </span>

                        {/* Download */}
                        <a
                          href={asDownloadUrl(att.url)}
                          download={att.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                          style={{ color: isOwn ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    );
                  }

                  // Image
                  if (isImage(att.type)) {
                    return (
                      <div key={i} className="relative group/img">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={att.url}
                          alt={att.name}
                          className="rounded-xl max-w-[28vw] xs:max-w-[180px] sm:max-w-50 max-h-50 object-cover cursor-pointer transition-all duration-200 hover:opacity-90 hover:scale-[1.02]"
                          onClick={() => setLightboxSrc(att.url)}
                        />
                        <Link
                          href={asDownloadUrl(att.url)}
                          download={att.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all duration-200 hover:box-shadow-lg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-3.5 h-3.5 text-white" />
                        </Link>
                        <p className="text-[9px] xs:text-[10px] mt-0.5 opacity-70 truncate max-w-[28vw] xs:max-w-[180px] sm:max-w-50">
                          {att.name}
                        </p>
                      </div>
                    );
                  }
                  if (isPDF(att.type)) {
                    // No inline `<iframe>` preview: the browser's own PDF viewer
                    // paints page chrome that no outer CSS can reach, so its flat
                    // grey cut into the bubble in both themes — and it degraded to
                    // a broken-file placeholder whenever the viewer refused the
                    // file outright. A card built from tokens belongs to whichever
                    // theme is active and always says something useful.
                    return (
                      <div
                        key={i}
                        className="rounded-xl overflow-hidden border w-full max-w-50 xs:max-w-55 sm:max-w-60"
                        style={{
                          background: isOwn ? 'var(--chat-own-inset)' : 'var(--sunken)',
                          borderColor: isOwn ? 'var(--chat-own-inset-border)' : 'var(--border)',
                        }}
                      >
                        <div className="flex items-center gap-2 px-2.5 py-2">
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{
                              background: isOwn
                                ? 'var(--chat-own-inset-border)'
                                : 'var(--danger-quiet)',
                            }}
                          >
                            <FileText
                              className="w-4 h-4"
                              style={{ color: isOwn ? 'white' : 'var(--danger-text)' }}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[10px] xs:text-xs font-medium">
                              {att.name}
                            </p>
                            <p className="flex items-center gap-1 text-[9px] xs:text-[10px] opacity-70">
                              <span>PDF</span>
                              <span aria-hidden>•</span>
                              <span>{formatFileSize(att.size)}</span>
                            </p>
                          </div>
                        </div>
                        <Link
                          href={asDownloadUrl(att.url)}
                          download={att.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1 py-1.5 border-t text-[9px] xs:text-xs hover:opacity-80 transition-opacity"
                          style={{
                            borderColor: isOwn ? 'var(--chat-own-inset-border)' : 'var(--border)',
                            color: isOwn ? 'var(--chat-own-contrast)' : 'var(--text-muted)',
                          }}
                        >
                          <Download className="w-3 h-3" /> {L.download}
                        </Link>
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={i}
                      href={asDownloadUrl(att.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:opacity-80 transition-all duration-200 hover:scale-[1.01]"
                      style={{ background: isOwn ? 'var(--chat-own-inset)' : 'var(--sunken)' }}
                    >
                      <span>📎</span>
                      <span className="truncate flex-1 text-[9px] xs:text-xs">{att.name}</span>
                      <span className="shrink-0 opacity-70 text-[9px] xs:text-[10px]">
                        {formatFileSize(att.size)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Link Preview */}
            {urlInContent && !message.poll && <LinkPreview url={urlInContent} isOwn={isOwn} />}

            {message.isEdited && (
              <span className="sm:text-[9px] text-xs opacity-60 ml-1">(edited)</span>
            )}
            {message.isPinned && (
              <span className="absolute -top-2 -right-1 sm:text-[10px] text-xs">📌</span>
            )}
          </div>

          {/* Poll UI */}
          {message.poll && (
            <div
              className="mt-1 rounded-xl overflow-hidden border w-full min-w-45 xs:min-w-[200px] sm:min-w-55 max-w-65 xs:max-w-[280px] sm:max-w-[320px] animate-fade-in"
              style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
            >
              <div
                className="px-2.5 xs:px-3 py-2 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <p
                  className="text-xs xs:text-sm font-semibold wrap-break-words"
                  style={{ color: 'var(--text-primary)' }}
                >
                  📊 {message.poll.question}
                </p>
                {message.poll.closedAt && (
                  <p
                    className="text-[9px] xs:text-[10px] mt-1"
                    style={{ color: 'var(--text-disabled)' }}
                  >
                    {L.pollClosed}
                  </p>
                )}
              </div>
              <div className="px-2.5 xs:px-3 py-2 space-y-1">
                {(() => {
                  const totalVotes = message.poll.options.reduce((s, o) => s + o.votes.length, 0);
                  const userVote = message.poll.options.find((o) =>
                    o.votes.includes(currentUserId),
                  )?.id;
                  return message.poll.options.map((opt) => {
                    const pct =
                      totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                    const isVoted = opt.id === userVote;
                    const isClosed = !!message.poll!.closedAt;
                    return (
                      <button
                        key={opt.id}
                        disabled={isClosed}
                        onClick={() =>
                          votePoll({
                            messageId: message._id,
                            userId: currentUserId,
                            optionId: opt.id,
                          })
                        }
                        className="w-full text-left relative rounded-lg overflow-hidden transition-all duration-200 hover:opacity-80 disabled:cursor-default"
                        style={{ background: 'var(--background)' }}
                      >
                        {/* Progress bar */}
                        <div
                          className="absolute inset-0 rounded-lg transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: isVoted ? 'var(--primary)' : 'var(--border)',
                            opacity: 0.25,
                          }}
                        />
                        <div className="relative flex items-center justify-between px-2.5 xs:px-3 py-2 min-h-9 xs:min-h-[32px]">
                          <span
                            className="text-[11px] xs:text-[12px] font-medium flex items-center gap-1 truncate max-w-[75%]"
                            style={{ color: isVoted ? 'var(--primary)' : 'var(--text-primary)' }}
                          >
                            {isVoted && (
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: 'var(--primary)' }}
                              />
                            )}
                            {opt.text}
                          </span>
                          <span
                            className="text-[9px] xs:text-[10px] font-bold shrink-0 ml-1"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {pct}%
                          </span>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
              <div
                className="px-2.5 xs:px-3 py-1.5 border-t flex items-center justify-between"
                style={{ borderColor: 'var(--border)' }}
              >
                <span
                  className="text-[9px] xs:text-[10px]"
                  style={{ color: 'var(--text-disabled)' }}
                >
                  {message.poll.options.reduce((s, o) => s + o.votes.length, 0)} {L.votes}
                </span>
                {isOwn && !message.poll.closedAt && (
                  <button
                    onClick={() => closePoll({ messageId: message._id, userId: currentUserId })}
                    className="text-[9px] xs:text-[10px] hover:opacity-70 transition-opacity py-0.5 px-1.5 hover:bg-opacity-50 rounded"
                    style={{ color: 'var(--primary)' }}
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
              style={{
                borderColor: 'var(--primary)',
                color: 'var(--primary)',
                background: 'transparent',
              }}
            >
              <MessageSquare className="w-2.5 h-2.5" />
              {message.threadCount} repl{message.threadCount === 1 ? 'y' : 'ies'}
            </button>
          )}

          {/* Smart Reply — only for incoming messages */}
          {!isOwn &&
            !message.isDeleted &&
            message.type !== 'system' &&
            message.type !== 'call' &&
            message.content && (
              <SmartReply
                message={message.content}
                lang={lang}
                onSelect={(reply) =>
                  onSendMessage
                    ? onSendMessage(reply)
                    : onReply(
                        message._id,
                        message.content,
                        message.sender?.name ?? t('common.someone'),
                      )
                }
              />
            )}

          {/* Timestamp + read receipt */}
          <div
            className={cn(
              'flex items-center gap-1 mt-1 px-1',
              isOwn ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            <span
              className="sm:text-[10px] text-xs opacity-60"
              style={{ color: 'var(--text-muted)' }}
            >
              {format(new Date(message.createdAt), 'HH:mm', { locale: dateFnsLocale })}
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
                    className="flex items-center gap-0.5 sm:px-1.5 px-2 sm:py-0.5 py-1 rounded-full sm:text-xs text-sm border transition-all duration-200 hover:box-shadow-lg min-h-7 sm:min-h-auto"
                    style={{
                      background: users.includes(currentUserId)
                        ? 'var(--primary)'
                        : 'var(--background-subtle)',
                      borderColor: users.includes(currentUserId)
                        ? 'var(--primary)'
                        : 'var(--border)',
                      color: users.includes(currentUserId) ? 'white' : 'var(--text-primary)',
                    }}
                    title={users.join(', ')}
                  >
                    {displayEmoji} {users.length}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Action bar — disabled for service broadcasts unless sender is superadmin */}
        {(!message.isServiceBroadcast || (message.isServiceBroadcast && isOwn)) &&
          showActions &&
          actionBarPos &&
          createPortal(
            <div
              ref={actionBarRef}
              className="fixed flex items-center gap-0.5 z-40 rounded-full px-1.5 py-1 shadow-2xl border transition-all duration-150"
              style={{
                top: actionBarPos.top,
                left: actionBarPos.left,
                background: 'var(--background)',
                borderColor: 'var(--border)',
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                setShowActions(true);
              }}
              onMouseLeave={() => {
                if (showMenu) return;
                hoverTimeoutRef.current = setTimeout(() => {
                  setShowActions(false);
                }, 100);
              }}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-sm sm:text-xs hover:scale-110 hover:bg-white/10 transition-all duration-150"
                >
                  {emoji}
                </button>
              ))}
              <button
                onClick={() =>
                  onReply(message._id, message.content, message.sender?.name ?? t('common.someone'))
                }
                className="w-7 h-7 flex items-center justify-center rounded-full hover:scale-110 hover:bg-white/10 transition-all duration-150"
                style={{ color: 'var(--text-muted)' }}
                title={L.reply}
              >
                <Reply className="w-4 h-4" />
              </button>
              <div className="relative">
                <button
                  ref={menuBtnRef}
                  onClick={() => {
                    if (menuBtnRef.current) {
                      const rect = menuBtnRef.current.getBoundingClientRect();
                      const spaceBelow = window.innerHeight - rect.bottom;
                      const openDown = spaceBelow > 220;
                      setMenuOpenDown(openDown);
                      setMenuPosition({
                        top: openDown ? rect.bottom + 8 : rect.top - 8,
                        left: isOwn ? undefined : rect.left,
                        right: isOwn ? window.innerWidth - rect.right - 8 : undefined,
                      });
                    }
                    setShowMenu((prev) => !prev);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:scale-110 hover:bg-white/10 transition-all duration-150"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>,
            document.body,
          )}
      </div>

      {/* Context menu rendered via portal so it isn't clipped by scroll containers */}
      <MessageMenuPortal
        open={showMenu}
        position={menuPosition}
        openDown={menuOpenDown}
        onMouseEnter={() => {
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          setShowActions(true);
        }}
      >
        <div ref={menuRef}>
          <MenuItem icon={<Copy className="w-3.5 h-3.5" />} label={L.copy} onClick={handleCopy} />
          <MenuItem
            icon={<Pin className="w-3.5 h-3.5" />}
            label={message.isPinned ? L.unpin : L.pin}
            onClick={handlePin}
          />
          {isOwn && (
            <MenuItem
              icon={<Edit2 className="w-3.5 h-3.5" />}
              label={L.edit}
              onClick={() => {
                setEditing(true);
                setShowMenu(false);
              }}
            />
          )}
          <MenuItem
            icon={<Trash className="w-3.5 h-3.5" />}
            label={L.deleteForMe}
            onClick={() => {
              setShowDeleteDialog(true);
              setShowMenu(false);
            }}
            danger
          />
          {isOwn && withinFiveMin && (
            <MenuItem
              icon={<Trash2 className="w-3.5 h-3.5" />}
              label={L.deleteForEveryone}
              onClick={() => {
                setShowDeleteDialog(true);
                setShowMenu(false);
              }}
              danger
            />
          )}
        </div>
      </MessageMenuPortal>
    </>
  );
});

// Portal-mounted menu so it isn't clipped by scroll containers / input area
function MessageMenuPortal({
  open,
  position,
  openDown,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean;
  position: { top: number; left?: number; right?: number } | null;
  openDown: boolean;
  children: React.ReactNode;
  onMouseEnter: () => void;
  onMouseLeave?: () => void;
}) {
  if (!open || !position || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed z-120 rounded-xl shadow-2xl border py-1 min-w-40 animate-slide-up"
      style={{
        top: position.top,
        left: position.left,
        right: position.right,
        background: 'var(--background)',
        borderColor: 'var(--border)',
        transform: openDown ? 'translateY(0)' : 'translateY(-100%)',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body,
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all duration-150 hover:opacity-80"
      style={{ color: danger ? 'var(--danger-text)' : 'var(--text-primary)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-item-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      {label}
    </button>
  );
}
