/**
 * Tests for notificationSound utility — Web Audio API sounds.
 *
 * Since jsdom doesn't implement AudioContext, we mock it on the global scope.
 * We do NOT try to redefine `window` — jsdom doesn't allow redefining it.
 */
import {
  playNotificationSound,
  playChatMessageSound,
  sendBrowserNotification,
} from '@/lib/notificationSound';

// ── Mock AudioContext classes ────────────────────────────────────────────────
class MockOscillatorNode {
  frequency = {
    value: 0,
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
  };
  type = 'sine';
  connect = jest.fn();
  start = jest.fn();
  stop = jest.fn();
}

class MockGainNode {
  gain = {
    value: 1,
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
  };
  connect = jest.fn().mockReturnThis();
}

class MockAudioContext {
  currentTime = 100;
  destination = 'mock-destination';
  state = 'running';
  createOscillator = jest.fn(() => new MockOscillatorNode());
  createGain = jest.fn(() => new MockGainNode());
  resume = jest.fn().mockResolvedValue(undefined);
}

const originalAudioContext = (global as any).AudioContext;
const originalNotification = (global as any).Notification;

beforeAll(() => {
  // Set AudioContext globally (NOT on window — jsdom's window is read-only)
  (global as any).AudioContext = MockAudioContext;
  // Set Notification globally
  (global as any).Notification = {
    permission: 'granted',
    requestPermission: jest.fn().mockResolvedValue('granted'),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  (global as any).AudioContext = originalAudioContext;
  (global as any).Notification = originalNotification;
});

describe('playNotificationSound', () => {
  it('does not throw when called with new_request type', () => {
    expect(() => playNotificationSound('new_request')).not.toThrow();
  });

  it('does not throw when called with approved type', () => {
    expect(() => playNotificationSound('approved')).not.toThrow();
  });

  it('does not throw when called with rejected type', () => {
    expect(() => playNotificationSound('rejected')).not.toThrow();
  });

  it('returns undefined for all types', () => {
    expect(playNotificationSound('new_request')).toBeUndefined();
    expect(playNotificationSound('approved')).toBeUndefined();
    expect(playNotificationSound('rejected')).toBeUndefined();
  });
});

describe('playChatMessageSound', () => {
  it('does not throw when called', () => {
    expect(() => playChatMessageSound()).not.toThrow();
  });

  it('returns undefined', () => {
    expect(playChatMessageSound()).toBeUndefined();
  });
});

describe('sendBrowserNotification', () => {
  it('does not throw with minimal args', () => {
    expect(() => sendBrowserNotification('Test Title')).not.toThrow();
  });

  it('does not throw with soundType option', () => {
    expect(() =>
      sendBrowserNotification('Test Title', {
        body: 'Test body',
        soundType: 'approved',
      } as any),
    ).not.toThrow();
  });

  it('does not throw with rejected sound type', () => {
    expect(() => sendBrowserNotification('Test', { soundType: 'rejected' } as any)).not.toThrow();
  });
});
