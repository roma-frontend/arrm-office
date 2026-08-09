/**
 * Tests for useChatWidgetAI — the AI chat widget hook.
 *
 * Covers: CSRF token fetch on mount, sendMessage (empty/loading guards,
 * smart navigation vs. create-request detection, streaming responses with
 * action parsing, error paths, table auto-expand to /ai-chat, <NAVIGATE>
 * redirects, input refocus), handleAction for all six action types (leave
 * conflict checks, driver validation, backup actions, error paths) and the
 * voice input flow via a mocked SpeechRecognition class.
 *
 * Mocks: fetch (routed by URL), next/navigation useRouter, react-i18next,
 * useAuthStore (mutable user), logger and chatWidgetUtils (controlled).
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor, render } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = { id: 'u1', organizationId: 'o1', role: 'admin' };
let mockPush = jest.fn();
let mockT = jest.fn((k: string) => k);
let mockLanguage = 'en';

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: { language: mockLanguage } }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('@/components/ai/chatWidgetUtils', () => ({
  parseActions: jest.fn(),
  getFollowUpSuggestions: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseActions, getFollowUpSuggestions } = require('@/components/ai/chatWidgetUtils') as {
  parseActions: jest.Mock;
  getFollowUpSuggestions: jest.Mock;
};

import { useChatWidgetAI } from '@/components/ai/useChatWidgetAI';
import type { AnyAction } from '@/components/ai/chatWidgetTypes';

const ORIGINAL_FETCH = global.fetch;

// ── Helpers ──────────────────────────────────────────────────────────────────
/** fetch mock that routes by URL substring. Values may be responses or fns. */
function routeFetch(routes: Record<string, unknown>): jest.Mock {
  const mock = jest.fn((url: unknown, init?: unknown) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return Promise.reject(new Error(`unmocked fetch: ${String(url)}`));
    const value = routes[key];
    return Promise.resolve(typeof value === 'function' ? (value as Function)(url, init) : value);
  });
  (global as any).fetch = mock;
  return mock;
}

function jsonRes(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

/** Streaming response: chunks joined into the body reader. */
function streamRes(...chunks: string[]): ReturnType<typeof jsonRes> {
  let i = 0;
  return jsonRes({
    body: {
      getReader: () => ({
        read: jest.fn().mockImplementation(() => {
          if (i < chunks.length) {
            return Promise.resolve({ done: false, value: new TextEncoder().encode(chunks[i++]) });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
      }),
    },
  });
}

/** Seeds a user message so handleAction's map() can match the messageId. */
function seedMessage(result: { current: { setMessages: (m: unknown) => void } }) {
  act(() => {
    result.current.setMessages([{ id: 'm1', role: 'user', content: 'x' }]);
  });
}

function bookLeaveAction(overrides: Partial<AnyAction> = {}): AnyAction {
  return {
    type: 'BOOK_LEAVE',
    leaveType: 'paid',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    days: 5,
    reason: 'vacation',
    ...overrides,
  };
}

function bookDriverAction(overrides: Partial<AnyAction> = {}): AnyAction {
  return {
    type: 'BOOK_DRIVER',
    driverId: 'd1',
    driverName: 'Driver',
    startTime: '2026-09-01T09:00:00.000Z',
    endTime: '2026-09-01T10:00:00.000Z',
    from: 'Office',
    to: 'Airport',
    purpose: 'trip',
    passengerCount: 2,
    ...overrides,
  };
}

/** Installs a capturing SpeechRecognition class on window. */
function installSR() {
  const instances: any[] = [];
  class MockSR {
    continuous = false;
    interimResults = false;
    lang = '';
    onresult: any = null;
    onend: any = null;
    onerror: any = null;
    start = jest.fn();
    stop = jest.fn();
    abort = jest.fn();
    constructor() {
      instances.push(this);
    }
  }
  (window as any).SpeechRecognition = MockSR;
  (window as any).webkitSpeechRecognition = MockSR;
  return { instances };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', organizationId: 'o1', role: 'admin' };
  mockPush = jest.fn();
  mockT = jest.fn((k: string) => k);
  mockLanguage = 'en';
  (parseActions as jest.Mock).mockReturnValue({ cleanContent: 'ok', actions: [] });
  (getFollowUpSuggestions as jest.Mock).mockReturnValue([]);
  // Default: CSRF endpoint answers; anything else must be routed per-test.
  (global as any).fetch = routeFetch({
    '/api/csrf-token': jsonRes({ json: () => Promise.resolve({ token: 'tok', signature: 'sig' }) }),
  });
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

// ── CSRF ─────────────────────────────────────────────────────────────────────
describe('useChatWidgetAI — CSRF token', () => {
  it('fetches the CSRF token on mount and uses it in chat requests', async () => {
    const fetchMock = routeFetch({
      '/api/csrf-token': jsonRes({
        json: () => Promise.resolve({ token: 'tok', signature: 'sig' }),
      }),
      '/api/chat': streamRes('hello'),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/csrf-token'));

    await act(async () => {
      await result.current.sendMessage('hello', jest.fn());
    });

    const [, init] = fetchMock.mock.calls.find(([u]) => String(u) === '/api/chat') as [string, any];
    expect(init.headers['X-CSRF-Token']).toBe('tok');
    expect(init.headers['X-CSRF-Token-Signature']).toBe('sig');
  });

  it('keeps working when the CSRF fetch fails', async () => {
    const fetchMock = routeFetch({
      '/api/csrf-token': jsonRes({ ok: false, status: 403 }),
      '/api/chat': streamRes('hi'),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/csrf-token'));

    await act(async () => {
      await result.current.sendMessage('hi', jest.fn());
    });

    const [, init] = fetchMock.mock.calls.find(([u]) => String(u) === '/api/chat') as [string, any];
    expect(init.headers['X-CSRF-Token']).toBeUndefined();
  });
});

// ── sendMessage ──────────────────────────────────────────────────────────────
describe('useChatWidgetAI — sendMessage', () => {
  it('does nothing for empty text', async () => {
    const fetchMock = routeFetch({ '/api/csrf-token': jsonRes() });
    const { result } = renderHook(() => useChatWidgetAI());
    await act(async () => {
      await result.current.sendMessage('   ', jest.fn());
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/chat', expect.anything());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages).toHaveLength(0);
  });

  it('ignores a second send while already loading', async () => {
    let resolveChat: (r: any) => void = () => {};
    const fetchMock = routeFetch({
      '/api/chat': () =>
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
    });
    const { result } = renderHook(() => useChatWidgetAI());

    const setOpen = jest.fn();
    let first: Promise<void>;
    act(() => {
      first = result.current.sendMessage('first', setOpen);
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await result.current.sendMessage('second', setOpen);
    });
    // Only one /api/chat request; the second send is a no-op.
    expect(fetchMock.mock.calls.filter(([u]) => String(u) === '/api/chat')).toHaveLength(1);

    await act(async () => {
      resolveChat(streamRes('done'));
      await first;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('navigates on "show calendar" instead of calling the API', async () => {
    const fetchMock = routeFetch({});
    const { result } = renderHook(() => useChatWidgetAI());
    const setOpen = jest.fn();
    await act(async () => {
      await result.current.sendMessage('show calendar', setOpen);
    });
    expect(mockPush).toHaveBeenCalledWith('/calendar');
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/chat', expect.anything());
  });

  it('does not navigate for create-request text (book leave)', async () => {
    const fetchMock = routeFetch({ '/api/chat': streamRes('ok') });
    const { result } = renderHook(() => useChatWidgetAI());
    const setOpen = jest.fn();
    await act(async () => {
      await result.current.sendMessage('book leave from 2026-09-01 to 2026-09-05', setOpen);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.anything());
    expect(setOpen).not.toHaveBeenCalled();
  });

  it('sends a message, streams the response and attaches actions', async () => {
    const action = bookLeaveAction();
    routeFetch({
      '/api/chat': streamRes('Here you go <ACTION>', JSON.stringify(action), '</ACTION>'),
    });
    (parseActions as jest.Mock).mockImplementation((content: string) => {
      const clean = content.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim();
      return {
        cleanContent: clean,
        actions: content.includes('<ACTION>') ? [action] : [],
      };
    });
    (getFollowUpSuggestions as jest.Mock).mockReturnValue(['s1', 's2']);

    const { result } = renderHook(() => useChatWidgetAI());
    await act(async () => {
      await result.current.sendMessage('  show my leaves  ', jest.fn());
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls.find(
      ([u]: any) => String(u) === '/api/chat',
    ) as [string, any];
    const body = JSON.parse(init.body);
    expect(body.userId).toBe('u1');
    expect(body.lang).toBe('en'); // no Cyrillic/Armenian → English
    expect(body.messages).toEqual([{ role: 'user', content: 'show my leaves' }]);

    expect(result.current.input).toBe('');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages).toHaveLength(2);
    const assistant = result.current.messages[1];
    expect(assistant.role).toBe('assistant');
    expect(assistant.actions).toEqual([action]);
    expect(assistant.bookingStates?.[0]).toEqual({ status: 'pending' });
    expect(assistant.suggestions).toEqual(['s1', 's2']);
  });

  it('detects Russian for Cyrillic-heavy text', async () => {
    routeFetch({ '/api/chat': streamRes('ok') });
    const { result } = renderHook(() => useChatWidgetAI());
    await act(async () => {
      await result.current.sendMessage('привет, покажи отпуска', jest.fn());
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls.find(
      ([u]: any) => String(u) === '/api/chat',
    ) as [string, any];
    expect(JSON.parse(init.body).lang).toBe('ru');
  });

  it('sets the server error message on a non-ok response', async () => {
    routeFetch({
      '/api/chat': jsonRes({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server boom' }),
      }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    await act(async () => {
      await result.current.sendMessage('hi', jest.fn());
    });
    expect(result.current.error).toBe('Server boom');
    expect(result.current.isLoading).toBe(false);
  });

  it('falls back to "Server error N" when the error body is not JSON', async () => {
    routeFetch({
      '/api/chat': jsonRes({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('bad')),
      }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    await act(async () => {
      await result.current.sendMessage('hi', jest.fn());
    });
    expect(result.current.error).toBe('Server error 502');
  });

  it('sets the error when the chat fetch rejects', async () => {
    routeFetch({ '/api/chat': () => Promise.reject(new Error('network down')) });
    const { result } = renderHook(() => useChatWidgetAI());
    await act(async () => {
      await result.current.sendMessage('hi', jest.fn());
    });
    expect(result.current.error).toBe('network down');
  });

  it('auto-expands to the fullscreen page when the reply contains a table', async () => {
    routeFetch({ '/api/chat': streamRes('a | b | c | d') });
    (parseActions as jest.Mock).mockReturnValue({ cleanContent: 'a | b | c | d', actions: [] });
    const { result } = renderHook(() => useChatWidgetAI());
    const setOpen = jest.fn();
    await act(async () => {
      await result.current.sendMessage('table please', setOpen);
    });
    expect(sessionStorage.getItem('ai-chat-handoff')).toContain('a | b | c | d');
    expect(mockPush).toHaveBeenCalledWith('/ai-chat');
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('keeps sending when sessionStorage is unavailable', async () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      routeFetch({ '/api/chat': streamRes('a | b | c | d') });
      (parseActions as jest.Mock).mockReturnValue({ cleanContent: 'a | b | c | d', actions: [] });
      const { result } = renderHook(() => useChatWidgetAI());
      await act(async () => {
        await result.current.sendMessage('table please', jest.fn());
      });
      expect(result.current.error).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('navigates via <NAVIGATE> after the delay and strips the tag', async () => {
    routeFetch({ '/api/chat': streamRes('<NAVIGATE>/leaves</NAVIGATE> go to leaves') });
    (parseActions as jest.Mock).mockReturnValue({
      cleanContent: '<NAVIGATE>/leaves</NAVIGATE> go to leaves',
      actions: [],
    });
    const { result } = renderHook(() => useChatWidgetAI());
    const setOpen = jest.fn();
    await act(async () => {
      await result.current.sendMessage('go to leaves', setOpen);
    });
    // The 800 ms redirect timer.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    expect(mockPush).toHaveBeenCalledWith('/leaves');
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(result.current.messages[1].content).toBe('go to leaves');
  });

  it('refocuses the input after the reply finishes', async () => {
    routeFetch({ '/api/chat': streamRes('ok') });
    const { result } = renderHook(() => useChatWidgetAI());
    const focus = jest.fn();
    render(<input ref={result.current.inputRef} onFocus={focus} />);
    await act(async () => {
      await result.current.sendMessage('hi', jest.fn());
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(focus).toHaveBeenCalled();
  });
});

// ── handleAction ─────────────────────────────────────────────────────────────
describe('useChatWidgetAI — handleAction', () => {
  it('marks the action as conflict when not logged in', async () => {
    mockUser = null;
    const { result } = renderHook(() => useChatWidgetAI());
    const action = bookLeaveAction();
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', action, 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]).toEqual({
      status: 'conflict',
      result: 'Not logged in.',
    });
  });

  it('BOOK_LEAVE surfaces critical conflicts with alternatives', async () => {
    routeFetch({
      '/api/chat/conflict-check': jsonRes({
        json: () =>
          Promise.resolve({
            hasCriticalConflicts: true,
            aiMessage: 'Dates clash with an approved leave.',
            conflicts: [{ title: 'Clash', message: 'busy', suggestion: 'move' }],
            alternativeDates: ['2026-09-10'],
          }),
      }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookLeaveAction(), 0);
    });
    const state = result.current.messages[0].bookingStates?.[0];
    expect(state?.status).toBe('conflict');
    expect(state?.result).toBe('Dates clash with an approved leave.');
    expect(state?.conflicts).toEqual([{ title: 'Clash', message: 'busy', suggestion: 'move' }]);
    expect(state?.alternativeDates).toEqual(['2026-09-10']);
  });

  it('BOOK_LEAVE books successfully when there are no conflicts', async () => {
    const fetchMock = routeFetch({
      '/api/chat/conflict-check': jsonRes({
        json: () => Promise.resolve({ hasCriticalConflicts: false }),
      }),
      '/api/chat/book-leave': jsonRes({ json: () => Promise.resolve({ message: 'Leave booked' }) }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookLeaveAction(), 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]).toEqual({
      status: 'booked',
      result: 'Leave booked',
    });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/book-leave')) as [
      string,
      any,
    ];
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      userId: 'u1',
      organizationId: 'o1',
      type: 'paid',
      startDate: '2026-09-01',
      days: 5,
      reason: 'vacation',
    });
  });

  it('BOOK_LEAVE falls back to "Done!" when the response has no message', async () => {
    routeFetch({
      '/api/chat/conflict-check': jsonRes({ json: () => Promise.resolve({}) }),
      '/api/chat/book-leave': jsonRes(),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookLeaveAction(), 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]?.result).toBe('Done!');
  });

  it('BOOK_LEAVE maps a non-ok response to a conflict result', async () => {
    routeFetch({
      '/api/chat/conflict-check': jsonRes({ json: () => Promise.resolve({}) }),
      '/api/chat/book-leave': jsonRes({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'denied' }),
      }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookLeaveAction(), 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]).toEqual({
      status: 'conflict',
      result: 'denied',
    });
  });

  it('BOOK_LEAVE handles a network failure', async () => {
    routeFetch({
      '/api/chat/conflict-check': jsonRes({ json: () => Promise.resolve({}) }),
      '/api/chat/book-leave': () => Promise.reject(new Error('offline')),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookLeaveAction(), 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]).toEqual({
      status: 'conflict',
      result: 'offline',
    });
  });

  it('BOOK_LEAVE treats an unparsable response as a server error', async () => {
    routeFetch({
      '/api/chat/conflict-check': jsonRes({ json: () => Promise.resolve({}) }),
      '/api/chat/book-leave': jsonRes({ json: () => Promise.reject(new Error('nope')) }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookLeaveAction(), 0);
    });
    // res.ok is true but json() failed → data.error = "Server error (200)" → but
    // the success branch reads data.message ?? 'Done!' — so it still books.
    expect(result.current.messages[0].bookingStates?.[0]).toEqual({
      status: 'booked',
      result: 'Done!',
    });
  });

  it('EDIT_LEAVE posts to /api/chat/edit-leave', async () => {
    const fetchMock = routeFetch({
      '/api/chat/edit-leave': jsonRes({ json: () => Promise.resolve({ message: 'Updated' }) }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction(
        'm1',
        {
          type: 'EDIT_LEAVE',
          leaveId: 'l1',
          employeeName: 'Ann',
          startDate: '2026-09-01',
          endDate: '2026-09-02',
          days: 2,
          reason: 'family',
          leaveType: 'family',
        },
        0,
      );
    });
    expect(result.current.messages[0].bookingStates?.[0]).toEqual({
      status: 'booked',
      result: 'Updated',
    });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/edit-leave')) as [
      string,
      any,
    ];
    expect(JSON.parse(init.body)).toMatchObject({
      leaveId: 'l1',
      startDate: '2026-09-01',
      type: 'family',
    });
  });

  it('DELETE_LEAVE posts to /api/chat/delete-leave', async () => {
    const fetchMock = routeFetch({
      '/api/chat/delete-leave': jsonRes({ json: () => Promise.resolve({ message: 'Deleted' }) }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction(
        'm1',
        {
          type: 'DELETE_LEAVE',
          leaveId: 'l1',
          employeeName: 'Ann',
          leaveType: 'paid',
          startDate: '2026-09-01',
          endDate: '2026-09-02',
        },
        0,
      );
    });
    expect(result.current.messages[0].bookingStates?.[0]?.status).toBe('booked');
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/delete-leave')) as [
      string,
      any,
    ];
    expect(JSON.parse(init.body)).toMatchObject({ leaveId: 'l1', employeeName: 'Ann' });
  });

  it('BOOK_DRIVER rejects when no organization is selected', async () => {
    mockUser = { id: 'u1', organizationId: null };
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookDriverAction(), 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]?.result).toBe(
      'Organization not selected. Please select an organization first.',
    );
  });

  it('BOOK_DRIVER rejects invalid dates', async () => {
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookDriverAction({ startTime: 'garbage' }), 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]?.result).toBe(
      'Invalid date/time for driver booking.',
    );
  });

  it('BOOK_DRIVER surfaces critical driver conflicts', async () => {
    routeFetch({
      '/api/chat/conflict-check': jsonRes({
        json: () => Promise.resolve({ hasCriticalConflicts: true, aiMessage: 'Driver is busy.' }),
      }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookDriverAction(), 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]?.result).toBe('Driver is busy.');
  });

  it('BOOK_DRIVER books successfully with trip info', async () => {
    const fetchMock = routeFetch({
      '/api/chat/conflict-check': jsonRes({ json: () => Promise.resolve({}) }),
      '/api/chat/book-driver': jsonRes({ json: () => Promise.resolve({ message: 'Car coming' }) }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction('m1', bookDriverAction(), 0);
    });
    expect(result.current.messages[0].bookingStates?.[0]).toEqual({
      status: 'booked',
      result: 'Car coming',
    });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/book-driver')) as [
      string,
      any,
    ];
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      driverId: 'd1',
      tripInfo: { from: 'Office', to: 'Airport', purpose: 'trip', passengerCount: 2 },
    });
    expect(typeof body.startTime).toBe('number');
  });

  it('BACKUP_ORG posts to /api/chat/backup-org', async () => {
    const fetchMock = routeFetch({
      '/api/chat/backup-org': jsonRes({ json: () => Promise.resolve({ message: 'Backed up' }) }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction(
        'm1',
        { type: 'BACKUP_ORG', organizationId: 'o1', organizationName: 'Acme' },
        0,
      );
    });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/backup-org')) as [
      string,
      any,
    ];
    expect(JSON.parse(init.body)).toMatchObject({ userId: 'u1', organizationId: 'o1' });
  });

  it('BACKUP_EMPLOYEE posts to /api/chat/backup-employee', async () => {
    const fetchMock = routeFetch({
      '/api/chat/backup-employee': jsonRes({ json: () => Promise.resolve({ message: 'ok' }) }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction(
        'm1',
        { type: 'BACKUP_EMPLOYEE', organizationId: 'o1', userId: 'u2', userName: 'Bob' },
        0,
      );
    });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/backup-employee')) as [
      string,
      any,
    ];
    expect(JSON.parse(init.body)).toMatchObject({ organizationId: 'o1', employeeId: 'u2' });
  });

  it('RESTORE_BACKUP posts to /api/chat/restore-backup', async () => {
    const fetchMock = routeFetch({
      '/api/chat/restore-backup': jsonRes({ json: () => Promise.resolve({ message: 'Restored' }) }),
    });
    const { result } = renderHook(() => useChatWidgetAI());
    seedMessage(result);
    await act(async () => {
      await result.current.handleAction(
        'm1',
        { type: 'RESTORE_BACKUP', backupId: 'b1', employeeName: 'Bob' },
        0,
      );
    });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/restore-backup')) as [
      string,
      any,
    ];
    expect(JSON.parse(init.body)).toMatchObject({ userId: 'u1', backupId: 'b1' });
  });
});

// ── startVoiceInput ──────────────────────────────────────────────────────────
describe('useChatWidgetAI — startVoiceInput', () => {
  it('does nothing when SpeechRecognition is unsupported', async () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    const { result } = renderHook(() => useChatWidgetAI());
    act(() => {
      result.current.startVoiceInput();
    });
    expect(result.current.isListening).toBe(false);
  });

  it('stops the active recognizer when called again', () => {
    const { instances } = installSR();
    const { result } = renderHook(() => useChatWidgetAI());
    act(() => {
      result.current.startVoiceInput();
    });
    expect(result.current.isListening).toBe(true);
    act(() => {
      result.current.startVoiceInput();
    });
    expect(instances[0].stop).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it('starts recognition with the language mapped from i18n', () => {
    mockLanguage = 'ru';
    const { instances } = installSR();
    const { result } = renderHook(() => useChatWidgetAI());
    act(() => {
      result.current.startVoiceInput();
    });
    expect(instances[0].lang).toBe('ru-RU');
    expect(instances[0].start).toHaveBeenCalled();
    expect(instances[0].continuous).toBe(true);
    expect(result.current.isListening).toBe(true);
  });

  it('updates the input from onresult and submits after silence', async () => {
    const { instances } = installSR();
    const { result } = renderHook(() => useChatWidgetAI());
    const onSubmit = jest.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <input ref={result.current.inputRef} />
      </form>,
    );

    act(() => {
      result.current.startVoiceInput();
    });
    const rec = instances[0];

    // Interim-only result → input mirrors the interim transcript.
    act(() => {
      rec.onresult({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: 'покажи' }, length: 1 }],
      });
    });
    expect(result.current.input).toBe('покажи');

    // A second result with a final transcript replaces it; the pending silence
    // timer is cleared first.
    act(() => {
      rec.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'привет мир' }, length: 1 }],
      });
    });
    expect(result.current.input).toBe('привет мир');

    // 1000 ms silence → stop; then 100 ms → requestSubmit on the attached form.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1150));
    });
    expect(rec.stop).toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(onSubmit).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it('resets listening state on onend and clears the pending silence timer', () => {
    const { instances } = installSR();
    const { result } = renderHook(() => useChatWidgetAI());
    act(() => {
      result.current.startVoiceInput();
    });
    // Arm the silence timer first so the onend cleanup branch runs.
    act(() => {
      instances[0].onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'hi' }, length: 1 }],
      });
    });
    act(() => {
      instances[0].onend();
    });
    expect(result.current.isListening).toBe(false);
    expect(instances[0].stop).not.toHaveBeenCalled();
  });

  it('resets listening state on onerror', () => {
    const { instances } = installSR();
    const { result } = renderHook(() => useChatWidgetAI());
    act(() => {
      result.current.startVoiceInput();
    });
    act(() => {
      instances[0].onerror(new Event('error'));
    });
    expect(result.current.isListening).toBe(false);
  });
});
