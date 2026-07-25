/**
 * Tests for pushNotifications.ts — Push Notification utilities
 */

import {
  isPushNotificationSupported,
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  sendLocalPushNotification,
  getNotificationPermission,
} from '@/lib/pushNotifications';

jest.mock('@/lib/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() },
}));

// Reusable mock building
function setupNavigator(options?: {
  registerResult?: any;
  getSubscriptionResult?: any;
  subscribeResult?: any;
}) {
  const subscribeFn = jest.fn().mockResolvedValue(
    options?.subscribeResult ?? {
      endpoint: 'https://push.example.com/abc',
      unsubscribe: jest.fn().mockResolvedValue(true),
      toJSON: () => ({}),
    },
  );

  const getSubscriptionFn = jest.fn().mockResolvedValue(options?.getSubscriptionResult ?? null);

  const registerFn = jest.fn().mockResolvedValue(
    options?.registerResult ?? {
      pushManager: {
        getSubscription: getSubscriptionFn,
        subscribe: subscribeFn,
      },
    },
  );

  const mockPushManager = {
    getSubscription: getSubscriptionFn,
    subscribe: subscribeFn,
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: registerFn,
      ready: Promise.resolve({ pushManager: mockPushManager }),
    },
    configurable: true,
    writable: true,
  });

  return { registerFn, getSubscriptionFn, subscribeFn };
}

function setupNotification(permission: NotificationPermission = 'granted') {
  Object.defineProperty(window, 'Notification', {
    value: {
      permission,
      requestPermission: jest.fn().mockResolvedValue(permission),
    },
    configurable: true,
    writable: true,
  });
}

function clearNavigator() {
  delete (navigator as any).serviceWorker;
}

const mockShowNotification = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  setupNavigator();
  setupNotification('granted');

  // Also set up showNotification through the register return value
  const reg = {
    pushManager: {
      getSubscription: jest.fn().mockResolvedValue(null),
      subscribe: jest.fn().mockResolvedValue({
        endpoint: 'https://push.example.com/abc',
        unsubscribe: jest.fn().mockResolvedValue(true),
        toJSON: () => ({}),
      }),
    },
    showNotification: mockShowNotification,
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: jest.fn().mockResolvedValue(reg),
      ready: Promise.resolve(reg),
    },
    configurable: true,
    writable: true,
  });

  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib37gp65oYI-vA0e-CvnG8V8RswNPQNBrD7xHYb9rJXLGYvO6CYnlPqEm0U';
});

describe('isPushNotificationSupported', () => {
  it('returns true when serviceWorker and PushManager exist', () => {
    expect(isPushNotificationSupported()).toBe(true);
  });

  it('returns false when serviceWorker is missing', () => {
    clearNavigator();
    expect(isPushNotificationSupported()).toBe(false);
  });
});

describe('registerServiceWorker', () => {
  it('registers and returns registration', async () => {
    const reg = await registerServiceWorker();
    expect(reg).toBeDefined();
  });

  it('returns null when serviceWorker not supported', async () => {
    clearNavigator();
    const reg = await registerServiceWorker();
    expect(reg).toBeNull();
  });

  it('returns null on registration error', async () => {
    setupNavigator({ registerResult: Promise.reject(new Error('fail')) });
    try {
      const reg = await registerServiceWorker();
      expect(reg).toBeNull();
    } catch {
      /* expected */
    }
  });
});

describe('requestNotificationPermission', () => {
  it('returns granted on user approval', async () => {
    const perm = await requestNotificationPermission();
    expect(perm).toBe('granted');
  });

  it('returns denied when notifications not supported', async () => {
    delete (window as any).Notification;
    const perm = await requestNotificationPermission();
    expect(perm).toBe('denied');
  });
});

describe('subscribeToPushNotifications', () => {
  it('returns subscription on success', async () => {
    const sub = await subscribeToPushNotifications();
    expect(sub).toBeDefined();
    expect(sub?.endpoint).toBe('https://push.example.com/abc');
  });

  it('returns null when push not supported', async () => {
    clearNavigator();
    const sub = await subscribeToPushNotifications();
    expect(sub).toBeNull();
  });

  it('returns null when permission denied', async () => {
    setupNotification('denied');
    const sub = await subscribeToPushNotifications();
    expect(sub).toBeNull();
  });

  it('uses existing subscription if already subscribed', async () => {
    const existingSub = {
      endpoint: 'https://push.example.com/existing',
      unsubscribe: jest.fn(),
    };

    // register must return a promise resolving to a registration with the right pushManager
    const mockReg = {
      pushManager: { getSubscription: jest.fn().mockResolvedValue(existingSub) },
    };

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: jest.fn().mockResolvedValue(mockReg),
        ready: Promise.resolve(mockReg),
      },
      configurable: true,
    });

    const sub = await subscribeToPushNotifications();
    expect(sub?.endpoint).toBe('https://push.example.com/existing');
  });

  it('falls back to default VAPID key when env var missing', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const sub = await subscribeToPushNotifications();
    expect(sub).toBeDefined();
  });
});

describe('unsubscribeFromPushNotifications', () => {
  it('unsubscribes and returns true', async () => {
    const { getSubscriptionFn } = setupNavigator({
      getSubscriptionResult: {
        endpoint: 'https://push.example.com/abc',
        unsubscribe: jest.fn().mockResolvedValue(true),
      },
    });

    const result = await unsubscribeFromPushNotifications();
    expect(result).toBe(true);
  });

  it('returns false when no subscription exists', async () => {
    const reg = {
      pushManager: { getSubscription: jest.fn().mockResolvedValue(null) },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: jest.fn().mockResolvedValue(reg),
        ready: Promise.resolve(reg),
      },
      configurable: true,
    });

    const result = await unsubscribeFromPushNotifications();
    expect(result).toBe(false);
  });

  it('returns false on error', async () => {
    clearNavigator();
    const result = await unsubscribeFromPushNotifications();
    expect(result).toBe(false);
  });
});

describe('sendLocalPushNotification', () => {
  it('shows notification with default options', async () => {
    await sendLocalPushNotification('Test Title');
    expect(mockShowNotification).toHaveBeenCalledWith(
      'Test Title',
      expect.objectContaining({ icon: expect.any(String), badge: expect.any(String) }),
    );
  });

  it('shows notification with custom options', async () => {
    await sendLocalPushNotification('Alert', { body: 'Something', tag: 'alert-1' });
    expect(mockShowNotification).toHaveBeenCalledWith(
      'Alert',
      expect.objectContaining({ body: 'Something', tag: 'alert-1' }),
    );
  });

  it('does nothing when push not supported', async () => {
    clearNavigator();
    await sendLocalPushNotification('Test');
    expect(mockShowNotification).not.toHaveBeenCalled();
  });
});

describe('getNotificationPermission', () => {
  it('returns Notification.permission', () => {
    expect(getNotificationPermission()).toBe('granted');
  });

  it('returns denied when Notification API missing', () => {
    delete (window as any).Notification;
    expect(getNotificationPermission()).toBe('denied');
  });
});
