/**
 * Tests for ChatWidget — the container wiring ChatWidgetButton and
 * ChatWidgetWindow together with local open/dock state and the shared
 * useChatWidgetAI hook.
 *
 * Both children are mocked as controllable stubs (like the Dialog mock in
 * ImidSignInButton.test.tsx) so the container's state plumbing — isOpen
 * toggle from the button, dock state, and the full hook passthrough — can be
 * asserted directly.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ── useChatWidgetAI mock (mutable) ───────────────────────────────────────────
let mockHook: Record<string, unknown> = {};
jest.mock('@/components/ai/useChatWidgetAI', () => ({
  useChatWidgetAI: () => mockHook,
}));

// ── Controllable child stubs ────────────────────────────────────────────────
let buttonProps: Record<string, unknown> = {};
let windowProps: Record<string, unknown> = {};
jest.mock('@/components/ai/ChatWidgetButton', () => ({
  ChatWidgetButton: (props: any) => {
    buttonProps = props;
    return (
      <button type="button" onClick={() => props.setIsOpen?.((o: boolean) => !o)}>
        ChatWidgetButton
      </button>
    );
  },
}));

jest.mock('@/components/ai/ChatWidgetWindow', () => ({
  ChatWidgetWindow: (props: any) => {
    windowProps = props;
    return <div>ChatWidgetWindow</div>;
  },
}));

import { ChatWidget } from '@/components/ai/ChatWidget';

const makeHook = () => ({
  messages: [{ id: 'm1', role: 'assistant', content: 'hi' }],
  setMessages: jest.fn(),
  input: 'typed text',
  setInput: jest.fn(),
  isLoading: false,
  error: null,
  isListening: false,
  wakeWordActive: true,
  inputRef: { current: null },
  user: { id: 'u1', name: 'Anna' },
  sendMessage: jest.fn(),
  handleAction: jest.fn(),
  startVoiceInput: jest.fn(),
  stopGeneration: jest.fn(),
  t: (key: string) => key,
  i18n: { language: 'en' },
  router: { push: jest.fn() },
});

describe('ChatWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHook = makeHook();
    buttonProps = {};
    windowProps = {};
  });

  it('renders the button and the window', () => {
    render(<ChatWidget />);
    expect(screen.getByText('ChatWidgetButton')).toBeInTheDocument();
    expect(screen.getByText('ChatWidgetWindow')).toBeInTheDocument();
  });

  it('starts closed with the default dock state', () => {
    render(<ChatWidget />);
    expect(buttonProps.isOpen).toBe(false);
    expect(windowProps.isOpen).toBe(false);
    expect(buttonProps.docked).toBe(false);
    expect(buttonProps.dockedSide).toBe('right');
    expect(buttonProps.dockedY).toBe(50);
    expect(windowProps.docked).toBe(false);
    expect(windowProps.dockedSide).toBe('right');
    expect(windowProps.dockedY).toBe(50);
  });

  it('opens the window when the button toggles', async () => {
    render(<ChatWidget />);
    expect(windowProps.isOpen).toBe(false);

    fireEvent.click(screen.getByText('ChatWidgetButton'));
    // setState → re-render → both children receive isOpen=true
    await waitFor(() => {
      expect(buttonProps.isOpen).toBe(true);
      expect(windowProps.isOpen).toBe(true);
    });

    fireEvent.click(screen.getByText('ChatWidgetButton'));
    await waitFor(() => {
      expect(windowProps.isOpen).toBe(false);
    });
  });

  it('passes the dock setters through to the button', () => {
    render(<ChatWidget />);
    // the button receives functional setters that update container state
    expect(typeof buttonProps.setDocked).toBe('function');
    expect(typeof buttonProps.setDockedSide).toBe('function');
    expect(typeof buttonProps.setDockedY).toBe('function');
    expect(typeof buttonProps.setIsOpen).toBe('function');
  });

  it('updates dock state when the button drags', async () => {
    render(<ChatWidget />);
    act(() => buttonProps.setDocked(true));
    act(() => buttonProps.setDockedSide('left'));
    act(() => buttonProps.setDockedY(70));

    await waitFor(() => {
      expect(windowProps.docked).toBe(true);
      expect(windowProps.dockedSide).toBe('left');
      expect(windowProps.dockedY).toBe(70);
    });
  });

  it('passes the hook values through to the window', () => {
    render(<ChatWidget />);
    expect(windowProps.messages).toEqual(mockHook.messages);
    expect(windowProps.input).toBe('typed text');
    expect(windowProps.isLoading).toBe(false);
    expect(windowProps.error).toBeNull();
    expect(windowProps.isListening).toBe(false);
    expect(windowProps.inputRef).toEqual({ current: null });
    expect(windowProps.user).toEqual({ id: 'u1', name: 'Anna' });
    expect(windowProps.router).toEqual({ push: expect.any(Function) });
  });

  it('passes the hook callbacks through to the window', () => {
    render(<ChatWidget />);
    expect(windowProps.setMessages).toBe(mockHook.setMessages);
    expect(windowProps.setInput).toBe(mockHook.setInput);
    expect(windowProps.sendMessage).toBe(mockHook.sendMessage);
    expect(windowProps.handleAction).toBe(mockHook.handleAction);
    expect(windowProps.startVoiceInput).toBe(mockHook.startVoiceInput);
    expect(windowProps.stopGeneration).toBe(mockHook.stopGeneration);
    expect(windowProps.t).toBe(mockHook.t);
    expect(windowProps.i18n).toBe(mockHook.i18n);
  });

  it('passes wakeWordActive only to the button, not the window', () => {
    render(<ChatWidget />);
    expect(buttonProps.wakeWordActive).toBe(true);
    expect(windowProps.wakeWordActive).toBeUndefined();
  });
});
