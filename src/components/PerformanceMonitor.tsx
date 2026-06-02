'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';
import { reportWebVitals, logBundleSize, calculatePerformanceScore } from '@/lib/performance';

/**
 * Performance Monitor Component
 * Отслеживает метрики производительности в dev режиме
 */
export default function PerformanceMonitor() {
  useEffect(() => {
    // Логирование bundle size
    if (typeof window !== 'undefined') {
      // Ждем полной загрузки
      window.addEventListener('load', () => {
        setTimeout(() => {
          logBundleSize();
          const score = calculatePerformanceScore();
          logger.log('🎯 Performance Score:', score, '/100');
        }, 1000);
      });
    }

    // Web Vitals мониторинг
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        // First Contentful Paint (FCP)
        const fcpObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              reportWebVitals({
                name: 'FCP',
                value: entry.startTime,
                rating:
                  entry.startTime < 1800
                    ? 'good'
                    : entry.startTime < 3000
                      ? 'needs-improvement'
                      : 'poor',
                delta: entry.startTime,
                id: 'fcp',
              });
            }
          }
        });
        fcpObserver.observe({ entryTypes: ['paint'] });

        // Largest Contentful Paint (LCP)
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            reportWebVitals({
              name: 'LCP',
              value: lastEntry.startTime,
              rating:
                lastEntry.startTime < 2500
                  ? 'good'
                  : lastEntry.startTime < 4000
                    ? 'needs-improvement'
                    : 'poor',
              delta: lastEntry.startTime,
              id: 'lcp',
            });
          }
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay (FID)
        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const fidEntry = entry as PerformanceEventTiming;
            reportWebVitals({
              name: 'FID',
              value: fidEntry.processingStart - entry.startTime,
              rating:
                fidEntry.processingStart - entry.startTime < 100
                  ? 'good'
                  : fidEntry.processingStart - entry.startTime < 300
                    ? 'needs-improvement'
                    : 'poor',
              delta: fidEntry.processingStart - entry.startTime,
              id: 'fid',
            });
          }
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Cumulative Layout Shift (CLS)
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const clsEntry = entry as PerformanceEntry & {
              hadRecentInput: boolean;
              value: number;
            };
            if (!clsEntry.hadRecentInput) {
              clsValue += clsEntry.value;
              reportWebVitals({
                name: 'CLS',
                value: clsValue,
                rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs-improvement' : 'poor',
                delta: clsValue,
                id: 'cls',
              });
            }
          }
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        logger.warn('Performance monitoring failed:', e);
      }
    }
  }, []);

  return null; // Этот компонент невидимый
}
