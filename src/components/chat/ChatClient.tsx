'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMainRef } from '@/hooks/useMainRef';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { NewConversationModal } from './NewConversationModal';
import { CallModal } from './CallModal';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useTranslation } from 'react-i18next';
import { playChatMessageSound } from '@/lib/notificationSound';
import { logger } from '@/lib/logger';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface Props {
  userId: string;
  organizationId: string;
  userName: string;
  userAvatar?: string;
  userRole: string;
}

export interface ActiveCall {
  callId: Id<'chatCalls'>;
  conversationId: Id<'chatConversations'>;
  type: 'audio' | 'video';
  isInitiator: boolean;
  remoteUserId?: Id<'users'>;
  remoteUserName?: string;
}

export default function ChatClient({
  userId,
  organizationId,
  userName,
  userAvatar,
  userRole,
}: Props) {
  const mainRef = useMainRef();
  const [selectedConvId, setSelectedConvId] = useState<Id<'chatConversations'> | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineMessages, setOfflineMessages] = useState<
    { conversationId: string; content: string; type?: string }[]
  >([]);
  const [listCollapsed, setListCollapsed] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const uid = userId as Id<'users'>;
  const orgId = organizationId as Id<'organizations'>;

  // Respect org selector: if a specific org is selected (e.g. superadmin), use it
  const { selectedOrgId } = useOrgSelectorStore();
  // If superadmin has selected an org, filter by that org; otherwise show all
  const effectiveOrgId =
    userRole === 'superadmin' && selectedOrgId
      ? (selectedOrgId as Id<'organizations'>)
      : userRole === 'superadmin'
        ? undefined
        : selectedOrgId
          ? (selectedOrgId as Id<'organizations'>)
          : orgId;

  const conversations = useQuery(
    api.chat.queries.getMyConversations,
    uid ? { userId: uid, organizationId: effectiveOrgId } : 'skip',
  );

  const initiateCallMutation = useMutation(api.chat.calls.initiateCall);

  // Conversation management mutations
  const togglePinMutation = useMutation(api.chat.mutations.togglePin);
  const deleteConversationMutation = useMutation(api.chat.mutations.deleteConversation);
  const restoreConversationMutation = useMutation(api.chat.mutations.restoreConversation);
  const toggleArchiveMutation = useMutation(api.chat.mutations.toggleArchive);
  const toggleMuteMutation = useMutation(api.chat.mutations.toggleMute);

  const handleSelectConversation = useCallback(
    (convId: Id<'chatConversations'>) => {
      setSelectedConvId(convId);
      // On mobile: only use overlay mode when expanded
      // When collapsed, sidebar stays visible and chat appears next to it
      if (!listCollapsed) {
        setMobileShowChat(true);
      }
      // slight delay so animation fires after state set
      setTimeout(() => setChatVisible(true), 10);
    },
    [listCollapsed],
  );

  // When deselecting on mobile
  const handleBack = useCallback(() => {
    setChatVisible(false);
    // Uncollapse sidebar immediately so it's visible when chat fades out
    setListCollapsed(false);
    setTimeout(() => {
      setMobileShowChat(false);
      setSelectedConvId(null);
    }, 280);
  }, []);

  const handleStartCall = useCallback(
    async (
      convId: Id<'chatConversations'>,
      type: 'audio' | 'video',
      participantIds: Id<'users'>[],
      remoteUserName?: string,
    ) => {
      logger.log('[ChatClient] Starting call', {
        convId,
        initiator: uid,
        participants: participantIds,
        org: effectiveOrgId,
      });

      const callId = await initiateCallMutation({
        conversationId: convId,
        organizationId: effectiveOrgId ?? undefined,
        initiatorId: uid,
        type,
        participantIds,
      });
      setActiveCall({
        callId,
        conversationId: convId,
        type,
        isInitiator: true,
        remoteUserId: participantIds.find((id) => id !== uid),
        remoteUserName,
      });
    },
    [initiateCallMutation, effectiveOrgId, uid],
  );

  const handleEndCall = useCallback(() => {
    setActiveCall(null);
  }, []);

  // Animate chat panel in when selectedConvId changes on md+
  useEffect(() => {
    if (selectedConvId) {
      setTimeout(() => setChatVisible(true), 10);
    } else {
      setChatVisible(false);
    }
  }, [selectedConvId]);

  // Clear selected conversation when organization changes
  useEffect(() => {
    if (selectedConvId) {
      setSelectedConvId(null);
      setMobileShowChat(false);
      setChatVisible(false);
    }
  }, [effectiveOrgId]);

  // Global notification sound for new messages in ANY conversation
  const previousTotalUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (!conversations) return;

    const totalUnread = conversations.reduce(
      (sum, conv) => sum + ((conv as any)?.membership?.unreadCount ?? 0),
      0,
    );

    if (previousTotalUnreadRef.current === null) {
      // First load — just save the count, don't play sound
      previousTotalUnreadRef.current = totalUnread;
      return;
    }

    // Play sound only when unread count increases (new message arrived)
    if (totalUnread > previousTotalUnreadRef.current) {
      // Skip if the currently open ChatWindow will handle the sound itself
      const isActiveConvHandlingSound = selectedConvId != null;
      if (!isActiveConvHandlingSound) {
        playChatMessageSound();
      }
    }

    previousTotalUnreadRef.current = totalUnread;
  }, [conversations, selectedConvId]);

  if (!uid)
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <ShieldLoader size="lg" />
      </div>
    );

  return (
    <>
      {/* New Conversation Modal - OUTSIDE overflow-hidden container */}
      {showNewConv && (
        <>
          <NewConversationModal
            currentUserId={uid}
            organizationId={effectiveOrgId}
            userRole={userRole}
            onClose={() => setShowNewConv(false)}
            onCreated={(convId) => {
              setSelectedConvId(convId);
              setShowNewConv(false);
              setMobileShowChat(true);
            }}
          />
        </>
      )}

      {/* Offline Indicator */}
      {!isOnline && (
        <div
          className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slide-up"
          style={{ background: 'var(--background-elevated)', border: '1px solid var(--border)' }}
        >
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              No connection
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Messages will be sent when you're back online
            </p>
          </div>
        </div>
      )}

      <div
        className="flex flex-1 min-h-0 h-full overflow-hidden sm:rounded-xl border-0 sm:border relative"
        style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
      >
        {/* ── Overlay when expanded on mobile only ────────────────────────── */}
        {!listCollapsed && !isDesktop && (
          <div className="fixed inset-0 z-20 bg-black/50" onClick={() => setListCollapsed(true)} />
        )}

        {/* ── Sidebar: Conversation List ───────────────────────────────── */}
        <div
          className={cn(
            'flex flex-col border-r shrink-0',
            listCollapsed
              ? 'relative z-10 hidden md:flex'
              : 'fixed top-16 left-0 right-0 bottom-0 z-[100] w-full md:relative md:top-auto md:left-auto md:right-auto md:bottom-auto md:z-auto md:w-80',
            // Hide sidebar on mobile only when expanded AND chat is shown
            !listCollapsed && mobileShowChat ? 'hidden md:flex' : '',
          )}
          style={{
            width: listCollapsed ? '72px' : undefined,
            transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
            borderColor: 'var(--border)',
            background: 'var(--sidebar-bg)',
          }}
        >
          <ConversationList
            conversations={(conversations ?? []).filter(Boolean) as any}
            selectedId={selectedConvId}
            currentUserId={uid}
            onSelect={(convId) => {
              handleSelectConversation(convId);
              // Close sidebar on mobile after selection
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                setListCollapsed(true);
              }
            }}
            collapsed={listCollapsed}
            onToggleCollapse={() => setListCollapsed((prev) => !prev)}
            onNewConversation={() => {
              const mainEl = mainRef.current;
              if (mainEl) {
                mainEl.scrollTo({ top: 0, behavior: 'smooth' });
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setShowNewConv(true);
            }}
            onTogglePin={async (convId) => {
              await togglePinMutation({ conversationId: convId, userId: uid });
            }}
            onDelete={async (convId) => {
              await deleteConversationMutation({ conversationId: convId, userId: uid });
              // Clear selected conversation to show initial empty state
              if (selectedConvId === convId) {
                setSelectedConvId(null);
                setMobileShowChat(false);
              }
            }}
            onRestore={async (convId) => {
              await restoreConversationMutation({ conversationId: convId, userId: uid });
            }}
            onToggleArchive={async (convId) => {
              await toggleArchiveMutation({ conversationId: convId, userId: uid });
            }}
            onToggleMute={async (convId) => {
              await toggleMuteMutation({ conversationId: convId, userId: uid });
            }}
          />
        </div>

        {/* ── Main: Chat Window ──────────────────────────────────────────── */}
        <div
          className={cn(
            'flex-1 flex flex-col min-w-0 overflow-x-hidden',
            'relative',
            // Mobile: show chat when collapsed (next to sidebar) OR when mobileShowChat (overlay)
            listCollapsed || mobileShowChat
              ? 'translate-x-0 opacity-100'
              : 'translate-x-full opacity-0 md:translate-x-0 md:opacity-100',
            'transition-[transform,opacity] duration-500 ease-in-out',
          )}
          style={{ background: 'var(--background)', contain: 'layout' }}
        >
          {/* Open sidebar button - shown when collapsed on desktop */}
          {listCollapsed && (
            <button
              onClick={() => setListCollapsed(false)}
              className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-16 items-center justify-center rounded-r-lg bg-(--sidebar-bg) border border-l-0 border-(--border) text-(--text-muted) hover:text-primary hover:scale-105 transition-all"
              style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}
              aria-label="Open sidebar"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
          {selectedConvId ? (
            <div
              className={cn(
                'flex flex-col h-full transition-all duration-500 ease-out',
                chatVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
              )}
            >
              <ChatWindow
                key={selectedConvId}
                conversationId={selectedConvId}
                currentUserId={uid}
                organizationId={effectiveOrgId}
                currentUserName={userName}
                currentUserAvatar={userAvatar}
                onBack={handleBack}
                onStartCall={handleStartCall}
              />
            </div>
          ) : (
            <EmptyState onNewConversation={() => setShowNewConv(true)} />
          )}
        </div>
      </div>

      {/* Active Call Modal */}
      {activeCall && (
        <CallModal
          call={activeCall}
          currentUserId={uid}
          currentUserName={userName}
          currentUserAvatar={userAvatar}
          onEnd={handleEndCall}
        />
      )}
    </>
  );
}

function EmptyState({ onNewConversation }: { onNewConversation: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5 p-8 select-none animate-fade-in">
      <div className="btn-gradient w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg">
        <MessageCircle className="w-9 h-9 text-white" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('chat.yourMessages')}
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('chat.yourMessagesSubtitle')}
        </p>
      </div>
      <button
        onClick={onNewConversation}
        className="btn-gradient px-5 py-2.5 rounded-xl text-sm font-medium text-white shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
      >
        {t('chat.startConversation')}
      </button>
    </div>
  );
}
