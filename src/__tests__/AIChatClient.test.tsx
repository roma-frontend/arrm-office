/**
 * Tests for AIChatPage (src/components/ai-chat/AIChatClient.tsx) — the full AI
 * assistant page: conversations sidebar (create/select/edit/delete), CSRF
 * handshake, streaming chat with ACTION-tag parsing, follow-up suggestions,
 * language detection, agent routing, 403 CSRF retry, NAVIGATE tags and the
 * widget handoff from sessionStorage.
 *
 * Mocks: convex/react (queries/mutations keyed by _name), generated api,
 * useAuthStore (mutable user), useMediaQuery (mutable), cssMotion, logger,
 * sonner, next/navigation, lucide, ui primitives, AgentSelector,
 * MarkdownMessage, aiAssistant/routeToAgent helpers and global fetch with a
 * streaming body for /api/chat.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Mutable fixtures (declared before jest.mock factories reference them) ─────
let mockUser: any = { id: 'user-1', role: 'admin', name: 'Anna Admin' };
let mockIsMobile = false;
let mockSuggestions: string[] = [];
let queryResults: Record<string, unknown> = {};
let paginatedResults: unknown[] | undefined = undefined;
const mutationCalls: Record<string, Array<{ args: any }>> = {};
const mutationImpl: Record<string, (...args: any[]) => Promise<unknown>> = {
  createConversation: async () => ({ conversationId: 'conv-new' }),
  updateConversationTitle: async () => undefined,
  deleteConversation: async () => undefined,
  addMessage: async () => undefined,
  autoRenameConversation: async () => undefined,
  togglePinConversation: async () => ({ success: true, pinned: true }),
  setMessageFeedback: async () => ({ success: true }),
  createShare: async () => ({ token: 'share-token', created: true }),
};
let chatResponder: (() => Promise<any>) | null = null;
let lastChatPayload: any = null;
let chatCallCount = 0;
const mockPush = jest.fn();

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback)
        return fallback.defaultValue ?? key;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Auth store / router / media query ────────────────────────────────────────
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockIsMobile,
}));

// ── CSS motion ───────────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// ── Convex: queries / mutations keyed by _name ───────────────────────────────
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    return async (...args: any[]) => {
      (mutationCalls[name] ??= []).push({ args });
      const impl = mutationImpl[name];
      if (impl) return impl(...args);
      return Promise.resolve();
    };
  },
  usePaginatedQuery: () => ({
    results: paginatedResults,
    status: 'LoadingFirstPage',
    loadMore: jest.fn(),
  }),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    aiChat: {
      listConversationsPaginated: { _name: 'listConversationsPaginated' },
      getMessages: { _name: 'getMessages' },
    },
    aiChatMutations: {
      createConversation: { _name: 'createConversation' },
      updateConversationTitle: { _name: 'updateConversationTitle' },
      deleteConversation: { _name: 'deleteConversation' },
      addMessage: { _name: 'addMessage' },
      autoRenameConversation: { _name: 'autoRenameConversation' },
      togglePinConversation: { _name: 'togglePinConversation' },
      setMessageFeedback: { _name: 'setMessageFeedback' },
      createShare: { _name: 'createShare' },
    },
    aiMemory: {
      listMemories: { _name: 'listMemories' },
    },
  },
}));

// ── Helpers / UI primitives ──────────────────────────────────────────────────
jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('@/lib/aiAssistant', () => ({
  getRoleSuggestions: jest.fn(() => mockSuggestions),
}));

jest.mock('@/lib/ai/agents', () => ({
  routeToAgent: jest.fn(() => 'general'),
}));

jest.mock('@/components/ai/AgentSelector', () => ({
  __esModule: true,
  default: ({ selectedAgent, onSelect, disabled }: any) => (
    <button
      data-testid="agent-selector"
      data-selected={selectedAgent}
      data-disabled={String(disabled)}
      onClick={() => onSelect?.('hr')}
    >
      agent-selector
    </button>
  ),
}));

jest.mock('@/components/MarkdownMessage', () => ({
  MarkdownMessage: ({ content }: any) => <span data-testid="markdown">{content}</span>,
}));

jest.mock('@/components/ai/MemoryPanel', () => ({
  MemoryPanel: ({ open }: any) => (open ? <div data-testid="memory-panel" /> : null),
}));

jest.mock('@/components/ai/AssistantExtras', () => ({
  SourcesChips: ({ sources }: any) => <div data-testid="sources-chips">{sources.join('|')}</div>,
  GeneratedImageCard: ({ prompt }: any) => <div data-testid="image-card">{prompt}</div>,
  WebSearchCard: ({ query }: any) => <div data-testid="websearch-card">{query}</div>,
  ArtifactCanvas: ({ artifact }: any) => <div data-testid="artifact-canvas">{artifact.type}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...p }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...p}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span data-testid="avatar">{children}</span>,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

jest.mock('lucide-react', () => {
  const iconNames = [
    'Sparkles',
    'Send',
    'Plus',
    'MessageSquare',
    'Bot',
    'User',
    'Copy',
    'Trash2',
    'Edit2',
    'PanelLeftClose',
    'Calendar',
    'ClipboardList',
    'Users',
    'TrendingUp',
    'Zap',
    'ArrowDown',
    'ChevronRight',
    'Check',
    'X',
    'Brain',
    'Share2',
    'Download',
    'Pin',
    'Search',
    'ThumbsUp',
    'ThumbsDown',
    'RefreshCw',
    'Square',
  ];
  const mocks: Record<string, any> = {};
  for (const name of iconNames) {
    mocks[name] = (props: any) => (
      <span data-testid={`icon-${name}`} {...props}>
        {name}
      </span>
    );
  }
  return mocks;
});

// ── Global fetch: CSRF endpoint + streaming /api/chat ────────────────────────
const mockFetch = jest.fn((url: string, opts?: any) => {
  const urlStr = String(url);
  if (urlStr.includes('/api/chat/smart-title')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Smart title' }),
    });
  }
  if (urlStr.endsWith('/api/chat')) {
    chatCallCount++;
    if (opts?.body) lastChatPayload = JSON.parse(opts.body);
    if (chatResponder) return chatResponder();
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}), body: null });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ token: 'tok-1', signature: 'sig-1' }),
  });
});

function streamBody(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (i < chunks.length) return { done: false, value: encoder.encode(chunks[i++]!) };
        return { done: true, value: undefined };
      },
    }),
  };
}

// ── Component ────────────────────────────────────────────────────────────────
import AIChatPage from '@/components/ai-chat/AIChatClient';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

const conv = { _id: 'conv-1', title: 'My chat', createdAt: '2026-01-01T00:00:00Z' };

beforeEach(() => {
  mockUser = { id: 'user-1', role: 'admin', name: 'Anna Admin' };
  mockIsMobile = false;
  queryResults = {};
  paginatedResults = undefined;
  mockSuggestions = [
    '📅 Book a vacation',
    '📋 View my tasks',
    '👥 View team calendar',
    '📊 Attendance stats',
  ];
  mockPush.mockClear();
  chatResponder = null;
  lastChatPayload = null;
  chatCallCount = 0;
  mockFetch.mockClear();
  for (const k of Object.keys(mutationCalls)) delete mutationCalls[k];
  sessionStorage.clear();
  (global as any).fetch = mockFetch;
  Element.prototype.scrollIntoView = jest.fn();
  (navigator as any).clipboard = { writeText: jest.fn() };
  (logger.error as jest.Mock).mockClear();
  (logger.log as jest.Mock).mockClear();
  (toast.error as jest.Mock).mockClear();
  (toast.success as jest.Mock).mockClear();
});

async function flushEffects() {
  await act(async () => {});
}

function typeAndSend(text: string) {
  const textarea = screen.getByPlaceholderText('aiChat.inputPlaceholder');
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.click(screen.getByTestId('icon-Send').closest('button')!);
}

function okStream(chunks: string[]) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({}),
    body: streamBody(chunks),
  });
}

describe('AIChatPage — welcome screen & sidebar', () => {
  it('renders the welcome screen with role-based suggestion cards', async () => {
    paginatedResults = [];
    render(<AIChatPage />);
    await flushEffects();

    expect(screen.getByText(/aiChat.welcomeTitle/)).toBeInTheDocument();
    expect(screen.getByText(/aiChat.welcomeSubtitle/)).toBeInTheDocument();
    expect(screen.getByText('📅 Book a vacation')).toBeInTheDocument();
    expect(screen.getByText('📋 View my tasks')).toBeInTheDocument();
    expect(screen.getByText('👥 View team calendar')).toBeInTheDocument();
    expect(screen.getByText('📊 Attendance stats')).toBeInTheDocument();
  });

  it('maps suggestion keywords to icons (tasks/team/attendance/analytics/org/security)', async () => {
    paginatedResults = [];
    mockSuggestions = [
      '📅 Book a vacation',
      '📋 view tasks now',
      '👥 team roster',
      '📊 attendance stats',
    ];
    const view = render(<AIChatPage />);
    await flushEffects();

    expect(screen.getByTestId('icon-Calendar')).toBeInTheDocument();
    expect(screen.getByTestId('icon-ClipboardList')).toBeInTheDocument();
    expect(screen.getByTestId('icon-Users')).toBeInTheDocument();
    expect(screen.getByTestId('icon-TrendingUp')).toBeInTheDocument();
    view.unmount();

    mockSuggestions = [
      '📈 analytics overview',
      '🏢 organization chart',
      '🔒 security settings',
      '📊 посещаемость',
    ];
    mockSuggestions = [
      '📈 analytics overview',
      '🏢 organization chart',
      '👥 team roster',
      '🔒 security settings',
    ];
    render(<AIChatPage />);
    await flushEffects();
    expect(screen.getAllByTestId('icon-TrendingUp').length).toBeGreaterThanOrEqual(1); // analytics
    expect(screen.getAllByTestId('icon-Zap').length).toBeGreaterThanOrEqual(2); // badge + security
    expect(screen.getAllByTestId('icon-Users').length).toBeGreaterThanOrEqual(2); // team + org
  });

  it('shows the empty-conversations state', async () => {
    paginatedResults = [];
    render(<AIChatPage />);
    await flushEffects();
    expect(screen.getByText('aiChat.noConversations')).toBeInTheDocument();
  });

  it('lists conversations and auto-selects the first one', async () => {
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    expect(screen.getByText('My chat')).toBeInTheDocument();
    // header title + role label
    expect(screen.getByText('aiChat.title')).toBeInTheDocument();
    expect(screen.getByText('🛡️ roles.admin')).toBeInTheDocument();
  });

  it('renders the role label for superadmin and employee', async () => {
    paginatedResults = [];
    mockUser = { id: 'u', role: 'superadmin', name: 'Boss' };
    const { unmount } = render(<AIChatPage />);
    await flushEffects();
    expect(screen.getByText('👑 roles.superadmin')).toBeInTheDocument();
    unmount();

    mockUser = { id: 'u', role: 'employee', name: 'Emp' };
    render(<AIChatPage />);
    await flushEffects();
    expect(screen.getByText('👤 roles.employee')).toBeInTheDocument();
  });

  it('restores messages from the sessionStorage widget handoff', async () => {
    sessionStorage.setItem(
      'ai-chat-handoff',
      JSON.stringify([
        { id: 'h1', role: 'user', content: 'handoff message', timestamp: new Date().toISOString() },
      ]),
    );
    paginatedResults = [];
    render(<AIChatPage />);
    await flushEffects();

    expect(screen.getByText('handoff message')).toBeInTheDocument();
    expect(sessionStorage.getItem('ai-chat-handoff')).toBeNull();
  });

  it('logs an error when the CSRF fetch fails', async () => {
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('network down')));
    render(<AIChatPage />);
    await flushEffects();
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs when the CSRF endpoint returns a non-ok status', async () => {
    (global as any).fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
    );
    render(<AIChatPage />);
    await flushEffects();
    expect(logger.error).toHaveBeenCalled();
  });

  it('creates a conversation from the desktop Plus button', async () => {
    paginatedResults = [];
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('icon-Plus').closest('button')!);
    await waitFor(() => expect(mutationCalls.createConversation).toHaveLength(1));
    expect(mutationCalls.createConversation[0]!.args[0]).toEqual({
      userId: 'user-1',
      title: 'aiChat.newChat',
    });
    expect(toast.success).toHaveBeenCalledWith('aiChat.newChatCreated');
  });

  it('does nothing on Plus without a user', async () => {
    mockUser = null;
    paginatedResults = [];
    render(<AIChatPage />);
    await flushEffects();
    fireEvent.click(screen.getByTestId('icon-Plus').closest('button')!);
    await flushEffects();
    expect(mutationCalls.createConversation).toBeUndefined();
  });

  it('shows an error toast when creating a conversation fails', async () => {
    paginatedResults = [];
    const orig = mutationImpl.createConversation!;
    mutationImpl.createConversation = async () => {
      throw new Error('boom');
    };
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('icon-Plus').closest('button')!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('aiChat.createError'));
    mutationImpl.createConversation = orig;
  });

  it('opens/closes the sidebar on mobile and closes it on conversation select', async () => {
    mockIsMobile = true;
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    // sidebar closed initially on mobile → chevron toggle visible
    expect(screen.getByTestId('icon-ChevronRight')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('icon-ChevronRight').closest('button')!);
    await flushEffects();
    // overlay visible when the sidebar is open
    expect(document.querySelector('[class*="bg-black/50"]')).toBeTruthy();
    expect(screen.getByTestId('icon-PanelLeftClose')).toBeInTheDocument();

    // close via the overlay click
    fireEvent.click(document.querySelector('[class*="bg-black/50"]')!);
    await flushEffects();
    expect(document.querySelector('[class*="bg-black/50"]')).toBeNull();

    // reopen and close via the X button
    fireEvent.click(screen.getByTestId('icon-ChevronRight').closest('button')!);
    await flushEffects();
    fireEvent.click(screen.getByTestId('icon-X').closest('button')!);
    await flushEffects();
    expect(document.querySelector('[class*="bg-black/50"]')).toBeNull();

    // open again, select a conversation → sidebar closes (overlay gone)
    fireEvent.click(screen.getByTestId('icon-ChevronRight').closest('button')!);
    await flushEffects();
    fireEvent.click(screen.getByText('My chat'));
    await flushEffects();
    expect(document.querySelector('[class*="bg-black/50"]')).toBeNull();
    expect(screen.getByTestId('icon-ChevronRight')).toBeInTheDocument();
  });

  it('creates a conversation from the mobile new-chat button', async () => {
    mockIsMobile = true;
    paginatedResults = [];
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('icon-ChevronRight').closest('button')!);
    await flushEffects();
    fireEvent.click(screen.getByText('aiChat.newChat'));
    await waitFor(() => expect(mutationCalls.createConversation).toHaveLength(1));
  });
});

describe('AIChatPage — conversation management', () => {
  it('loads saved messages for the active conversation', async () => {
    paginatedResults = [conv];
    queryResults.getMessages = [
      { _id: 'm1', role: 'user', content: 'saved question', createdAt: '2026-01-01T00:00:00Z' },
      { _id: 'm2', role: 'assistant', content: 'saved answer', createdAt: '2026-01-01T00:00:01Z' },
    ];
    render(<AIChatPage />);
    await flushEffects();

    expect(screen.getByText('saved question')).toBeInTheDocument();
    expect(screen.getByText('saved answer')).toBeInTheDocument();
  });

  it('edits a conversation title on Enter', async () => {
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('icon-Edit2').closest('button')!);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mutationCalls.updateConversationTitle).toHaveLength(1));
    expect(mutationCalls.updateConversationTitle[0]!.args[0]).toEqual({
      conversationId: 'conv-1',
      title: 'Renamed',
    });
    await waitFor(() => expect(screen.getByText('Renamed')).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('aiChat.titleUpdated');
  });

  it('saves the edited title via the check button and cancels on Escape', async () => {
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    // save via Check button
    fireEvent.click(screen.getByTestId('icon-Edit2').closest('button')!);
    const input1 = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input1, { target: { value: 'Via check' } });
    fireEvent.click(screen.getByTestId('icon-Check').closest('button')!);
    await waitFor(() => expect(mutationCalls.updateConversationTitle).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('Via check')).toBeInTheDocument());

    // cancel on Escape
    fireEvent.click(screen.getByTestId('icon-Edit2').closest('button')!);
    const input2 = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input2, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input2, { key: 'Escape' });
    expect(document.querySelector('input[type="text"]')).toBeNull();
    expect(screen.queryByText('Discarded')).toBeNull();
  });

  it('shows an error toast when the title update fails', async () => {
    paginatedResults = [conv];
    const orig = mutationImpl.updateConversationTitle!;
    mutationImpl.updateConversationTitle = async () => {
      throw new Error('boom');
    };
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('icon-Edit2').closest('button')!);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('aiChat.updateError'));
    mutationImpl.updateConversationTitle = orig;
  });

  it('deletes a conversation and clears the active one', async () => {
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('icon-Trash2').closest('button')!);
    await waitFor(() => expect(mutationCalls.deleteConversation).toHaveLength(1));
    expect(mutationCalls.deleteConversation[0]!.args[0]).toEqual({ conversationId: 'conv-1' });
    // active conversation cleared → welcome screen back
    await waitFor(() => expect(screen.getByText(/aiChat.welcomeTitle/)).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('aiChat.chatDeleted');
  });

  it('shows an error toast when deleting fails', async () => {
    paginatedResults = [conv];
    const orig = mutationImpl.deleteConversation!;
    mutationImpl.deleteConversation = async () => {
      throw new Error('boom');
    };
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('icon-Trash2').closest('button')!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('aiChat.deleteError'));
    mutationImpl.deleteConversation = orig;
  });
});

describe('AIChatPage — sending messages', () => {
  it('keeps the send button disabled for empty input', async () => {
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();
    expect(screen.getByTestId('icon-Send').closest('button')).toBeDisabled();
  });

  it('does nothing without a user', async () => {
    mockUser = null;
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    const textarea = screen.getByPlaceholderText('aiChat.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await flushEffects();
    expect(mutationCalls.addMessage).toBeUndefined();
  });

  it('warns when the CSRF token is not ready yet', async () => {
    (global as any).fetch = jest.fn(() => new Promise(() => {}));
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('hello');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('CSRF token is not ready yet'));
  });

  it('submits on Enter and keeps Shift+Enter for newlines', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['done']);
    render(<AIChatPage />);
    await flushEffects();

    const textarea = screen.getByPlaceholderText('aiChat.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: 'line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    await flushEffects();
    expect(mutationCalls.addMessage).toBeUndefined();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(mutationCalls.addMessage).toHaveLength(2));
  });

  it('sends a message optimistically and streams the assistant reply', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['Hello', ' AI!']);
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('Hello AI');

    await waitFor(() => expect(mutationCalls.addMessage).toHaveLength(2), { timeout: 3000 });
    expect(mutationCalls.addMessage[0]!.args[0]).toMatchObject({
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello AI',
    });
    // user message rendered immediately
    expect(screen.getByText('Hello AI')).toBeInTheDocument();
    // streamed assistant content assembled
    await waitFor(() => expect(screen.getByText('Hello AI!')).toBeInTheDocument());

    // payload: language detection (en) + agent routing
    expect(lastChatPayload).toMatchObject({
      userId: 'user-1',
      lang: 'en',
      agent: 'general',
      messages: [{ role: 'user', content: 'Hello AI' }],
    });

    // admin role → admin follow-up suggestions
    expect(screen.getByText('chatWidget.whoOnLeaveToday')).toBeInTheDocument();
    expect(screen.getByText('chatWidget.teamStats')).toBeInTheDocument();
    expect(screen.getByText('chatWidget.pendingApprovals')).toBeInTheDocument();

    // clicking a follow-up suggestion copies it into the input
    fireEvent.click(screen.getByText('chatWidget.whoOnLeaveToday'));
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText('aiChat.inputPlaceholder') as HTMLTextAreaElement).value,
      ).toBe('chatWidget.whoOnLeaveToday'),
    );
  });

  it('detects Russian and Armenian input language', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['ok']);
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('Привет, покажи баланс');
    await waitFor(() => expect(lastChatPayload?.lang).toBe('ru'));

    typeAndSend('Ողջույն');
    await waitFor(() => expect(lastChatPayload?.lang).toBe('hy'));
  });

  it('parses ACTION tags out of the streamed response', async () => {
    paginatedResults = [conv];
    chatResponder = () =>
      okStream(['<ACTION>{"type":"show","payload":{"x":1}}</ACTION>', 'Result text']);
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('run it');
    await waitFor(() => expect(screen.getByText('Result text')).toBeInTheDocument());
    expect(screen.queryByText(/ACTION/)).toBeNull();
  });

  it('skips malformed ACTION tags', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['<ACTION>not json</ACTION>', 'ok text']);
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('go');
    await waitFor(() => expect(screen.getByText('ok text')).toBeInTheDocument());
  });

  it('retries once with a refreshed CSRF token on 403', async () => {
    paginatedResults = [conv];
    chatResponder = () => {
      if (chatCallCount === 1) {
        return Promise.resolve({ ok: false, status: 403, json: async () => ({ error: 'csrf' }) });
      }
      return okStream(['retried']);
    };
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('hello');
    await waitFor(() => expect(screen.getByText('retried')).toBeInTheDocument());
    expect(chatCallCount).toBe(2);
  });

  it('shows a toast when creating a conversation during send fails', async () => {
    paginatedResults = [];
    const orig = mutationImpl.createConversation!;
    mutationImpl.createConversation = async () => {
      throw new Error('boom');
    };
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('hello');
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('toasts.conversationCreateFailed'),
    );
    mutationImpl.createConversation = orig;
  });

  it('logs and continues when saving messages fails', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['still works']);
    const orig = mutationImpl.addMessage!;
    mutationImpl.addMessage = async () => {
      throw new Error('save boom');
    };
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('hello');
    // both the user and the assistant save fail → both catch blocks log
    await waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith('[Save message error]:', expect.anything()),
    );
    await waitFor(() => expect(screen.getByText('still works')).toBeInTheDocument());
    expect(logger.error).toHaveBeenCalledWith('[Save AI message error]:', expect.anything());
    mutationImpl.addMessage = orig;
  });

  it('logs when the CSRF refresh fails after a 403 and shows the server error', async () => {
    paginatedResults = [conv];
    let csrfCalls = 0;
    (global as any).fetch = jest.fn((url: string, opts?: any) => {
      if (String(url).includes('/api/chat')) {
        chatCallCount++;
        if (chatCallCount === 1) {
          return Promise.resolve({ ok: false, status: 403, json: async () => ({}) });
        }
        return okStream(['after retry']);
      }
      csrfCalls++;
      if (csrfCalls > 1) return Promise.reject(new Error('csrf refresh down'));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ token: 't', signature: 's' }),
      });
    });
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('hello');
    await waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith('[CSRF refresh failed]', expect.anything()),
    );
    // the original 403 response is surfaced as an error message
    await waitFor(() => expect(screen.getByText(/❌ Server error 403/)).toBeInTheDocument());
  });

  it('shows the server error in an assistant message on failure', async () => {
    paginatedResults = [conv];
    chatResponder = () =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('hello');
    await waitFor(() => expect(screen.getByText(/❌ boom/)).toBeInTheDocument());
    expect(toast.error).toHaveBeenCalledWith('aiChat.error');
  });

  it('navigates when the response contains a NAVIGATE tag', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['<NAVIGATE>/dashboard</NAVIGATE>', 'go now']);
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('open dashboard');
    await waitFor(() => expect(screen.getByText('go now')).toBeInTheDocument(), { timeout: 3000 });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'), { timeout: 3000 });
  });

  it('creates a conversation on first send and auto-renames it', async () => {
    paginatedResults = [];
    queryResults.getMessages = [];
    chatResponder = () => okStream(['renamed!']);
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('Check my balance');

    await waitFor(() => expect(mutationCalls.createConversation).toHaveLength(1));
    expect(mutationCalls.createConversation[0]!.args[0].title).toBe('Check my balance');

    // Smart title: /api/chat/smart-title → updateConversationTitle
    await waitFor(() => expect(mutationCalls.updateConversationTitle).toHaveLength(1));
    expect(mutationCalls.updateConversationTitle[0]!.args[0]).toEqual({
      conversationId: 'conv-new',
      title: 'Smart title',
    });
  });

  it('logs when auto-renaming the conversation fails', async () => {
    paginatedResults = [];
    queryResults.getMessages = [];
    chatResponder = () => okStream(['renamed!']);
    const orig = mutationImpl.updateConversationTitle!;
    mutationImpl.updateConversationTitle = async () => {
      throw new Error('rename boom');
    };
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('Check my balance');
    await waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith('[Smart title error]:', expect.anything()),
    );
    mutationImpl.updateConversationTitle = orig;
  });

  it('uses the manually selected agent for routing', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['agent done']);
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('agent-selector'));
    typeAndSend('help me');
    await waitFor(() => expect(lastChatPayload?.agent).toBe('hr'));
    expect(screen.getByTestId('agent-selector').dataset.selected).toBe('hr');
  });

  it('triggers a send from a welcome suggestion card', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['done']);
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByText('📅 Book a vacation'));
    // the suggestion is copied into the input (handleSuggestion strips the emoji)
    await waitFor(
      () =>
        expect(
          (screen.getByPlaceholderText('aiChat.inputPlaceholder') as HTMLTextAreaElement).value,
        ).toBe('Book a vacation'),
      { timeout: 3000 },
    );
  });

  it('copies assistant content to the clipboard', async () => {
    paginatedResults = [conv];
    queryResults.getMessages = [
      { _id: 'm1', role: 'assistant', content: 'copy me', createdAt: '2026-01-01T00:00:00Z' },
    ];
    render(<AIChatPage />);
    await flushEffects();

    fireEvent.click(screen.getByTestId('icon-Copy').closest('button')!);
    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith('copy me');
    expect(toast.success).toHaveBeenCalledWith('aiChat.copied');
  });

  it('shows the typing indicator while streaming', async () => {
    paginatedResults = [conv];
    chatResponder = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
        body: {
          getReader: () => ({
            // never resolves → isLoading stays true
            read: () => new Promise(() => {}),
          }),
        },
      });
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('wait');
    await waitFor(() => expect(document.querySelectorAll('.animate-bounce')).toHaveLength(3));
  });

  it('shows follow-up suggestions for leave/booking responses', async () => {
    paginatedResults = [conv];
    chatResponder = () => okStream(['Your leave was submitted for approval']);
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('ask');
    await waitFor(() => expect(screen.getByText('chatWidget.showBalance')).toBeInTheDocument());
    expect(screen.getByText('chatWidget.viewUpcoming')).toBeInTheDocument();
    expect(screen.getByText('chatWidget.whoOnLeave')).toBeInTheDocument();
  });

  it('shows hardcoded suggestions for sick/balance/cancel responses', async () => {
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    chatResponder = () => okStream(['Please visit a doctor tomorrow']);
    typeAndSend('sick?');
    await waitFor(() =>
      expect(screen.getByText('🤒 Book sick leave for today')).toBeInTheDocument(),
    );

    chatResponder = () => okStream(['Your balance is 12 days remaining']);
    typeAndSend('balance');
    await waitFor(() => expect(screen.getByText('📊 Show my leave history')).toBeInTheDocument());

    chatResponder = () => okStream(['The request was canceled']);
    typeAndSend('cancel');
    await waitFor(() => expect(screen.getByText('📋 Show my pending leaves')).toBeInTheDocument());

    chatResponder = () => okStream(['Your team calendar is ready']);
    typeAndSend('team');
    await waitFor(() => expect(screen.getByText('📅 Show team calendar')).toBeInTheDocument());
  });

  it('shows default suggestions for an employee', async () => {
    mockUser = { id: 'user-1', role: 'employee', name: 'Emp' };
    paginatedResults = [conv];
    chatResponder = () => okStream(['Nothing special here']);
    render(<AIChatPage />);
    await flushEffects();

    typeAndSend('hi');
    await waitFor(() => expect(screen.getByText('📆 Book a vacation')).toBeInTheDocument());
    expect(screen.getByText('chatWidget.showBalance')).toBeInTheDocument();
    expect(screen.getByText('👥 Who is on leave this week?')).toBeInTheDocument();
  });
});

describe('AIChatPage — scroll & misc', () => {
  it('shows the scroll-to-bottom button when scrolled up and scrolls on click', async () => {
    paginatedResults = [conv];
    queryResults.getMessages = [
      { _id: 'm1', role: 'user', content: 'old', createdAt: '2026-01-01T00:00:00Z' },
    ];
    render(<AIChatPage />);
    await flushEffects();

    const container = document.querySelector('div.overflow-y-auto.p-0') as HTMLDivElement;
    expect(container).toBeTruthy();
    Object.defineProperty(container, 'scrollTop', { value: 0, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });
    fireEvent.scroll(container);

    expect(screen.getByTestId('icon-ArrowDown')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('icon-ArrowDown').closest('button')!);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('toggles the sidebar via the header button on desktop', async () => {
    paginatedResults = [conv];
    render(<AIChatPage />);
    await flushEffects();

    expect(screen.getByTestId('icon-PanelLeftClose')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('icon-PanelLeftClose').closest('button')!);
    await flushEffects();
    expect(screen.getByTestId('icon-ChevronRight')).toBeInTheDocument();
  });
});
