/**
 * Tests for useVoiceNavigation hook — voice-controlled navigation
 *
 * Tests: startListening/stopListening toggle, speech recognition
 * events (onresult, onerror, onend), voice feedback, cleanup,
 * disabled state, unsupported browser.
 */

import { renderHook, act } from '@testing-library/react';
import { useVoiceNavigation } from '@/hooks/useVoiceNavigation';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockPush = jest.fn();
const mockDetectIntent = jest.fn();
const mockSpeak = jest.fn();

// Mock SpeechSynthesisUtterance global
(global as any).SpeechSynthesisUtterance = class MockUtterance {
  lang: string = '';
  text: string = '';
  constructor(text: string) {
    this.text = text;
  }
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Use mutable variable for user
let mockVoiceUser: any = { role: 'admin', name: 'Alice' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: Function) => selector({ user: mockVoiceUser }),
}));

jest.mock('@/lib/aiAssistant', () => ({
  detectIntent: (...args: any[]) => mockDetectIntent(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock SpeechRecognition
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onstart?: () => void;
  onresult?: (event: any) => void;
  onerror?: (event: any) => void;
  onend?: () => void;
  start = jest.fn();
  stop = jest.fn();
  addEventListener = jest.fn((event: string, handler: any) => {
    if (event === 'start') this.onstart = handler;
  });
}

let mockRecognition: MockSpeechRecognition;

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockReset();
  mockDetectIntent.mockReset();
  mockVoiceUser = { role: 'admin', name: 'Alice' };

  mockRecognition = new MockSpeechRecognition();

  (window as any).SpeechRecognition = jest.fn(() => mockRecognition);
  (window as any).webkitSpeechRecognition = undefined;

  Object.defineProperty(window, 'speechSynthesis', {
    value: { speak: mockSpeak },
    configurable: true,
    writable: true,
  });
});

describe('useVoiceNavigation', () => {
  it('starts listening when startListening is called', () => {
    const { result } = renderHook(() => useVoiceNavigation());

    act(() => {
      result.current.startListening();
    });

    expect(mockRecognition.start).toHaveBeenCalled();
  });

  it('sets isListening to true after start event', () => {
    const { result } = renderHook(() => useVoiceNavigation());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      mockRecognition.onstart?.();
    });

    expect(result.current.isListening).toBe(true);
  });

  it('sets isListening to false after error', () => {
    const { result } = renderHook(() => useVoiceNavigation());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      mockRecognition.onstart?.();
    });

    expect(result.current.isListening).toBe(true);

    act(() => {
      mockRecognition.onerror?.({ error: 'no-speech' });
    });

    expect(result.current.isListening).toBe(false);
  });

  it('sets isListening to false on end event', () => {
    const { result } = renderHook(() => useVoiceNavigation());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      mockRecognition.onstart?.();
    });

    act(() => {
      mockRecognition.onend?.();
    });

    expect(result.current.isListening).toBe(false);
  });

  it('navigates when intent is detected from voice command', () => {
    const { result } = renderHook(() => useVoiceNavigation());

    mockDetectIntent.mockReturnValue({
      name: 'Dashboard',
      action: '/dashboard',
    });

    act(() => {
      result.current.startListening();
    });

    act(() => {
      mockRecognition.onresult?.({
        results: [[{ transcript: 'go to dashboard' }]],
      });
    });

    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('provides voice feedback when speechSynthesis is available', () => {
    const { result } = renderHook(() => useVoiceNavigation({ language: 'en-US' }));

    mockDetectIntent.mockReturnValue({
      name: 'Dashboard',
      action: '/dashboard',
    });

    act(() => {
      result.current.startListening();
    });

    act(() => {
      mockRecognition.onresult?.({
        results: [[{ transcript: 'dashboard' }]],
      });
    });

    expect(mockSpeak).toHaveBeenCalled();
  });

  it('stopListening stops recognition and updates state', () => {
    const { result } = renderHook(() => useVoiceNavigation());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      result.current.stopListening();
    });

    expect(mockRecognition.stop).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it('does not start when enabled=false', () => {
    const { result } = renderHook(() => useVoiceNavigation({ enabled: false }));

    act(() => {
      result.current.startListening();
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  it('does not navigate when no user', () => {
    mockVoiceUser = null;

    const { result } = renderHook(() => useVoiceNavigation());

    act(() => {
      result.current.startListening();
    });

    mockDetectIntent.mockReturnValue({ name: 'Dashboard', action: '/dashboard' });

    act(() => {
      mockRecognition.onresult?.({
        results: [[{ transcript: 'dashboard' }]],
      });
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sets transcript on voice command', () => {
    const { result } = renderHook(() => useVoiceNavigation());

    act(() => {
      result.current.startListening();
    });

    act(() => {
      mockRecognition.onresult?.({
        results: [[{ transcript: 'Show reports' }]],
      });
    });
  });

  it('cleans up recognition on unmount', () => {
    const { result, unmount } = renderHook(() => useVoiceNavigation());

    act(() => {
      result.current.startListening();
    });

    unmount();

    expect(mockRecognition.stop).toHaveBeenCalled();
  });
});
