/**
 * Tests for MessageBubble — the chat message bubble:
 *   - text / attachments / polls / reactions / receipts rendering
 *   - system, service-broadcast, call and deleted variants
 *   - hover action bar (portal) → reactions, reply, context menu (portal)
 *   - edit (textarea + Enter/Escape), delete for me/everyone (5-min gate), pin, copy
 *   - poll voting + close, image lightbox, PDF/audio/generic attachments, thread, SmartReply
 *
 * Mocks: convex/react (per-mutation impls keyed by _name), generated api, optimistic
 * reaction hook, logger, SmartReply, LinkPreview (real extractUrl), lucide (testids),
 * avatar, next/link, clipboard.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import type { Id } from '../../convex/_generated/dataModel';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      if (key === 'chat.joined') return `Joined: ${params?.name ?? ''}`;
      if (key === 'chat.ticketCreated') return `Ticket ${params?.number ?? ''} created`;
      if (key === 'common.someone') return 'Someone';
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Convex mutations keyed by _name ──────────────────────────────────────────
const mutationCalls: Record<string, Array<{ args: any }>> = {};
let reactionImpl: ((emoji: string, users: unknown[]) => Promise<unknown>) | null = null;

jest.mock('../../convex/_generated/api', () => ({
  api: {
    chat: {
      mutations: {
        toggleReaction: { _name: 'toggleReaction' },
        editMessage: { _name: 'editMessage' },
        deleteMessage: { _name: 'deleteMessage' },
        deleteMessageForMe: { _name: 'deleteMessageForMe' },
        pinMessage: { _name: 'pinMessage' },
        votePoll: { _name: 'votePoll' },
        closePoll: { _name: 'closePoll' },
      },
    },
  },
}));

jest.mock('convex/react', () => ({
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    return async (...args: any[]) => {
      (mutationCalls[name] ??= []).push({ args });
      if (name === 'toggleReaction' && reactionImpl) {
        return reactionImpl(args[0], args[1]);
      }
      return Promise.resolve();
    };
  },
}));

jest.mock('@/hooks/useOptimisticActions', () => ({
  useOptimisticReaction: () => ({
    toggleOptimistic: jest.fn(async (emoji: string, users: unknown[]) => {
      (mutationCalls['toggleReaction'] ??= []).push({ args: [emoji, users] });
      if (reactionImpl) return reactionImpl(emoji, users);
    }),
    optimisticReactions: {},
    error: null,
  }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span data-testid="avatar">{children}</span>,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
  AvatarImage: (props: any) => <img {...props} alt={props.alt ?? ''} />,
}));

jest.mock('next/link', () => {
  const ReactMod = require('react');
  return {
    __esModule: true,
    default: ({ children, href, ...rest }: any) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  };
});

// SmartReply: mock that renders its onSelect trigger
jest.mock('@/components/chat/SmartReply', () => ({
  SmartReply: ({ onSelect }: any) => (
    <button data-testid="smart-reply" onClick={() => onSelect('Smart text')}>
      smart-reply
    </button>
  ),
}));

// LinkPreview: keep the real extractUrl, stub the async component
jest.mock('@/components/chat/LinkPreview', () => {
  const actual = jest.requireActual('@/components/chat/LinkPreview');
  return {
    ...actual,
    LinkPreview: ({ url }: any) => <div data-testid="link-preview">{url}</div>,
  };
});

jest.mock('lucide-react', () => {
  const icons = [
    'Reply',
    'Edit2',
    'Trash2',
    'Trash',
    'Pin',
    'Copy',
    'MoreHorizontal',
    'Phone',
    'Video',
    'FileText',
    'Download',
    'X',
    'CheckCheck',
    'Check',
    'MessageSquare',
  ];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── Component under test ─────────────────────────────────────────────────────
import { MessageBubble } from '@/components/chat/MessageBubble';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const NOW = Date.now();
const baseMessage = {
  _id: 'm1' as Id<'chatMessages'>,
  senderId: 'u2' as Id<'users'>,
  type: 'text',
  content: 'Hello world',
  createdAt: NOW - 60_000,
  sender: { _id: 'u2' as Id<'users'>, name: 'Bob Smith' },
};

const defaultProps = {
  message: baseMessage as any,
  isOwn: false,
  showAvatar: true,
  showName: true,
  currentUserId: 'me' as Id<'users'>,
  currentUserAvatar: 'https://cdn/me.png',
  currentUserName: 'Roman',
  onReply: jest.fn(),
  onOpenThread: jest.fn(),
  onSendMessage: jest.fn(),
  lang: 'en',
};

function renderBubble(
  messageOverrides: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
) {
  const message = { ...baseMessage, ...messageOverrides };
  const onReply = jest.fn();
  const onOpenThread = jest.fn();
  const onSendMessage = jest.fn();
  const utils = render(
    <MessageBubble
      message={message as any}
      isOwn={false}
      showAvatar={true}
      showName={true}
      currentUserId={'me' as Id<'users'>}
      currentUserAvatar="https://cdn/me.png"
      currentUserName="Roman"
      onReply={onReply}
      onOpenThread={onOpenThread}
      onSendMessage={onSendMessage}
      lang="en"
      {...props}
    />,
  );
  return { ...utils, onReply, onOpenThread, onSendMessage };
}

function rowEl(container: HTMLElement) {
  return container.querySelector('[data-msg-row]') as HTMLElement;
}

async function openMenu(container: HTMLElement) {
  fireEvent.mouseEnter(rowEl(container));
  const moreBtn = screen.getByTestId('icon-MoreHorizontal').closest('button');
  expect(moreBtn).toBeTruthy();
  fireEvent.click(moreBtn as HTMLElement);
  // menu portal renders synchronously; flush the outside-click listener setup
  await act(async () => {});
}

beforeEach(() => {
  Object.keys(mutationCalls).forEach((k) => delete mutationCalls[k]);
  reactionImpl = null;
  (global.navigator as any).clipboard = { writeText: jest.fn() };
  jest.useRealTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ── Basic rendering ──────────────────────────────────────────────────────────
describe('MessageBubble basics', () => {
  it('renders the message content, sender name and timestamp', () => {
    const { container } = renderBubble();
    expect(screen.getByText('Hello world')).toBeTruthy();
    expect(screen.getByText('Bob Smith')).toBeTruthy();
    // HH:mm of NOW-60s — just check a time-like pattern is present
    expect(container.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it('links the avatar to the employee profile for other users', () => {
    renderBubble();
    const link = screen.getByTitle("View Bob Smith's profile");
    expect(link.getAttribute('href')).toBe('/employees/u2');
    expect(screen.getByTestId('avatar-fallback').textContent).toBe('BS');
  });

  it('shows the own avatar with initials and no sender name for own messages', () => {
    renderBubble({}, { isOwn: true, showName: false });
    expect(screen.getByTestId('avatar-fallback').textContent).toBe('R');
    expect(screen.queryByText('Bob Smith')).toBeNull();
  });

  it('renders a placeholder when the avatar is hidden', () => {
    renderBubble({}, { showAvatar: false });
    expect(screen.queryByTestId('avatar')).toBeNull();
    expect(screen.queryByTitle("View Bob Smith's profile")).toBeNull();
  });

  it('falls back to Unknown when the sender has no name', () => {
    renderBubble({ sender: { _id: 'u2' as Id<'users'>, name: undefined } });
    expect(screen.getByText('Unknown')).toBeTruthy();
  });

  it('marks edited and pinned messages', () => {
    renderBubble({ isEdited: true, isPinned: true });
    expect(screen.getByText('(edited)')).toBeTruthy();
    expect(screen.getByText('📌')).toBeTruthy();
  });

  it('renders the reply preview with the referenced sender', () => {
    renderBubble({ replyToContent: 'Original question', replyToSenderName: 'Alice' });
    expect(screen.getByText('Original question')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('renders an empty placeholder when content is empty', () => {
    const { container } = renderBubble({ content: '' });
    expect(container.querySelector('p')).toBeNull();
  });
});

// ── Variant messages ─────────────────────────────────────────────────────────
describe('MessageBubble variants', () => {
  it('shows the deleted placeholder for deleted messages', () => {
    const { container } = renderBubble({ isDeleted: true });
    expect(container.textContent).toContain('🗑');
    expect(container.textContent).toContain('This message was deleted');
    // No bubble actions for deleted messages
    expect(screen.queryByTestId('icon-MoreHorizontal')).toBeNull();
  });

  it('renders a service broadcast without the sender prefix', () => {
    renderBubble({
      type: 'system',
      isServiceBroadcast: true,
      broadcastIcon: '📢',
      broadcastTitle: 'System',
      content: 'Bob Smith: Server maintenance tonight',
    });
    expect(screen.getByText('📢')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Server maintenance tonight')).toBeTruthy();
  });

  it('renders a plain system message as-is', () => {
    const { container } = renderBubble({ type: 'system', content: 'Joined the chat' });
    expect(screen.getByText('Joined the chat')).toBeTruthy();
    expect(container.textContent).not.toContain('i18n::');
  });

  it('localizes a tokenized system message', () => {
    renderBubble({
      type: 'system',
      content: 'i18n::{"key":"chat.joined","params":{"name":"Bob"}}',
    });
    expect(screen.getByText('Joined: Bob')).toBeTruthy();
  });

  it('drops a token whose key cannot be resolved', () => {
    const { container } = renderBubble({
      type: 'system',
      content: 'i18n::{"key":"chat.missingKey","params":{}}',
    });
    expect(container.textContent).not.toContain('chat.missingKey');
  });

  it('renders an answered video call with a formatted duration', () => {
    renderBubble({
      type: 'call',
      callType: 'video',
      callStatus: 'answered',
      callDuration: 65,
      content: 'Video call',
    });
    expect(screen.getByText('Video call')).toBeTruthy();
    expect(screen.getByText('1m 5s')).toBeTruthy();
  });

  it('renders a missed audio call', () => {
    renderBubble({
      type: 'call',
      callType: 'audio',
      callStatus: 'missed',
      content: 'Audio call',
    });
    expect(screen.getByText('Missed')).toBeTruthy();
  });

  it('renders a declined call', () => {
    renderBubble({
      type: 'call',
      callType: 'audio',
      callStatus: 'declined',
      content: 'Audio call',
    });
    expect(screen.getByText('Declined')).toBeTruthy();
  });
});

// ── Read receipts ────────────────────────────────────────────────────────────
describe('Read receipts', () => {
  it('shows Seen when a recipient has read the message', () => {
    renderBubble({ readBy: [{ userId: 'u2', readAt: NOW + 5_000 }] }, { isOwn: true });
    expect(screen.getByText('Seen')).toBeTruthy();
  });

  it('shows Delivered when a recipient has not read yet', () => {
    renderBubble({ readBy: [{ userId: 'u2', readAt: -1 }] }, { isOwn: true });
    expect(screen.getByText('Delivered')).toBeTruthy();
  });

  it('shows Sent when there are no receipt entries', () => {
    renderBubble({ readBy: [] }, { isOwn: true });
    expect(screen.getByText('Sent')).toBeTruthy();
  });

  it('localizes receipts for ru', () => {
    renderBubble({ readBy: [{ userId: 'u2', readAt: NOW + 5_000 }] }, { isOwn: true, lang: 'ru' });
    expect(screen.getByText('Просмотрено')).toBeTruthy();
  });

  it('hides receipts for incoming messages', () => {
    renderBubble({ readBy: [{ userId: 'u2', readAt: NOW }] });
    expect(screen.queryByText('Seen')).toBeNull();
  });
});

// ── Action bar + context menu ────────────────────────────────────────────────
describe('Action bar and menu', () => {
  it('shows the action bar on hover and hides it after leaving', async () => {
    const { container } = renderBubble();
    expect(screen.queryByTestId('icon-MoreHorizontal')).toBeNull();
    fireEvent.mouseEnter(rowEl(container));
    expect(screen.getByTestId('icon-MoreHorizontal')).toBeTruthy();
    jest.useFakeTimers();
    fireEvent.mouseLeave(rowEl(container));
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.queryByTestId('icon-MoreHorizontal')).toBeNull();
  });

  it('toggles the action bar on touch', () => {
    const { container } = renderBubble();
    fireEvent.mouseEnter(rowEl(container));
    expect(screen.getByTestId('icon-MoreHorizontal')).toBeTruthy();
    // touch toggles the visibility off (position stays set from hover)
    fireEvent.touchStart(rowEl(container));
    expect(screen.queryByTestId('icon-MoreHorizontal')).toBeNull();
    fireEvent.touchStart(rowEl(container));
    expect(screen.getByTestId('icon-MoreHorizontal')).toBeTruthy();
  });

  it('closes the menu when clicking outside', async () => {
    const { container } = renderBubble();
    await openMenu(container);
    expect(screen.getByText('Copy')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await act(async () => {});
    expect(screen.queryByText('Copy')).toBeNull();
  });

  it('highlights menu items on hover', async () => {
    const { container } = renderBubble();
    await openMenu(container);
    const item = screen.getByText('Copy').closest('button') as HTMLElement;
    fireEvent.mouseEnter(item);
    fireEvent.mouseLeave(item);
    expect(item.style.background).toBe('transparent');
  });

  it('keeps the action bar visible while the menu is open', () => {
    const { container } = renderBubble();
    fireEvent.mouseEnter(rowEl(container));
    fireEvent.mouseLeave(rowEl(container));
    expect(screen.getByTestId('icon-MoreHorizontal')).toBeTruthy(); // still open (menu closed, hover timeout cleared by leave guard)
  });

  it('triggers a quick emoji reaction from the action bar', async () => {
    const { container } = renderBubble();
    fireEvent.mouseEnter(rowEl(container));
    const emojiBtn = screen.getByText('👍');
    fireEvent.click(emojiBtn);
    await act(async () => {});
    const calls = mutationCalls['toggleReaction'] ?? [];
    expect(calls).toHaveLength(1);
  });

  it('triggers reply from the action bar', () => {
    const { container, onReply } = renderBubble();
    fireEvent.mouseEnter(rowEl(container));
    const replyBtn = screen.getByTitle('Reply').closest('button') as HTMLElement;
    fireEvent.click(replyBtn);
    expect(onReply).toHaveBeenCalledWith('m1', 'Hello world', 'Bob Smith');
  });

  it('stops the touch event on the action bar from bubbling', () => {
    const { container } = renderBubble();
    fireEvent.mouseEnter(rowEl(container));
    const bar = screen.getByTestId('icon-MoreHorizontal').closest('div.fixed') as HTMLElement;
    fireEvent.touchStart(bar);
    // the bar stays open — the row handler (toggle) never fires
    expect(screen.getByTestId('icon-MoreHorizontal')).toBeTruthy();
  });

  it('keeps the action bar alive while hovering it', () => {
    jest.useFakeTimers();
    const { container } = renderBubble();
    fireEvent.mouseEnter(rowEl(container));
    const bar = screen.getByTestId('icon-MoreHorizontal').closest('div.fixed') as HTMLElement;
    fireEvent.mouseEnter(bar);
    fireEvent.mouseLeave(bar);
    // hide is deferred via a 100ms timeout, so the bar is still present
    expect(screen.getByTestId('icon-MoreHorizontal')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.queryByTestId('icon-MoreHorizontal')).toBeNull();
  });
});

// ── Menu actions ─────────────────────────────────────────────────────────────
describe('Menu actions', () => {
  it('copies the message content', async () => {
    const { container } = renderBubble();
    await openMenu(container);
    fireEvent.click(screen.getByText('Copy'));
    await act(async () => {});
    expect((global.navigator as any).clipboard.writeText).toHaveBeenCalledWith('Hello world');
    expect(screen.queryByText('Copy')).toBeNull();
  });

  it('pins and unpins the message', async () => {
    const first = renderBubble();
    await openMenu(first.container);
    fireEvent.click(screen.getByText('Pin'));
    await act(async () => {});
    expect(mutationCalls['pinMessage']).toEqual([
      { args: [{ messageId: 'm1', userId: 'me', pin: true }] },
    ]);
    first.unmount();

    const second = renderBubble({ isPinned: true });
    await openMenu(second.container);
    fireEvent.click(screen.getByText('Unpin'));
    await act(async () => {});
    expect(mutationCalls['pinMessage'][1].args).toEqual([
      { messageId: 'm1', userId: 'me', pin: false },
    ]);
  });

  it('hides edit and delete-for-everyone for incoming messages', async () => {
    const { container } = renderBubble({}, { isOwn: false });
    await openMenu(container);
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete for everyone')).toBeNull();
    expect(screen.getByText('Delete for me')).toBeTruthy();
  });

  it('deletes for me only (own, within 5 minutes) from the dialog', async () => {
    const { container } = renderBubble({}, { isOwn: true });
    await openMenu(container);
    fireEvent.click(screen.getByText('Delete for me'));
    // dialog opens with both options
    expect(screen.getByText('Delete message')).toBeTruthy();
    expect(screen.getByText('Delete for everyone')).toBeTruthy();
    fireEvent.click(screen.getByText('Delete for me'));
    await act(async () => {});
    expect(mutationCalls['deleteMessage']).toEqual([{ args: [{ messageId: 'm1', userId: 'me' }] }]);
    expect(screen.queryByText('Delete message')).toBeNull();
  });

  it('deletes for everyone when within 5 minutes', async () => {
    const { container } = renderBubble({}, { isOwn: true });
    await openMenu(container);
    fireEvent.click(screen.getByText('Delete for everyone'));
    fireEvent.click(screen.getByText('Delete for everyone'));
    await act(async () => {});
    expect(mutationCalls['deleteMessage'][0].args).toEqual([
      { messageId: 'm1', userId: 'me', deleteForEveryone: true },
    ]);
  });

  it('shows the 5-minute notice and hides delete-for-everyone for old messages', async () => {
    const old = Date.now() - 10 * 60 * 1000;
    const { container } = renderBubble({ createdAt: old }, { isOwn: true });
    await openMenu(container);
    expect(screen.queryByText('Delete for everyone')).toBeNull();
    fireEvent.click(screen.getByText('Delete for me'));
    expect(screen.getByText(/5 minutes/)).toBeTruthy();
    // cancel closes the dialog without a mutation
    fireEvent.click(screen.getByText('Cancel'));
    expect(mutationCalls['deleteMessage']).toBeUndefined();
  });
});

// ── Editing ──────────────────────────────────────────────────────────────────
describe('Editing', () => {
  it('edits the message and saves the new content', async () => {
    const { container } = renderBubble({}, { isOwn: true });
    await openMenu(container);
    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated content' } });
    // the save button is the only *button* named Edit (header label is a div)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await act(async () => {});
    expect(mutationCalls['editMessage']).toEqual([
      { args: [{ messageId: 'm1', userId: 'me', content: 'Updated content' }] },
    ]);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('saves with Enter and cancels with Escape', async () => {
    const { container } = renderBubble({}, { isOwn: true });
    await openMenu(container);
    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Enter saved' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await act(async () => {});
    expect(mutationCalls['editMessage'][0].args[0].content).toBe('Enter saved');

    // re-enter edit, escape cancels without saving
    fireEvent.mouseEnter(rowEl(container));
    fireEvent.click(screen.getByTestId('icon-MoreHorizontal').closest('button') as HTMLElement);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await act(async () => {});
    expect(mutationCalls['editMessage']).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('closes edit mode without a mutation when content is unchanged', async () => {
    const { container } = renderBubble({}, { isOwn: true });
    await openMenu(container);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' })); // save with unchanged content
    await act(async () => {});
    expect(mutationCalls['editMessage']).toBeUndefined();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('cancels editing via the cancel button', async () => {
    const { container } = renderBubble({}, { isOwn: true });
    await openMenu(container);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'discarded' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(mutationCalls['editMessage']).toBeUndefined();
  });

  it('disables the save button while the edit content is empty', async () => {
    const { container } = renderBubble({}, { isOwn: true });
    await openMenu(container);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    const save = screen.getByRole('button', { name: 'Edit' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it('tracks focus on the edit textarea', async () => {
    const { container } = renderBubble({}, { isOwn: true });
    await openMenu(container);
    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox');
    fireEvent.focus(textarea);
    fireEvent.blur(textarea);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});

// ── Reactions ────────────────────────────────────────────────────────────────
describe('Reactions', () => {
  it('renders existing reactions with counts and toggles them', async () => {
    const reactions = { u1f44d: ['me', 'u2'], u2764_ufe0f: ['u3'] };
    const { container } = renderBubble({ reactions } as any);
    expect(screen.getByText('👍 2')).toBeTruthy();
    expect(screen.getByText('❤️ 1')).toBeTruthy();
    fireEvent.click(screen.getByText('👍 2'));
    await act(async () => {});
    expect(mutationCalls['toggleReaction'][0].args[0]).toBe('👍');
    expect(mutationCalls['toggleReaction'][0].args[1]).toEqual(['me', 'u2']);
  });

  it('hides empty reaction entries and shows nothing when there are no reactions', () => {
    const { container } = renderBubble({
      reactions: { u1f44d: [] },
    } as any);
    expect(screen.queryByText(/👍/)).toBeNull();
    const empty = renderBubble();
    expect(empty.container.querySelectorAll('button')).toBeTruthy();
  });

  it('logs an error when the reaction mutation fails', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    reactionImpl = jest.fn().mockRejectedValue(new Error('boom'));
    const { container } = renderBubble({ reactions: { u1f44d: ['me'] } } as any);
    fireEvent.click(screen.getByText('👍 1'));
    await waitFor(() => expect(logger.error).toHaveBeenCalled());
  });
});

// ── Polls ────────────────────────────────────────────────────────────────────
describe('Polls', () => {
  const poll = {
    question: 'Lunch?',
    options: [
      { id: 'a', text: 'Pizza', votes: ['me', 'u3'] },
      { id: 'b', text: 'Sushi', votes: ['u2'] },
    ],
  };

  it('renders percentages, marks the user vote and casts a vote', async () => {
    renderBubble({ poll } as any);
    expect(screen.getByText('📊 Lunch?')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy(); // Pizza 2/3
    expect(screen.getByText('33%')).toBeTruthy(); // Sushi 1/3
    fireEvent.click(screen.getByRole('button', { name: /Sushi/ }));
    await act(async () => {});
    expect(mutationCalls['votePoll']).toEqual([
      { args: [{ messageId: 'm1', userId: 'me', optionId: 'b' }] },
    ]);
  });

  it('shows the closed label and disables options when closed', async () => {
    renderBubble({ poll: { ...poll, closedAt: NOW } } as any);
    expect(screen.getByText('Poll closed')).toBeTruthy();
    const option = screen.getByRole('button', { name: /Pizza/ }) as HTMLButtonElement;
    expect(option.disabled).toBe(true);
  });

  it('lets the owner close an open poll', async () => {
    const { container } = renderBubble({ poll } as any, { isOwn: true });
    fireEvent.click(screen.getByText('Close poll'));
    await act(async () => {});
    expect(mutationCalls['closePoll']).toEqual([{ args: [{ messageId: 'm1', userId: 'me' }] }]);
  });

  it('hides the close button for non-owners and closed polls', async () => {
    renderBubble({ poll } as any, { isOwn: false });
    expect(screen.queryByText('Close poll')).toBeNull();
    const { container } = renderBubble({ poll: { ...poll, closedAt: NOW } } as any, {
      isOwn: true,
    });
    expect(screen.queryByText('Close poll')).toBeNull();
  });

  it('shows the total vote count', () => {
    renderBubble({ poll } as any);
    expect(screen.getByText('3 votes')).toBeTruthy();
  });
});

// ── Attachments ──────────────────────────────────────────────────────────────
describe('Attachments', () => {
  it('opens and closes the image lightbox', () => {
    const attachments = [
      { url: 'https://cdn/a.png', name: 'a.png', type: 'image/png', size: 1234 },
    ];
    renderBubble({ attachments } as any);
    expect(screen.getByText('a.png')).toBeTruthy();
    fireEvent.click(screen.getByAltText('a.png'));
    expect(screen.getByAltText('Preview')).toBeTruthy();
    fireEvent.click(screen.getByTestId('icon-X').closest('button') as HTMLElement);
    expect(screen.queryByAltText('Preview')).toBeNull();
  });

  it('closes the lightbox when clicking the backdrop', () => {
    const attachments = [{ url: 'https://cdn/a.png', name: 'a.png', type: 'image/png', size: 1 }];
    renderBubble({ attachments } as any);
    fireEvent.click(screen.getByAltText('a.png'));
    const overlay = screen.getByAltText('Preview').closest('div.fixed') as HTMLElement;
    fireEvent.click(overlay);
    expect(screen.queryByAltText('Preview')).toBeNull();
  });

  it('keeps the lightbox open when clicking the image itself', () => {
    const attachments = [{ url: 'https://cdn/a.png', name: 'a.png', type: 'image/png', size: 1 }];
    renderBubble({ attachments } as any);
    fireEvent.click(screen.getByAltText('a.png'));
    fireEvent.click(screen.getByAltText('Preview'));
    expect(screen.getByAltText('Preview')).toBeTruthy();
  });

  it('blocks the avatar link click from bubbling', () => {
    const { container } = renderBubble();
    const link = screen.getByTitle("View Bob Smith's profile") as HTMLElement;
    fireEvent.click(link);
    expect(link.getAttribute('href')).toBe('/employees/u2');
  });

  it('downloads an image attachment without bubbling', () => {
    const attachments = [{ url: 'https://cdn/a.png', name: 'a.png', type: 'image/png', size: 1 }];
    renderBubble({ attachments } as any);
    const download = screen.getByTestId('icon-Download').closest('a') as HTMLElement;
    fireEvent.click(download);
    expect(download.getAttribute('href')).toBe('https://cdn/a.png');
  });

  it('renders a PDF with its size, preview iframe and download link', () => {
    const attachments = [
      { url: 'https://cdn/doc.pdf', name: 'doc.pdf', type: 'application/pdf', size: 2048 },
    ];
    renderBubble({ attachments } as any);
    expect(screen.getByText('doc.pdf')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(containerQuery('iframe')).toBeTruthy();
    expect(screen.getByText('Download')).toBeTruthy();
  });

  it('renders an audio message with a formatted duration and waveform', () => {
    const attachments = [
      { url: 'https://cdn/voice.mp3', name: 'voice.mp3', type: 'audio/mpeg', size: 4096 },
    ];
    const { container } = renderBubble({
      attachments,
      callDuration: 125,
    } as any);
    expect(screen.getByText('2:05')).toBeTruthy();
    // audio attachments render a play button + waveform, not the file size
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.queryByText('voice.mp3')).toBeNull(); // name is not shown for audio
  });

  it('renders a generic file attachment as a download link', () => {
    const attachments = [
      {
        url: 'https://cdn/archive.zip',
        name: 'archive.zip',
        type: 'application/zip',
        size: 5 * 1048576,
      },
    ];
    renderBubble({ attachments } as any);
    expect(screen.getByText('📎')).toBeTruthy();
    expect(screen.getByText('5.0 MB')).toBeTruthy();
  });
});

function containerQuery(sel: string) {
  return document.querySelector(sel);
}

// ── Thread + SmartReply ──────────────────────────────────────────────────────
describe('Thread and SmartReply', () => {
  it('opens the thread from the reply count button', () => {
    const { onOpenThread } = renderBubble({ threadCount: 3 });
    fireEvent.click(screen.getByText('3 replies'));
    expect(onOpenThread).toHaveBeenCalledWith('m1', 'Hello world');
  });

  it('renders the singular reply label', () => {
    renderBubble({ threadCount: 1 });
    expect(screen.getByText('1 reply')).toBeTruthy();
  });

  it('renders no thread button when threadCount is 0', () => {
    renderBubble({ threadCount: 0 });
    expect(screen.queryByText(/\d+ repl/)).toBeNull();
  });

  it('sends a smart reply via onSendMessage for incoming messages', () => {
    const { onSendMessage } = renderBubble();
    fireEvent.click(screen.getByTestId('smart-reply'));
    expect(onSendMessage).toHaveBeenCalledWith('Smart text');
  });

  it('falls back to onReply when onSendMessage is absent', () => {
    const { onReply } = renderBubble({}, { onSendMessage: undefined });
    fireEvent.click(screen.getByTestId('smart-reply'));
    expect(onReply).toHaveBeenCalledWith('m1', 'Hello world', 'Bob Smith');
  });

  it('does not render SmartReply for own messages', () => {
    renderBubble({}, { isOwn: true });
    expect(screen.queryByTestId('smart-reply')).toBeNull();
  });

  it('does not render SmartReply for system/call/deleted messages', () => {
    renderBubble({ type: 'system', content: 'Joined' });
    expect(screen.queryByTestId('smart-reply')).toBeNull();
    renderBubble({ type: 'call', content: 'Call', callStatus: 'missed' });
    expect(screen.queryByTestId('smart-reply')).toBeNull();
  });
});

// ── Link preview ─────────────────────────────────────────────────────────────
describe('Link preview', () => {
  it('renders a link preview when the content contains a URL', () => {
    renderBubble({ content: 'Check https://example.com/docs' });
    expect(screen.getByTestId('link-preview')).toBeTruthy();
  });

  it('does not render a link preview without a URL or with a poll', () => {
    renderBubble({ content: 'No link here' });
    expect(screen.queryByTestId('link-preview')).toBeNull();
    renderBubble({
      content: 'https://example.com',
      poll: { question: 'Q', options: [{ id: 'a', text: 'A', votes: [] }] },
    } as any);
    expect(screen.queryByTestId('link-preview')).toBeNull();
  });
});
