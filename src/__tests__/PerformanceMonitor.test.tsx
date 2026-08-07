/**
 * Tests for PerformanceMonitor — invisible dev-mode component that logs
 * bundle size and web vitals.
 *
 * Mocks: @/lib/logger, @/lib/performance. Window 'load' is dispatched to
 * trigger the logging callback; a fake PerformanceObserver class is installed
 * to exercise the web-vitals branch.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, act } from '@testing-library/react';

const logMock = jest.fn();
jest.mock('@/lib/logger', () => ({
  logger: {
    log: logMock,
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const reportWebVitalsMock = jest.fn();
jest.mock('@/lib/performance', () => ({
  reportWebVitals: reportWebVitalsMock,
  logBundleSize: jest.fn(),
  calculatePerformanceScore: jest.fn(() => 88),
}));

import PerformanceMonitor from '@/components/PerformanceMonitor';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).PerformanceObserver;
  });

  it('renders nothing', () => {
    const { container } = render(<PerformanceMonitor />);
    expect(container).toBeEmptyDOMElement();
  });

  it('logs bundle size and performance score after window load', () => {
    render(<PerformanceMonitor />);
    act(() => {
      window.dispatchEvent(new Event('load'));
      jest.advanceTimersByTime(1100);
    });
    expect(logMock).toHaveBeenCalledWith('🎯 Performance Score:', 88, '/100');
  });

  it('reports web vitals when PerformanceObserver is available', () => {
    const observers: Array<{
      cb: (list: { getEntries: () => any[] }) => void;
      options: any;
    }> = [];
    class FakePerformanceObserver {
      constructor(cb: (list: { getEntries: () => any[] }) => void) {
        observers.push({ cb, options: null });
      }
      observe(options: any) {
        observers[observers.length - 1]!.options = options;
      }
    }
    (globalThis as any).PerformanceObserver = FakePerformanceObserver;

    render(<PerformanceMonitor />);

    expect(observers.length).toBe(4); // FCP, LCP, FID, CLS

    // FCP entry
    act(() => {
      observers[0]!.cb({
        getEntries: () => [{ name: 'first-contentful-paint', startTime: 1200 }],
      });
    });
    expect(reportWebVitalsMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'FCP', value: 1200, rating: 'good' }),
    );

    // LCP entry
    act(() => {
      observers[1]!.cb({ getEntries: () => [{ startTime: 3000 }] });
    });
    expect(reportWebVitalsMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'LCP', value: 3000, rating: 'needs-improvement' }),
    );

    // FID entry
    act(() => {
      observers[2]!.cb({
        getEntries: () => [{ startTime: 10, processingStart: 200 }],
      });
    });
    expect(reportWebVitalsMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'FID', value: 190, rating: 'needs-improvement' }),
    );

    // CLS entry
    act(() => {
      observers[3]!.cb({
        getEntries: () => [{ hadRecentInput: false, value: 0.05 }],
      });
    });
    expect(reportWebVitalsMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'CLS', value: 0.05, rating: 'good' }),
    );
  });

  it('skips CLS entries with recent input', () => {
    const observers: Array<{ cb: (list: { getEntries: () => any[] }) => void }> = [];
    class FakePerformanceObserver {
      constructor(cb: (list: { getEntries: () => any[] }) => void) {
        observers.push({ cb });
      }
      observe() {}
    }
    (globalThis as any).PerformanceObserver = FakePerformanceObserver;

    render(<PerformanceMonitor />);
    act(() => {
      observers[3]!.cb({ getEntries: () => [{ hadRecentInput: true, value: 0.3 }] });
    });
    expect(reportWebVitalsMock).not.toHaveBeenCalled();
  });
});
