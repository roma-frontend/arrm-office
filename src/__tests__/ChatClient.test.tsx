/**
 * Tests for ChatClient — main chat component with Convex queries/mutations,
 * responsive layout, call handling, offline indicator, and new conversation flow.
 *
 * Pattern: AIGovernancePanel.test.tsx — query results driven by _name map.
 */

import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback)
        return fallback.defaultValue ?? key;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Convex query mock ────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mockMutation = jest.fn().mockResolvedValue('call-1');

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockMutation,
}));

// ── API mock (relative path matching ChatClient's import) ────────────────────
jest.mock('../../convex/_generated/api', () => ({
  api: {
    chat: {
      queries: { getMyConversations: { _name: 'getMyConversations' } },
      mutations: {
        togglePin: { _name: 'togglePin' },
        deleteConversation: { _name: 'deleteConversation' },
        restoreConversation: { _name: 'restoreConversation' },
        toggleArchive: { _name: 'toggleArchive' },
        toggleMute: { _name: 'toggleMute' },
      },
      calls: { initiateCall: { _name: 'initiateCall' } },
    },
  },
}));

// ── Hook mocks ───────────────────────────────────────────────────────────────
jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({
    current: Object.assign(document.createElement('div'), { scrollTo: jest.fn() }),
  }),
}));

jest.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false, // non-desktop by default
}));

jest.mock('@/store/useOrgSelectorStore', () => ({
  useOrgSelectorStore: () => ({ selectedOrgId: null }),
}));

jest.mock('@/lib/notificationSound', () => ({
  playChatMessageSound: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn() },
}));

jest.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// ── Sub-component mocks ──────────────────────────────────────────────────────
jest.mock('@/components/chat/ConversationList', () => ({
  ConversationList: ({
    conversations,
    onSelect,
    collapsed,
    onNewConversation,
    onTogglePin,
    onDelete,
    onToggleCollapse,
    selectedId,
  }: any) => (
    <div data-testid="conversation-list" data-collapsed={String(collapsed)}>
      <span data-testid="conv-count">{conversations.length}</span>
      <button data-testid="new-conv" onClick={onNewConversation}>
        New
      </button>
      <button data-testid="toggle-collapse" onClick={onToggleCollapse}>
        Toggle
      </button>
      {conversations.map((conv: any) => (
        <div key={conv._id} data-testid="conv-item" onClick={() => onSelect(conv._id)}>
          {conv.name || 'Unnamed'}
        </div>
      ))}
      <button data-testid="delete-conv" onClick={() => onDelete?.('conv-1')}>
        Delete
      </button>
      <button data-testid="pin-conv" onClick={() => onTogglePin?.('conv-1')}>
        Pin
      </button>
    </div>
  ),
}));

jest.mock('@/components/chat/ChatWindow', () => ({
  ChatWindow: ({ conversationId, onBack, onStartCall }: any) => (
    <div data-testid="chat-window" data-conv-id={conversationId}>
      <button data-testid="back-btn" onClick={onBack}>
        Back
      </button>
      <button data-testid="start-call" onClick={() => onStartCall?.(conversationId, 'audio', [])}>
        Call
      </button>
    </div>
  ),
}));

jest.mock('@/components/chat/NewConversationModal', () => ({
  NewConversationModal: ({ onClose, onCreated }: any) => (
    <div data-testid="new-conv-modal">
      <button data-testid="create-conv" onClick={() => onCreated?.('new-conv-1')}>
        Create
      </button>
      <button data-testid="close-modal" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

jest.mock('@/components/chat/CallModal', () => ({
  CallModal: ({ call, onEnd }: any) => (
    <div data-testid="call-modal" data-call-type={call.type}>
      <span>Call: {call.type}</span>
      <button data-testid="end-call" onClick={onEnd}>
        End
      </button>
    </div>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ size }: any) => <div data-testid="shield-loader">Loading...</div>,
}));

// ── Module under test ──
import ChatClient from '@/components/chat/ChatClient';

const defaultProps = {
  userId: 'user-1',
  organizationId: 'org-1',
  userName: 'Test User',
  userAvatar: '/avatar.jpg',
  userRole: 'admin',
};

const mockConversations = [
  {
    _id: 'conv-1',
    name: 'General Chat',
    isArchived: false,
    isDeleted: false,
    lastMessage: { content: 'Hello!', createdAt: Date.now() },
    membership: { unreadCount: 2 },
    participants: [],
  },
  {
    _id: 'conv-2',
    name: 'Team Chat',
    isArchived: false,
    isDeleted: false,
    lastMessage: null,
    membership: { unreadCount: 0 },
    participants: [],
  },
];

describe('ChatClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = { getMyConversations: undefined };
    // jsdom doesn't implement window.scrollTo — mock it
    window.scrollTo = jest.fn();
  });

  describe('Loading state', () => {
    it('shows loader when userId is empty', () => {
      const { container } = render(<ChatClient {...defaultProps} userId="" />);
      expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    beforeEach(() => {
      queryResults.getMyConversations = [];
    });

    it('renders empty state when no conversation selected', () => {
      render(<ChatClient {...defaultProps} />);
      expect(screen.getByText('chat.yourMessages')).toBeInTheDocument();
      expect(screen.getByText('chat.yourMessagesSubtitle')).toBeInTheDocument();
    });

    it('renders start conversation button in empty state', () => {
      render(<ChatClient {...defaultProps} />);
      expect(screen.getByText('chat.startConversation')).toBeInTheDocument();
    });

    it('opens new conversation modal from empty state button', () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByText('chat.startConversation'));
      expect(screen.getByTestId('new-conv-modal')).toBeInTheDocument();
    });
  });

  describe('Conversation list', () => {
    beforeEach(() => {
      queryResults.getMyConversations = mockConversations;
    });

    it('renders conversation list with correct count', () => {
      render(<ChatClient {...defaultProps} />);
      expect(screen.getByTestId('conv-count').textContent).toBe('2');
    });

    it('renders conversation names', () => {
      render(<ChatClient {...defaultProps} />);
      expect(screen.getByText('General Chat')).toBeInTheDocument();
      expect(screen.getByText('Team Chat')).toBeInTheDocument();
    });

    it('selects conversation when clicked', () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByText('General Chat'));
      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
    });

    it('opens new conversation modal', () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByTestId('new-conv'));
      expect(screen.getByTestId('new-conv-modal')).toBeInTheDocument();
    });

    it('creates conversation from modal and shows chat window', () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByTestId('new-conv'));
      fireEvent.click(screen.getByTestId('create-conv'));
      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
    });

    it('closes new conversation modal', () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByTestId('new-conv'));
      fireEvent.click(screen.getByTestId('close-modal'));
      expect(screen.queryByTestId('new-conv-modal')).not.toBeInTheDocument();
    });
  });

  describe('Chat window', () => {
    beforeEach(() => {
      queryResults.getMyConversations = mockConversations;
    });

    it('navigates back from chat window and shows empty state', async () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByText('General Chat'));
      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('back-btn'));
      // handleBack uses setTimeout(280ms) before clearing selectedConvId
      await waitFor(() => {
        expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
      });
    });
  });

  describe('Call functionality', () => {
    beforeEach(() => {
      queryResults.getMyConversations = mockConversations;
    });

    it('initiates a call and shows call modal', async () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByText('General Chat'));
      fireEvent.click(screen.getByTestId('start-call'));
      expect(mockMutation).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByTestId('call-modal')).toBeInTheDocument();
      });
    });

    it('shows audio call type in modal', async () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByText('General Chat'));
      fireEvent.click(screen.getByTestId('start-call'));
      await waitFor(() => {
        expect(screen.getByTestId('call-modal').getAttribute('data-call-type')).toBe('audio');
      });
    });

    it('ends a call and hides call modal', async () => {
      jest.useFakeTimers();
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByText('General Chat'));
      fireEvent.click(screen.getByTestId('start-call'));
      await waitFor(() => {
        expect(screen.getByTestId('call-modal')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('end-call'));
      expect(screen.queryByTestId('call-modal')).not.toBeInTheDocument();
      jest.useRealTimers();
    });
  });

  describe('Conversation actions', () => {
    beforeEach(() => {
      queryResults.getMyConversations = mockConversations;
    });

    it('calls mutation on pin', () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByTestId('pin-conv'));
      expect(mockMutation).toHaveBeenCalled();
    });

    it('calls mutation on delete', () => {
      render(<ChatClient {...defaultProps} />);
      fireEvent.click(screen.getByTestId('delete-conv'));
      expect(mockMutation).toHaveBeenCalled();
    });
  });

  /**
   * Regression: on mobile the expanded conversation list used to be a `fixed`
   * sheet offset by a hardcoded `top-16` (the navbar height). Any change to where
   * the navbar actually sat — it hides itself on scroll, and the safe-area inset
   * pushes it down — left a band of background between the navbar and the sheet.
   * Keeping the sheet `absolute` inside the chat area removes that coupling.
   */
  describe('Mobile sheet layout', () => {
    const overlayOf = (container: HTMLElement) =>
      container.querySelector<HTMLElement>('.bg-black\\/50');

    const sheetOf = () => screen.getByTestId('conversation-list').parentElement;

    beforeEach(() => {
      queryResults.getMyConversations = mockConversations;
    });

    it('does not anchor the sheet to the viewport', () => {
      render(<ChatClient {...defaultProps} />);
      const className = sheetOf()?.className ?? '';

      expect(className).toContain('absolute');
      expect(className).toContain('inset-0');
      expect(className).not.toContain('fixed');
      expect(className).not.toContain('top-16');
    });

    it('bounds the dimming overlay to the chat area', () => {
      const { container } = render(<ChatClient {...defaultProps} />);
      const className = overlayOf(container)?.className ?? '';

      expect(className).toContain('absolute');
      expect(className).toContain('inset-0');
      expect(className).not.toContain('fixed');
      expect(className).not.toContain('top-16');
    });

    it('keeps the sheet scroll from chaining to the document', () => {
      render(<ChatClient {...defaultProps} />);
      expect(sheetOf()?.className).toContain('overscroll-contain');
    });

    it('removes the overlay when the list collapses', () => {
      render(<ChatClient {...defaultProps} />);
      expect(overlayOf(document.body)).not.toBeNull();

      fireEvent.click(screen.getByTestId('toggle-collapse'));

      expect(overlayOf(document.body)).toBeNull();
    });

    it('leaves document scrolling untouched', () => {
      render(<ChatClient {...defaultProps} />);
      // The sheet no longer escapes its container, so there is nothing behind it
      // to freeze — the component must not reach out and mutate body styles.
      expect(document.body.style.overflow).toBe('');
    });
  });

  // Offline indicator: internal `isOnline` state initialised to true and
  // managed by event listeners — not testable from outside the component
  // without refactoring to accept a prop.
});
