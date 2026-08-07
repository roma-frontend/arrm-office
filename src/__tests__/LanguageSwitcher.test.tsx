/**
 * Tests for LanguageSwitcher — language dropdown that persists the choice and
 * calls i18n.changeLanguage.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
let mockLanguage = 'en';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: mockLanguage, changeLanguage: mockChangeLanguage },
  }),
}));

// ── lucide + ui mocks ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="globe" {...props} />;
  return { Globe: Icon };
});
jest.mock('@/components/ui/button', () => {
  return {
    Button: ({ children, ...rest }: any) => (
      <button data-testid="lang-trigger" {...rest}>
        {children}
      </button>
    ),
  };
});
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...rest }: any) => (
    <button data-testid="dropdown-item" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

// ── cssMotion mock ───────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    span: ({ children }: any) => <span>{children}</span>,
    div: ({ children }: any) => <div>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const originalRaf = (globalThis as any).requestAnimationFrame;

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage = 'en';
  mockChangeLanguage.mockResolvedValue(undefined);
  (globalThis as any).requestAnimationFrame = (cb: () => void) => {
    cb();
    return 1;
  };
  (globalThis as any).scrollTo = jest.fn();
  window.localStorage.clear();
});

afterEach(() => {
  (globalThis as any).requestAnimationFrame = originalRaf;
});

describe('LanguageSwitcher', () => {
  it('renders the current language label and flag', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText(/English/)).toBeInTheDocument();
    // the flag renders in both the desktop and compact labels
    expect(screen.getAllByText(/🇬🇧/).length).toBeGreaterThan(0);
  });

  it('offers the other three languages in the dropdown', () => {
    render(<LanguageSwitcher />);
    const items = screen.getAllByTestId('dropdown-item');
    expect(items.map((i) => i.textContent)).toEqual(
      expect.arrayContaining(['🇦🇲Հայերեն', '🇷🇺Русский', '🇩🇪Deutsch']),
    );
    // current language (English) is not offered
    expect(items.map((i) => i.textContent)).not.toContain('English');
  });

  it('persists the choice and calls i18n.changeLanguage', async () => {
    render(<LanguageSwitcher />);
    const russian = screen
      .getAllByTestId('dropdown-item')
      .find((i) => i.textContent?.includes('Русский'))!;
    fireEvent.click(russian);

    await act(async () => {});
    expect(mockChangeLanguage).toHaveBeenCalledWith('ru');
    expect(window.localStorage.getItem('i18nextLng')).toBe('ru');
    expect((globalThis as any).scrollTo).toHaveBeenCalled();
  });

  it('shows the flag-only label on the compact view', () => {
    render(<LanguageSwitcher />);
    // both spans render; the flag appears at least once
    expect(screen.getAllByText(/🇬🇧/).length).toBeGreaterThan(0);
  });
});
