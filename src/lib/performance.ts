/**
 * Performance Monitoring and Optimization Utilities
 * Отслеживание производительности приложения
 */

import { logger } from './logger';

// ===== WEB VITALS MONITORING =====
export function reportWebVitals(metric: {
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  id?: string;
}) {
  // Логирование метрик производительности
  if (process.env.NODE_ENV === 'development') {
    logger.log('📊 Web Vitals:', {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
    });
  }

  // В production можно отправлять в аналитику (Google Analytics, etc)
  if (typeof window !== 'undefined' && typeof window.gtag !== 'undefined') {
    window.gtag('event', metric.name, {
      value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      event_category: 'Web Vitals',
      event_label: metric.id,
      non_interaction: true,
    });
  }
}

// ===== PERFORMANCE MARKS =====
export const perf = {
  // Начало измерения
  mark(name: string) {
    if (typeof performance !== 'undefined') {
      performance.mark(`${name}-start`);
    }
  },

  // Конец измерения и расчет времени
  measure(name: string) {
    if (typeof performance !== 'undefined') {
      try {
        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);

        const measure = performance.getEntriesByName(name)[0];
        if (measure && process.env.NODE_ENV === 'development') {
          logger.log(`⏱️ ${name}: ${measure.duration.toFixed(2)}ms`);
        }

        // Очистка marks
        performance.clearMarks(`${name}-start`);
        performance.clearMarks(`${name}-end`);
        performance.clearMeasures(name);

        return measure?.duration || 0;
      } catch (e) {
        logger.warn(`Performance measurement failed for ${name}:`, e);
        return 0;
      }
    }
    return 0;
  },

  // Получить все метрики
  getAllMetrics() {
    if (typeof performance === 'undefined') return [];

    return {
      navigation: performance.getEntriesByType('navigation'),
      resources: performance.getEntriesByType('resource'),
      marks: performance.getEntriesByType('mark'),
      measures: performance.getEntriesByType('measure'),
    };
  },
};

// ===== LAZY LOADING OBSERVER =====
export function createLazyObserver(callback: (entry: IntersectionObserverEntry) => void) {
  if (typeof IntersectionObserver === 'undefined') {
    return null;
  }

  return new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          callback(entry);
        }
      });
    },
    {
      rootMargin: '50px', // Загружать за 50px до появления в viewport
      threshold: 0.01,
    },
  );
}

// ===== PREFETCH UTILITIES =====
export function prefetchRoute(href: string) {
  if (typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  document.head.appendChild(link);
}

export function preconnect(url: string) {
  if (typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = url;
  document.head.appendChild(link);
}

// ===== DEBOUNCE & THROTTLE =====
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ===== CACHE UTILITIES =====
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string, ttl: number = 60000): T | null {
  const cached = cache.get(key);
  if (!cached) return null;

  const isExpired = Date.now() - cached.timestamp > ttl;
  if (isExpired) {
    cache.delete(key);
    return null;
  }

  return cached.data as T;
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data: data as unknown, timestamp: Date.now() });
}

export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

// ===== BUNDLE SIZE CHECKER =====
export function logBundleSize() {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    const jsSize = resources
      .filter((r) => r.name.endsWith('.js'))
      .reduce((sum, r) => sum + (r.transferSize || 0), 0);

    const cssSize = resources
      .filter((r) => r.name.endsWith('.css'))
      .reduce((sum, r) => sum + (r.transferSize || 0), 0);

    logger.log('📦 Bundle Sizes:', {
      js: `${(jsSize / 1024).toFixed(2)} KB`,
      css: `${(cssSize / 1024).toFixed(2)} KB`,
      total: `${((jsSize + cssSize) / 1024).toFixed(2)} KB`,
    });
  }
}

// ===== PERFORMANCE SCORE =====
export function calculatePerformanceScore(): number {
  if (typeof performance === 'undefined') return 0;

  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  if (!navigation) return 0;

  // Метрики
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;
  const domContentLoaded =
    navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
  const loadComplete = navigation.loadEventEnd - navigation.loadEventStart;

  // Простая оценка (0-100)
  let score = 100;

  if (fcp > 1800) score -= 30;
  else if (fcp > 1000) score -= 15;

  if (domContentLoaded > 1500) score -= 25;
  else if (domContentLoaded > 800) score -= 10;

  if (loadComplete > 3000) score -= 25;
  else if (loadComplete > 1500) score -= 10;

  return Math.max(0, score);
}

export default {
  reportWebVitals,
  perf,
  createLazyObserver,
  prefetchRoute,
  preconnect,
  debounce,
  throttle,
  getCached,
  setCache,
  clearCache,
  logBundleSize,
  calculatePerformanceScore,
};
