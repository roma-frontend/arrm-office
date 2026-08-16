/**
 * Tests for CookieBanner — server-rendered consent banner that accepts,
 * rejects and routes to settings.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  // CookieBanner resolves copy via useLandingTranslation, which imports
  // '@/i18n/config' — the real i18next.init() needs the plugin shape below.
  initReactI18next: { type: 'i18nextModule' },
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string }) =>
      typeof opts === 'object' && opts ? (opts.defaultValue ?? key) : (opts ?? key),
    i18n: { language: 'en' },
  }),
}));

// ── Store mocks ──────────────────────────────────────────────────────────────
let mockConsent = { hasConsent: false, showBanner: true };
const mockAcceptAll = jest.fn();
const mockRejectAll = jest.fn();
jest.mock('@/store/cookieConsentStore', () => ({
  useCookieConsent: () => ({
    ...mockConsent,
    acceptAll: mockAcceptAll,
    rejectAll: mockRejectAll,
  }),
}));

let mockIsAuthenticated = false;
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

// ── Router mock ──────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── next/link mock ───────────────────────────────────────────────────────────
jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

// ── lucide + ui mocks ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return {
    Cookie: Icon,
    Settings: Icon,
    Shield: Icon,
    BarChart3: Icon,
    Target: Icon,
    Palette: Icon,
  };
});
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
const { useCookieConsent } = require('@/store/cookieConsentStore') as {
  useCookieConsent: () => any;
};

import CookieBanner from '@/components/CookieBanner';

beforeEach(() => {
  jest.clearAllMocks();
  mockConsent = { hasConsent: false, showBanner: true };
  mockIsAuthenticated = false;
});

describe('CookieBanner', () => {
  it('renders the banner with title, description and actions', async () => {
    render(<CookieBanner />);
    await waitFor(() => {
      expect(screen.getByText(/cookies\.title/)).toBeInTheDocument();
    });
    expect(screen.getByText('cookies.acceptAll')).toBeInTheDocument();
    expect(screen.getByText('cookies.rejectAll')).toBeInTheDocument();
    expect(screen.getByText('cookies.settings')).toBeInTheDocument();
  });

  it('does not render when consent was already given', async () => {
    mockConsent = { hasConsent: true, showBanner: false };
    const { container } = render(<CookieBanner />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('does not render when the banner is disabled', async () => {
    mockConsent = { hasConsent: false, showBanner: false };
    const { container } = render(<CookieBanner />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('accepts all consent when the accept button is clicked', async () => {
    render(<CookieBanner />);
    await waitFor(() => {
      expect(screen.getByText('cookies.acceptAll')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('cookies.acceptAll'));
    expect(mockAcceptAll).toHaveBeenCalled();
  });

  it('rejects all consent when the reject button is clicked', async () => {
    render(<CookieBanner />);
    await waitFor(() => {
      expect(screen.getByText('cookies.rejectAll')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('cookies.rejectAll'));
    expect(mockRejectAll).toHaveBeenCalled();
  });

  it('routes unauthenticated users to login with a callback', async () => {
    render(<CookieBanner />);
    await waitFor(() => {
      expect(screen.getByText('cookies.settings')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('cookies.settings'));
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fsettings');
  });

  it('routes authenticated users directly to settings', async () => {
    mockIsAuthenticated = true;
    render(<CookieBanner />);
    await waitFor(() => {
      expect(screen.getByText('cookies.settings')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('cookies.settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('renders a link to the privacy policy', async () => {
    render(<CookieBanner />);
    await waitFor(() => {
      expect(
        screen.getByLabelText('Read our privacy policy and data handling practices'),
      ).toBeInTheDocument();
    });
  });
});
