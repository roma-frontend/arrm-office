/**
 * Tests for AppProviders — the combined app provider wrapper.
 *
 * Every nested provider is stubbed to a pass-through div so we can assert the
 * composition order and that children render through the whole chain.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('@/components/error/GlobalErrorBoundaryProvider', () => ({
  GlobalErrorBoundaryProvider: ({ children }: any) => (
    <div data-testid="prov-error">{children}</div>
  ),
}));
jest.mock('@/components/providers/MonitoringProvider', () => ({
  MonitoringProvider: ({ children }: any) => <div data-testid="prov-monitoring">{children}</div>,
}));
jest.mock('@/components/providers/SessionProvider', () => ({
  SessionProvider: ({ children }: any) => <div data-testid="prov-session">{children}</div>,
}));
jest.mock('@/components/I18nProvider', () => ({
  I18nProvider: ({ children }: any) => <div data-testid="prov-i18n">{children}</div>,
}));
jest.mock('@/context/StatusUpdateContext', () => ({
  StatusUpdateProvider: ({ children }: any) => <div data-testid="prov-status">{children}</div>,
}));
jest.mock('@/lib/convex', () => ({
  ConvexClientProvider: ({ children }: any) => <div data-testid="prov-convex">{children}</div>,
}));
jest.mock('@/components/providers/AuthSyncProvider', () => ({
  AuthSyncProvider: ({ children }: any) => <div data-testid="prov-auth">{children}</div>,
}));
jest.mock('@/components/ThemeProvider', () => ({
  ThemeProvider: ({ children, attribute, defaultTheme, enableSystem }: any) => (
    <div
      data-testid="prov-theme"
      data-attribute={attribute}
      data-theme={defaultTheme}
      data-enable-system={String(enableSystem)}
    >
      {children}
    </div>
  ),
}));
jest.mock('@/components/MaintenanceAutoLogout', () => ({
  MaintenanceAutoLogout: () => <span data-testid="maintenance" />,
}));
jest.mock('@/components/HtmlLangUpdater', () => ({
  HtmlLangUpdater: () => <span data-testid="html-lang" />,
}));
jest.mock('@/components/RadixScrollLockFix', () => ({
  RadixScrollLockFix: () => <span data-testid="radix-fix" />,
}));
jest.mock('sonner', () => ({
  Toaster: (props: any) => <div data-testid="toaster" data-position={props.position} />,
}));

import { AppProviders } from '@/components/AppProviders';

describe('AppProviders', () => {
  it('renders children through the provider chain', () => {
    render(<AppProviders>Hello world</AppProviders>);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders all providers in composition order', () => {
    const { container } = render(<AppProviders>Child</AppProviders>);
    const order = [
      'prov-error',
      'prov-monitoring',
      'prov-session',
      'prov-i18n',
      'prov-status',
      'prov-convex',
      'prov-auth',
      'prov-theme',
    ];
    // Find the outermost nested divs in document order.
    const ids = order.map((id) => container.querySelector(`[data-testid="${id}"]`)).filter(Boolean);
    expect(ids).toHaveLength(order.length);
    // Nested structure: each provider must be an ancestor of the next.
    for (let i = 0; i < ids.length - 1; i++) {
      expect(ids[i]!.contains(ids[i + 1]!)).toBe(true);
    }
  });

  it('renders the side-effect components and toaster', () => {
    render(<AppProviders>Child</AppProviders>);
    expect(screen.getByTestId('html-lang')).toBeInTheDocument();
    expect(screen.getByTestId('maintenance')).toBeInTheDocument();
    expect(screen.getByTestId('radix-fix')).toBeInTheDocument();
    const toaster = screen.getByTestId('toaster');
    expect(toaster.getAttribute('data-position')).toBe('top-right');
  });

  it('configures the theme provider with system default', () => {
    render(<AppProviders>Child</AppProviders>);
    const theme = screen.getByTestId('prov-theme');
    expect(theme.getAttribute('data-attribute')).toBe('class');
    expect(theme.getAttribute('data-theme')).toBe('system');
    expect(theme.getAttribute('data-enable-system')).toBe('true');
  });
});
