'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface QueuedAction {
  id: string;
  action: string;
  payload: unknown;
  timestamp: number;
}

const STORAGE_KEY = 'hr-offline-queue';

function loadQueue(): QueuedAction[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Queues actions when offline and processes them when back online.
 * @param processor - async function that executes a queued action
 */
export function useOfflineQueue(processor: (action: string, payload: unknown) => Promise<void>) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const processing = useRef(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-only queue load
    setQueue(loadQueue());
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Process queue when back online
  useEffect(() => {
    if (!isOnline || queue.length === 0 || processing.current) return;
    processing.current = true;

    (async () => {
      const remaining = [...queue];
      while (remaining.length > 0 && navigator.onLine) {
        const item = remaining.shift()!;
        try {
          await processor(item.action, item.payload);
        } catch {
          // Put back failed item and stop
          remaining.unshift(item);
          break;
        }
      }
      setQueue(remaining);
      saveQueue(remaining);
      processing.current = false;
    })();
  }, [isOnline, queue, processor]);

  const enqueue = useCallback((action: string, payload: unknown) => {
    const item: QueuedAction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      payload,
      timestamp: Date.now(),
    };
    setQueue((prev) => {
      const next = [...prev, item];
      saveQueue(next);
      return next;
    });
  }, []);

  return { isOnline, queue, enqueue, pendingCount: queue.length };
}
