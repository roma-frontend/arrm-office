/**
 * Tests for useLandingTextOverrides — the live landing-copy subscription that
 * is deferred past the load window (idle callback) to keep the Convex
 * websocket off the critical path.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, act, waitFor } from '@testing-library/react';

const useQuery = jest.fn();
jest.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

const applyLandingOverrides = jest.fn();
jest.mock('@/lib/landingTexts', () => ({
  applyLandingOverrides: (...args: unknown[]) => applyLandingOverrides(...args),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    superadmin: {
      landingEditor: { getPublishedLandingTexts: { query: 'getPublishedLandingTexts' } },
    },
  },
}));

import { useLandingTextOverrides } from '@/hooks/useLandingTextOverrides';

function Probe(props: Parameters<typeof useLandingTextOverrides>[0]) {
  useLandingTextOverrides(props.locale, props.initial, props.editorOverrides);
  return null;
}

const originalIdle = (globalThis as any).requestIdleCallback;

describe('useLandingTextOverrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).requestIdleCallback = (cb: () => void) => {
      cb();
      return 1;
    };
  });
  afterEach(() => {
    (globalThis as any).requestIdleCallback = originalIdle;
    jest.useRealTimers();
  });

  it('skips the live query entirely while idle has not fired', () => {
    (globalThis as any).requestIdleCallback = undefined;
    jest.useFakeTimers();
    render(<Probe locale="en" />);
    // Deferred: no subscription until the fallback timer fires
    expect(useQuery).toHaveBeenCalledWith(expect.anything(), 'skip');
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(useQuery).toHaveBeenLastCalledWith(expect.anything(), { lang: 'en' });
  });

  it('subscribes after the browser goes idle', () => {
    render(<Probe locale="ru" />);
    expect(useQuery).toHaveBeenLastCalledWith(expect.anything(), { lang: 'ru' });
  });

  it('never subscribes in editor preview mode (editorOverrides win)', () => {
    render(<Probe locale="en" editorOverrides={{ 'landing.heroTitle': 'Draft' }} />);
    expect(useQuery).toHaveBeenCalledWith(expect.anything(), 'skip');
    expect(applyLandingOverrides).toHaveBeenCalledWith('en', {
      'landing.heroTitle': 'Draft',
    });
  });

  it('applies the SSR initial map immediately', () => {
    useQuery.mockReturnValue(undefined);
    render(<Probe locale="de" initial={{ 'landing.scroll': 'Scrollen' }} />);
    expect(applyLandingOverrides).toHaveBeenCalledWith('de', { 'landing.scroll': 'Scrollen' });
  });

  it('re-injects when the live query resolves with published overrides', async () => {
    useQuery.mockReturnValue(undefined);
    const { rerender } = render(<Probe locale="en" />);
    useQuery.mockReturnValue({ 'landing.heroTitle': 'Published!' });
    rerender(<Probe locale="en" />);
    await waitFor(() => {
      expect(applyLandingOverrides).toHaveBeenCalledWith('en', {
        'landing.heroTitle': 'Published!',
      });
    });
  });

  it('ignores an empty published map', async () => {
    useQuery.mockReturnValue({});
    render(<Probe locale="en" />);
    await act(async () => {});
    expect(applyLandingOverrides).not.toHaveBeenCalled();
  });
});
