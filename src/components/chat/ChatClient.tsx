'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { toast } from 'sonner';

interface Props {
  userId: string;
  organizationId: string;
  userName: string;
  userAvatar?: string;
  userRole: string;
}

/**
 * Safety stop for the clear-chat loop: 500 messages per batch, so this covers a
 * 20 000-message history. Beyond that the user is told to repeat the action
 * rather than the browser spinning on an unbounded loop.
 */
const MAX_CLEAR_BATCHES = 40;

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
  const { t } = useTranslation();
  const [selectedConvId, setSelectedConvId] = useState<Id<'chatConversations'> | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [isOnline, _setIsOnline] = useState(true);
  const [_offlineMessages, _setOfflineMessages] = useState<
    { conversationId: string; content: string; type?: string }[]
  >([]);
  const [listCollapsed, setListCollapsed] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  /**
   * On mobile the expanded conversation list covers the chat area. It is
   * positioned `absolute` inside this component's own `relative` box rather than
   * `fixed` against the viewport: a viewport-anchored sheet had to hardcode the
   * navbar height as its top offset, which broke every time the navbar moved
   * (it hides itself on scroll) or the safe-area inset shifted the navbar down,
   * leaving a band of background between the two.
   */
  const mobileSheetOpen = !listCollapsed && !isDesktop;

  const uid = userId as Id<'users'>;
  const orgId = organizationId as Id<'organizations'>;

  // Respect org selector: if a specific org is selected (e.g. superadmin), use it
  const { selectedOrgId, setSelectedOrgId } = useOrgSelectorStore();
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
  const clearConversationMutation = useMutation(api.chat.mutations.clearConversation);

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

  /**
   * Deep link support: `/chat?conversation=<id>`.
   *
   * Everything that hands the user a link to a specific chat — most visibly the
   * "open chat" button on a support ticket in `/superadmin/support` — routes
   * here. Nothing used to read the parameter, so those links landed on the bare
   * chat page with the empty state showing and the conversation nowhere in
   * sight.
   *
   * Two things have to line up before the target can actually be displayed:
   * the conversation must be resolved without regard to the org currently
   * selected (a ticket chat belongs to the reporter's tenant, not necessarily
   * the one the superadmin is looking at), and the selector then has to be moved
   * to that tenant, because both the sidebar list and the chat window read their
   * data through an org-filtered query.
   */
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedConvId = searchParams.get('conversation');
  const requestedConv = useQuery(
    api.chat.queries.getConversationSummary,
    requestedConvId && uid
      ? { conversationId: requestedConvId as Id<'chatConversations'>, userId: uid }
      : 'skip',
  );
  // Guards against re-opening the target after the user navigates away from it.
  const consumedDeepLink = useRef<string | null>(null);

  useEffect(() => {
    if (!requestedConvId || requestedConv === undefined) return;
    if (consumedDeepLink.current === requestedConvId) return;
    consumedDeepLink.current = requestedConvId;

    // Drop the parameter either way: it has been acted on, and leaving it in the
    // address bar would re-open the chat every time the user closes it.
    router.replace(pathname, { scroll: false });

    if (!requestedConv) {
      toast.error(t('chat.conversationUnavailable'));
      return;
    }

    if (requestedConv.organizationId && requestedConv.organizationId !== selectedOrgId) {
      setSelectedOrgId(requestedConv.organizationId);
    }
    handleSelectConversation(requestedConv._id);
  }, [
    requestedConvId,
    requestedConv,
    selectedOrgId,
    setSelectedOrgId,
    handleSelectConversation,
    router,
    pathname,
    t,
  ]);

  // Ensure HR Assistant channel memberships are migrated on load.
  // Runs every time the chat page opens — the mutation is idempotent
  // (checks before inserting) so duplicate calls are safe.
  const ensureHrMembership = useMutation(api.attendance.mutations.ensureHrAssistantMembership);
  useEffect(() => {
    // Always use orgId (from page props) — it's always set because the
    // page redirects when organizationId is missing. effectiveOrgId can be
    // undefined for superadmin with no org selected, which caused the HR
    // Assistant channel to never be provisioned for admins.
    ensureHrMembership({ organizationId: orgId })
      .then((r) => {
        if (r && !r.migrated) console.warn('[ChatClient] HR migration skipped:', r);
      })
      .catch((e) => console.error('[ChatClient] HR migration error:', e));
  }, [ensureHrMembership, orgId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally clear selection only when the organization changes
  }, [effectiveOrgId]);

  // Global notification sound for new messages in ANY conversation
  const previousTotalUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (!conversations) return;

    const totalUnread = conversations.reduce(
      (sum, conv) => sum + (conv?.membership?.unreadCount ?? 0),
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
          <div className="w-2 h-2 rounded-full bg-(--warning-solid) animate-pulse" />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('chat.noConnection')}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('chat.noConnectionHint')}
            </p>
          </div>
        </div>
      )}

      <div
        className="flex flex-1 min-h-0 h-full overflow-hidden sm:rounded-xl border-0 sm:border relative"
        style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
      >
        {/* ── Overlay when expanded on mobile only ────────────────────────── */}
        {/* `absolute`, so it is bounded by the chat area and cannot bleed into
            the navbar strip no matter where the navbar currently sits. */}
        {mobileSheetOpen && (
          <div
            className="absolute inset-0 z-20 bg-black/50"
            onClick={() => setListCollapsed(true)}
          />
        )}

        {/* ── Sidebar: Conversation List ───────────────────────────────── */}
        <div
          className={cn(
            'flex flex-col border-r shrink-0',
            listCollapsed
              ? 'relative z-10 hidden md:flex'
              : 'absolute inset-0 z-[100] w-full overscroll-contain md:relative md:inset-auto md:z-auto md:w-80',
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
            conversations={(conversations ?? []).filter(Boolean)}
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
            onClearChat={async (convId) => {
              // Clearing for everyone deletes a bounded batch per call (a
              // transaction cannot touch an unbounded number of documents), so
              // keep calling until the conversation reports itself empty. The
              // clear-for-me path does its work in a single pass.
              for (let batch = 0; batch < MAX_CLEAR_BATCHES; batch += 1) {
                const result = await clearConversationMutation({
                  conversationId: convId,
                  userId: uid,
                });
                if (result.mode === 'self' || !result.hasMore) return;
              }
              throw new Error('Conversation too long to clear in one pass');
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
              aria-label={t('chat.openSidebar')}
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
