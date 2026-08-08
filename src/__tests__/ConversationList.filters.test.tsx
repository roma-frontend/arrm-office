/**
 * Tests for the conversation list filter rules.
 *
 * The list persists its filter in localStorage and defaults to `chat`, i.e.
 * direct messages only. That quietly hid any group the user was sent to by a
 * link — a support ticket chat is a group — so the conversation could be open on
 * screen and still be missing from the sidebar. The open conversation is now
 * exempt from the filters.
 */

import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      typeof opts?.defaultValue === 'string' ? opts.defaultValue : key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('i18next', () => ({ language: 'en' }));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...rest }: Record<string, unknown> & { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} {...rest} />
  ),
}));

jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), error: jest.fn() } }));

import { ConversationList } from '@/components/chat/ConversationList';

const direct = {
  _id: 'conv-direct' as never,
  type: 'direct' as const,
  otherUser: { _id: 'u-2' as never, name: 'Alex', avatar: undefined },
  isPinned: false,
  isArchived: false,
  createdAt: 1,
  membership: { unreadCount: 0, isArchived: false, isDeleted: false, isMuted: false },
};

const group = {
  _id: 'conv-group' as never,
  type: 'group' as const,
  name: '🎫 SUP-1: Broken button',
  isPinned: false,
  isArchived: false,
  createdAt: 2,
  membership: { unreadCount: 0, isArchived: false, isDeleted: false, isMuted: false },
};

function renderList(selectedId: string | null) {
  return render(
    <ConversationList
      conversations={[direct, group] as never}
      selectedId={selectedId as never}
      currentUserId={'u-1' as never}
      onSelect={jest.fn()}
      collapsed={false}
      onToggleCollapse={jest.fn()}
      onNewConversation={jest.fn()}
    />,
  );
}

describe('ConversationList filters', () => {
  beforeEach(() => {
    localStorage.clear();
    // The default the component falls back to, and the one users end up with.
    localStorage.setItem('chat_filters', JSON.stringify(['chat']));
  });

  it('hides groups under the direct-messages filter', () => {
    renderList(null);
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.queryByText('🎫 SUP-1: Broken button')).not.toBeInTheDocument();
  });

  it('keeps the open conversation listed even when the filter excludes it', () => {
    renderList('conv-group');
    expect(screen.getByText('🎫 SUP-1: Broken button')).toBeInTheDocument();
  });

  it('still applies the search box to the open conversation', () => {
    renderList('conv-group');
    fireEvent.change(screen.getByPlaceholderText('chat.searchConversations'), {
      target: { value: 'zzz' },
    });
    expect(screen.queryByText('🎫 SUP-1: Broken button')).not.toBeInTheDocument();
  });
});
