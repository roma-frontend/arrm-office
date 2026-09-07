/**
 * Tests for the landing Footer — link rendering and the auth-aware href swap.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
// `initReactI18next` is included because useLandingTranslation imports
// '@/i18n/config', which calls i18n.use(initReactI18next) at module scope.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

// ── next/link mock ───────────────────────────────────────────────────────────
jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockIsAuthenticated = false;
jest.mock('@/store/useAuthStore', () => ({
  useAuthStoreShallow: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStoreShallow } = require('@/store/useAuthStore') as {
  useAuthStoreShallow: () => { isAuthenticated: boolean };
};

import Footer from '@/components/landing/Footer';

beforeEach(() => {
  mockIsAuthenticated = false;
});

describe('Footer', () => {
  it('renders the brand and footer link columns', () => {
    render(<Footer />);
    expect(screen.getByText('landing.features')).toBeInTheDocument();
    expect(screen.getByText('landing.pricing')).toBeInTheDocument();
    // The footer uses the bundled `landing` namespace — the `auth` namespace is
    // deliberately not loaded on the landing page (raw keys leaked pre-fix).
    expect(screen.getByText('landingExtra.signIn')).toBeInTheDocument();
    expect(screen.getByText('landingExtra.footerPrivacy')).toBeInTheDocument();
  });

  it('links to the login page when unauthenticated', () => {
    render(<Footer />);
    expect(screen.getByText('nav.dashboard').closest('a')).toHaveAttribute('href', '/login');
  });

  it('links to the dashboard when authenticated', () => {
    mockIsAuthenticated = true;
    render(<Footer />);
    expect(screen.getByText('nav.dashboard').closest('a')).toHaveAttribute('href', '/dashboard');
    expect(screen.getByText('nav.employees').closest('a')).toHaveAttribute('href', '/employees');
  });

  it('renders the copyright line with the current year', () => {
    render(<Footer />);
    expect(screen.getByText(new RegExp(`${new Date().getFullYear()}`))).toBeInTheDocument();
  });

  it('renders the social links with target blank', () => {
    const { container } = render(<Footer />);
    const twitter = container.querySelector('a[href="https://twitter.com"]');
    expect(twitter).toHaveAttribute('target', '_blank');
    expect(twitter).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.querySelector('a[href="https://github.com"]')).toBeInTheDocument();
  });
});
