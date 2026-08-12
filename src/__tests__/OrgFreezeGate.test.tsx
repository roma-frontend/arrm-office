/**
 * Tests for OrgFreezeGate — full-screen lock shown for a frozen organization.
 *
 * Mocks: convex/react getFreezeState query, auth store with selector support,
 * next/navigation useRouter, Button, lucide icons, global fetch for logout.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args?: unknown) =>
    args === 'skip' ? undefined : queryResults[ref?._name ?? ''],
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    superadmin: {
      getFreezeState: { _name: 'getFreezeState' },
    },
  },
}));

let mockUser: any = { id: 'u1', organizationId: 'o1', role: 'employee' };
const mockLogout = jest.fn();
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) =>
    selector({ user: mockUser, logout: mockLogout, isAuthenticated: true }),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, className, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { LogOut: Icon, Snowflake: Icon };
});

import { OrgFreezeGate } from '@/components/auth/OrgFreezeGate';

const originalFetch = global.fetch;

describe('OrgFreezeGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', organizationId: 'o1', role: 'employee' };
    queryResults = {};
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders nothing when not frozen', () => {
    const { container } = render(<OrgFreezeGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the freeze query is undefined', () => {
    queryResults.getFreezeState = undefined;
    const { container } = render(<OrgFreezeGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when frozen is false', () => {
    queryResults.getFreezeState = { frozen: false };
    const { container } = render(<OrgFreezeGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('skips the query and shows nothing for a superadmin', () => {
    mockUser = { id: 'u1', organizationId: 'o1', role: 'superadmin' };
    queryResults.getFreezeState = { frozen: true, reason: 'ops' };
    const { container } = render(<OrgFreezeGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('skips the query when the user has no organization', () => {
    mockUser = { id: 'u1', role: 'employee' };
    const { container } = render(<OrgFreezeGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the freeze screen with title and reason', () => {
    queryResults.getFreezeState = { frozen: true, reason: 'Maintenance window' };
    render(<OrgFreezeGate />);
    expect(screen.getByText('freeze.title')).toBeInTheDocument();
    expect(screen.getByText('freeze.description')).toBeInTheDocument();
    expect(screen.getByText('Maintenance window')).toBeInTheDocument();
    expect(screen.getByText('freeze.logout')).toBeInTheDocument();
  });

  it('omits the reason box when there is no reason', () => {
    queryResults.getFreezeState = { frozen: true };
    render(<OrgFreezeGate />);
    expect(screen.queryByText(/Maintenance/)).toBeNull();
  });

  it('logs out via the API, clears the store and navigates to login', async () => {
    queryResults.getFreezeState = { frozen: true };
    render(<OrgFreezeGate />);
    fireEvent.click(screen.getByText('freeze.logout'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });
    expect(mockLogout).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('still logs out when the API call fails', async () => {
    queryResults.getFreezeState = { frozen: true };
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    render(<OrgFreezeGate />);
    fireEvent.click(screen.getByText('freeze.logout'));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
