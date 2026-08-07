/**
 * Tests for error & fallback pages in src/app and src/app/(auth):
 *   - error.tsx (global error boundary)
 *   - global-error.tsx (root html-level boundary)
 *   - (auth)/error.tsx, (auth)/not-found.tsx, (auth)/loading.tsx, (auth)/layout.tsx
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    ready: true,
    i18n: { language: 'en' },
  }),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    AlertOctagon: Icon,
    RefreshCw: Icon,
    Home: Icon,
    ShieldAlert: Icon,
    FileQuestion: Icon,
    ArrowLeft: Icon,
  };
});

jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), log: jest.fn() },
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: (props: any) => <div data-testid="shield-loader" {...props} />,
}));

import GlobalError from '@/app/error';
import RootGlobalError from '@/app/global-error';
import AuthError from '@/app/(auth)/error';
import AuthNotFound from '@/app/(auth)/not-found';
import AuthLoading from '@/app/(auth)/loading';
import AuthLayout from '@/app/(auth)/layout';

describe('global error boundary (src/app/error.tsx)', () => {
  it('renders the error title and description', () => {
    render(<GlobalError error={new Error('boom')} reset={() => {}} />);
    expect(screen.getByText('Oops! Something broke')).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred\. Our team has been notified/),
    ).toBeInTheDocument();
  });

  it('shows the error digest reference when present', () => {
    const error = Object.assign(new Error('boom'), { digest: 'digest-123' });
    render(<GlobalError error={error} reset={() => {}} />);
    expect(screen.getByText(/digest-123/)).toBeInTheDocument();
  });

  it('calls reset when the retry button is clicked', () => {
    const reset = jest.fn();
    render(<GlobalError error={new Error('boom')} reset={reset} />);
    fireEvent.click(screen.getByText('Refresh page'));
    expect(reset).toHaveBeenCalled();
  });

  it('links home', () => {
    render(<GlobalError error={new Error('boom')} reset={() => {}} />);
    expect(screen.getByText('Go home').closest('a')).toHaveAttribute('href', '/');
  });
});

describe('root global error (src/app/global-error.tsx)', () => {
  it('renders inside html/body with the critical error copy', () => {
    render(<RootGlobalError error={new Error('fatal')} reset={() => {}} />);
    expect(screen.getByText('Critical Error')).toBeInTheDocument();
    expect(screen.getByText(/A critical error occurred that prevented/)).toBeInTheDocument();
  });

  it('shows the digest and calls reset', () => {
    const reset = jest.fn();
    const error = Object.assign(new Error('fatal'), { digest: 'd-42' });
    render(<RootGlobalError error={error} reset={reset} />);
    expect(screen.getByText(/d-42/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Try again'));
    expect(reset).toHaveBeenCalled();
  });
});

describe('auth error (src/app/(auth)/error.tsx)', () => {
  it('renders the auth error screen and reset button', () => {
    const reset = jest.fn();
    render(<AuthError error={new Error('auth failed')} reset={reset} />);
    expect(screen.getByText('Authentication Error')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong during authentication/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Try again'));
    expect(reset).toHaveBeenCalled();
  });

  it('links back to login', () => {
    render(<AuthError error={new Error('x')} reset={() => {}} />);
    expect(screen.getByText('Back to Login').closest('a')).toHaveAttribute('href', '/login');
  });
});

describe('auth not-found (src/app/(auth)/not-found.tsx)', () => {
  it('renders the auth 404 copy', () => {
    render(<AuthNotFound />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(
      screen.getByText(/The authentication page you're looking for doesn't exist/),
    ).toBeInTheDocument();
  });

  it('offers login and home links', () => {
    render(<AuthNotFound />);
    expect(screen.getByText('Go to Login').closest('a')).toHaveAttribute('href', '/login');
    expect(screen.getByText('Go Home').closest('a')).toHaveAttribute('href', '/');
  });
});

describe('auth loading (src/app/(auth)/loading.tsx)', () => {
  it('renders the shield loader', () => {
    render(<AuthLoading />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });
});

describe('auth layout (src/app/(auth)/layout.tsx)', () => {
  it('renders its children', () => {
    render(
      <AuthLayout>
        <div>child-content</div>
      </AuthLayout>,
    );
    expect(screen.getByText('child-content')).toBeInTheDocument();
  });
});
