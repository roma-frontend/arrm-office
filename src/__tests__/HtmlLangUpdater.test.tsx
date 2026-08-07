/**
 * Tests for HtmlLangUpdater — keeps <html lang="..."> in sync with i18n.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
const listeners = new Map<string, Set<() => void>>();
const mockI18n = {
  language: 'en',
  on: jest.fn((event: string, cb: () => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
  }),
  off: jest.fn((event: string, cb: () => void) => {
    listeners.get(event)?.delete(cb);
  }),
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: mockI18n }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useTranslation } = require('react-i18next') as { useTranslation: () => any };

import { HtmlLangUpdater } from '@/components/HtmlLangUpdater';

beforeEach(() => {
  listeners.clear();
  jest.clearAllMocks();
  mockI18n.language = 'en';
  mockI18n.on.mockClear();
  mockI18n.off.mockClear();
});

describe('HtmlLangUpdater', () => {
  it('sets the html lang attribute on mount', () => {
    render(<HtmlLangUpdater />);
    expect(document.documentElement.lang).toBe('en');
  });

  it('registers a languageChanged listener and unregisters on unmount', () => {
    const { unmount } = render(<HtmlLangUpdater />);
    expect(mockI18n.on).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    const handler = mockI18n.on.mock.calls[0][1] as () => void;

    unmount();
    expect(mockI18n.off).toHaveBeenCalledWith('languageChanged', handler);
  });

  it('updates the html lang attribute when the language changes', () => {
    render(<HtmlLangUpdater />);
    mockI18n.language = 'ru';
    const handler = mockI18n.on.mock.calls[0][1] as () => void;
    handler();
    expect(document.documentElement.lang).toBe('ru');
  });

  it('falls back to en when no language is set', () => {
    mockI18n.language = '';
    render(<HtmlLangUpdater />);
    expect(document.documentElement.lang).toBe('en');
  });
});
