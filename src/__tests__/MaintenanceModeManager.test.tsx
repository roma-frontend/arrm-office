/**
 * Tests for MaintenanceModeManager — admin card to disable maintenance mode.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

let mockMaintenance: any = undefined;
const disableMutation = jest.fn().mockResolvedValue(undefined);
jest.mock('convex/react', () => ({
  useQuery: () => mockMaintenance,
  useMutation: () => disableMutation,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: { admin: { getMaintenanceMode: { _name: 'getMaintenanceMode' } } },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
  CardDescription: ({ children }: any) => <div data-testid="card-desc">{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { AlertTriangle: Icon, PowerOff: Icon };
});

import { MaintenanceModeManager } from '@/components/admin/MaintenanceModeManager';

describe('MaintenanceModeManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaintenance = undefined;
  });

  it('renders nothing while maintenance is loading', () => {
    const { container } = render(<MaintenanceModeManager organizationId="org-1" userId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when maintenance is not active', () => {
    mockMaintenance = { isActive: false };
    const { container } = render(<MaintenanceModeManager organizationId="org-1" userId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title, message and timeline for active maintenance', () => {
    mockMaintenance = {
      isActive: true,
      startTime: Date.UTC(2026, 0, 1, 12, 0, 0),
      endTime: Date.UTC(2026, 0, 1, 14, 0, 0),
      estimatedDuration: '2 hours',
      title: 'Upgrade',
      message: 'Scheduled upgrade',
    };
    render(<MaintenanceModeManager organizationId="org-1" userId="u1" />);
    expect(screen.getByText('maintenance.siteMaintenance')).toBeInTheDocument();
    expect(screen.getByText('Upgrade')).toBeInTheDocument();
    expect(screen.getByText('Scheduled upgrade')).toBeInTheDocument();
    expect(screen.getByText('2 hours')).toBeInTheDocument();
  });

  it('calls the disable mutation when the button is clicked', async () => {
    mockMaintenance = { isActive: true, startTime: Date.now(), message: 'x' };
    render(<MaintenanceModeManager organizationId="org-1" userId="u1" />);
    fireEvent.click(screen.getByText('maintenance.enableSite'));
    await Promise.resolve();
    expect(disableMutation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'u1',
    });
  });

  it('does not call the mutation without org/user ids', async () => {
    mockMaintenance = { isActive: true, startTime: Date.now(), message: 'x' };
    render(<MaintenanceModeManager />);
    fireEvent.click(screen.getByText('maintenance.enableSite'));
    await Promise.resolve();
    expect(disableMutation).not.toHaveBeenCalled();
  });

  it('shows the loader inside the button while disabling', async () => {
    let resolveDisable!: (v: unknown) => void;
    (disableMutation as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (resolveDisable = resolve)),
    );
    mockMaintenance = { isActive: true, startTime: Date.now(), message: 'x' };
    const { container } = render(<MaintenanceModeManager organizationId="org-1" userId="u1" />);
    fireEvent.click(screen.getByText('maintenance.enableSite'));
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
    await Promise.resolve();
    resolveDisable(undefined);
  });
});
