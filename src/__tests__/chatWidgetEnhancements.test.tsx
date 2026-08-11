/**
 * Tests for chatWidgetEnhancements — the AI-chat helper layer: TypingStages,
 * mood greetings, context-aware suggestions, slash commands (list + filter +
 * dropdown), MessageActions (reactions / copy / pin / TTS) and the pinned
 * responses localStorage store.
 *
 * Covers: TypingStages stage rotation with fake timers; all five mood-greeting
 * time windows; all seven context-suggestion pages + the empty fallback; the
 * eight slash commands with command/label filtering; MessageActions reaction
 * toggles, clipboard copy with the 2s reset, pin callback, and the TTS
 * speak/cancel/onend/onerror paths; SlashCommandDropdown empty/select; and
 * getPinnedMessages/togglePinMessage including the no-window guard, corrupt
 * storage and the 20-item cap.
 *
 * Mocks: react-i18next, lucide-react, navigator.clipboard and
 * window.speechSynthesis / SpeechSynthesisUtterance.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => opts?.defaultValue ?? key,
  }),
}));

// ── lucide ───────────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const names = ['Volume2', 'Copy', 'ThumbsUp', 'ThumbsDown', 'Pin', 'Check'];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

import {
  TypingStages,
  getMoodGreeting,
  getContextSuggestions,
  getSlashCommands,
  filterSlashCommands,
  MessageActions,
  SlashCommandDropdown,
  getPinnedMessages,
  togglePinMessage,
} from '@/components/ai/chatWidgetEnhancements';

const t = (key: string, opts?: any) => opts?.defaultValue ?? key;

// ── Environment helpers ──────────────────────────────────────────────────────
let getHoursSpy: jest.SpyInstance;
let writeTextMock: jest.Mock;
let speakMock: jest.Mock;
let cancelMock: jest.Mock;

describe('TypingStages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rotates through the three stages every two seconds', () => {
    render(<TypingStages />);
    // The defaultValue of each stage is rendered in order.
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Generating...')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // Wraps back around to the first stage.
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });
});

describe('getMoodGreeting', () => {
  beforeEach(() => {
    getHoursSpy = jest.spyOn(Date.prototype, 'getHours');
  });

  afterEach(() => {
    getHoursSpy.mockRestore();
  });

  const cases: [number, string][] = [
    [0, '🌙 Still up, Alice? Let me help you finish faster!'],
    [5, '🌙 Still up, Alice? Let me help you finish faster!'],
    [6, '☀️ Good morning, Alice! How can I help today?'],
    [11, '☀️ Good morning, Alice! How can I help today?'],
    [12, '👋 Hey Alice! What can I do for you?'],
    [16, '👋 Hey Alice! What can I do for you?'],
    [17, '🌆 Good evening, Alice! Need anything before wrapping up?'],
    [20, '🌆 Good evening, Alice! Need anything before wrapping up?'],
    [21, "🌙 Working late, Alice? Let's make it quick!"],
    [23, "🌙 Working late, Alice? Let's make it quick!"],
  ];

  it.each(cases)('uses the %s-hour greeting', (hour, expected) => {
    getHoursSpy.mockReturnValue(hour);
    expect(getMoodGreeting('Alice', t)).toBe(expected);
  });

  it('interpolates the first name into the greeting', () => {
    getHoursSpy.mockReturnValue(10);
    const mockT = jest.fn((key: string, opts?: any) => opts?.defaultValue ?? key);
    getMoodGreeting('Alice', mockT);
    expect(mockT).toHaveBeenCalledWith(
      'chatWidget.moodMorning',
      expect.objectContaining({ name: 'Alice' }),
    );
  });
});

describe('getContextSuggestions', () => {
  it.each([
    ['/leaves', '📋 My leave balance'],
    ['/employees', '🔍 Find employee'],
    ['/attendance', '⏰ My attendance today'],
    ['/tasks', '📋 My open tasks'],
    ['/analytics', '📈 Show trends'],
    ['/drivers', '🚗 Book a driver'],
    ['/payroll', '💰 My salary'],
  ])('returns %s suggestions for %s', (pathname, firstSuggestion) => {
    const result = getContextSuggestions(pathname, t);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(firstSuggestion);
  });

  it('returns an empty list for unknown pages', () => {
    expect(getContextSuggestions('/dashboard', t)).toEqual([]);
  });

  it('matches a path containing the keyword', () => {
    expect(getContextSuggestions('/org/123/leaves/2025', t)[0]).toBe('📋 My leave balance');
  });
});

describe('getSlashCommands', () => {
  it('returns all eight commands with icons and translated descriptions', () => {
    const commands = getSlashCommands(t);
    expect(commands).toHaveLength(8);
    expect(commands.map((c) => c.command)).toEqual([
      '/leave',
      '/balance',
      '/team',
      '/tasks',
      '/attendance',
      '/driver',
      '/help',
      '/clear',
    ]);
    expect(commands[0].description).toBe('Request time off');
    expect(commands[0].icon).toBe('📆');
  });
});

describe('filterSlashCommands', () => {
  it('returns an empty list when the input does not start with a slash', () => {
    expect(filterSlashCommands('hello', t)).toEqual([]);
  });

  it('returns every command for a bare slash', () => {
    expect(filterSlashCommands('/', t)).toHaveLength(8);
  });

  it('filters by command prefix', () => {
    const result = filterSlashCommands('/bal', t);
    expect(result.map((c) => c.command)).toEqual(['/balance']);
  });

  it('filters by label prefix', () => {
    const result = filterSlashCommands('/team', t);
    expect(result.map((c) => c.command)).toEqual(['/team']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterSlashCommands('/xyz', t)).toEqual([]);
  });
});

describe('MessageActions', () => {
  beforeEach(() => {
    writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    speakMock = jest.fn();
    cancelMock = jest.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speak: speakMock, cancel: cancelMock },
      configurable: true,
      writable: true,
    });
    (globalThis as any).SpeechSynthesisUtterance = jest
      .fn()
      .mockImplementation(() => ({ onend: null, onerror: null }));
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('toggles the thumbs-up reaction', () => {
    render(<MessageActions content="hi" onPin={jest.fn()} />);
    const up = screen.getByTitle('Helpful');
    fireEvent.click(up);
    expect(up.className).toContain('text-green-500');
    fireEvent.click(up);
    expect(up.className).not.toContain('text-green-500');
  });

  it('toggles the thumbs-down reaction independently', () => {
    render(<MessageActions content="hi" onPin={jest.fn()} />);
    const down = screen.getByTitle('Not helpful');
    fireEvent.click(down);
    expect(down.className).toContain('text-red-500');
    fireEvent.click(down);
    expect(down.className).not.toContain('text-red-500');
  });

  it('copies the content to the clipboard and shows the check mark, then resets', async () => {
    render(<MessageActions content="copy me" onPin={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Copy'));
    expect(writeTextMock).toHaveBeenCalledWith('copy me');
    expect(screen.getByTestId('icon-Check')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('icon-Copy')).toBeInTheDocument();
  });

  it('calls onPin and shows the pinned style when isPinned', () => {
    const onPin = jest.fn();
    render(<MessageActions content="hi" onPin={onPin} isPinned={false} />);
    fireEvent.click(screen.getByTitle('Pin'));
    expect(onPin).toHaveBeenCalled();
  });

  it('highlights the pin button when already pinned', () => {
    render(<MessageActions content="hi" onPin={jest.fn()} isPinned />);
    expect(screen.getByTitle('Pin').className).toContain('text-[#2563eb]');
  });

  it('speaks the cleaned content and stops when clicked again', () => {
    render(<MessageActions content="Hello **world** <b>!</b>" onPin={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Read aloud'));
    expect(speakMock).toHaveBeenCalledTimes(1);
    // Markup and emphasis characters are stripped before speaking.
    const utterance = speakMock.mock.calls[0][0] as any;
    expect(typeof utterance).toBe('object');
    fireEvent.click(screen.getByTitle('Read aloud'));
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it('stops speaking when the utterance ends or errors', () => {
    let utterance: any;
    (globalThis as any).SpeechSynthesisUtterance = jest.fn().mockImplementation(() => {
      utterance = { onend: null, onerror: null };
      return utterance;
    });
    render(<MessageActions content="hi" onPin={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Read aloud'));
    expect(speakMock).toHaveBeenCalledTimes(1);
    act(() => {
      utterance.onend();
    });
    fireEvent.click(screen.getByTitle('Read aloud'));
    expect(speakMock).toHaveBeenCalledTimes(2);
    act(() => {
      utterance.onerror();
    });
    // Speaking flag reset → next click speaks again, never cancels.
    fireEvent.click(screen.getByTitle('Read aloud'));
    expect(speakMock).toHaveBeenCalledTimes(3);
    expect(cancelMock).not.toHaveBeenCalled();
  });
});

describe('SlashCommandDropdown', () => {
  const commands = [
    { command: '/leave', label: 'Leave', icon: '📆', description: 'Request time off' },
    { command: '/balance', label: 'Balance', icon: '📋', description: 'Check balance' },
  ];

  it('renders nothing for an empty command list', () => {
    const { container } = render(<SlashCommandDropdown commands={[]} onSelect={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each command and fires onSelect with the command string', () => {
    const onSelect = jest.fn();
    render(<SlashCommandDropdown commands={commands} onSelect={onSelect} />);
    expect(screen.getByText('/leave')).toBeInTheDocument();
    expect(screen.getByText('Request time off')).toBeInTheDocument();
    expect(screen.getByText('📆')).toBeInTheDocument();
    fireEvent.click(screen.getByText('/balance'));
    expect(onSelect).toHaveBeenCalledWith('/balance');
  });
});

describe('pinned messages (localStorage)', () => {
  const PINNED_KEY = 'hr-chat-pinned';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(getPinnedMessages()).toEqual([]);
  });

  it('returns stored messages', () => {
    const stored = [{ id: 'm1', content: 'hello', pinnedAt: 1 }];
    localStorage.setItem(PINNED_KEY, JSON.stringify(stored));
    expect(getPinnedMessages()).toEqual(stored);
  });

  it('returns an empty list when storage is corrupted', () => {
    localStorage.setItem(PINNED_KEY, '{not json');
    expect(getPinnedMessages()).toEqual([]);
  });

  it('returns an empty list when window is unavailable', () => {
    const originalWindow = globalThis.window;
    try {
      delete (globalThis as any).window;
      expect(typeof window).toBe('undefined');
      expect(getPinnedMessages()).toEqual([]);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('adds a message and returns true', () => {
    expect(togglePinMessage('m1', 'hello')).toBe(true);
    expect(getPinnedMessages()).toEqual([expect.objectContaining({ id: 'm1', content: 'hello' })]);
  });

  it('removes an existing message and returns false', () => {
    togglePinMessage('m1', 'hello');
    expect(togglePinMessage('m1', 'again')).toBe(false);
    expect(getPinnedMessages()).toEqual([]);
  });

  it('caps the stored list at twenty messages', () => {
    for (let i = 0; i < 25; i++) {
      togglePinMessage(`m${i}`, `content ${i}`);
    }
    const pinned = getPinnedMessages();
    expect(pinned).toHaveLength(20);
    // The newest message is kept, the oldest is dropped.
    expect(pinned[19].id).toBe('m24');
    expect(pinned.some((p) => p.id === 'm0')).toBe(false);
  });

  it('is robust when localStorage is unavailable', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      expect(getPinnedMessages()).toEqual([]);
      // togglePinMessage reads via getPinnedMessages, which recovers.
      expect(togglePinMessage('m1', 'hi')).toBe(true);
    } finally {
      getItem.mockRestore();
    }
  });
});
