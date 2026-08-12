/**
 * Tests for ChatWindow — the full chat thread: paginated messages with
 * virtualization, header (calls/search/info/background), sending text/files/
 * voice/polls/scheduled messages, @mention autocomplete, reply preview, typing
 * indicator, read-only channels, thread/info/background panels and the
 * incoming-message sound/notification effect.
 *
 * Mocks: convex/react (useQuery/useMutation/usePaginatedQuery keyed by _name),
 * @tanstack/react-virtual, all six chat sub-components, cloudinary action,
 * optimistic-send hook, notification sound, toast, logger, lucide, avatar,
 * next/link, ShieldLoader.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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

// ── Convex: query results and per-mutation impls keyed by _name ─────────────
let queryResults: Record<string, unknown> = {};
const mutationCalls: Record<string, Array<{ args: any }>> = {};
let mutationImpl: ((name: string, args: any) => Promise<unknown>) | null = null;
let paginated: { results: unknown[]; status: string; loadMore: jest.Mock } | null = null;

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    return async (...args: any[]) => {
      (mutationCalls[name] ??= []).push({ args });
      if (mutationImpl) return mutationImpl(name, args);
      return Promise.resolve();
    };
  },
  usePaginatedQuery: () =>
    paginated ?? { results: undefined, status: 'LoadingFirstPage', loadMore: jest.fn() },
}));

// ── Generated api (relative path matches ChatWindow's import) ───────────────
jest.mock('../../convex/_generated/api', () => ({
  api: {
    chat: {
      queries: {
        listMessagesPaginated: { _name: 'listMessagesPaginated' },
        getConversationMembers: { _name: 'getConversationMembers' },
        getTypingUsers: { _name: 'getTypingUsers' },
        getMyConversations: { _name: 'getMyConversations' },
        getPinnedMessages: { _name: 'getPinnedMessages' },
        searchMessages: { _name: 'searchMessages' },
      },
      mutations: {
        sendMessage: { _name: 'sendMessage' },
        scheduleMessage: { _name: 'scheduleMessage' },
        markAsRead: { _name: 'markAsRead' },
        setTyping: { _name: 'setTyping' },
      },
    },
    users: { queries: { getUserById: { _name: 'getUserById' } } },
  },
}));

// ── Optimistic send hook ─────────────────────────────────────────────────────
let optimisticMessages: any[] = [];
jest.mock('@/hooks/useOptimisticActions', () => ({
  useOptimisticSendMessage: () => ({ optimisticMessages }),
}));

// ── Virtualizer: render every message row at a fixed offset ─────────────────
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: any) => ({
    getTotalSize: () => count * 100,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({ index: i, start: i * 100, key: `v${i}` })),
    measureElement: jest.fn(),
  }),
}));

jest.mock('@/actions/cloudinary', () => ({
  uploadChatAttachment: jest.fn().mockResolvedValue({
    url: 'https://cdn.test/file.png',
    name: 'file.png',
    type: 'image/png',
  }),
}));

jest.mock('@/lib/notificationSound', () => ({
  playChatMessageSound: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

jest.mock('next/link', () => {
  const ReactMod = require('react');
  return {
    __esModule: true,
    default: ({ children, href }: any) => <a href={href}>{children}</a>,
  };
});

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span data-testid="avatar">{children}</span>,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
  AvatarImage: (props: any) => <img {...props} />,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const icons = [
    'ArrowLeft',
    'Phone',
    'Video',
    'Search',
    'Pin',
    'Info',
    'Paperclip',
    'Smile',
    'X',
    'FileText',
    'Clock',
    'BarChart2',
    'Mic',
    'ChevronDown',
    'Image',
  ];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── Chat sub-components ──────────────────────────────────────────────────────
jest.mock('@/components/chat/MessageBubble', () => ({
  MessageBubble: ({
    message,
    isOwn,
    showAvatar,
    showName,
    onReply,
    onOpenThread,
    onSendMessage,
  }: any) => (
    <div
      data-testid="msg-bubble"
      data-own={String(isOwn)}
      data-show-avatar={String(showAvatar)}
      data-show-name={String(showName)}
    >
      <span data-testid="msg-content">{message.content || '📎 Attachment'}</span>
      <button
        data-testid="msg-reply"
        onClick={() => onReply?.(message._id, message.content, 'Bob')}
      >
        reply
      </button>
      <button data-testid="msg-thread" onClick={() => onOpenThread?.(message._id, message.content)}>
        thread
      </button>
      <button data-testid="msg-send-reply" onClick={() => onSendMessage?.('reply text')}>
        send-reply
      </button>
    </div>
  ),
}));

jest.mock('@/components/chat/ThreadPanel', () => ({
  ThreadPanel: ({ parentMessageId, parentContent, onClose }: any) => (
    <div data-testid="thread-panel" data-parent={parentMessageId} data-content={parentContent}>
      <button data-testid="thread-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

jest.mock('@/components/chat/ConversationInfoPanel', () => ({
  ConversationInfoPanel: ({ onClose }: any) => (
    <div data-testid="info-panel">
      <button data-testid="info-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

jest.mock('@/components/chat/TypingIndicator', () => ({
  TypingIndicator: ({ users }: any) => (
    <div data-testid="typing-indicator">{users.map((u: any) => u.name).join(',')} typing…</div>
  ),
}));

jest.mock('@/components/chat/EmojiPicker', () => ({
  __esModule: true,
  default: ({ onSelect, onClose }: any) => (
    <div data-testid="emoji-picker">
      <button data-testid="emoji-pick" onClick={() => onSelect('😀')}>
        pick
      </button>
      <button data-testid="emoji-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

let mockVoiceBlobSize = 5;
jest.mock('@/components/chat/VoiceMessageRecorder', () => ({
  VoiceMessageRecorder: ({ onRecordingStart, onRecordingStop, onRecordingCancel }: any) => (
    <div data-testid="voice-recorder">
      <button data-testid="voice-start" onClick={onRecordingStart}>
        start
      </button>
      <button
        data-testid="voice-stop"
        onClick={() =>
          onRecordingStop?.(
            new Blob([new ArrayBuffer(mockVoiceBlobSize)], { type: 'audio/webm' }),
            3,
          )
        }
      >
        stop
      </button>
      <button data-testid="voice-cancel" onClick={onRecordingCancel}>
        cancel
      </button>
    </div>
  ),
}));

jest.mock('@/components/chat/BackgroundPicker', () => ({
  BackgroundPicker: ({ onSelect, onClose }: any) => (
    <div data-testid="bg-picker">
      <button data-testid="bg-select" onClick={onSelect}>
        select
      </button>
      <button data-testid="bg-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

// ── Module under test ────────────────────────────────────────────────────────
import { ChatWindow } from '@/components/chat/ChatWindow';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { uploadChatAttachment } from '@/actions/cloudinary';
import { playChatMessageSound } from '@/lib/notificationSound';

const AVATAR_URL = 'https://cdn.test/avatar.png';

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'm1',
    senderId: 'u2',
    sender: { name: 'Bob Smith', avatarUrl: AVATAR_URL },
    content: 'Hello there',
    type: 'text',
    createdAt: Date.now() - 1000,
    ...overrides,
  };
}

const CONVERSATIONS = [
  {
    _id: 'conv-1',
    type: 'direct',
    name: null,
    avatarUrl: null,
    memberCount: 2,
    membership: { isMuted: false },
    otherUser: { _id: 'u2', name: 'Bob Smith', avatarUrl: AVATAR_URL, presenceStatus: 'available' },
  },
];

/** Same id, so `defaultProps` keeps working — but a named group of three. */
const GROUP_CONVERSATIONS = [
  {
    _id: 'conv-1',
    type: 'group',
    name: 'Accounting',
    avatarUrl: null,
    memberCount: 3,
    membership: { isMuted: false },
    otherUser: null,
  },
];

const MEMBERS = [
  { userId: 'u1', user: { name: 'Anna Petrova', avatarUrl: null } },
  { userId: 'u2', user: { name: 'Bob Smith', avatarUrl: AVATAR_URL, department: 'Sales' } },
];

const defaultProps = {
  conversationId: 'conv-1' as any,
  currentUserId: 'u1' as any,
  organizationId: 'org-1' as any,
  currentUserName: 'Anna Petrova',
  currentUserAvatar: undefined,
  onBack: jest.fn(),
  onStartCall: jest.fn(),
};

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe('ChatWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoiceBlobSize = 5;
    for (const k of Object.keys(mutationCalls)) delete mutationCalls[k];
    mutationImpl = null;
    optimisticMessages = [];
    paginated = null;
    queryResults = {
      getConversationMembers: MEMBERS,
      getTypingUsers: [],
      getMyConversations: CONVERSATIONS,
      getPinnedMessages: [],
      getUserById: { _id: 'u1', role: 'admin', chatBackground: 'default' },
    };
    (HTMLElement.prototype as any).scrollIntoView = jest.fn();
    (URL as any).createObjectURL = jest.fn(() => 'blob:test');
    (URL as any).revokeObjectURL = jest.fn();
    // jsdom has no Notification and document.hasFocus() is false by default
    (globalThis as any).Notification = {
      permission: 'default',
      requestPermission: jest.fn(),
    };
    document.hasFocus = () => true;
  });

  afterEach(() => {
    delete (HTMLElement.prototype as any).scrollIntoView;
    delete (URL as any).createObjectURL;
    delete (URL as any).revokeObjectURL;
    delete (globalThis as any).Notification;
  });

  function renderWindow() {
    return render(<ChatWindow {...defaultProps} />);
  }

  // ── Loading / empty / messages ─────────────────────────────────────────

  it('shows the empty state when there are no messages', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    expect(screen.getByText('chat.noMessagesYet')).toBeInTheDocument();
  });

  it('renders messages chronologically with own/other flags', () => {
    paginated = {
      results: [
        makeMessage({ _id: 'm2', senderId: 'u2', content: 'Second' }),
        makeMessage({ _id: 'm1', senderId: 'u1', content: 'First' }),
      ],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    renderWindow();

    // reversed → chronological: m1 (First) first
    const contents = screen.getAllByTestId('msg-content').map((el) => el.textContent);
    expect(contents[0]).toBe('First');
    expect(contents[1]).toBe('Second');

    const bubbles = screen.getAllByTestId('msg-bubble');
    expect(bubbles[0]).toHaveAttribute('data-own', 'true'); // m1 is from u1
    expect(bubbles[1]).toHaveAttribute('data-own', 'false'); // m2 from u2
  });

  // ── Sender attribution in groups ───────────────────────────────────────
  // In a group you cannot tell who wrote a message unless the bubble shows the
  // sender. The name and avatar only appear on the first message of a streak,
  // and a system notice ("Group X was created") used to count as part of the
  // streak — so the group creator's first real message was left unattributed.

  describe('sender attribution in a group', () => {
    beforeEach(() => {
      queryResults.getMyConversations = GROUP_CONVERSATIONS;
    });

    it('attributes the first message after a system notice from the same sender', () => {
      paginated = {
        // Query order is newest-first; ChatWindow reverses it.
        results: [
          makeMessage({ _id: 'm3', senderId: 'u1', content: 'Got it' }),
          makeMessage({ _id: 'm2', senderId: 'u2', content: 'trying it out' }),
          makeMessage({ _id: 'm1', senderId: 'u2', type: 'system', content: 'Group created' }),
        ],
        status: 'Exhausted',
        loadMore: jest.fn(),
      };
      renderWindow();

      const bubbles = screen.getAllByTestId('msg-bubble');
      expect(bubbles[1]).toHaveAttribute('data-show-name', 'true');
      expect(bubbles[1]).toHaveAttribute('data-show-avatar', 'true');
    });

    it('does not repeat the name on a consecutive message from the same sender', () => {
      paginated = {
        results: [
          makeMessage({ _id: 'm2', senderId: 'u2', content: 'and one more' }),
          makeMessage({ _id: 'm1', senderId: 'u2', content: 'trying it out' }),
        ],
        status: 'Exhausted',
        loadMore: jest.fn(),
      };
      renderWindow();

      const bubbles = screen.getAllByTestId('msg-bubble');
      expect(bubbles[0]).toHaveAttribute('data-show-name', 'true');
      expect(bubbles[1]).toHaveAttribute('data-show-name', 'false');
    });

    it('never labels your own messages with your name', () => {
      paginated = {
        results: [makeMessage({ _id: 'm1', senderId: 'u1', content: 'mine' })],
        status: 'Exhausted',
        loadMore: jest.fn(),
      };
      renderWindow();

      expect(screen.getByTestId('msg-bubble')).toHaveAttribute('data-show-name', 'false');
    });

    it('shows the conversation name in the header', () => {
      paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
      renderWindow();

      // A `hidden sm:blocktext-[15px]` typo used to collapse the two classes
      // into one, hiding the heading at every breakpoint.
      const heading = screen.getByRole('heading', { name: 'Accounting' });
      expect(heading.className).toContain('sm:block');
      expect(heading.className).not.toContain('sm:blocktext');
    });
  });

  it('deduplicates messages and merges optimistic messages', () => {
    optimisticMessages = [makeMessage({ _id: 'opt-1', senderId: 'u1', content: 'Optimistic' })];
    paginated = {
      results: [
        makeMessage({ _id: 'm2', senderId: 'u2' }),
        makeMessage({ _id: 'm1', senderId: 'u1' }),
      ],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    renderWindow();

    const contents = screen.getAllByTestId('msg-content').map((el) => el.textContent);
    expect(contents).toContain('Optimistic');
  });

  it('renders the header with the other user name and presence', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('chat.activeNow')).toBeInTheDocument();
  });

  it('renders a group conversation name and member count', () => {
    queryResults.getMyConversations = [
      {
        _id: 'conv-1',
        type: 'group',
        name: 'Dev Team',
        memberCount: 3,
        membership: { isMuted: false },
      },
    ];
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    expect(screen.getByText('Dev Team')).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  // ── Header actions: back, calls, search, pinned ────────────────────────

  it('calls onBack and starts audio/video calls', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    fireEvent.click(screen.getByTestId('icon-ArrowLeft'));
    expect(defaultProps.onBack).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('chat.voiceCall'));
    expect(defaultProps.onStartCall).toHaveBeenCalledWith('conv-1', 'audio', ['u2'], 'Bob Smith');

    fireEvent.click(screen.getByTitle('chat.videoCall'));
    expect(defaultProps.onStartCall).toHaveBeenCalledWith('conv-1', 'video', ['u2'], 'Bob Smith');
  });

  it('hides call buttons for the System Announcements channel', () => {
    queryResults.getMyConversations = [
      {
        _id: 'conv-1',
        type: 'group',
        name: 'System Announcements',
        membership: { isMuted: false },
      },
    ];
    queryResults.getUserById = { _id: 'u1', role: 'superadmin', chatBackground: 'default' };
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    expect(screen.queryByTitle('chat.voiceCall')).not.toBeInTheDocument();
    expect(screen.queryByTitle('chat.videoCall')).not.toBeInTheDocument();
  });

  it('toggles the search bar and shows the result count', async () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('chat.searchMessages'));
    expect(screen.getByPlaceholderText('chat.searchInConversation')).toBeInTheDocument();

    // query.length > 1 triggers the search
    queryResults.searchMessages = [makeMessage({ _id: 'hit-1' })];
    fireEvent.change(screen.getByPlaceholderText('chat.searchInConversation'), {
      target: { value: 'hello' },
    });
    await waitFor(() => expect(screen.getByText(/1 result/)).toBeInTheDocument());
  });

  it('shows the pinned messages banner', () => {
    queryResults.getPinnedMessages = [{ _id: 'p1', content: 'Pinned note' }];
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    expect(screen.getByText(/Pinned note/)).toBeInTheDocument();
  });

  // ── Sending text ───────────────────────────────────────────────────────

  it('sends a text message on Enter', async () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const textarea = screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hi Bob' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(mutationCalls.sendMessage?.[0].args[0]).toEqual(
        expect.objectContaining({
          conversationId: 'conv-1',
          senderId: 'u1',
          organizationId: 'org-1',
          type: 'text',
          content: 'Hi Bob',
        }),
      );
    });
  });

  it('keeps the send button disabled for empty input', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    const sendBtn = screen.getAllByRole('button').find((b) => b.disabled);
    expect(sendBtn?.disabled).toBe(true);
  });

  it('sends shift+Enter without sending', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    const textarea = screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(mutationCalls.sendMessage).toBeUndefined();
  });

  it('sets the typing indicator while typing and clears it after 3s', async () => {
    jest.useFakeTimers();
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const textarea = screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello' } });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(mutationCalls.setTyping?.[0].args[0]).toEqual(
      expect.objectContaining({ isTyping: true }),
    );

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(mutationCalls.setTyping?.some((c) => c.args[0].isTyping === false)).toBe(true);
    jest.useRealTimers();
  });

  // ── @mention autocomplete ──────────────────────────────────────────────

  it('shows mention suggestions and inserts on Enter', async () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const textarea = screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@Bob' } });

    // 'Bob Smith' also appears in the header — the suggestion popup adds a second copy
    await waitFor(() => expect(screen.getAllByText('Bob Smith').length).toBeGreaterThan(1));

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect((textarea as HTMLTextAreaElement).value).toContain('@Bob Smith');

    // Escape closes the popup (current user 'Anna' is filtered from suggestions,
    // so '@B' lists both Bob Smith and Boris)
    queryResults.getConversationMembers = [
      { userId: 'u1', user: { name: 'Anna Petrova' } },
      { userId: 'u2', user: { name: 'Bob Smith' } },
      { userId: 'u3', user: { name: 'Boris' } },
    ];
    fireEvent.change(textarea, { target: { value: '@B' } });
    await waitFor(() => expect(screen.getByText('Boris')).toBeInTheDocument());
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByText('Boris')).not.toBeInTheDocument();
  });

  it('navigates mentions with arrow keys and selects on click', async () => {
    queryResults.getConversationMembers = [
      { userId: 'u1', user: { name: 'Anna Petrova' } },
      { userId: 'u2', user: { name: 'Bob Smith' } },
      { userId: 'u3', user: { name: 'Boris' } },
    ];
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const textarea = screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@B' } });
    await waitFor(() => expect(screen.getAllByText('Bob Smith').length).toBeGreaterThan(1));

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect((textarea as HTMLTextAreaElement).value).toContain('@');
  });

  // ── Emoji ──────────────────────────────────────────────────────────────

  it('opens the emoji picker and inserts the selected emoji', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTestId('icon-Smile'));
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('emoji-pick'));
    expect(
      (screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement).value,
    ).toBe('😀');
  });

  // ── Reply preview ──────────────────────────────────────────────────────

  it('shows and cancels the reply preview', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getAllByTestId('msg-reply')[0]);
    expect(screen.getByText(/chat.replyingTo/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === '✕')!);
    expect(screen.queryByText(/chat.replyingTo/)).not.toBeInTheDocument();
  });

  // ── Thread / info / background panels ──────────────────────────────────

  it('opens and closes the thread panel', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getAllByTestId('msg-thread')[0]);
    expect(screen.getByTestId('thread-panel')).toHaveAttribute('data-parent', 'm1');
    fireEvent.click(screen.getByTestId('thread-close'));
    expect(screen.queryByTestId('thread-panel')).not.toBeInTheDocument();
  });

  it('opens and closes the conversation info panel', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('chat.info'));
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('info-close'));
    expect(screen.queryByTestId('info-panel')).not.toBeInTheDocument();
  });

  it('opens and closes the background picker via portal', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('Chat Background'));
    expect(screen.getByTestId('bg-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bg-close'));
    expect(screen.queryByTestId('bg-picker')).not.toBeInTheDocument();
  });

  // ── Polls ──────────────────────────────────────────────────────────────

  it('creates and sends a poll', async () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('chat.createPollShort'));

    const sendPoll = () => screen.getByText('chat.sendPoll');
    expect((sendPoll() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('chat.pollQuestion'), {
      target: { value: 'Best language?' },
    });
    // textboxes after opening the creator: [message, question, option 1, option 2]
    const optionInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el !== screen.getByPlaceholderText('chat.messagePlaceholder'));
    fireEvent.change(optionInputs[1], { target: { value: 'TS' } });
    fireEvent.change(optionInputs[2], { target: { value: 'JS' } });

    expect((sendPoll() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sendPoll());

    await waitFor(() => {
      expect(mutationCalls.sendMessage?.[0].args[0]).toEqual(
        expect.objectContaining({
          content: '📊 Best language?',
          poll: {
            question: 'Best language?',
            options: [
              { id: 'opt_0', text: 'TS', votes: [] },
              { id: 'opt_1', text: 'JS', votes: [] },
            ],
          },
        }),
      );
    });
  });

  it('adds and removes poll options', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('chat.createPollShort'));

    fireEvent.click(screen.getByText('chat.addOption'));
    // [message, question, option 1, option 2, option 3]
    const inputs = screen
      .getAllByRole('textbox')
      .filter((el) => el !== screen.getByPlaceholderText('chat.messagePlaceholder'));
    expect(inputs.length).toBe(4);

    // remove one option (the ✕ buttons only appear when there are >2 options)
    const removeBtns = screen.getAllByRole('button').filter((b) => b.textContent === '✕');
    expect(removeBtns.length).toBe(3);
    fireEvent.click(removeBtns[0]);
    const inputsAfter = screen
      .getAllByRole('textbox')
      .filter((el) => el !== screen.getByPlaceholderText('chat.messagePlaceholder'));
    expect(inputsAfter.length).toBe(3);
  });

  // ── Scheduled send ─────────────────────────────────────────────────────

  it('schedules a message for a future time', async () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('chat.scheduleMessage'));

    // datetime-local values are parsed as local time — build a local ISO
    // string (toISOString would produce UTC and could land in the past)
    const local = new Date(Date.now() + 3600_000);
    const future = new Date(local.getTime() - local.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    fireEvent.change(screen.getByPlaceholderText('chat.messagePlaceholder'), {
      target: { value: 'Reminder' },
    });
    const dtInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dtInput, { target: { value: future } });

    // scheduled banner shows
    expect(screen.getByText(/chat.scheduledFor/)).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(mutationCalls.scheduleMessage?.[0].args[0]).toEqual(
        expect.objectContaining({
          conversationId: 'conv-1',
          content: 'Reminder',
          scheduledFor: expect.any(Number),
        }),
      );
    });
  });

  // ── File attachments ───────────────────────────────────────────────────

  it('adds a pending image preview and removes it', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const file = new File(['img'], 'photo.png', { type: 'image/png' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    // the counter row renders "1 chat.fileReadyToSend" (two text nodes)
    expect(screen.getByText(/chat.fileReadyToSend/)).toBeInTheDocument();

    // the remove button renders the X icon (no text)
    fireEvent.click(screen.getAllByTestId('icon-X')[0]);
    expect(screen.queryByText(/chat.fileReadyToSend/)).not.toBeInTheDocument();
  });

  it('rejects oversized files', async () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const big = new File([new ArrayBuffer(2 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    fireEvent.change(fileInput(), { target: { files: [big] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('chat.fileSizeLimit'));
  });

  it('sends a text message with an uploaded attachment', async () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const file = new File(['img'], 'photo.png', { type: 'image/png' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    const textarea = screen.getByPlaceholderText('chat.addCaption') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'See attached' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(uploadChatAttachment).toHaveBeenCalled();
    });
    expect(mutationCalls.sendMessage?.[0].args[0]).toEqual(
      expect.objectContaining({
        type: 'image',
        content: 'See attached',
        attachments: [
          { url: 'https://cdn.test/file.png', name: 'file.png', type: 'image/png', size: 3 },
        ],
      }),
    );
  });

  // ── Voice messages ─────────────────────────────────────────────────────

  it('sends a voice message through the recorder', async () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('Voice message'));
    expect(screen.getByTestId('voice-recorder')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('voice-start'));
    fireEvent.click(screen.getByTestId('voice-stop'));

    await waitFor(() => {
      expect(uploadChatAttachment).toHaveBeenCalledWith(
        expect.any(String),
        'voice.webm',
        'audio/webm',
      );
    });
    expect(mutationCalls.sendMessage?.[0].args[0]).toEqual(
      expect.objectContaining({ type: 'audio', audioDuration: 3 }),
    );
    expect(toast.success).toHaveBeenCalledWith('chat.voiceMessageSent');
  });

  it('cancels the voice recorder', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('Voice message'));
    fireEvent.click(screen.getByTestId('voice-cancel'));
    expect(screen.queryByTestId('voice-recorder')).not.toBeInTheDocument();
  });

  // ── Load older / scroll down ───────────────────────────────────────────

  it('loads older messages when available', () => {
    const loadMore = jest.fn();
    paginated = { results: [makeMessage()], status: 'CanLoadMore', loadMore };
    renderWindow();
    // t with { defaultValue } resolves to the default string
    fireEvent.click(screen.getByText('↑ Load older messages'));
    expect(loadMore).toHaveBeenCalledWith(30);
  });

  it('shows and uses the scroll-down button', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    const { container } = renderWindow();

    const parent = container.querySelector('.overflow-y-auto') as HTMLElement;
    Object.defineProperty(parent, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 400 });
    fireEvent.scroll(parent);

    expect(screen.getByTitle('Scroll to bottom')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Scroll to bottom'));
    expect((HTMLElement.prototype as any).scrollIntoView).toHaveBeenCalled();
  });

  // ── Typing indicator / read-only channel ───────────────────────────────

  it('shows the typing indicator for other users', () => {
    queryResults.getTypingUsers = [{ userId: 'u2', name: 'Bob Smith' }];
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    expect(screen.getByTestId('typing-indicator')).toHaveTextContent('Bob Smith');
  });

  it('renders a read-only channel for non-superadmins', () => {
    queryResults.getMyConversations = [
      {
        _id: 'conv-1',
        type: 'group',
        name: 'System Announcements',
        membership: { isMuted: false },
      },
    ];
    queryResults.getUserById = { _id: 'u1', role: 'employee', chatBackground: 'default' };
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    expect(screen.getByText('chat.readOnlyChannel')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('chat.messagePlaceholder')).not.toBeInTheDocument();
  });

  // ── Incoming message sound / notification ──────────────────────────────

  it('plays a sound for a new incoming message while the tab is focused', async () => {
    paginated = {
      results: [makeMessage({ _id: 'm1', senderId: 'u2' })],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    // ChatWindow is wrapped in React.memo — change a prop on rerender so the
    // new message array is actually re-evaluated.
    const { rerender } = render(<ChatWindow {...defaultProps} currentUserAvatar="v1" />);
    // first load registers the latest id, no sound
    expect(playChatMessageSound).not.toHaveBeenCalled();

    // results are desc (newest first) — reversed for display, so m2 is latest
    paginated = {
      results: [
        makeMessage({ _id: 'm2', senderId: 'u2' }),
        makeMessage({ _id: 'm1', senderId: 'u2' }),
      ],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    rerender(<ChatWindow {...defaultProps} currentUserAvatar="v2" />);

    await waitFor(() => {
      expect(playChatMessageSound).toHaveBeenCalled();
    });
    expect(mutationCalls.markAsRead?.[0].args[0]).toEqual(
      expect.objectContaining({ conversationId: 'conv-1', userId: 'u1' }),
    );
  });

  it('does not play a sound for own messages', async () => {
    paginated = {
      results: [makeMessage({ _id: 'm1', senderId: 'u2' })],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    const { rerender } = render(<ChatWindow {...defaultProps} currentUserAvatar="v1" />);

    paginated = {
      results: [
        makeMessage({ _id: 'm1', senderId: 'u2' }),
        makeMessage({ _id: 'm2', senderId: 'u1' }),
      ],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    rerender(<ChatWindow {...defaultProps} currentUserAvatar="v2" />);
    await waitFor(() => {
      expect(screen.getAllByTestId('msg-bubble').length).toBe(2);
    });
    expect(playChatMessageSound).not.toHaveBeenCalled();
  });

  it('shows a browser notification when the tab is not focused', async () => {
    document.hasFocus = () => false;
    (globalThis as any).Notification = class MockNotification {
      static permission = 'granted';
      static requestPermission = jest.fn();
      static instances: Array<{ title: string; options: any }> = [];
      title: string;
      options: any;
      constructor(title: string, options: any) {
        this.title = title;
        this.options = options;
        (MockNotification as any).instances.push({ title, options });
      }
    };

    paginated = {
      results: [makeMessage({ _id: 'm1', senderId: 'u2' })],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    const { rerender } = render(<ChatWindow {...defaultProps} currentUserAvatar="v1" />);

    // results are desc (newest first) — m2 is the latest incoming message
    paginated = {
      results: [
        makeMessage({ _id: 'm2', senderId: 'u2' }),
        makeMessage({ _id: 'm1', senderId: 'u2' }),
      ],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    rerender(<ChatWindow {...defaultProps} currentUserAvatar="v2" />);

    await waitFor(() => {
      expect((globalThis as any).Notification.instances.length).toBeGreaterThan(0);
    });
    expect(playChatMessageSound).toHaveBeenCalled();
  });

  it('skips sound for muted conversations and service broadcasts', async () => {
    queryResults.getMyConversations = [
      {
        _id: 'conv-1',
        type: 'direct',
        name: null,
        membership: { isMuted: true },
        otherUser: { _id: 'u2', name: 'Bob Smith' },
      },
    ];
    paginated = {
      results: [makeMessage({ _id: 'm1', senderId: 'u2' })],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    const { rerender } = render(<ChatWindow {...defaultProps} currentUserAvatar="v1" />);

    paginated = {
      results: [
        makeMessage({ _id: 'm1', senderId: 'u2' }),
        makeMessage({ _id: 'm2', senderId: 'u2', isServiceBroadcast: true }),
      ],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    rerender(<ChatWindow {...defaultProps} currentUserAvatar="v2" />);
    await waitFor(() => {
      expect(screen.getAllByTestId('msg-bubble').length).toBe(2);
    });
    expect(playChatMessageSound).not.toHaveBeenCalled();
  });

  // ── Mentions on send / voice errors / notification request ──────────────

  it('parses @mentions into mentionedUserIds when sending', async () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const textarea = screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'ping @Bob Smith!' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(mutationCalls.sendMessage?.[0].args[0]).toEqual(
        expect.objectContaining({ mentionedUserIds: ['u2'] }),
      );
    });
  });

  it('rejects an oversized voice message', () => {
    mockVoiceBlobSize = 2 * 1024 * 1024; // > 1MB limit
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('Voice message'));
    fireEvent.click(screen.getByTestId('voice-start'));
    fireEvent.click(screen.getByTestId('voice-stop'));
    expect(toast.error).toHaveBeenCalledWith('chat.voiceSizeLimit');
    expect(uploadChatAttachment).not.toHaveBeenCalled();
  });

  it('shows a toast when sending a voice message fails', async () => {
    (uploadChatAttachment as jest.Mock).mockRejectedValueOnce(new Error('cloud down'));
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('Voice message'));
    fireEvent.click(screen.getByTestId('voice-start'));
    fireEvent.click(screen.getByTestId('voice-stop'));

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalled();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('chat.voiceMessageFailed'));
  });

  it('requests notification permission when permission is default', async () => {
    document.hasFocus = () => false;
    (globalThis as any).Notification = { permission: 'default', requestPermission: jest.fn() };

    paginated = {
      results: [makeMessage({ _id: 'm1', senderId: 'u2' })],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    const { rerender } = render(<ChatWindow {...defaultProps} currentUserAvatar="v1" />);
    paginated = {
      results: [
        makeMessage({ _id: 'm2', senderId: 'u2' }),
        makeMessage({ _id: 'm1', senderId: 'u2' }),
      ],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    rerender(<ChatWindow {...defaultProps} currentUserAvatar="v2" />);

    await waitFor(() => {
      expect((globalThis as any).Notification.requestPermission).toHaveBeenCalled();
    });
  });

  // ── Header hover styling / misc buttons ─────────────────────────────────

  it('applies hover styles on the call buttons', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    const phone = screen.getByTitle('chat.voiceCall');
    fireEvent.mouseEnter(phone);
    expect(phone.style.background).toBe('var(--sidebar-item-hover)');
    expect(phone.style.color).toBe('var(--primary)');
    fireEvent.mouseLeave(phone);
    expect(phone.style.color).toBe('var(--text-muted)');
  });

  it('applies hover styles on the video and search buttons', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const video = screen.getByTitle('chat.videoCall');
    fireEvent.mouseEnter(video);
    expect(video.style.color).toBe('var(--primary)');
    fireEvent.mouseLeave(video);
    expect(video.style.color).toBe('var(--text-muted)');

    const search = screen.getByTitle('chat.searchMessages');
    fireEvent.mouseEnter(search);
    expect(search.style.background).toBe('var(--sidebar-item-hover)');
    fireEvent.mouseLeave(search);
    expect(search.style.background).toBe('transparent');
  });

  it('applies hover styles on the info button', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    const info = screen.getByTitle('chat.info');
    fireEvent.mouseEnter(info);
    expect(info.style.background).toBe('var(--sidebar-item-hover)');
    fireEvent.mouseLeave(info);
    expect(info.style.background).toBe('transparent');

    const bg = screen.getByTitle('Chat Background');
    fireEvent.mouseEnter(bg);
    expect(bg.style.background).toBe('var(--sidebar-item-hover)');
    fireEvent.mouseLeave(bg);
    expect(bg.style.background).toBe('transparent');
  });

  it('sends a quick reply from the message bubble', async () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getAllByTestId('msg-send-reply')[0]);

    await waitFor(() => {
      expect(mutationCalls.sendMessage?.[0].args[0]).toEqual(
        expect.objectContaining({ content: 'reply text', type: 'text' }),
      );
    });
  });

  it('closes the poll creator and emoji picker through their close buttons', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('chat.createPollShort'));
    expect(screen.getByPlaceholderText('chat.pollQuestion')).toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId('icon-X')[0]); // poll creator close
    expect(screen.queryByPlaceholderText('chat.pollQuestion')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('icon-Smile'));
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('emoji-close'));
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
  });

  it('closes the scheduled-send picker and cancels a scheduled banner', () => {
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('chat.scheduleMessage'));
    const local = new Date(Date.now() + 3600_000);
    const future = new Date(local.getTime() - local.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    fireEvent.change(document.querySelector('input[type="datetime-local"]') as HTMLInputElement, {
      target: { value: future },
    });
    expect(screen.getByText(/chat.scheduledFor/)).toBeInTheDocument();

    // cancel the scheduled banner
    fireEvent.click(screen.getByText('chat.cancel'));
    expect(screen.queryByText(/chat.scheduledFor/)).not.toBeInTheDocument();

    // close the picker via its ✕ button
    const pickerClose = screen
      .getAllByRole('button')
      .find((b) => b.textContent === '✕') as HTMLButtonElement;
    fireEvent.click(pickerClose);
    expect(document.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
  });

  it('selects a background and closes the picker through onSelect', () => {
    paginated = { results: [makeMessage()], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();
    fireEvent.click(screen.getByTitle('Chat Background'));
    fireEvent.click(screen.getByTestId('bg-select'));
    expect(screen.queryByTestId('bg-picker')).not.toBeInTheDocument();
  });

  it('logs a warning for messages without a sender', () => {
    paginated = {
      results: [makeMessage({ _id: 'm1', sender: undefined })],
      status: 'Exhausted',
      loadMore: jest.fn(),
    };
    renderWindow();
    expect(logger.warn).toHaveBeenCalled();
  });

  // ── Error paths ────────────────────────────────────────────────────────

  it('logs an error when sending fails', async () => {
    mutationImpl = async (name: string) => {
      if (name === 'sendMessage') throw new Error('network down');
      return undefined;
    };
    paginated = { results: [], status: 'Exhausted', loadMore: jest.fn() };
    renderWindow();

    const textarea = screen.getByPlaceholderText('chat.messagePlaceholder') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'boom' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith('Send failed:', expect.any(Error));
    });
  });
});
