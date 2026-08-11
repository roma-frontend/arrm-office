/**
 * Tests for ServiceBroadcastsManager — the admin panel that lists service
 * broadcast announcements and lets admins delete them.
 *
 * Covers: loading state (query undefined), empty state, the broadcast list
 * (icon, title, content, sender, localized date for en/ru/hy), the disabled
 * edit button, the delete flow (open dialog, cancel, confirm → mutation with
 * the right payload + logger), delete errors (Error instance / non-Error),
 * and the in-progress deleting state.
 *
 * Mocks: react-i18next (mutable language), convex/react keyed by _name,
 * generated api, sonner toast, logger, UI primitives (card, button,
 * alert-dialog, ShieldLoader) and lucide icons.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

// ── i18n ─────────────────────────────────────────────────────────────────────
let mockLanguage = 'en';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Object options render the interpolated sender; all other keys resolve
    // to the key itself so assertions can match on stable strings.
    t: (key: string, options?: any) => {
      if (options && typeof options === 'object') {
        return options.sender ?? key;
      }
      return options ?? key;
    },
    i18n: { language: mockLanguage },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
let mockBroadcasts: any = undefined;
let mockDeleteMessage: jest.Mock = jest.fn();
jest.mock('convex/react', () => ({
  useQuery: (q: any) => (q?._name === 'getServiceBroadcasts' ? mockBroadcasts : undefined),
  useMutation: (m: any) => (m?._name === 'deleteMessage' ? mockDeleteMessage : jest.fn()),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    chat: {
      queries: { getServiceBroadcasts: { _name: 'getServiceBroadcasts' } },
      mutations: { deleteMessage: { _name: 'deleteMessage' } },
    },
  },
}));

// ── Toast / logger ───────────────────────────────────────────────────────────
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({
  toast: mockToast,
}));

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() };
jest.mock('@/lib/logger', () => ({
  logger: mockLogger,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type = 'button', ...props }: any) => (
    <button type={type} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, style }: any) => (
    <div data-testid="card" style={style}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: any) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick, disabled, ...props }: any) => (
    <button data-testid="alert-action" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children, onClick, disabled, ...props }: any) => (
    <button data-testid="alert-cancel" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Edit2: Icon, Trash2: Icon, MessageCircle: Icon, Clock: Icon };
});

import { ServiceBroadcastsManager } from '@/components/admin/ServiceBroadcastsManager';

const BROADCASTS: any[] = [
  {
    _id: 'b1',
    icon: '🎉',
    title: 'Team lunch',
    content: 'Join us Friday at noon in the canteen.',
    senderName: 'HR Team',
    createdAt: Date.parse('2024-05-15T10:30:00Z'),
  },
  {
    _id: 'b2',
    icon: '📢',
    title: 'Maintenance window',
    content: 'System downtime tonight from 23:00.',
    senderName: 'IT',
    createdAt: Date.parse('2024-06-01T09:00:00Z'),
  },
];

describe('ServiceBroadcastsManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = 'en';
    mockBroadcasts = undefined;
    mockDeleteMessage.mockReset().mockResolvedValue(undefined);
  });

  it('renders a loader while the broadcasts query is loading', () => {
    mockBroadcasts = undefined;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.historyTitle')).toBeInTheDocument();
  });

  it('renders the empty state when there are no broadcasts', () => {
    mockBroadcasts = [];
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    expect(screen.getByText('broadcasts.noAnnouncements')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.createNewAbove')).toBeInTheDocument();
  });

  it('renders the broadcast list with sender, content and the count in the title', () => {
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    expect(screen.getByText('broadcasts.historyTitle (2)')).toBeInTheDocument();
    expect(screen.getByText('🎉')).toBeInTheDocument();
    expect(screen.getByText('Team lunch')).toBeInTheDocument();
    expect(screen.getByText('Join us Friday at noon in the canteen.')).toBeInTheDocument();
    expect(screen.getAllByText(/HR Team/)).toHaveLength(1);
    expect(screen.getAllByText(/^IT$/)).toHaveLength(1);
  });

  it('formats the date with the English locale by default', () => {
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    const expected = format(new Date(BROADCASTS[0].createdAt), 'd MMM yyyy, HH:mm', {
      locale: enUS,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('formats the date with the Russian locale', () => {
    mockLanguage = 'ru';
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    const expected = format(new Date(BROADCASTS[0].createdAt), 'd MMM yyyy, HH:mm', {
      locale: ru,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('formats the date with the Armenian locale', () => {
    mockLanguage = 'hy';
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    const expected = format(new Date(BROADCASTS[0].createdAt), 'd MMM yyyy, HH:mm', {
      locale: hy,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders a disabled edit button with a tooltip', () => {
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    const editButton = screen.getAllByTitle('broadcasts.editSoon')[0];
    expect(editButton).toBeDisabled();
    expect(screen.getAllByText('broadcasts.delete')).toHaveLength(2);
  });

  it('opens the delete dialog when the delete button is clicked', () => {
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    const deleteButtons = screen.getAllByText('broadcasts.delete');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.deleteConfirmTitle')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.deleteConfirmDesc')).toBeInTheDocument();
  });

  it('cancels the dialog without deleting', () => {
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    fireEvent.click(screen.getAllByText('broadcasts.delete')[0]);
    fireEvent.click(screen.getByTestId('alert-cancel'));
    expect(screen.queryByTestId('alert-dialog')).toBeNull();
    expect(mockDeleteMessage).not.toHaveBeenCalled();
  });

  it('confirms deletion with the correct payload and closes the dialog', async () => {
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    fireEvent.click(screen.getAllByText('broadcasts.delete')[1]);
    fireEvent.click(screen.getByTestId('alert-action'));
    await waitFor(() =>
      expect(mockDeleteMessage).toHaveBeenCalledWith({
        messageId: 'b2',
        userId: 'u1',
        deleteForEveryone: true,
      }),
    );
    expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Deleting broadcast b2'));
    expect(screen.queryByTestId('alert-dialog')).toBeNull();
  });

  it('shows the deleting state and disables the dialog buttons while deleting', async () => {
    let resolveDelete: (v: unknown) => void;
    mockDeleteMessage.mockImplementation(() => new Promise((resolve) => (resolveDelete = resolve)));
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    fireEvent.click(screen.getAllByText('broadcasts.delete')[0]);
    fireEvent.click(screen.getByTestId('alert-action'));
    await waitFor(() => expect(screen.getByText('broadcasts.deleting')).toBeInTheDocument());
    expect(screen.getByTestId('alert-action')).toBeDisabled();
    expect(screen.getByTestId('alert-cancel')).toBeDisabled();
    resolveDelete!(undefined);
    await waitFor(() => expect(screen.queryByTestId('alert-dialog')).toBeNull());
  });

  it('shows an error toast when deletion fails with an Error', async () => {
    mockDeleteMessage.mockRejectedValue(new Error('boom'));
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    fireEvent.click(screen.getAllByText('broadcasts.delete')[0]);
    fireEvent.click(screen.getByTestId('alert-action'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('broadcasts.deleteFailed'));
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[ServiceBroadcastsManager] ✗ Failed to delete broadcast:',
      'boom',
    );
    // Dialog stays open so the user can retry.
    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
  });

  it('stringifies a non-Error failure', async () => {
    mockDeleteMessage.mockRejectedValue('plain failure');
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    fireEvent.click(screen.getAllByText('broadcasts.delete')[0]);
    fireEvent.click(screen.getByTestId('alert-action'));
    await waitFor(() =>
      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), 'plain failure'),
    );
  });

  it('applies hover styling on the broadcast rows', () => {
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);
    const row = document.querySelector('.p-4.rounded-lg') as HTMLElement;
    expect(row).not.toBeNull();
    fireEvent.mouseEnter(row);
    expect(row.style.backgroundColor).toBe('var(--card-hover)');
    fireEvent.mouseLeave(row);
    expect(row.style.backgroundColor).toBe('transparent');
  });

  it('applies hover styling on the action and dialog buttons', () => {
    mockBroadcasts = BROADCASTS;
    render(<ServiceBroadcastsManager organizationId="o1" userId="u1" />);

    // Disabled edit button: the guarded branch is skipped on enter.
    const editButton = screen.getAllByTitle('broadcasts.editSoon')[0] as HTMLElement;
    fireEvent.mouseEnter(editButton);
    fireEvent.mouseLeave(editButton);
    expect(editButton.style.backgroundColor).toBe('var(--background-subtle)');

    // Delete button opacity hover.
    const deleteButton = screen
      .getAllByText('broadcasts.delete')[0]
      .closest('button') as HTMLElement;
    fireEvent.mouseEnter(deleteButton);
    expect(deleteButton.style.opacity).toBe('0.9');
    fireEvent.mouseLeave(deleteButton);
    expect(deleteButton.style.opacity).toBe('1');

    // Dialog cancel/action hover while the dialog is open.
    fireEvent.click(screen.getAllByText('broadcasts.delete')[0]);
    const cancelButton = screen.getByTestId('alert-cancel') as HTMLElement;
    fireEvent.mouseEnter(cancelButton);
    expect(cancelButton.style.backgroundColor).toBe('var(--card-hover)');
    fireEvent.mouseLeave(cancelButton);
    expect(cancelButton.style.backgroundColor).toBe('var(--background-subtle)');
    const actionButton = screen.getByTestId('alert-action') as HTMLElement;
    fireEvent.mouseEnter(actionButton);
    expect(actionButton.style.opacity).toBe('0.9');
    fireEvent.mouseLeave(actionButton);
    expect(actionButton.style.opacity).toBe('1');
  });
});
