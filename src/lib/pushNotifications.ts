// Push Notifications utility functions

import { logger } from './logger';

// Check if browser supports push notifications
export function isPushNotificationSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Register service worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    logger.warn('Service Workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    logger.log('Service Worker registered:', registration);
    return registration;
  } catch (error) {
    logger.error('Service Worker registration failed:', error);
    return null;
  }
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    logger.warn('Notifications not supported');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  logger.log('Notification permission:', permission);
  return permission;
}

// Subscribe to push notifications
export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  if (!isPushNotificationSupported()) {
    logger.warn('Push notifications not supported');
    return null;
  }

  try {
    // First, request permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      logger.warn('Notification permission denied');
      return null;
    }

    // Register service worker
    const registration = await registerServiceWorker();
    if (!registration) {
      return null;
    }

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Subscribe to push
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
            // Default test key (replace with your own)
            'BEl62iUYgUivxIkv69yViEuiBIa-Ib37gp65oYI-vA0e-CvnG8V8RswNPQNBrD7xHYb9rJXLGYvO6CYnlPqEm0U',
        ),
      });

      logger.log('Subscribed to push notifications:', subscription);
    }

    return subscription;
  } catch (error) {
    logger.error('Failed to subscribe to push notifications:', error);
    return null;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      logger.log('Unsubscribed from push notifications');
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to unsubscribe from push notifications:', error);
    return false;
  }
}

// Send a local push notification (doesn't require server)
export async function sendLocalPushNotification(
  title: string,
  options: NotificationOptions = {},
): Promise<void> {
  if (!isPushNotificationSupported()) {
    logger.warn('Push notifications not supported');
    return;
  }

  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      logger.warn('Notification permission denied');
      return;
    }

    const registration = await navigator.serviceWorker.ready;

    await registration.showNotification(title, {
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      requireInteraction: false, // Better for iOS
      silent: false,
      ...options,
    });
  } catch (error) {
    logger.error('Failed to send local push notification:', error);
  }
}

// Utility: Convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const paddingLength = (4 - (base64String.length % 4)) % 4;
  const padding = paddingLength > 0 ? '='.repeat(paddingLength) : '';
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Check notification permission status
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}
