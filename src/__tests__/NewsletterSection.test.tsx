/**
 * Tests for the landing NewsletterSection — email validation, subscribe flow
 * and success state.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string }) =>
      typeof opts === 'object' && opts ? (opts.defaultValue ?? key) : (opts ?? key),
    i18n: { language: 'en' },
  }),
}));

// ── sonner toast mock ────────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// ── lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return { Mail: Icon, ArrowRight: Icon, CheckCircle2: Icon };
});

// ── ui button + loader mocks ─────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => {
  return {
    Button: ({ children, onClick, ...rest }: any) => (
      <button onClick={onClick} {...rest}>
        {children}
      </button>
    ),
  };
});
jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

// ── IntersectionObserver mock (useReveal) ───────────────────────────────────
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [];
}
(globalThis as any).IntersectionObserver = MockIntersectionObserver;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toast } = require('sonner') as { toast: { success: jest.Mock; error: jest.Mock } };

import NewsletterSection from '@/components/landing/NewsletterSection';

const originalFetch = (globalThis as any).fetch;

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  jest.clearAllMocks();
});

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
});

describe('NewsletterSection', () => {
  it('renders the title, input and subscribe button', () => {
    render(<NewsletterSection />);
    expect(screen.getByText('newsletter.title')).toBeInTheDocument();
    expect(screen.getByLabelText('ariaLabels.emailAddress')).toBeInTheDocument();
    expect(screen.getByText('newsletter.subscribe')).toBeInTheDocument();
  });

  it('rejects an invalid email with an error toast', () => {
    render(<NewsletterSection />);
    const input = screen.getByLabelText('ariaLabels.emailAddress');
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.submit(input.closest('form')!);

    expect(toast.error).toHaveBeenCalledWith('newsletter.invalidEmail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('subscribes successfully and shows the success state', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<NewsletterSection />);
    const input = screen.getByLabelText('ariaLabels.emailAddress');
    fireEvent.change(input, { target: { value: 'anna@example.com' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect((globalThis as any).fetch).toHaveBeenCalledWith(
        '/api/newsletter/subscribe',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText('newsletter.subscribed')).toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith('newsletter.successMessage');
  });

  it('reports an error toast when the request fails', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server down' }),
    });

    render(<NewsletterSection />);
    const input = screen.getByLabelText('ariaLabels.emailAddress');
    fireEvent.change(input, { target: { value: 'anna@example.com' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Something went wrong');
    });
  });

  it('thanks already-subscribed users with the dedicated message', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, alreadySubscribed: true }),
    });

    render(<NewsletterSection />);
    const input = screen.getByLabelText('ariaLabels.emailAddress');
    fireEvent.change(input, { target: { value: 'anna@example.com' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('You are already subscribed!');
    });
  });

  it('sends the language with the subscription payload', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<NewsletterSection />);
    const input = screen.getByLabelText('ariaLabels.emailAddress');
    fireEvent.change(input, { target: { value: 'anna@example.com' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      const body = JSON.parse(((globalThis as any).fetch as jest.Mock).mock.calls[0][1].body) as {
        email: string;
        language: string;
      };
      expect(body).toEqual({ email: 'anna@example.com', language: 'en' });
    });
  });
});
