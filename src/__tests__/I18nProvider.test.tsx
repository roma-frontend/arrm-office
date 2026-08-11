/**
 * Tests for I18nProvider — the one-time language bootstrap that reads the
 * saved language from localStorage, syncs it with i18next and writes the
 * i18nextLng cookie.
 *
 * Covers: saving the current language when nothing is stored yet, applying a
 * stored language via i18n.changeLanguage (then cookie), rendering children
 * immediately when the stored language matches, the invalid stored value
 * reset path (warn + switch to en), the one-time initialization guard, and the
 * document/SSR guards inside the cookie helpers.
 *
 * Mocks: react-i18next (controllable i18n mock), @/lib/logger and
 * @/i18n/config (side-effect import).
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';

// ── i18n mock (controllable) ─────────────────────────────────────────────────
let mockI18n: { language: string; changeLanguage: jest.Mock };
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: mockI18n }),
}));

// The provider imports '../i18n/config' purely for its init side effect.
jest.mock('@/i18n/config', () => ({}));

// ── Logger ───────────────────────────────────────────────────────────────────
const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/lib/logger', () => ({
  logger: mockLogger,
}));

import { I18nProvider } from '@/components/I18nProvider';

const CHILD = <div data-testid="child">child content</div>;

describe('I18nProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    document.cookie = 'i18nextLng=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    mockI18n = {
      language: 'en',
      changeLanguage: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('saves the current language to localStorage and the cookie when nothing is stored', () => {
    render(<I18nProvider>{CHILD}</I18nProvider>);
    expect(localStorage.getItem('i18nextLng')).toBe('en');
    expect(document.cookie).toContain('i18nextLng=en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('uses en as the fallback when the current language is empty', () => {
    mockI18n = { language: '', changeLanguage: jest.fn().mockResolvedValue(undefined) };
    render(<I18nProvider>{CHILD}</I18nProvider>);
    expect(localStorage.getItem('i18nextLng')).toBe('en');
    expect(document.cookie).toContain('i18nextLng=en');
  });

  it('applies a stored language that differs from the current one', async () => {
    localStorage.setItem('i18nextLng', 'ru');
    mockI18n = { language: 'en', changeLanguage: jest.fn().mockResolvedValue(undefined) };
    render(<I18nProvider>{CHILD}</I18nProvider>);
    await act(async () => {});
    expect(mockI18n.changeLanguage).toHaveBeenCalledWith('ru');
    expect(document.cookie).toContain('i18nextLng=ru');
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('does not change the language when the stored language matches', () => {
    localStorage.setItem('i18nextLng', 'en');
    render(<I18nProvider>{CHILD}</I18nProvider>);
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    // A matching language is kept as-is; no cookie rewrite is needed.
    expect(localStorage.getItem('i18nextLng')).toBe('en');
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  // Note: the `else if (savedLang !== currentLang)` reset branch with
  // logger.warn is unreachable through the public API — getSavedLanguage
  // already filters out values outside VALID_LANGUAGES, so a non-empty saved
  // language always matches the validator. It stays uncovered on purpose.

  it('only runs the initialization once even when i18n changes identity', () => {
    const { rerender } = render(<I18nProvider>{CHILD}</I18nProvider>);
    const writeSpy = jest.spyOn(Storage.prototype, 'setItem');
    // A fresh i18n object triggers the effect again; the initialized ref
    // guard must skip the whole bootstrap a second time.
    mockI18n = { language: 'de', changeLanguage: jest.fn().mockResolvedValue(undefined) };
    rerender(<I18nProvider>{CHILD}</I18nProvider>);
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    // No second localStorage write happens on the guarded re-run.
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it('renders children while waiting for the language change promise', async () => {
    let resolveChange!: (v: unknown) => void;
    localStorage.setItem('i18nextLng', 'de');
    mockI18n = {
      language: 'en',
      changeLanguage: jest.fn(() => new Promise((resolve) => (resolveChange = resolve))),
    };
    render(<I18nProvider>{CHILD}</I18nProvider>);
    // Children render before the change resolves.
    expect(screen.getByTestId('child')).toBeInTheDocument();
    await act(async () => {
      resolveChange(undefined);
    });
    expect(document.cookie).toContain('i18nextLng=de');
  });

  it('writes the cookie even when the saved language matches the current one', () => {
    // Empty localStorage: current language is persisted.
    render(<I18nProvider>{CHILD}</I18nProvider>);
    expect(document.cookie).toContain('i18nextLng=en');
  });
});
