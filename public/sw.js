// Service Worker for Push Notifications + Offline Support
const CACHE_NAME = 'hr-office-v2';
const OFFLINE_URL = '/offline';
const PRECACHE_URLS = [OFFLINE_URL];

// Install event — precache offline page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate event — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  clients.claim();
});

// Fetch event — serve offline page when network fails for navigation requests
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});

// Push notification event
self.addEventListener('push', (event) => {
  logger.log('Push notification received:', event);
  
  let notificationData = {
    title: 'Time for a Break! ☕',
    body: 'You\'ve been working hard. Take a 5-minute break to stretch and recharge!',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'break-reminder',
    requireInteraction: false, // Changed to false for iOS
    renotify: true, // Force notification even if tag exists
    vibrate: [300, 100, 300, 100, 300, 100, 300], // Stronger vibration pattern
    silent: false, // Ensure sound plays
    data: {
      url: '/dashboard',
      timestamp: Date.now(),
    },
    actions: [
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
      {
        action: 'snooze',
        title: 'Snooze 5 min',
      },
    ],
  };

  // If push has data, use it
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (e) {
      logger.error('Failed to parse push data:', e);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  logger.log('Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  if (event.action === 'snooze') {
    // Schedule another notification in 5 minutes
    setTimeout(() => {
      self.registration.showNotification('Break Reminder - Snoozed ⏰', {
        body: 'Your 5-minute snooze is up. Time for that break!',
        icon: '/icon-192x192.png',
        tag: 'break-reminder-snooze',
      });
    }, 5 * 60 * 1000);
    return;
  }

  // Open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (let client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          return client.focus();
        }
      }
      // If not open, open new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || '/dashboard');
      }
    })
  );
});

// Background sync for offline support (optional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    logger.log('Background sync triggered');
  }
});
