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
  requestNotificationPermission,
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

let mockAudioContextState = 'running';

class MockAudioContext {
  currentTime = 100;
  destination = 'mock-destination';
  get state() {
    return mockAudioContextState;
  }
  createOscillator = jest.fn(() => new MockOscillatorNode());
  createGain = jest.fn(() => new MockGainNode());
  resume = jest.fn().mockResolvedValue(undefined);
  createBuffer = jest.fn(() => ({}) as any);
  createBufferSource = jest.fn(() => ({
    buffer: null,
    connect: jest.fn(),
    start: jest.fn(),
  }));
}

const originalAudioContext = (global as any).AudioContext;
const originalNotification = (global as any).Notification;

beforeAll(() => {
  // Set AudioContext globally (NOT on window — jsdom's window is read-only)
  (global as any).AudioContext = MockAudioContext;
  // Set Notification globally — in jsdom the global IS window, so this works
  (global as any).Notification = {
    permission: 'granted',
    requestPermission: jest.fn().mockResolvedValue('granted'),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAudioContextState = 'running';
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

  it('silently catches AudioContext construction errors and warns', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalAC = (global as any).AudioContext;

    // Replace AudioContext with a broken constructor
    (global as any).AudioContext = class {
      constructor() {
        throw new Error('mock AudioContext error');
      }
    } as any;

    // Force _sharedCtx.state to be 'closed' so getAudioContext() tries to
    // create a NEW AudioContext (which will throw with our broken constructor).
    mockAudioContextState = 'closed';

    expect(() => playNotificationSound('new_request')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('Could not play notification sound:', expect.any(Error));

    (global as any).AudioContext = originalAC;
    warnSpy.mockRestore();
  });

  // Smoke-test: all 3 branches via different calls
  it('plays new_request, approved, and rejected without error', () => {
    expect(() => {
      playNotificationSound('new_request');
      playNotificationSound('approved');
      playNotificationSound('rejected');
    }).not.toThrow();
  });
});

describe('playChatMessageSound', () => {
  it('does not throw when called', () => {
    expect(() => playChatMessageSound()).not.toThrow();
  });

  it('returns undefined', () => {
    expect(playChatMessageSound()).toBeUndefined();
  });

  it('catches errors and warns', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalAC = (global as any).AudioContext;

    // Replace AudioContext with a broken constructor
    (global as any).AudioContext = class {
      constructor() {
        throw new Error('mock AudioContext error');
      }
    } as any;

    // Force _sharedCtx.state to be 'closed' so getAudioContext() creates a new one
    mockAudioContextState = 'closed';

    expect(() => playChatMessageSound()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('Failed to play notification sound:', expect.any(Error));

    (global as any).AudioContext = originalAC;
    warnSpy.mockRestore();
  });
});

describe('requestNotificationPermission', () => {
  afterEach(() => {
    // Reset Notification mock
    (global as any).Notification = {
      permission: 'granted',
      requestPermission: jest.fn().mockResolvedValue('granted'),
    };
  });

  it('returns true when permission is already granted', () => {
    (global as any).Notification = {
      permission: 'granted',
      requestPermission: jest.fn(),
    };
    expect(requestNotificationPermission()).toBe(true);
    // Should NOT call requestPermission
    expect((global as any).Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('returns false and requests permission when permission is default (not granted/denied)', () => {
    (global as any).Notification = {
      permission: 'default',
      requestPermission: jest.fn().mockResolvedValue('granted'),
    };
    const result = requestNotificationPermission();
    expect(result).toBe(false); // returns synchronously
    expect((global as any).Notification.requestPermission).toHaveBeenCalled();
  });

  it('returns false when permission is denied', () => {
    (global as any).Notification = {
      permission: 'denied',
      requestPermission: jest.fn(),
    };
    expect(requestNotificationPermission()).toBe(false);
    // Should NOT call requestPermission if denied
    expect((global as any).Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('returns false when Notification API is not available', () => {
    delete (global as any).Notification;
    expect(requestNotificationPermission()).toBe(false);
  });

  // Note: SSR test (typeof window === 'undefined') can't be tested in jsdom
  // because jsdom always defines window.
});

describe('sendBrowserNotification', () => {
  afterEach(() => {
    (global as any).Notification = {
      permission: 'granted',
      requestPermission: jest.fn().mockResolvedValue('granted'),
    };
  });

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

  it('does not send browser notification when permission is not granted', () => {
    (global as any).Notification = {
      permission: 'denied',
    };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    sendBrowserNotification('Test Title');
    // Should not throw — just silently skip
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not send when Notification API is absent', () => {
    delete (global as any).Notification;
    expect(() => sendBrowserNotification('Test Title')).not.toThrow();
  });

  // Note: SSR test (typeof window === 'undefined') can't be tested in jsdom.
});

// AudioContext unlock mechanism (module init) is tested indirectly
// through playNotificationSound/playChatMessageSound tests above.
// The unlock listeners are registered at module-import time, which
// happens before any Jest spy can intercept them, so direct testing
// requires jest.isolateModules() — not warranted for internal init code.
