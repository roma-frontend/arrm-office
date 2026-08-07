/**
 * Tests for SuperadminBroadcastsPanel — superadmin company-wide announcements.
 *
 * Mocks: convex/react getCurrentUser query, child components
 * (ServiceBroadcastDialog / ServiceBroadcastsManager), UI primitives.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

let currentUser: any = undefined;
jest.mock('convex/react', () => ({
  useQuery: () => currentUser,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: { users: { queries: { getCurrentUser: { _name: 'getCurrentUser' } } } },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, size, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, style }: any) => (
    <div data-testid="card" style={style}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));

const DialogSpy = jest.fn();
jest.mock('@/components/admin/ServiceBroadcastDialog', () => ({
  ServiceBroadcastDialog: (props: any) => {
    DialogSpy(props);
    return <div data-testid="dialog" />;
  },
}));

const ManagerSpy = jest.fn();
jest.mock('@/components/admin/ServiceBroadcastsManager', () => ({
  ServiceBroadcastsManager: (props: any) => {
    ManagerSpy(props);
    return <div data-testid="manager" />;
  },
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { AlertCircle: Icon, MessageSquare: Icon };
});

import { SuperadminBroadcastsPanel } from '@/components/admin/SuperadminBroadcastsPanel';

describe('SuperadminBroadcastsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { _id: 'cu-1', organizationId: 'cu-org' };
  });

  it('renders nothing when the current user has no organization id', () => {
    currentUser = { _id: 'cu-1' };
    const { container } = render(<SuperadminBroadcastsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a spinner while the current user is loading (with passed ids)', () => {
    currentUser = undefined;
    const { container } = render(
      <SuperadminBroadcastsPanel organizationId={'org-x' as any} userId={'user-x' as any} />,
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('uses passed ids over the current user', () => {
    render(<SuperadminBroadcastsPanel organizationId={'org-x' as any} userId={'user-x' as any} />);
    expect(ManagerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-x', userId: 'user-x' }),
    );
  });

  it('falls back to the current user ids', () => {
    render(<SuperadminBroadcastsPanel />);
    expect(ManagerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'cu-org', userId: 'cu-1' }),
    );
  });

  it('renders the title and description', () => {
    render(<SuperadminBroadcastsPanel />);
    expect(screen.getByText('broadcasts.title')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.description')).toBeInTheDocument();
  });

  it('renders typical scenario list', () => {
    render(<SuperadminBroadcastsPanel />);
    expect(screen.getByText('broadcasts.typicalScenarios')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.maintenance')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.security')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.critical')).toBeInTheDocument();
  });

  it('opens the broadcast dialog when the new button is clicked', () => {
    render(<SuperadminBroadcastsPanel />);
    fireEvent.click(screen.getByText('broadcasts.newButton'));
    expect(DialogSpy).toHaveBeenCalledWith(
      expect.objectContaining({ open: true, organizationId: 'cu-org', userId: 'cu-1' }),
    );
  });
});
