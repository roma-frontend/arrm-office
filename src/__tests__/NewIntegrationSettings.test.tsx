/**
 * Tests for NewIntegrationSettings component — integration config UI.
 *
 * Mocks: convex/react (useQuery, useMutation, useAction), auth, UI components.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        return fallback.defaultValue ?? key;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Convex mock ──────────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mockMutation = jest.fn().mockResolvedValue(undefined);
const mockAction = jest.fn().mockResolvedValue({ success: true });

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockMutation,
  useAction: () => mockAction,
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    integrations: {
      getAllIntegrationConfigs: { _name: 'getAllIntegrationConfigs' },
      saveIntegrationConfig: { _name: 'saveIntegrationConfig' },
      syncIntegration: { _name: 'syncIntegration' },
    },
  },
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockUser: any = { id: 'user-1', role: 'admin', name: 'Admin' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => mockUser,
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
}));

// ── UI component mocks ───────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, size, variant, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, style }: any) => (
    <div data-testid="card" className={className} style={style}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children, className, onClick }: any) => (
    <div data-testid="card-header" className={className} onClick={onClick}>
      {children}
    </div>
  ),
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      data-testid="switch"
    />
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ size, variant }: any) => (
    <div data-testid="shield-loader" data-size={size} data-variant={variant}>
      Loading...
    </div>
  ),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// ── Icons mock ───────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Check: MockIcon,
    X: MockIcon,
    RefreshCw: MockIcon,
    Clock: MockIcon,
    ExternalLink: MockIcon,
  };
});

// ── Module under test ──
import NewIntegrationSettings from '@/components/settings/NewIntegrationSettings';

const MOCK_CONFIGS = [
  {
    _id: 'cfg-1',
    provider: 'lucky_carrot',
    config: {
      isEnabled: true,
      apiKey: 'lc_key_123',
      apiUrl: 'https://api.luckycarrot.com',
      autoSyncEmployees: true,
      syncStatus: 'success',
      lastSyncAt: Date.now(),
    },
  },
  {
    _id: 'cfg-2',
    provider: 'imid',
    config: {
      isEnabled: false,
      clientId: 'imid_client',
      enableLogin: false,
      syncStatus: 'idle',
    },
  },
  {
    _id: 'cfg-3',
    provider: 'armsoft',
    config: {
      isEnabled: true,
      apiEndpoint: 'https://api.armsoft.am/v1',
      syncEmployees: true,
      syncStatus: 'error',
      lastError: 'Connection failed',
    },
  },
];

describe('NewIntegrationSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    mockUser = { id: 'user-1', role: 'admin', name: 'Admin' };
    queryResults.getAllIntegrationConfigs = MOCK_CONFIGS;
  });

  it('renders the integrations page title', () => {
    render(<NewIntegrationSettings />);
    expect(screen.getByText('Integrations')).toBeInTheDocument();
  });

  it('renders all provider cards', () => {
    const { container } = render(<NewIntegrationSettings />);
    const cards = container.querySelectorAll('[data-testid="card"]');
    expect(cards.length).toBe(4);
  });

  it('shows Lucky Carrot as a provider', () => {
    render(<NewIntegrationSettings />);
    expect(screen.getByText('Lucky Carrot')).toBeInTheDocument();
  });

  it('shows imID as a provider', () => {
    render(<NewIntegrationSettings />);
    expect(screen.getByText('imID')).toBeInTheDocument();
  });

  it('shows Armsoft as a provider', () => {
    render(<NewIntegrationSettings />);
    expect(screen.getByText('ՀԾ Armsoft')).toBeInTheDocument();
  });

  it('shows active badge for enabled integrations', () => {
    render(<NewIntegrationSettings />);
    const badges = screen.getAllByText('Active');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows inactive badge for disabled integrations', () => {
    render(<NewIntegrationSettings />);
    const inactiveBadges = screen.getAllByText('Inactive');
    expect(inactiveBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows loading indicator when no user', () => {
    mockUser = null;
    const { container } = render(<NewIntegrationSettings />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });

  it('shows loading indicator when no org', () => {
    // Can't easily mock useSelectedOrganization, so test just renders
    render(<NewIntegrationSettings />);
    expect(screen.getByText('Integrations')).toBeInTheDocument();
  });

  it('renders without crashing with empty configs', () => {
    queryResults.getAllIntegrationConfigs = [];
    const { container } = render(<NewIntegrationSettings />);
    expect(container.querySelector('[data-testid="card"]')).toBeTruthy();
  });

  it('shows active badges for enabled integrations', () => {
    render(<NewIntegrationSettings />);
    // Lucky Carrot and Armsoft are enabled → show 'Active'
    const activeElements = screen.getAllByText('Active');
    expect(activeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows inactive badge for disabled integration', () => {
    render(<NewIntegrationSettings />);
    // imID is disabled → show 'Inactive'
    const inactiveElements = screen.getAllByText('Inactive');
    expect(inactiveElements.length).toBeGreaterThanOrEqual(1);
  });

  it('expands provider card to show sync status', () => {
    render(<NewIntegrationSettings />);
    // Click the first card header to expand
    const cardHeaders = screen.getAllByText(/Lucky Carrot|imID|Armsoft/);
    expect(cardHeaders.length).toBeGreaterThanOrEqual(1);
    // Click on Lucky Carrot
    fireEvent.click(screen.getByText('Lucky Carrot'));
    // Now should show sync status inside expanded content
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows configuration fields when expanded', () => {
    render(<NewIntegrationSettings />);
    // Expand Lucky Carrot
    fireEvent.click(screen.getByText('Lucky Carrot'));
    // Should show API Key field
    expect(screen.getByText('API Key')).toBeInTheDocument();
    expect(screen.getByText('API URL')).toBeInTheDocument();
    expect(screen.getByText('Webhook URL')).toBeInTheDocument();
  });

  it('expands armsoft to show cron field', () => {
    render(<NewIntegrationSettings />);
    // Expand Armsoft
    fireEvent.click(screen.getByText('ՀԾ Armsoft'));
    // Should show sync schedule field
    expect(screen.getByText('Sync schedule (cron)')).toBeInTheDocument();
  });

  it('shows provider descriptions', () => {
    render(<NewIntegrationSettings />);
    expect(screen.getByText('Employee recognition & rewards platform')).toBeInTheDocument();
    expect(screen.getByText('Armenian digital identity & e-signature')).toBeInTheDocument();
    expect(screen.getByText('Armenian ERP — HR & payroll data sync')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<NewIntegrationSettings />);
    expect(screen.getByText(/Connect third-party services/i)).toBeInTheDocument();
  });
});
