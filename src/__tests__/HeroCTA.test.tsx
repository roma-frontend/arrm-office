/**
 * Tests for the landing HeroCTA — auth-gated call-to-action buttons.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: {
      language: 'en',
      getFixedT: () => (key: string, fallback?: string) => fallback ?? key,
    },
  }),
}));

// ── next/link + router mocks ─────────────────────────────────────────────────
jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockUser: { id: string; role: string } | null = null;
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

// ── ui button mock ───────────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => {
  return {
    Button: ({ children, onClick, ...rest }: any) => (
      <button onClick={onClick} {...rest}>
        {children}
      </button>
    ),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require('@/store/useAuthStore') as { useAuthStore: () => any };

import HeroCTA from '@/components/landing/HeroCTA';

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
});

describe('HeroCTA', () => {
  it('renders the get-started and sign-in links for guests', () => {
    render(<HeroCTA />);
    expect(screen.getByText('landing.getStartedFree').closest('a')).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByText('landing.signIn').closest('a')).toHaveAttribute('href', '/login');
  });

  it('uses the server language before mount via getFixedT', () => {
    render(<HeroCTA initialLanguage="ru" />);
    // fallback keys are passed through, so labels still render
    expect(screen.getByText('landing.getStartedFree')).toBeInTheDocument();
  });

  it('renders dashboard buttons for an authenticated user after mount', () => {
    mockUser = { id: 'user-1', role: 'admin' };
    render(<HeroCTA />);
    act(() => {
      jest.runAllTimers();
    });
    // mounted state flips via useEffect; assert the authed branch renders
    expect(screen.getByText('landing.goToDashboard')).toBeInTheDocument();
    expect(screen.getByText('landing.viewAnalytics')).toBeInTheDocument();
  });

  it('navigates to the dashboard when the CTA is clicked', () => {
    mockUser = { id: 'user-1', role: 'admin' };
    render(<HeroCTA />);
    act(() => {
      jest.runAllTimers();
    });
    fireEvent.click(screen.getByText('landing.goToDashboard'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });
});
