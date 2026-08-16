'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { getRoleSuggestions, type UserRole } from '@/lib/aiAssistant';
import AgentSelector from '@/components/ai/AgentSelector';
import { type AgentType, routeToAgent } from '@/lib/ai/agents';
import {
  Sparkles,
  Send,
  Plus,
  MessageSquare,
  Bot,
  User,
  Copy,
  Trash2,
  Edit2,
  PanelLeftClose,
  Calendar,
  ClipboardList,
  Users,
  TrendingUp,
  Zap,
  ArrowDown,
  ChevronRight,
  Check,
  X,
  Brain,
  Share2,
  Download,
  Pin,
  Search,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { logger } from '@/lib/logger';
import { parseAssistantTags, stripControlTags, stripPartialTail } from '@/lib/ai/tags';
import { canNavigate } from '@/lib/ai/assistantRoutes';
import { MemoryPanel } from '@/components/ai/MemoryPanel';
import {
  SourcesChips,
  GeneratedImageCard,
  WebSearchCard,
  ArtifactCanvas,
} from '@/components/ai/AssistantExtras';
import {
  QUICK_ACTIONS,
  quickActionPrompt,
  buildSlashCommands,
  parseSlashQuery,
  filterCommands,
  type QuickAction,
  type SlashCommand,
} from '@/lib/ai/commands';
import type { MessageArtifact, WebSearchResult } from '@/components/ai/chatWidgetTypes';

type CsrfPair = { token: string; signature: string };

type Message = {
  _id?: string;
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: AnyAction[];
  suggestions?: string[];
  isNew?: boolean;
  sources?: string[];
  imagePrompt?: string;
  webSearchQuery?: string;
  webSearchResults?: WebSearchResult[];
  artifacts?: MessageArtifact[];
  feedback?: 'up' | 'down';
};

type AnyAction = {
  type: string;
  payload: Record<string, unknown>;
};

type Conversation = {
  _id: string;
  title: string;
  date: Date;
  pinned?: boolean;
};

// ═══════════════════════════════════════════════════════════════
// Parse AI response for ACTION tags
// ═══════════════════════════════════════════════════════════════
function parseActions(content: string): { cleanContent: string; actions: AnyAction[] } {
  const actionMatches = [...content.matchAll(/<ACTION>([\s\S]*?)<\/ACTION>/g)];
  if (actionMatches.length === 0) return { cleanContent: content, actions: [] };

  const actions: AnyAction[] = [];
  for (const match of actionMatches) {
    try {
      const actionStr = match[1]?.trim();
      if (actionStr) {
        const action = JSON.parse(actionStr) as AnyAction;
        actions.push(action);
      }
    } catch {
      // skip invalid JSON
    }
  }

  const cleanContent = content
    .replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { cleanContent, actions };
}

// ═══════════════════════════════════════════════════════════════
// Follow-up suggestions
// ═══════════════════════════════════════════════════════════════
function getFollowUpSuggestions(
  content: string,
  userRole: string,
  t: (key: string) => string,
): string[] {
  const lower = content.toLowerCase();

  if (
    lower.includes('book') ||
    lower.includes('leave') ||
    lower.includes('submitted') ||
    lower.includes('approved')
  ) {
    return [t('chatWidget.showBalance'), t('chatWidget.viewUpcoming'), t('chatWidget.whoOnLeave')];
  }
  if (lower.includes('balance') || lower.includes('days left') || lower.includes('remaining')) {
    return ['📆 Book a vacation', '🤒 Request sick leave', '📊 Show my leave history'];
  }
  if (lower.includes('sick') || lower.includes('doctor') || lower.includes('medical')) {
    return ['🤒 Book sick leave for today', '👨‍⚕️ Book a doctor visit', t('chatWidget.showBalance')];
  }
  if (lower.includes('team') || lower.includes('colleague') || lower.includes('who is')) {
    return ['📅 Show team calendar', '📋 My leave balance', '📆 Book time off'];
  }
  if (lower.includes('cancel') || lower.includes('delete') || lower.includes('removed')) {
    return ['📋 Show my pending leaves', '📆 Book new leave', '📊 My leave balance'];
  }
  if (userRole === 'admin' || userRole === 'supervisor') {
    return [
      t('chatWidget.whoOnLeaveToday'),
      t('chatWidget.teamStats'),
      t('chatWidget.pendingApprovals'),
    ];
  }
  return ['📆 Book a vacation', t('chatWidget.showBalance'), '👥 Who is on leave this week?'];
}

// ═══════════════════════════════════════════════════════════════
// Language detection
// ═══════════════════════════════════════════════════════════════
function detectLanguage(text: string): 'en' | 'ru' | 'hy' {
  const ruPattern = /[\u0400-\u04FF]/;
  const hyPattern = /[\u0530-\u058F]/;

  if (ruPattern.test(text)) return 'ru';
  if (hyPattern.test(text)) return 'hy';
  return 'en';
}

// Human labels for slash-command navigation entries (kept out of i18n: the
// list mirrors assistantRoutes and changes rarely).
const SLASH_ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/calendar': 'Calendar',
  '/leaves': 'Leaves',
  '/tasks': 'Tasks',
  '/attendance': 'Attendance',
  '/profile': 'Profile',
  '/settings': 'Settings',
  '/documents': 'Documents',
  '/messenger': 'Messenger',
  '/learning': 'Learning',
  '/recognition': 'Recognition',
  '/goals': 'Goals',
  '/surveys': 'Surveys',
  '/corporate': 'Corporate policies',
  '/help-desk': 'Help desk',
  '/events': 'Events',
  '/employees': 'Employees',
  '/analytics': 'Analytics',
  '/reports': 'Reports',
  '/performance': 'Performance',
  '/approvals': 'Approvals',
  '/team': 'Team',
  '/admin': 'Admin',
  '/recruitment': 'Recruitment',
  '/onboarding': 'Onboarding',
  '/offboarding': 'Offboarding',
  '/payroll': 'Payroll',
  '/expenses': 'Expenses',
  '/assets': 'Assets',
  '/meeting-rooms': 'Meeting rooms',
  '/projects': 'Projects',
  '/org-chart': 'Org chart',
  '/news': 'News',
  '/signatures': 'Signatures',
  '/document-builder': 'Document builder',
  '/integrations': 'Integrations',
  '/security': 'Security',
  '/audit': 'Audit log',
  '/ai-governance': 'AI governance',
  '/superadmin': 'Superadmin',
  '/superadmin/organizations': 'Organizations',
  '/superadmin/backups': 'Backups',
  '/superadmin/billing': 'Billing',
  '/superadmin/security': 'Platform security',
  '/superadmin/impersonate': 'Impersonate',
  '/ai-site-editor': 'AI site editor',
};

const QUICK_ACTION_ICONS: Record<QuickAction, string> = {
  shorter: '✂️',
  longer: '📝',
  simplify: '💡',
  translate: '🌐',
  continue: '⏩',
};

export default function AIChatPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const userId = user?.id as Id<'users'> | undefined;

  const [csrf, setCsrf] = useState<CsrfPair | null>(null);

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Pick up messages from widget handoff
  useEffect(() => {
    try {
      const handoff = sessionStorage.getItem('ai-chat-handoff');
      if (handoff) {
        setMessages(JSON.parse(handoff) as Message[]);
        sessionStorage.removeItem('ai-chat-handoff');
      }
    } catch {}
  }, []);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('general');
  const [lastDetectedAgent, setLastDetectedAgent] = useState<AgentType>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [memoryOpen, setMemoryOpen] = useState(false);
  const _isListening = false;

  const abortRef = useRef<AbortController | null>(null);

  /** Stop the in-flight stream; the partial answer is kept. */
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  // Update sidebar state when screen size changes
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // Handle conversation selection - close sidebar on mobile
  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    if (isMobile) setSidebarOpen(false);
  };

  // Convex queries
  const {
    results: savedConversations,
    loadMore: _loadMoreConversations,
    status: _convsStatus,
  } = usePaginatedQuery(api.aiChat.listConversationsPaginated, userId ? { userId } : 'skip', {
    initialNumItems: 30,
  });

  // Load messages for active conversation
  const savedMessages = useQuery(
    api.aiChat.getMessages,
    activeConversationId
      ? { conversationId: activeConversationId as Id<'aiConversations'> }
      : 'skip',
  );

  // Convex mutations
  const createConversation = useMutation(api.aiChatMutations.createConversation);
  const updateConversationTitle = useMutation(api.aiChatMutations.updateConversationTitle);
  const deleteConversation = useMutation(api.aiChatMutations.deleteConversation);
  const addMessage = useMutation(api.aiChatMutations.addMessage);
  const togglePinConversation = useMutation(api.aiChatMutations.togglePinConversation);
  const setMessageFeedback = useMutation(api.aiChatMutations.setMessageFeedback);
  const createShare = useMutation(api.aiChatMutations.createShare);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Scroll button visibility
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Load conversations from Convex
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (savedConversations) {
      const convs = savedConversations.map((c) => ({
        _id: c._id,
        title: c.title,
        date: new Date(c.createdAt),
        pinned: c.pinned,
      }));
      setConversations(convs);

      // Auto-select first conversation if none selected
      if (convs.length > 0 && !activeConversationId) {
        setActiveConversationId(convs[0]!._id);
      }
    }
  }, [savedConversations, activeConversationId]);

  // Pinned first, then newest; filtered by the sidebar search box.
  const visibleConversations = conversations
    .filter((c) => !searchQuery.trim() || c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.date.getTime() - a.date.getTime();
    });

  const handleTogglePin = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await togglePinConversation({
        conversationId: conversationId as Id<'aiConversations'>,
      });
      setConversations((prev) =>
        prev.map((c) => (c._id === conversationId ? { ...c, pinned: result.pinned } : c)),
      );
    } catch (error) {
      logger.error('[Pin conversation error]:', error);
    }
  };

  // Load messages when conversation selected
  useEffect(() => {
    if (savedMessages && activeConversationId) {
      const loadedMessages: Message[] = savedMessages.map((m) => ({
        _id: m._id,
        id: m._id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.createdAt),
        actions: [],
        suggestions: [],
      }));
      setMessages(loadedMessages);
    }
  }, [savedMessages, activeConversationId]);

  // Auto-focus input
  useEffect(() => {
    if (textareaRef.current) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  // ✅ Load CSRF token once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch('/api/csrf-token', { method: 'GET' });
        if (!r.ok) throw new Error(`CSRF endpoint error: ${r.status}`);
        const data = (await r.json()) as CsrfPair;
        if (!cancelled) setCsrf(data);
      } catch (e) {
        logger.error('[CSRF] Failed to fetch CSRF token:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Create new conversation
  // ═══════════════════════════════════════════════════════════════
  const handleNewConversation = async () => {
    if (!userId) return;

    try {
      const { conversationId } = await createConversation({
        userId,
        title: t('aiChat.newChat') || 'New Chat',
      });

      setActiveConversationId(conversationId);
      setMessages([]);
      setConversations((prev) => [
        {
          _id: conversationId,
          title: t('aiChat.newChat') || 'New Chat',
          date: new Date(),
        },
        ...prev,
      ]);

      toast.success(t('aiChat.newChatCreated') || 'New chat created');
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch (error) {
      logger.error('[Create conversation error]:', error);
      toast.error(t('aiChat.createError') || 'Failed to create chat');
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Delete conversation with animation
  // ═══════════════════════════════════════════════════════════════
  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      await deleteConversation({ conversationId: conversationId as Id<'aiConversations'> });

      setConversations((prev) => prev.filter((c) => c._id !== conversationId));

      if (activeConversationId === conversationId) {
        setMessages([]);
        setActiveConversationId(null);
      }

      toast.success(t('aiChat.chatDeleted') || 'Chat deleted');
    } catch (error) {
      logger.error('[Delete conversation error]:', error);
      toast.error(t('aiChat.deleteError') || 'Failed to delete chat');
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Start editing title
  // ═══════════════════════════════════════════════════════════════
  const startEditingTitle = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitleId(conv._id);
    setEditingTitle(conv.title);
  };

  // ═══════════════════════════════════════════════════════════════
  // Save edited title
  // ═══════════════════════════════════════════════════════════════
  const saveEditedTitle = async (conversationId: string) => {
    try {
      await updateConversationTitle({
        conversationId: conversationId as Id<'aiConversations'>,
        title: editingTitle,
      });

      setConversations((prev) =>
        prev.map((c) => (c._id === conversationId ? { ...c, title: editingTitle } : c)),
      );
      setEditingTitleId(null);
      toast.success(t('aiChat.titleUpdated') || 'Title updated');
    } catch (error) {
      logger.error('[Update title error]:', error);
      toast.error(t('aiChat.updateError') || 'Failed to update title');
    }
  };

  const cancelEditingTitle = () => {
    setEditingTitleId(null);
    setEditingTitle('');
  };

  // ═══════════════════════════════════════════════════════════════
  // Send message - FULL LOGIC from ChatWidget
  // ═══════════════════════════════════════════════════════════════
  const handleSend = async (textOverride?: string) => {
    const messageText = textOverride ?? input;
    if (!messageText.trim() || !userId || isLoading) return;

    // ✅ CSRF check FIRST (до optimistic UI и до Convex)
    if (!csrf) {
      toast.error('CSRF token is not ready yet');
      return;
    }

    const lang = detectLanguage(messageText);
    const userMessageContent = messageText.trim();

    // If no active conversation, create one
    let currentConvId = activeConversationId;
    if (!currentConvId) {
      try {
        const { conversationId } = await createConversation({
          userId,
          title: userMessageContent.slice(0, 50),
        });
        currentConvId = conversationId;
        setActiveConversationId(conversationId);
        setConversations((prev) => [
          {
            _id: conversationId,
            title: userMessageContent.slice(0, 50),
            date: new Date(),
          },
          ...prev,
        ]);
      } catch (error) {
        logger.error('[Create conversation error]:', error);
        toast.error(t('toasts.conversationCreateFailed'));
        return;
      }
    }

    // Create optimistic user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessageContent,
      timestamp: new Date(),
      isNew: true,
    };

    const isFirstMessage = messages.length === 0;

    // Add to UI immediately (optimistic update)
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Save user message to Convex
    try {
      await addMessage({
        conversationId: currentConvId as Id<'aiConversations'>,
        role: 'user',
        content: userMessage.content,
      });
    } catch (error) {
      logger.error('[Save message error]:', error);
    }

    try {
      logger.log('🤖 [AI Chat Page] Sending message to AI:', {
        userId,
        message: userMessageContent,
      });

      // Auto-detect agent if not manually set
      const effectiveAgent =
        selectedAgent !== 'general'
          ? selectedAgent
          : routeToAgent(userMessageContent, (user?.role as UserRole) || 'employee');

      // Sync displayed agent in UI (doesn't affect future auto-detection)
      if (selectedAgent === 'general') {
        setLastDetectedAgent(effectiveAgent);
      }

      const payload = {
        // Blank turns are dropped: OpenAI-compatible providers reject an
        // `assistant` message with empty content, so one blank answer used to
        // make every following request fail as well.
        messages: [...messages, userMessage]
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content })),
        userId,
        lang,
        agent: effectiveAgent,
      };

      const controller = new AbortController();
      abortRef.current = controller;

      let res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf.token,
          'X-CSRF-Token-Signature': csrf.signature,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // ✅ retry 1 раз при 403 (обновим CSRF и повторим)
      if (res.status === 403) {
        try {
          const r2 = await fetch('/api/csrf-token', { method: 'GET' });
          if (r2.ok) {
            const nextCsrf = (await r2.json()) as CsrfPair;
            setCsrf(nextCsrf);

            res = await fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': nextCsrf.token,
                'X-CSRF-Token-Signature': nextCsrf.signature,
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
          }
        } catch (e) {
          logger.error('[CSRF refresh failed]', e);
        }
      }

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        const errorMessage = errData.error || `Server error ${res.status}`;
        throw new Error(errorMessage);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      const assistantId = `ai-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          actions: [],
          suggestions: [],
          isNew: true,
        },
      ]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullContent += decoder.decode(value, { stream: true });
          // Hide control tags mid-stream (including partial ones at the tail).
          const display = stripControlTags(
            parseActions(stripPartialTail(fullContent)).cleanContent,
          );
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: display } : m)),
          );
        }
      }

      const { cleanContent, actions } = parseActions(fullContent);
      const parsed = parseAssistantTags(cleanContent);

      // A 200 with no usable text is still a failure. Without this the blank
      // bubble was both the only symptom and, once persisted, a poison pill for
      // every later turn of the conversation.
      if (!parsed.cleanContent.trim() && actions.length === 0 && !parsed.artifacts.length) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        toast.error(t('aiChat.emptyReply', { defaultValue: 'No reply received. Please retry.' }));
        return;
      }

      const suggestions = parsed.suggestions.length
        ? parsed.suggestions
        : getFollowUpSuggestions(parsed.cleanContent, user?.role || 'employee', t);

      // Check for navigation tags in response (role allow-list enforced)
      if (
        parsed.navigateTo &&
        canNavigate((user?.role as UserRole) || 'employee', parsed.navigateTo)
      ) {
        const route = parsed.navigateTo;
        setTimeout(() => {
          router.push(route);
        }, 800);
      }

      // Save AI message to Convex
      try {
        await addMessage({
          conversationId: currentConvId as Id<'aiConversations'>,
          role: 'assistant',
          content: parsed.cleanContent,
        });
      } catch (error) {
        logger.error('[Save AI message error]:', error);
      }

      // Smart title for the first message of a conversation
      if (isFirstMessage && currentConvId) {
        const convIdAtRename = currentConvId;
        void (async () => {
          try {
            const titleRes = await fetch('/api/chat/smart-title', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(csrf
                  ? {
                      'X-CSRF-Token': csrf.token,
                      'X-CSRF-Token-Signature': csrf.signature,
                    }
                  : {}),
              },
              body: JSON.stringify({ message: userMessage.content, lang }),
            });
            const data = (await titleRes.json().catch(() => ({}))) as { title?: string };
            const title = data.title || userMessage.content.slice(0, 50);
            await updateConversationTitle({
              conversationId: convIdAtRename as Id<'aiConversations'>,
              title,
            });
            setConversations((prev) =>
              prev.map((c) => (c._id === convIdAtRename ? { ...c, title } : c)),
            );
          } catch (error) {
            logger.error('[Smart title error]:', error);
          }
        })();
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: parsed.cleanContent,
                actions,
                suggestions,
                sources: parsed.sources,
                imagePrompt: parsed.imagePrompt || undefined,
                webSearchQuery: parsed.webSearchQuery || undefined,
                artifacts: parsed.artifacts,
              }
            : m,
        ),
      );
    } catch (error) {
      // Drop the placeholder if nothing streamed into it, so an empty assistant
      // turn never survives into the next request's history.
      setMessages((prev) =>
        prev.filter((m) => m.role !== 'assistant' || m.content.trim().length > 0 || !m.isNew),
      );
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Stopped by the user — keep the partial answer.
        return;
      }
      logger.error('[AI Chat Page] Error:', error);
      toast.error(t('aiChat.error') || 'Failed to get response');

      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: '❌ ' + (error instanceof Error ? error.message : 'Unknown error'),
          timestamp: new Date(),
          isNew: true,
        },
      ]);
    } finally {
      abortRef.current = null;
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  /** Re-run the last user message (regenerate the last answer). */
  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser || isLoading) return;
    setMessages((prev) => {
      const lastAssistantIndex = prev.map((m) => m.role).lastIndexOf('assistant');
      return lastAssistantIndex >= 0 ? prev.slice(0, lastAssistantIndex) : prev;
    });
    void handleSend(lastUser.content);
  };

  const handleQuickAction = (qa: QuickAction) => {
    void handleSend(quickActionPrompt(qa, assistantLocale));
  };

  const handleFeedback = async (message: Message, rating: 'up' | 'down') => {
    if (!userId || !activeConversationId) return;
    const next = message.feedback === rating ? undefined : rating;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: next } : m)));
    if (!next) return;
    try {
      await setMessageFeedback({
        conversationId: activeConversationId as Id<'aiConversations'>,
        messageId: message.id,
        userId: userId as Id<'users'>,
        rating: next,
      });
    } catch (error) {
      logger.error('[Feedback error]:', error);
    }
  };

  const handleShare = async () => {
    if (!activeConversationId || !userId) return;
    try {
      const { token } = await createShare({
        conversationId: activeConversationId as Id<'aiConversations'>,
        createdBy: userId as Id<'users'>,
      });
      const url = `${window.location.origin}/shared-ai-chat/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success(t('aiChat.shareCopied', { defaultValue: 'Share link copied to clipboard' }));
    } catch (error) {
      logger.error('[Share error]:', error);
      toast.error(t('aiChat.shareError', { defaultValue: 'Failed to create share link' }));
    }
  };

  const handleExport = (format: 'md' | 'json') => {
    if (!messages.length) return;
    const title = conversations.find((c) => c._id === activeConversationId)?.title || 'chat';
    let blob: Blob;
    if (format === 'json') {
      blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    } else {
      const md = messages
        .map((m) => `## ${m.role === 'user' ? '👤 User' : '🤖 Assistant'}\n\n${m.content}`)
        .join('\n\n---\n\n');
      blob = new Blob([`# ${title}\n\n${md}`], { type: 'text/markdown' });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.slice(0, 40)}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleSuggestion = (suggestion: string) => {
    const clean = suggestion.replace(/^[\p{Emoji}\s]+/u, '').trim();
    setInput(clean);
    setTimeout(() => void handleSend(), 50);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('aiChat.copied') || 'Copied!');
  };

  const assistantLocale = (['ru', 'hy'].includes(i18n.language) ? i18n.language : 'en') as
    | 'en'
    | 'ru'
    | 'hy';

  // ── Slash commands in the composer ────────────────────────────────
  const slashQuery = parseSlashQuery(input);
  const slashCommands: SlashCommand[] = slashQuery.active
    ? filterCommands(
        buildSlashCommands((user?.role as UserRole) || 'employee', {
          routes: SLASH_ROUTE_LABELS,
          newChat: t('aiChat.newChat') || 'New chat',
          clearChat: t('aiChat.clearChat', { defaultValue: 'Clear chat' }),
          memory: t('aiChat.memory.title', { defaultValue: 'Assistant memory' }),
          openVerb: t('aiChat.openVerb', { defaultValue: 'Open' }),
        }),
        slashQuery.query,
      ).slice(0, 8)
    : [];

  const handleSlashCommand = (cmd: SlashCommand) => {
    if (cmd.kind === 'navigate' && cmd.value) {
      router.push(cmd.value);
      setInput('');
    } else if (cmd.kind === 'new') {
      void handleNewConversation();
      setInput('');
    } else if (cmd.kind === 'clear') {
      setMessages([]);
      setInput('');
    } else if (cmd.kind === 'memory') {
      setMemoryOpen(true);
      setInput('');
    }
  };

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');

  const roleBasedSuggestions = getRoleSuggestions((user?.role as UserRole) || 'employee', t);

  const initialSuggestions = roleBasedSuggestions.slice(0, 4).map((suggestion) => {
    const cleanSuggestion = suggestion.replace(/^[\p{Emoji}\s]+/u, '').trim();
    let icon = <Calendar className="w-4 h-4" />;

    if (
      cleanSuggestion.includes('задачи') ||
      cleanSuggestion.includes('tasks') ||
      cleanSuggestion.includes('задач')
    ) {
      icon = <ClipboardList className="w-4 h-4" />;
    } else if (
      cleanSuggestion.includes('команд') ||
      cleanSuggestion.includes('сотрудник') ||
      cleanSuggestion.includes('employees') ||
      cleanSuggestion.includes('team')
    ) {
      icon = <Users className="w-4 h-4" />;
    } else if (cleanSuggestion.includes('посещаемость') || cleanSuggestion.includes('attendance')) {
      icon = <TrendingUp className="w-4 h-4" />;
    } else if (
      cleanSuggestion.includes('аналитик') ||
      cleanSuggestion.includes('analytics') ||
      cleanSuggestion.includes('статистик')
    ) {
      icon = <TrendingUp className="w-4 h-4" />;
    } else if (cleanSuggestion.includes('организац') || cleanSuggestion.includes('organization')) {
      icon = <Users className="w-4 h-4" />;
    } else if (cleanSuggestion.includes('безопасн') || cleanSuggestion.includes('security')) {
      icon = <Zap className="w-4 h-4" />;
    }

    return {
      icon,
      label: suggestion,
      query: cleanSuggestion,
    };
  });

  return (
    <div
      className="flex h-full bg-linear-to-br from-(--background) via-(--background) to-(--primary)/2"
      style={{ contain: 'layout' }}
    >
      {/* Sidebar */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed md:relative z-50 h-full bg-(--card) border-r border-(--border) shrink-0 overflow-hidden ${
          isMobile ? 'w-full' : ''
        }`}
        style={{
          position: isMobile ? 'fixed' : 'relative',
          top: 0,
          left: 0,
          height: '100%',
          width: sidebarOpen ? (isMobile ? '100vw' : 300) : 0,
          transform: isMobile ? `translateX(${sidebarOpen ? '0' : '-100%'})` : 'none',
          opacity: sidebarOpen ? 1 : 0,
          willChange: 'width, opacity',
          pointerEvents: sidebarOpen || !isMobile ? 'auto' : 'none',
          transition: isMobile
            ? 'transform 300ms ease-in-out, opacity 300ms ease-in-out'
            : sidebarOpen
              ? `width 600ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 600ms cubic-bezier(0.34, 1.56, 0.64, 1)`
              : `width 600ms cubic-bezier(0.4, 0, 0.2, 1), opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
      >
        <div className="p-4 h-full flex flex-col" style={{ width: '100%' }}>
          {/* Mobile close button */}
          {isMobile && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-(--text-primary) flex items-center gap-2 truncate">
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="truncate">{t('aiChat.conversations') || 'Conversations'}</span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarOpen(false);
                }}
                className="h-8 w-8 p-0 shrink-0 z-50 relative"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Desktop header */}
          {!isMobile && (
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-(--text-primary) flex items-center gap-2 truncate">
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="truncate">{t('aiChat.conversations') || 'Conversations'}</span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewConversation}
                className="h-8 w-8 p-0 shrink-0"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Mobile new chat button */}
          {isMobile && (
            <Button variant="secondary" onClick={handleNewConversation} className="w-full mb-4">
              <Plus className="w-4 h-4 mr-2" />
              {t('aiChat.newChat') || 'New Chat'}
            </Button>
          )}

          {/* Conversation search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('aiChat.searchChats', { defaultValue: 'Search chats…' })}
              className="w-full bg-(--background) border border-(--border) rounded-lg py-2 pl-9 pr-3 text-xs text-(--text-primary) outline-none focus:border-(--primary)"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            <AnimatePresence>
              {visibleConversations.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-8 text-(--text-muted) text-sm"
                >
                  {t('aiChat.noConversations') || 'No conversations yet'}
                </motion.div>
              ) : (
                visibleConversations.map((conv) => (
                  <div
                    key={conv._id}
                    className={`group relative flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all ${
                      activeConversationId === conv._id
                        ? 'bg-(--primary)/10 text-(--primary) border border-(--primary)/20'
                        : 'hover:bg-(--background-subtle) border border-transparent'
                    }`}
                    onClick={() => handleSelectConversation(conv._id)}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />

                    {editingTitleId === conv._id ? (
                      <div
                        className="flex-1 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditedTitle(conv._id);
                            if (e.key === 'Escape') cancelEditingTitle();
                          }}
                          className="flex-1 min-w-0 bg-transparent border-b border-(--primary) outline-none text-sm"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-(--success-text)"
                          onClick={() => saveEditedTitle(conv._id)}
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-(--danger-text)"
                          onClick={cancelEditingTitle}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-sm truncate block" title={conv.title}>
                          {conv.pinned && <Pin className="w-3 h-3 inline mr-1 text-(--primary)" />}
                          {conv.title}
                        </span>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-6 w-6 p-0 ${conv.pinned ? 'text-(--primary)' : ''}`}
                            onClick={(e) => handleTogglePin(conv._id, e)}
                          >
                            <Pin className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => startEditingTitle(conv, e)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => handleDeleteConversation(conv._id, e)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </aside>

      {/* Main Chat */}
      <main
        className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden ${
          !isMobile && !sidebarOpen ? 'md:ml-0' : ''
        }`}
      >
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-(--border) bg-(--card)/50 backdrop-blur shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-9 w-9 p-0 shrink-0"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg btn-gradient flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block min-w-0">
                <h1 className="font-semibold text-(--text-primary) truncate">
                  {t('aiChat.title') || 'Shield HR AI'}
                </h1>
                <p className="text-xs text-(--text-muted) truncate">
                  {user?.role === 'superadmin'
                    ? `👑 ${t('roles.superadmin')}`
                    : user?.role === 'admin'
                      ? `🛡️ ${t('roles.admin')}`
                      : `👤 ${t('roles.employee')}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <AgentSelector
              selectedAgent={selectedAgent !== 'general' ? selectedAgent : lastDetectedAgent}
              onSelect={setSelectedAgent}
              disabled={isLoading}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => setMemoryOpen(true)}
              title={t('aiChat.memory.title', { defaultValue: 'Assistant memory' })}
            >
              <Brain className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={handleShare}
              disabled={!messages.length}
              title={t('aiChat.share', { defaultValue: 'Share conversation' })}
            >
              <Share2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => handleExport('md')}
              disabled={!messages.length}
              title={t('aiChat.export', { defaultValue: 'Export as Markdown' })}
            >
              <Download className="w-4 h-4" />
            </Button>
            <Badge variant="secondary" className="hidden sm:flex gap-1 shrink-0">
              <Zap className="w-3 h-3" />
              {t('aiChat.aiPowered')}
            </Badge>
          </div>
        </header>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-0">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center overflow-hidden px-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center w-full max-w-2xl"
              >
                <div className="hidden md:flex w-16 h-16 rounded-2xl btn-gradient items-center justify-center mx-auto mb-6 shadow-lg shadow-(--primary)/20">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-(--text-primary) mb-2">
                  {t('aiChat.welcomeTitle') || 'Welcome!'} {user?.name}
                </h2>
                <p className="text-(--text-muted) mb-8">
                  {t('aiChat.welcomeSubtitle') || "I'm your AI assistant. How can I help?"}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 my-4">
                  {initialSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestion(suggestion.query)}
                      className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border border-(--border) hover:bg-(--background-subtle) hover:border-(--primary)/30 hover:shadow-lg hover:shadow-(--primary)/10 transition-all group min-w-0"
                    >
                      <div className="p-2 rounded-lg bg-(--primary)/10 group-hover:bg-(--primary)/20 transition-colors">
                        {suggestion.icon}
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-center break-words">
                        {suggestion.label}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="space-y-4 max-w-200 mx-auto mt-6 px-4 sm:px-6 lg:px-8">
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: message.isNew ? 20 : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: message.isNew ? index * 0.05 : 0 }}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback
                      className={
                        message.role === 'user'
                          ? 'bg-(--primary) text-white'
                          : 'btn-gradient text-white'
                      }
                    >
                      {message.role === 'user' ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div
                    className={`max-w-[85%] sm:max-w-[100%] ${message.role === 'user' ? 'text-right' : ''}`}
                  >
                    <Card
                      className={`p-4 border-0 shadow-sm ${
                        message.role === 'user'
                          ? 'btn-gradient text-white'
                          : 'bg-(--card) border-(--border)'
                      }`}
                    >
                      <MarkdownMessage content={message.content} isUser={message.role === 'user'} />
                    </Card>

                    {/* RAG sources, generated image, web search, artifacts */}
                    {message.role === 'assistant' &&
                      message.sources &&
                      message.sources.length > 0 && <SourcesChips sources={message.sources} />}
                    {message.role === 'assistant' && message.imagePrompt && (
                      <GeneratedImageCard prompt={message.imagePrompt} />
                    )}
                    {message.role === 'assistant' && message.webSearchQuery && (
                      <WebSearchCard query={message.webSearchQuery} />
                    )}
                    {message.role === 'assistant' &&
                      message.artifacts?.map((artifact, ai) => (
                        <ArtifactCanvas key={`${message.id}-artifact-${ai}`} artifact={artifact} />
                      ))}

                    <div
                      className={`flex items-center gap-2 mt-1 ${message.role === 'user' ? 'justify-end' : ''}`}
                    >
                      <span className="text-xs text-(--text-muted)">
                        {message.timestamp
                          ? new Date(message.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>

                      {message.role === 'assistant' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToClipboard(message.content)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-6 w-6 p-0 ${message.feedback === 'up' ? 'text-(--success-text)' : ''}`}
                            onClick={() => handleFeedback(message, 'up')}
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-6 w-6 p-0 ${message.feedback === 'down' ? 'text-(--danger-text)' : ''}`}
                            onClick={() => handleFeedback(message, 'down')}
                          >
                            <ThumbsDown className="w-3 h-3" />
                          </Button>
                          {lastAssistantMessage?.id === message.id && !isLoading && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={handleRegenerate}
                              title={t('aiChat.regenerate', { defaultValue: 'Regenerate' })}
                            >
                              <RefreshCw className="w-3 h-3" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Quick actions on the last assistant answer */}
                    {message.role === 'assistant' &&
                      lastAssistantMessage?.id === message.id &&
                      !isLoading && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {QUICK_ACTIONS.map((qa) => (
                            <button
                              key={qa}
                              onClick={() => handleQuickAction(qa)}
                              className="text-[11px] px-2 py-1 rounded-md border border-(--border) hover:bg-(--background-subtle) text-(--text-muted) transition-colors"
                            >
                              {QUICK_ACTION_ICONS[qa]}{' '}
                              {t(`aiChat.quick.${qa}`, { defaultValue: qa })}
                            </button>
                          ))}
                        </div>
                      )}

                    {/* Follow-up suggestions */}
                    {message.role === 'assistant' &&
                      message.suggestions &&
                      message.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {message.suggestions.map((suggestion, i) => (
                            <button
                              key={i}
                              onClick={() => handleSuggestion(suggestion)}
                              className="text-xs px-3 py-1.5 rounded-full bg-(--background-subtle) hover:bg-(--primary)/10 hover:text-(--primary) transition-colors border border-(--border) hover:border-(--primary)/30"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="btn-gradient text-white">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <Card className="flex items-center justify-center p-2 h-5 bg-(--card) border-(--border)">
                    <div className="flex gap-1">
                      <span
                        className="w-1 h-1 rounded-full btn-gradient animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1 h-1 rounded-full btn-gradient animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1 h-1 rounded-full btn-gradient animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </Card>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={stopGeneration}
                    className="h-7 px-2 text-xs text-(--text-muted)"
                  >
                    <Square className="w-3 h-3 mr-1" />
                    {t('aiChat.stop', { defaultValue: 'Stop' })}
                  </Button>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-(--border) bg-(--card)/50 backdrop-blur shrink-0">
          <div className="relative max-w-4xl h-14 mx-auto">
            {/* Slash command palette */}
            {slashCommands.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-(--border) bg-(--card) shadow-lg overflow-hidden max-h-64 overflow-y-auto z-50">
                {slashCommands.map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => handleSlashCommand(cmd)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-(--background-subtle) transition-colors"
                  >
                    <span className="text-xs font-medium text-(--primary)">
                      {cmd.kind === 'navigate' ? cmd.value : `/${cmd.id}`}
                    </span>
                    <span className="flex-1 text-xs text-(--text-primary) truncate">
                      {cmd.label}
                    </span>
                    {cmd.hint && (
                      <span className="text-[10px] text-(--text-muted) truncate">{cmd.hint}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                _isListening
                  ? t('chatWidget.listening')
                  : t('aiChat.inputPlaceholder') || 'Ask anything… (type / for commands)'
              }
              className="flex-1 resize-none bg-(--background) border border-(--border) rounded-xl py-4 pl-4 pr-14 text-sm text-(--text-primary) outline-none focus:border-(--primary) focus:ring-2 focus:ring-(--primary)/20 min-h-14 max-h-50 w-full"
              rows={1}
            />
            <Button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isLoading}
              className="absolute! right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg p-0"
              size="sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-xs text-center text-(--text-muted) mt-3">
            {t('aiChat.disclaimer') || 'AI may make mistakes. Please verify important information.'}
          </p>
        </div>
      </main>

      {/* Memory manager */}
      <MemoryPanel userId={userId} open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      {/* Scroll button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            className="absolute bottom-28 right-6 p-3 rounded-full btn-gradient text-white shadow-lg hover:shadow-xl transition-shadow"
          >
            <ArrowDown className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
