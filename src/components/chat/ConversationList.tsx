'use client';
import Image from 'next/image';

import React, { useState, useRef, useEffect } from 'react';
import type { Id } from '../../../convex/_generated/dataModel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import {
  Search,
  Plus,
  Users,
  MessageCircle,
  Pin,
  Archive,
  Trash2,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ru, hy, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

interface Conversation {
  _id: Id<'chatConversations'>;
  type: 'direct' | 'group';
  name?: string;
  avatarUrl?: string;
  lastMessageAt?: number;
  lastMessageText?: string;
  lastMessageSenderId?: Id<'users'>;
  isPinned?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  membership: { unreadCount: number; isMuted: boolean; isDeleted?: boolean; isArchived?: boolean };
  otherUser?: {
    _id: Id<'users'>;
    name: string;
    avatarUrl?: string;
    presenceStatus?: string;
  } | null;
  memberCount?: number;
  members?: Array<{ userId: Id<'users'>; user?: { name: string; avatarUrl?: string } | null }>;
}

interface Props {
  conversations: Conversation[];
  selectedId: Id<'chatConversations'> | null;
  currentUserId: Id<'users'>;
  onSelect: (id: Id<'chatConversations'>) => void;
  onNewConversation: () => void;
  onTogglePin?: (convId: Id<'chatConversations'>) => Promise<void>;
  onDelete?: (convId: Id<'chatConversations'>) => Promise<void>;
  onRestore?: (convId: Id<'chatConversations'>) => Promise<void>;
  onToggleArchive?: (convId: Id<'chatConversations'>) => Promise<void>;
  onToggleMute?: (convId: Id<'chatConversations'>) => Promise<void>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type FilterType = 'all' | 'chat' | 'unread' | 'groups' | 'pinned' | 'archived';

const CHAT_FILTER_KEY = 'chat_filters';

function getStoredFilters(): FilterType[] {
  if (typeof window === 'undefined') return ['chat'];
  const stored = localStorage.getItem(CHAT_FILTER_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // If not valid JSON, treat as single filter
      if (['all', 'chat', 'unread', 'groups', 'pinned', 'archived'].includes(stored)) {
        return [stored as FilterType];
      }
    }
  }
  return ['chat'];
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function PresenceDot({ status }: { status?: string }) {
  const color =
    status === 'available'
      ? 'bg-green-500'
      : status === 'busy'
        ? 'bg-yellow-500'
        : status === 'in_call' || status === 'in_meeting'
          ? 'bg-red-500'
          : status === 'out_of_office'
            ? 'bg-gray-400'
            : 'bg-gray-400';
  return (
    <span
      className={cn(
        'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white',
        color,
      )}
    />
  );
}

export const ConversationList = React.memo(function ConversationList({
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
  collapsed,
  onToggleCollapse,
}: Props) {
  const { t } = useTranslation();
  const currentLang = i18n.language || 'en';
  const dateFnsLocale = currentLang === 'ru' ? ru : currentLang === 'hy' ? hy : enUS;
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<FilterType[]>(getStoredFilters);
  const [loadingOpId, setLoadingOpId] = useState<string | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Persist filter to localStorage
  useEffect(() => {
    localStorage.setItem(CHAT_FILTER_KEY, activeFilters[0] || 'chat');
  }, [activeFilters]);

  const toggleFilter = (f: FilterType) => {
    setActiveFilters((prev) => {
      if (prev.includes(f)) {
        // Don't allow deselecting if it's the last filter
        if (prev.length === 1) return prev;
        return prev.filter((filter) => filter !== f);
      }
      return [...prev, f];
    });
  };

  // Handle wheel scroll for filters
  const handleFilterWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (filtersRef.current) {
      e.preventDefault();
      filtersRef.current.scrollLeft += e.deltaY > 0 ? 100 : -100;
      updateScrollButtons();
    }
  };

  // Update scroll button visibility
  const updateScrollButtons = () => {
    if (filtersRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = filtersRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  // Scroll filters left/right
  const scrollFilters = (direction: 'left' | 'right') => {
    if (filtersRef.current) {
      filtersRef.current.scrollBy({
        left: direction === 'left' ? -120 : 120,
        behavior: 'smooth',
      });
      setTimeout(updateScrollButtons, 300);
    }
  };

  // Initialize scroll buttons on mount
  React.useEffect(() => {
    updateScrollButtons();
    window.addEventListener('resize', updateScrollButtons);
    return () => window.removeEventListener('resize', updateScrollButtons);
  }, []);

  // Apply filters
  const filtered = conversations.filter((c) => {
    const name = c.type === 'direct' ? (c.otherUser?.name ?? '') : (c.name ?? '');
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    const isHidden = c.membership.isArchived || c.isArchived;
    const isUnread = c.membership.unreadCount > 0 && !c.membership.isDeleted;
    const isPinned = c.isPinned && !isHidden && !c.membership.isDeleted;
    const isDirect = c.type === 'direct' && !isHidden && !c.membership.isDeleted;
    const isGroup = c.type === 'group' && !isHidden && !c.membership.isDeleted;
    const isArchived = c.membership.isDeleted || isHidden;
    const isActive = !isHidden && !c.membership.isDeleted;

    // If no filters active, show all active
    if (activeFilters.length === 0) return isActive;

    // Match if any filter matches
    return activeFilters.some((f) => {
      switch (f) {
        case 'chat':
          return isDirect;
        case 'unread':
          return isUnread;
        case 'groups':
          return isGroup;
        case 'pinned':
          return isPinned;
        case 'archived':
          return isArchived;
        default:
          return isActive;
      }
    });
  });

  const totalUnread = conversations.reduce((s, c) => s + (c.membership.unreadCount ?? 0), 0);

  const handleOperation = async (
    operation: () => Promise<void>,
    convId: Id<'chatConversations'>,
  ) => {
    try {
      setLoadingOpId(convId);
      await operation();
    } catch (error) {
      console.error('Operation failed:', error);
    } finally {
      setLoadingOpId(null);
    }
  };

  const [showContent, setShowContent] = useState(!collapsed);
  const showCollapse = collapsed !== undefined;

  React.useEffect(() => {
    if (!collapsed) {
      // Show content immediately when expanding
      setShowContent(true);
    } else {
      // Hide content after a short delay when collapsing
      const timer = setTimeout(() => setShowContent(false), 200);
      return () => clearTimeout(timer);
    }
  }, [collapsed]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className={cn(
          'flex items-center pt-4 pb-2',
          showCollapse && collapsed ? 'flex-col gap-2 px-2' : 'px-4 justify-between gap-4',
        )}
      >
        {/* Collapse toggle - desktop only */}
        {showCollapse && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              'hidden md:flex items-center justify-center rounded-lg transition-all hover:scale-105',
              'border border-border bg-background text-text-muted hover:bg-sidebar-item-hover hover:text-primary',
              showCollapse && collapsed ? 'w-10 h-10' : 'w-8 h-8 shrink-0',
            )}
            aria-label={showCollapse && collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {showCollapse && collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}

        {showCollapse && collapsed && (
          <button
            onClick={onNewConversation}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 btn-gradient"
            style={{ cursor: 'pointer' }}
            title={t('chat.newConversation')}
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        )}

        <div
          className={cn(
            'flex items-center justify-between w-full gap-2 overflow-hidden',
            showCollapse && collapsed ? 'max-w-0 opacity-0' : 'max-w-full opacity-100',
          )}
          style={{
            transition:
              'max-width 600ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('chat.messages')}
            </h2>
            {totalUnread > 0 && (
              <span className="min-w-4.5 h-4.5 px-1 rounded-full bg-linear-to-r from-red-500 to-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              onNewConversation();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 btn-gradient"
            style={{
              cursor: 'pointer',
              zIndex: 10,
              position: 'relative',
            }}
            title={t('chat.newConversation')}
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Search - hidden when collapsed (desktop only) */}
      <div
        className={cn(
          'overflow-hidden',
          showCollapse && showCollapse && collapsed ? 'max-h-0 opacity-0' : 'max-h-20 opacity-100',
        )}
        style={{
          transition:
            'max-height 600ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div className="px-3 pb-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: 'var(--text-disabled)' }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chat.searchConversations')}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-(--input-border) bg-(--input) text-(--text-primary) outline-none transition-all"
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>
        </div>
      </div>

      {/* Filters - hidden when showCollapse && collapsed (desktop only) */}
      <div
        className={cn(
          'overflow-hidden',
          showCollapse && showCollapse && collapsed ? 'max-h-0 opacity-0' : 'max-h-20 opacity-100',
        )}
        style={{
          transition:
            'max-height 600ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div className="px-3 pb-2 flex items-center gap-1.5">
          {/* Left scroll button */}
          <button
            onClick={() => scrollFilters('left')}
            className={cn(
              'shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-all',
              canScrollLeft ? 'opacity-100 hover:opacity-70' : 'opacity-30 cursor-not-allowed',
            )}
            style={{ background: 'var(--background-subtle)' }}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Filters container */}
          <div
            ref={filtersRef}
            onWheel={handleFilterWheel}
            onScroll={updateScrollButtons}
            className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollBehavior: 'smooth' }}
          >
            {(['all', 'chat', 'groups', 'unread', 'pinned', 'archived'] as const).map((f) => {
              const unreadCount = conversations.filter(
                (c) =>
                  c.membership.unreadCount > 0 &&
                  !(c.membership.isArchived || c.isArchived || c.membership.isDeleted),
              ).length;
              return (
                <button
                  key={f}
                  onClick={() => toggleFilter(f)}
                  className={cn(
                    'px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all shrink-0 active:scale-95',
                    activeFilters.includes(f)
                      ? 'btn-gradient text-white shadow-md'
                      : 'text-gray-500 opacity-60 hover:opacity-100',
                  )}
                  style={{
                    background: activeFilters.includes(f) ? '#3b82f6' : 'transparent',
                    cursor: 'pointer',
                  }}
                  title={
                    f === 'archived' ? t('chat.filterArchived') + ' - tap to restore' : undefined
                  }
                >
                  {f === 'all' && t('chat.filterAll', 'All')}
                  {f === 'chat' && t('chat.filterChat', 'Chat')}
                  {f === 'groups' && t('chat.filterGroups', 'Groups')}
                  {f === 'unread' &&
                    `${t('chat.filterUnread', 'Unread')} ${unreadCount > 0 ? `(${unreadCount})` : ''}`}
                  {f === 'pinned' && t('chat.filterPinned', 'Pinned')}
                  {f === 'archived' && t('chat.filterArchived', 'Archived')}
                </button>
              );
            })}
          </div>

          {/* Right scroll button */}
          <button
            onClick={() => scrollFilters('right')}
            className={cn(
              'shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-all',
              canScrollRight ? 'opacity-100 hover:opacity-70' : 'opacity-30 cursor-not-allowed',
            )}
            style={{ background: 'var(--background-subtle)' }}
            disabled={!canScrollRight}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 custom-scrollbar">
        {filtered.length === 0 && !showCollapse && (
          <div className="text-center py-12">
            <Users
              className="w-8 h-8 mx-auto mb-2 opacity-30"
              style={{ color: 'var(--text-muted)' }}
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {search ? t('chat.noResults') : t('chat.noConversations')}
            </p>
          </div>
        )}

        {filtered.map((conv, idx) => {
          const isSelected = conv._id === selectedId;
          const isGroup = conv.type === 'group';
          const displayName = isGroup
            ? (conv.name ?? t('chat.groupLabel', 'Group'))
            : (conv.otherUser?.name ?? t('chat.unknownUser', 'Unknown'));
          const avatarUrl = isGroup ? conv.avatarUrl : conv.otherUser?.avatarUrl;
          // If conversation is selected, hide the unread count (client-side optimization)
          const unread = isSelected ? 0 : (conv.membership.unreadCount ?? 0);
          const lastTime = conv.lastMessageAt
            ? formatDistanceToNow(new Date(conv.lastMessageAt), {
                addSuffix: false,
                locale: dateFnsLocale,
              })
            : '';

          // Sender prefix for last message
          const isOwnLast = conv.lastMessageSenderId === currentUserId;
          const isSystemAnnouncements = conv.name === 'System Announcements';
          // Don't show sender name for System Announcements
          const senderName = isSystemAnnouncements
            ? ''
            : isOwnLast
              ? t('chat.youPrefix')
              : conv.type === 'direct'
                ? ''
                : conv.lastMessageSenderId
                  ? (conv.members
                      ?.find((m) => m.userId === conv.lastMessageSenderId)
                      ?.user?.name?.split(' ')[0] ?? '')
                  : '';
          const deletedMessages = [
            'This message was deleted',
            'Это сообщение было удалено',
            'Այս հաղորդագրությունը ջնջված է',
          ];
          const isDeleted = deletedMessages.includes(conv.lastMessageText || '');
          const rawLastText = isDeleted ? '' : conv.lastMessageText;

          // Remove sender prefix for System Announcements (in case it's still there)
          let displayLastText = rawLastText;
          if (isSystemAnnouncements && displayLastText) {
            const match = displayLastText.match(/^[^:]*:\s*/);
            if (match) {
              displayLastText = displayLastText.substring(match[0].length);
            }
            displayLastText = displayLastText.replace(/^\d{1,2}\s*[AP]M\s*🔔?\s*/, '');
          }

          const lastMsgPreview = isSystemAnnouncements
            ? t('maintenance.notificationLabel')
            : isDeleted
              ? t('chat.deleted')
              : displayLastText
                ? senderName && !isSystemAnnouncements && !isDeleted
                  ? `${senderName}: ${displayLastText}`
                  : displayLastText
                : isGroup
                  ? `${conv.memberCount ?? 2} ${t('chat.members')}`
                  : t('chat.startConversationHint');

          // Last message sender avatar (for groups, but NOT for System Announcements)
          const lastSenderMember =
            isGroup && !isSystemAnnouncements && conv.lastMessageSenderId
              ? conv.members?.find((m) => m.userId === conv.lastMessageSenderId)
              : null;
          const lastSenderAvatar = isSystemAnnouncements
            ? null
            : isOwnLast
              ? null
              : lastSenderMember?.user?.avatarUrl;
          const lastSenderInitial = isSystemAnnouncements
            ? null
            : isOwnLast
              ? null
              : (lastSenderMember?.user?.name?.[0]?.toUpperCase() ?? null);

          const isLoading = loadingOpId === conv._id;

          return (
            <ContextMenu key={conv._id}>
              <ContextMenuTrigger asChild>
                <div
                  onClick={() => onSelect(conv._id)}
                  className={cn(
                    'w-full rounded-xl transition-all duration-200 text-left relative cursor-pointer',
                    showCollapse && collapsed
                      ? 'flex justify-center py-1.5'
                      : 'flex items-center gap-3 px-3 py-3',
                    isSelected ? 'shadow-sm scale-[1.01]' : 'hover:opacity-90',
                  )}
                  style={{
                    background: isSelected ? 'var(--sidebar-item-active)' : 'transparent',
                    color: isSelected ? 'var(--sidebar-item-active-text)' : 'var(--text-primary)',
                    animation: `conv-in 0.25s ease-out ${idx * 0.04}s both`,
                    opacity: conv.membership.isDeleted ? 0.5 : 1,
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--sidebar-item-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {isLoading && (
                    <div className="absolute top-3 left-3">
                      <ShieldLoader size="xs" variant="inline" />
                    </div>
                  )}

                  {/* Conversation avatar */}
                  <div className="relative shrink-0">
                    <Avatar
                      className={cn(
                        'transition-all',
                        showCollapse && collapsed ? 'w-10 h-10' : 'w-10 h-10',
                      )}
                    >
                      {avatarUrl && <AvatarImage src={avatarUrl} />}
                      <AvatarFallback
                        className={
                          isGroup
                            ? 'text-xs font-bold text-white bg-gradient-to-br from-indigo-500 to-purple-600'
                            : 'text-xs font-bold text-white btn-gradient'
                        }
                      >
                        {isGroup ? <Users className="w-4 h-4" /> : getInitials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    {!isGroup && conv.otherUser?.presenceStatus && (
                      <PresenceDot status={conv.otherUser.presenceStatus} />
                    )}
                    {/* Unread dot for showCollapse && collapsed mode */}
                    {showCollapse && collapsed && unread > 0 && !conv.membership.isMuted && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
                    )}
                  </div>

                  {/* Content - hidden when collapsed */}
                  {!(showCollapse && collapsed) && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className={cn(
                              'sm:text-sm text-base truncate',
                              unread > 0 ? 'font-semibold' : 'font-medium',
                            )}
                          >
                            {displayName}
                          </span>
                          {conv.isPinned && (
                            <Pin
                              className="sm:w-3 sm:h-3 w-4 h-4 shrink-0"
                              style={{ color: 'var(--primary)' }}
                            />
                          )}
                        </div>
                        {lastTime && (
                          <span
                            className="sm:text-[10px] text-xs shrink-0"
                            style={{ color: 'var(--text-disabled)' }}
                          >
                            {lastTime}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-1 sm:mt-0.5">
                        <div className="flex items-center gap-1 min-w-0">
                          {/* Last message sender mini-avatar (groups only, not own, not System Announcements) */}
                          {isGroup &&
                            conv.lastMessageText &&
                            !isOwnLast &&
                            !isSystemAnnouncements && (
                              <div className="sm:w-3.5 sm:h-3.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center sm:text-[7px] text-[8px] font-bold text-white overflow-hidden btn-gradient">
                                {lastSenderAvatar ? (
                                  <Image
                                    src={lastSenderAvatar}
                                    alt=""
                                    width={16}
                                    height={16}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                ) : (
                                  lastSenderInitial
                                )}
                              </div>
                            )}
                          <p
                            className={cn(
                              'sm:text-xs text-sm truncate',
                              unread > 0 ? 'font-medium' : 'opacity-70',
                            )}
                            style={{
                              color: isSelected
                                ? 'var(--sidebar-item-active-text)'
                                : 'var(--text-muted)',
                            }}
                          >
                            {isDeleted ? t('chat.deleted') : lastMsgPreview}
                          </p>
                        </div>
                        {unread > 0 && !conv.membership.isMuted && (
                          <span className="min-w-5 sm:min-w-4.5 h-5 sm:h-4.5 px-1 rounded-full bg-linear-to-r from-red-500 to-red-600 text-white sm:text-[9px] text-[10px] font-bold flex items-center justify-center shadow-lg">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                        {conv.membership.isMuted && (
                          <VolumeX className="w-3 h-3 shrink-0 opacity-50" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action buttons for archived/deleted items (visible without right-click) */}
                  {!showCollapse && collapsed && activeFilters.includes('archived') && (
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {conv.membership.isDeleted ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOperation(async () => {
                              await onRestore?.(conv._id);
                              // Force refresh by switching to chat filter after a small delay
                              setTimeout(() => setActiveFilters(['chat']), 100);
                            }, conv._id);
                          }}
                          className="p-1.5 rounded-lg transition-colors hover:bg-(--sidebar-item-hover)"
                          title={t('chat.restore')}
                        >
                          <RotateCcw className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                        </button>
                      ) : conv.membership.isArchived || conv.isArchived ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOperation(
                              () => onToggleArchive?.(conv._id) || Promise.resolve(),
                              conv._id,
                            );
                          }}
                          className="p-1.5 rounded-lg transition-colors hover:bg-(--sidebar-item-hover)"
                          title={t('chat.unarchive')}
                        >
                          <Archive className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </ContextMenuTrigger>

              {/* Context Menu */}
              <ContextMenuContent className="w-48">
                {!conv.membership.isDeleted && (
                  <>
                    <ContextMenuLabel className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {displayName}
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                  </>
                )}

                {conv.membership.isDeleted ? (
                  <ContextMenuItem
                    onClick={() =>
                      handleOperation(async () => {
                        await onRestore?.(conv._id);
                        setActiveFilters(['chat']);
                      }, conv._id)
                    }
                    disabled={isLoading}
                    className="flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('chat.restore')}
                  </ContextMenuItem>
                ) : (
                  <>
                    <ContextMenuItem
                      onClick={() =>
                        handleOperation(
                          () => onTogglePin?.(conv._id) || Promise.resolve(),
                          conv._id,
                        )
                      }
                      disabled={isLoading}
                      className="flex items-center gap-2"
                    >
                      <Pin className="w-4 h-4" />
                      {conv.isPinned ? t('chat.unpin') : t('chat.pin')}
                    </ContextMenuItem>

                    <ContextMenuItem
                      onClick={() =>
                        handleOperation(
                          () => onToggleMute?.(conv._id) || Promise.resolve(),
                          conv._id,
                        )
                      }
                      disabled={isLoading}
                      className="flex items-center gap-2"
                    >
                      {conv.membership.isMuted ? (
                        <>
                          <Volume2 className="w-4 h-4" />
                          {t('chat.unmute')}
                        </>
                      ) : (
                        <>
                          <VolumeX className="w-4 h-4" />
                          {t('chat.mute')}
                        </>
                      )}
                    </ContextMenuItem>

                    <ContextMenuItem
                      onClick={() =>
                        handleOperation(
                          () => onToggleArchive?.(conv._id) || Promise.resolve(),
                          conv._id,
                        )
                      }
                      disabled={isLoading}
                      className="flex items-center gap-2"
                    >
                      <Archive className="w-4 h-4" />
                      {conv.membership.isArchived || conv.isArchived
                        ? t('chat.unarchive')
                        : t('chat.archive')}
                    </ContextMenuItem>

                    <ContextMenuSeparator />

                    <ContextMenuItem
                      onClick={() =>
                        handleOperation(() => onDelete?.(conv._id) || Promise.resolve(), conv._id)
                      }
                      disabled={isLoading}
                      className="flex items-center gap-2 text-red-500 focus:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('chat.delete')}
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
});
