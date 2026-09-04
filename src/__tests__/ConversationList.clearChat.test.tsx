/**
 * Tests for the "Clear chat" entry of the conversation context menu.
 *
 * Clearing wipes the history from the database for every participant, so unlike
 * the reversible per-user actions next to it, the item must ask first and only
 * call the mutation from the confirmation dialog.
 *
 * The Radix context menu and dialog are stubbed (they are portal- and
 * pointer-event-driven, which jsdom does not model) — the menu content renders
 * inline and each item becomes a button.
 */

import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

jest.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: any) => <>{children}</>,
  ContextMenuTrigger: ({ children }: any) => <>{children}</>,
  ContextMenuContent: ({ children }: any) => <div>{children}</div>,
  ContextMenuLabel: ({ children }: any) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
  ContextMenuItem: ({ children, onClick, disabled }: any) => (
    <button type="button" disabled={disabled} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogAction: ({ children, onClick, disabled }: any) => (
    <button type="button" disabled={disabled} onClick={(e) => onClick?.(e)}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children, onClick, disabled }: any) => (
    <button type="button" disabled={disabled} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
}));

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

function renderList(onClearChat?: (id: never) => Promise<void>) {
  return render(
    <ConversationList
      conversations={[direct] as never}
      selectedId={null as never}
      currentUserId={'u-1' as never}
      onSelect={jest.fn()}
      collapsed={false}
      onToggleCollapse={jest.fn()}
      onNewConversation={jest.fn()}
      onClearChat={onClearChat as never}
    />,
  );
}

/** Open the confirmation dialog from the context-menu item. */
async function openConfirm() {
  fireEvent.click(screen.getByText('chat.clearChat'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
}

describe('ConversationList — clear chat', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('chat_filters', JSON.stringify(['chat']));
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('omits the item when no handler is wired', () => {
    renderList(undefined);
    expect(screen.queryByText('chat.clearChat')).not.toBeInTheDocument();
  });

  it('asks for confirmation instead of clearing straight away', async () => {
    const onClearChat = jest.fn(async () => {});
    renderList(onClearChat);
    await openConfirm();
    expect(onClearChat).not.toHaveBeenCalled();
    expect(screen.getByText('chat.clearChatConfirm')).toBeInTheDocument();
  });

  it('clears the conversation once confirmed and reports success', async () => {
    const onClearChat = jest.fn(async () => {});
    renderList(onClearChat);
    await openConfirm();
    // Both the title and the confirm button carry the same label.
    fireEvent.click(screen.getAllByText('chat.clearChat').slice(-1)[0] as HTMLElement);
    await waitFor(() => expect(onClearChat).toHaveBeenCalledWith('conv-direct'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('chat.chatCleared'));
    // Dialog closes on success.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the dialog open and surfaces an error when the mutation fails', async () => {
    const onClearChat = jest.fn(async () => {
      throw new Error('too long');
    });
    renderList(onClearChat);
    await openConfirm();
    fireEvent.click(screen.getAllByText('chat.clearChat').slice(-1)[0] as HTMLElement);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('chat.clearChatFailed'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the dialog from cancel without clearing', async () => {
    const onClearChat = jest.fn(async () => {});
    renderList(onClearChat);
    await openConfirm();
    fireEvent.click(screen.getByText('common.cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onClearChat).not.toHaveBeenCalled();
  });
});
