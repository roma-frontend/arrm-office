/**
 * Tests for SLASettings — admin SLA configuration form.
 *
 * Mocks: convex/react (config query + update mutation), auth store, i18n,
 * UI primitives (Card, Button, Input, Label, cssMotion).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

let mockConfig: any = undefined;
const updateMutation = jest.fn().mockResolvedValue(undefined);
jest.mock('convex/react', () => ({
  useQuery: () => mockConfig,
  useMutation: () => updateMutation,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    sla: {
      getSLAConfig: { _name: 'getSLAConfig' },
      updateSLAConfig: { _name: 'updateSLAConfig' },
    },
  },
}));

let mockUser: any = { id: 'u1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Settings: Icon, Save: Icon, AlertCircle: Icon };
});

import SLASettings from '@/components/admin/SLASettings';

describe('SLASettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = undefined;
    mockUser = { id: 'u1' };
  });

  it('renders the title and description', () => {
    render(<SLASettings />);
    expect(screen.getByText('sla.title')).toBeInTheDocument();
    expect(screen.getByText('sla.description')).toBeInTheDocument();
  });

  it('initializes inputs from the config when it loads', () => {
    mockConfig = {
      targetResponseTimeHours: 48,
      warningThresholdPercent: 80,
      criticalThresholdPercent: 95,
    };
    render(<SLASettings />);
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs.length).toBe(3);
    expect(inputs[0]?.value).toBe('48');
    expect(inputs[1]?.value).toBe('80');
    expect(inputs[2]?.value).toBe('95');
  });

  it('saves the config via the mutation', async () => {
    mockConfig = {
      targetResponseTimeHours: 24,
      warningThresholdPercent: 75,
      criticalThresholdPercent: 90,
    };
    render(<SLASettings />);
    fireEvent.click(screen.getByText('sla.saveConfig'));
    await Promise.resolve();
    expect(updateMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        targetResponseTime: 24,
        warningThreshold: 75,
        criticalThreshold: 90,
      }),
    );
  });

  it('shows a validation alert and disables save when warning >= critical', () => {
    mockConfig = {
      targetResponseTimeHours: 24,
      warningThresholdPercent: 90,
      criticalThresholdPercent: 80,
    };
    render(<SLASettings />);
    expect(screen.getByText('sla.thresholdError')).toBeInTheDocument();
    expect(screen.getByText('sla.saveConfig')).toBeDisabled();
  });

  it('does not save without a user', async () => {
    mockUser = null;
    mockConfig = {
      targetResponseTimeHours: 24,
      warningThresholdPercent: 75,
      criticalThresholdPercent: 90,
    };
    render(<SLASettings />);
    fireEvent.click(screen.getByText('sla.saveConfig'));
    await Promise.resolve();
    expect(updateMutation).not.toHaveBeenCalled();
  });
});
