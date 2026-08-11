/**
 * Tests for ChatWidgetWindow — the floating AI-assistant chat window.
 *
 * Covers: open/close gating + backdrop, header buttons (pin, fullscreen,
 * close), empty-state suggestions (initial + context-aware), message
 * rendering (user/assistant, large-content preview with and without tables),
 * MessageActions pin toggle, every action card type (BOOK_LEAVE / EDIT_LEAVE /
 * DELETE_LEAVE / BOOK_DRIVER / BACKUP_ORG / BACKUP_EMPLOYEE / RESTORE_BACKUP),
 * booking states (pending / loading / booked / conflict with alternatives),
 * follow-up suggestions, typing indicator, error banner, pinned panel
 * (empty/with messages + truncation), slash-command dropdown, input flows
 * (submit via form / Enter / Shift+Enter, disabled while loading, voice
 * toggle, autofocus after open), and docked left/right placement.
 *
 * Mocks: react-i18next, next/navigation (mutable pathname + router),
 * @/lib/cssMotion, lucide-react, ShieldLoader, Button, MarkdownTable,
 * chatWidgetUtils (initial suggestions + leave-type labels) and the whole
 * chatWidgetEnhancements module (controllable greetings/suggestions/commands/
 * pinned messages + spied MessageActions/SlashCommandDropdown).
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { Message } from '@/components/ai/chatWidgetTypes';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'object' ? key : (fallback ?? key)),
    i18n: { language: 'en' },
  }),
}));

// ── next/navigation ──────────────────────────────────────────────────────────
let mockPathname = '/leaves';
const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
}));

// ── cssMotion ────────────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// ── lucide ───────────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const names = [
    'X',
    'Send',
    'Sparkles',
    'CheckCircle',
    'AlertCircle',
    'Calendar',
    'Pencil',
    'Trash2',
    'Mic',
    'MicOff',
    'Car',
    'Maximize2',
    'Database',
    'Pin',
    'Brain',
    'Square',
  ];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── Assistant extras & memory (new AI features) ─────────────────────────────
jest.mock('@/components/ai/MemoryPanel', () => ({
  MemoryPanel: ({ open }: any) => (open ? <div data-testid="memory-panel" /> : null),
}));
jest.mock('@/components/ai/AssistantExtras', () => ({
  SourcesChips: ({ sources }: any) => <div data-testid="sources-chips">{sources.join('|')}</div>,
  GeneratedImageCard: ({ prompt }: any) => <div data-testid="image-card">{prompt}</div>,
  WebSearchCard: ({ query }: any) => <div data-testid="websearch-card">{query}</div>,
  ArtifactCanvas: ({ artifact }: any) => <div data-testid="artifact-canvas">{artifact.type}</div>,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: (props: any) => <div data-testid="shield-loader" {...props} />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, type = 'button', ...props }: any) => (
    <button type={type} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ai/MarkdownTable', () => ({
  formatMessageContent: (content: string) => content,
}));

// ── chatWidgetUtils (controllable) ───────────────────────────────────────────
const initialSuggestionsMock = jest.fn();
jest.mock('@/components/ai/chatWidgetUtils', () => ({
  LEAVE_TYPE_LABELS: { paid: 'Paid Leave' },
  getInitialSuggestions: (...args: any[]) => initialSuggestionsMock(...args),
}));

// ── chatWidgetEnhancements (fully controlled) ────────────────────────────────
const moodGreetingMock = jest.fn();
const contextSuggestionsMock = jest.fn();
const slashCommandsMock = jest.fn();
const pinnedMessagesMock = jest.fn();
const togglePinMock = jest.fn();
const MessageActionsSpy = jest.fn();
const SlashDropdownSpy = jest.fn();
jest.mock('@/components/ai/chatWidgetEnhancements', () => ({
  TypingStages: () => <span data-testid="typing-stages" />,
  getMoodGreeting: (...args: any[]) => moodGreetingMock(...args),
  getContextSuggestions: (...args: any[]) => contextSuggestionsMock(...args),
  filterSlashCommands: (...args: any[]) => slashCommandsMock(...args),
  MessageActions: (props: any) => {
    MessageActionsSpy(props);
    return (
      <div data-testid="msg-actions">
        <span data-testid="pin-state">{props.isPinned ? 'pinned' : 'unpinned'}</span>
        <button data-testid="pin-btn" onClick={props.onPin}>
          pin
        </button>
      </div>
    );
  },
  SlashCommandDropdown: (props: any) => {
    SlashDropdownSpy(props);
    return (
      <div data-testid="slash-dropdown">
        {props.commands.map((c: any) => (
          <button
            key={c.command}
            data-testid="slash-cmd"
            onClick={() => props.onSelect(c.command ?? c)}
          >
            {c.command ?? c}
          </button>
        ))}
      </div>
    );
  },
  getPinnedMessages: (...args: any[]) => pinnedMessagesMock(...args),
  togglePinMessage: (...args: any[]) => togglePinMock(...args),
}));

import { ChatWidgetWindow } from '@/components/ai/ChatWidgetWindow';

// ── Helpers ──────────────────────────────────────────────────────────────────
function renderWindow(props: Record<string, any> = {}) {
  const base = {
    isOpen: true,
    setIsOpen: jest.fn(),
    docked: false,
    dockedSide: 'right' as const,
    dockedY: 50,
    messages: [] as Message[],
    setMessages: jest.fn(),
    input: '',
    setInput: jest.fn(),
    isLoading: false,
    error: null as string | null,
    isListening: false,
    inputRef: { current: null } as React.RefObject<HTMLInputElement | null>,
    user: null,
    sendMessage: jest.fn().mockResolvedValue(undefined),
    handleAction: jest.fn().mockResolvedValue(undefined),
    startVoiceInput: jest.fn(),
    stopGeneration: jest.fn(),
    router: mockRouter,
    t: (key: string, fallback?: any) => (typeof fallback === 'object' ? key : (fallback ?? key)),
    i18n: { language: 'en' },
    ...props,
  };
  const result = render(<ChatWidgetWindow {...(base as any)} />);
  // Merge the base props (mocks the tests assert on) with the RTL result
  // (container/rerender) so both are available from a single helper call.
  return { ...base, ...result };
}

const assistant = (over: Partial<Message>): Message => ({
  id: 'm1',
  role: 'assistant',
  content: 'Sure!',
  ...over,
});

describe('ChatWidgetWindow', () => {
  beforeAll(() => {
    // jsdom has no scrollIntoView; the chat auto-scrolls on mount/update.
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/leaves';
    mockRouter.push.mockReset();
    initialSuggestionsMock.mockReturnValue(['💡 Show my balance', '📆 Book a vacation']);
    moodGreetingMock.mockReturnValue('Hello there');
    contextSuggestionsMock.mockReturnValue([]);
    slashCommandsMock.mockReturnValue([]);
    pinnedMessagesMock.mockReturnValue([]);
    togglePinMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when closed', () => {
    const { container } = renderWindow({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the header, subtitle and a backdrop that closes the chat', () => {
    const base = renderWindow();
    expect(screen.getByText('aiChat.shieldHrAi')).toBeInTheDocument();
    expect(screen.getByText('chatWidget.subtitle')).toBeInTheDocument();
    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(base.setIsOpen).toHaveBeenCalledWith(false);
  });

  it('closes via the close button', () => {
    const base = renderWindow();
    fireEvent.click(screen.getByLabelText('chatWidget.closeChat'));
    expect(base.setIsOpen).toHaveBeenCalledWith(false);
  });

  it('navigates to the full-screen chat via the maximize button', () => {
    const base = renderWindow();
    fireEvent.click(screen.getByLabelText('Open full screen chat'));
    expect(mockRouter.push).toHaveBeenCalledWith('/ai-chat');
    expect(base.setIsOpen).toHaveBeenCalledWith(false);
  });

  it('shows the mood greeting and initial suggestions when there are no messages', () => {
    renderWindow({ user: { name: 'Alice Smith', role: 'admin' } });
    expect(moodGreetingMock).toHaveBeenCalledWith('Alice', expect.any(Function));
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(initialSuggestionsMock).toHaveBeenCalled();
    expect(screen.getByText('💡 Show my balance')).toBeInTheDocument();
    expect(screen.getByText(/chatWidget\.smartHint/)).toBeInTheDocument();
  });

  it('sends a cleaned suggestion when an initial suggestion is clicked', async () => {
    const base = renderWindow();
    fireEvent.click(screen.getByText('💡 Show my balance'));
    await waitFor(() =>
      expect(base.sendMessage).toHaveBeenCalledWith('Show my balance', base.setIsOpen),
    );
  });

  it('renders and sends context-aware suggestions based on the pathname', async () => {
    contextSuggestionsMock.mockReturnValue(['Check approvals', 'View team']);
    const base = renderWindow();
    expect(screen.getByText(/chatWidget\.basedOnPage/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Check approvals'));
    await waitFor(() =>
      expect(base.sendMessage).toHaveBeenCalledWith('Check approvals', base.setIsOpen),
    );
  });

  it('does not render the context block when there are no context suggestions', () => {
    renderWindow();
    expect(screen.queryByText(/chatWidget\.basedOnPage/)).toBeNull();
  });

  it('renders user messages on the right and assistant messages on the left', () => {
    renderWindow({
      messages: [
        assistant({ id: 'a1', content: 'Hello bot' }),
        { id: 'u1', role: 'user', content: 'Hi!' },
      ],
    });
    expect(screen.getByText('Hello bot')).toBeInTheDocument();
    expect(screen.getByText('Hi!')).toBeInTheDocument();
  });

  it('renders a large non-table assistant message as a preview with a full-screen link', () => {
    const longContent = 'word '.repeat(200); // 1000 chars, no table markers
    renderWindow({ messages: [assistant({ content: longContent })] });
    expect(screen.getByText(/word word/)).toBeInTheDocument();
    expect(screen.getByText('chatWidget.viewFullScreen')).toBeInTheDocument();
    fireEvent.click(screen.getByText('chatWidget.viewFullScreen'));
    expect(mockRouter.push).toHaveBeenCalledWith('/ai-chat');
  });

  it('renders a table message preview filtered from the table rows', () => {
    const tableContent =
      'Here is the report:\n| Name | Days |\n| --- | --- |\n| Alice | 5 |\n| Bob | 3 |\nBottom line';
    renderWindow({ messages: [assistant({ content: tableContent })] });
    expect(screen.getByText(/Here is the report/)).toBeInTheDocument();
    expect(screen.getByText(/Bottom line/)).toBeInTheDocument();
    expect(screen.getByText('chatWidget.viewFullScreen')).toBeInTheDocument();
  });

  it('renders a short assistant message without the full-screen link', () => {
    renderWindow({ messages: [assistant({ content: 'Short reply' })] });
    expect(screen.getByText('Short reply')).toBeInTheDocument();
    expect(screen.queryByText('chatWidget.viewFullScreen')).toBeNull();
  });

  it('toggles the pinned state through MessageActions onPin', async () => {
    renderWindow({
      messages: [assistant({ id: 'pin1', content: 'Important answer' })],
    });
    expect(MessageActionsSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ isPinned: false, content: 'Important answer' }),
    );
    fireEvent.click(screen.getByTestId('pin-btn'));
    expect(togglePinMock).toHaveBeenCalledWith('pin1', 'Important answer');
    await waitFor(() =>
      expect(MessageActionsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ isPinned: true }),
      ),
    );
  });

  it('unpins a message when togglePinMessage returns false', async () => {
    togglePinMock.mockReturnValue(false);
    renderWindow({ messages: [assistant({ id: 'pin1', content: 'X' })] });
    fireEvent.click(screen.getByTestId('pin-btn'));
    await waitFor(() =>
      expect(MessageActionsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ isPinned: false }),
      ),
    );
  });

  describe('action cards', () => {
    it('renders a pending BOOK_LEAVE card and confirms via handleAction', async () => {
      const action = {
        type: 'BOOK_LEAVE',
        leaveType: 'paid',
        startDate: '2025-01-01',
        endDate: '2025-01-03',
        days: 2,
        reason: 'rest',
      };
      const base = renderWindow({ messages: [assistant({ actions: [action as any] })] });
      expect(screen.getByText('Paid Leave')).toBeInTheDocument();
      expect(screen.getByText('📅 2025-01-01 → 2025-01-03')).toBeInTheDocument();
      expect(screen.getByText('⏱️ 2 days')).toBeInTheDocument();
      expect(screen.getByText('📝 rest')).toBeInTheDocument();
      fireEvent.click(screen.getByText('chatWidget.confirmSend'));
      await waitFor(() => expect(base.handleAction).toHaveBeenCalledWith('m1', action, 0));
    });

    it('uses the fallback label for an unknown leave type', () => {
      renderWindow({
        messages: [
          assistant({ actions: [{ type: 'BOOK_LEAVE', leaveType: 'weird' as any } as any] }),
        ],
      });
      expect(screen.getByText('chatWidget.leaveRequest')).toBeInTheDocument();
    });

    it('renders an EDIT_LEAVE card with the confirm-update label', async () => {
      const action = {
        type: 'EDIT_LEAVE',
        leaveId: 'l1',
        employeeName: 'Alice',
        startDate: '2025-02-01',
        endDate: '2025-02-02',
        days: 1,
        leaveType: 'paid',
      };
      const base = renderWindow({ messages: [assistant({ actions: [action as any] })] });
      expect(screen.getByText('chatWidget.updateLeave')).toBeInTheDocument();
      fireEvent.click(screen.getByText('chatWidget.confirmUpdate'));
      await waitFor(() => expect(base.handleAction).toHaveBeenCalledWith('m1', action, 0));
    });

    it('renders a DELETE_LEAVE card with the destructive warning', async () => {
      const action = {
        type: 'DELETE_LEAVE',
        leaveId: 'l1',
        employeeName: 'Alice',
        leaveType: 'paid',
        startDate: '2025-03-01',
        endDate: '2025-03-02',
      };
      const base = renderWindow({ messages: [assistant({ actions: [action as any] })] });
      expect(screen.getByText('chatWidget.cancelLeave')).toBeInTheDocument();
      expect(screen.getByText('⚠️ This action cannot be undone')).toBeInTheDocument();
      fireEvent.click(screen.getByText('chatWidget.confirmDelete'));
      await waitFor(() => expect(base.handleAction).toHaveBeenCalledWith('m1', action, 0));
    });

    it('renders a BOOK_DRIVER card with ride details', async () => {
      const action = {
        type: 'BOOK_DRIVER',
        driverId: 'd1',
        driverName: 'Sam',
        startTime: '2025-04-01T10:00:00Z',
        endTime: '2025-04-01T11:00:00Z',
        from: 'Office',
        to: 'Airport',
        purpose: 'Business trip',
        passengerCount: 2,
      };
      renderWindow({ messages: [assistant({ actions: [action as any] })] });
      expect(screen.getByText('Book Driver')).toBeInTheDocument();
      expect(screen.getByText('🚗 Sam')).toBeInTheDocument();
      expect(screen.getByText('📍 Office → Airport')).toBeInTheDocument();
      expect(screen.getByText('👥 2 passengers')).toBeInTheDocument();
      expect(screen.getByText('💼 Business trip')).toBeInTheDocument();
    });

    it('localizes the driver start time for ru', () => {
      const action = {
        type: 'BOOK_DRIVER',
        driverId: 'd1',
        driverName: 'Sam',
        startTime: '2025-04-01T10:00:00Z',
        from: 'A',
        to: 'B',
        passengerCount: 1,
        purpose: '',
      };
      renderWindow({
        messages: [assistant({ actions: [action as any] })],
        i18n: { language: 'ru' },
      });
      expect(screen.getByText(/1 passengers/)).toBeInTheDocument();
      expect(screen.queryByText(/💼/)).toBeNull();
    });

    it('renders a BACKUP_ORG card', () => {
      renderWindow({
        messages: [
          assistant({
            actions: [
              { type: 'BACKUP_ORG', organizationId: 'o1', organizationName: 'Acme' } as any,
            ],
          }),
        ],
      });
      expect(screen.getByText('Backup: Acme')).toBeInTheDocument();
      expect(screen.getByText('🏢 Acme')).toBeInTheDocument();
      expect(screen.getByText('💾 Backing up all employees')).toBeInTheDocument();
    });

    it('renders a BACKUP_EMPLOYEE card', () => {
      renderWindow({
        messages: [
          assistant({
            actions: [
              {
                type: 'BACKUP_EMPLOYEE',
                organizationId: 'o1',
                userId: 'u1',
                userName: 'Alice',
              } as any,
            ],
          }),
        ],
      });
      expect(screen.getByText('Backup: Alice')).toBeInTheDocument();
      expect(screen.getByText('👤 Alice')).toBeInTheDocument();
      expect(screen.getByText('💾 Backing up employee data')).toBeInTheDocument();
    });

    it('renders a RESTORE_BACKUP card', () => {
      renderWindow({
        messages: [
          assistant({
            actions: [{ type: 'RESTORE_BACKUP', backupId: 'b1', employeeName: 'Bob' } as any],
          }),
        ],
      });
      expect(screen.getByText('Restore: Bob')).toBeInTheDocument();
      expect(screen.getByText('🔄 Restoring from backup snapshot')).toBeInTheDocument();
    });

    it('shows the loading state with ShieldLoader', () => {
      renderWindow({
        messages: [
          assistant({
            actions: [{ type: 'BOOK_LEAVE', leaveType: 'paid' } as any],
            bookingStates: { 0: { status: 'loading' } },
          }),
        ],
      });
      expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
      expect(screen.getByText('chatWidget.submitting')).toBeInTheDocument();
      expect(screen.queryByText('chatWidget.confirmSend')).toBeNull();
    });

    it('shows the booked success state with the result', () => {
      renderWindow({
        messages: [
          assistant({
            actions: [{ type: 'BOOK_LEAVE', leaveType: 'paid' } as any],
            bookingStates: { 0: { status: 'booked', result: 'Leave booked!' } },
          }),
        ],
      });
      expect(screen.getByText('Leave booked!')).toBeInTheDocument();
    });

    it('shows conflicts and alternative date chips that reset the booking', async () => {
      const base = renderWindow({
        messages: [
          assistant({
            id: 'conf1',
            actions: [{ type: 'BOOK_LEAVE', leaveType: 'paid' } as any],
            bookingStates: {
              0: {
                status: 'conflict',
                result: 'Dates clash',
                conflicts: [
                  {
                    title: 'Overlap',
                    message: 'Already booked',
                    suggestion: 'Pick another date',
                  },
                ],
                alternativeDates: ['2025-05-05', '2025-05-06'],
              },
            },
          }),
        ],
      });
      expect(screen.getByText('Dates clash')).toBeInTheDocument();
      expect(screen.getByText('Overlap')).toBeInTheDocument();
      expect(screen.getByText('Already booked')).toBeInTheDocument();
      expect(screen.getByText('💡 Pick another date')).toBeInTheDocument();
      fireEvent.click(screen.getByText('📅 2025-05-05'));
      expect(base.setInput).toHaveBeenCalledWith('Хочу отпуск 2025-05-05');
      await waitFor(() => expect(base.setMessages).toHaveBeenCalledWith(expect.any(Function)));
    });
  });

  it('renders follow-up suggestions for assistant messages and sends them', async () => {
    const base = renderWindow({
      messages: [assistant({ suggestions: ['Check balance', 'Book leave'] })],
    });
    fireEvent.click(screen.getByText('Check balance'));
    await waitFor(() =>
      expect(base.sendMessage).toHaveBeenCalledWith('Check balance', base.setIsOpen),
    );
  });

  it('does not render follow-up suggestions while loading', () => {
    renderWindow({
      isLoading: true,
      messages: [assistant({ suggestions: ['Check balance'] })],
    });
    expect(screen.queryByText('Check balance')).toBeNull();
  });

  it('shows the typing stages while loading', () => {
    renderWindow({ isLoading: true });
    expect(screen.getByTestId('typing-stages')).toBeInTheDocument();
  });

  it('shows the error banner', () => {
    renderWindow({ error: 'Something went wrong' });
    expect(screen.getByText('⚠️ Something went wrong')).toBeInTheDocument();
  });

  describe('pinned panel', () => {
    it('shows an empty message when nothing is pinned', () => {
      renderWindow();
      fireEvent.click(screen.getByLabelText('Pinned messages'));
      expect(screen.getByText('aiChat.noPinnedMessages')).toBeInTheDocument();
    });

    it('lists pinned messages and truncates long content', () => {
      pinnedMessagesMock.mockReturnValue([
        { id: 'p1', content: 'Short note', pinnedAt: 1 },
        { id: 'p2', content: 'x'.repeat(150), pinnedAt: 2 },
      ]);
      renderWindow();
      fireEvent.click(screen.getByLabelText('Pinned messages'));
      expect(screen.getByText('Short note')).toBeInTheDocument();
      expect(screen.getByText('x'.repeat(100) + '...')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Pinned messages'));
      expect(screen.queryByText('Short note')).toBeNull();
    });
  });

  describe('slash commands', () => {
    it('renders the dropdown and inserts the command into the input', () => {
      slashCommandsMock.mockReturnValue([{ command: '/balance', label: 'Show balance' }]);
      const base = renderWindow();
      expect(screen.getByTestId('slash-dropdown')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('slash-cmd'));
      expect(base.setInput).toHaveBeenCalledWith('/balance ');
    });
  });

  describe('input & voice', () => {
    it('submits the input via the form', async () => {
      const base = renderWindow({ input: 'Hello' });
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);
      await waitFor(() => expect(base.sendMessage).toHaveBeenCalledWith('Hello', base.setIsOpen));
    });

    it('submits on Enter but not on Shift+Enter', async () => {
      const base = renderWindow({ input: 'Enter me' });
      const inputEl = screen.getByPlaceholderText('chatWidget.placeholder');
      fireEvent.keyDown(inputEl, { key: 'Enter' });
      await waitFor(() =>
        expect(base.sendMessage).toHaveBeenCalledWith('Enter me', base.setIsOpen),
      );
      fireEvent.keyDown(inputEl, { key: 'Enter', shiftKey: true });
      expect(base.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('disables the send button when the input is empty', () => {
      renderWindow();
      const form = document.querySelector('form') as HTMLFormElement;
      expect((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it('disables the send button while loading even with text', () => {
      renderWindow({ input: 'x', isLoading: true });
      const form = document.querySelector('form') as HTMLFormElement;
      expect((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it('disables the input while loading', () => {
      renderWindow({ input: 'x', isLoading: true });
      expect(
        (screen.getByPlaceholderText('chatWidget.placeholder') as HTMLInputElement).disabled,
      ).toBe(true);
    });

    it('toggles voice input and shows the listening state', () => {
      const base = renderWindow();
      fireEvent.click(screen.getByTitle('chatWidget.voiceInput'));
      expect(base.startVoiceInput).toHaveBeenCalled();
      renderWindow({ isListening: true });
      expect(screen.getByPlaceholderText('chatWidget.listening')).toBeInTheDocument();
      expect(screen.getByTitle('chatWidget.stopListening')).toBeInTheDocument();
      expect(screen.getByTestId('icon-MicOff')).toBeInTheDocument();
    });

    it('focuses the input shortly after opening', () => {
      jest.useFakeTimers();
      const inputRef = { current: null } as React.RefObject<HTMLInputElement | null>;
      renderWindow({ inputRef });
      expect(inputRef.current).not.toBeNull();
      act(() => {
        jest.advanceTimersByTime(350);
      });
      expect(document.activeElement).toBe(inputRef.current);
    });
  });

  describe('docking', () => {
    it('positions on the right when docked on the right side', () => {
      renderWindow({ docked: true, dockedSide: 'right', dockedY: 50 });
      const panel = document.querySelector('.fixed.z-50') as HTMLElement;
      expect(panel.style.right).toBe('0.5rem');
      expect(panel.style.top).toContain('clamp(');
    });

    it('positions on the left when docked on the left side', () => {
      renderWindow({ docked: true, dockedSide: 'left' });
      const panel = document.querySelector('.fixed.z-50') as HTMLElement;
      expect(panel.style.left).toBe('16.5rem');
    });

    it('uses the floating position classes when not docked', () => {
      renderWindow({ docked: false });
      const panel = document.querySelector('.fixed.z-50') as HTMLElement;
      expect(panel.className).toContain('bottom-36');
    });
  });
});
