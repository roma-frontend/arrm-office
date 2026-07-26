import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// ── Mocks ──
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// Convex query results are driven per-test through this map, keyed by the
// query function reference's `_name` (set on the mocked api below).
let queryResults: Record<string, unknown> = {};
const mockMutation = jest.fn();

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockMutation,
}));

// Each api entry carries a `_name` so the useQuery mock can resolve its result.
jest.mock(
  '@/convex/_generated/api',
  () => ({
    api: {
      aiGovernance: {
        getStats: { _name: 'getStats' },
        getRecentActivity: { _name: 'getRecentActivity' },
        getAgentHealth: { _name: 'getAgentHealth' },
        getAuditLog: { _name: 'getAuditLog' },
        getGuardrails: { _name: 'getGuardrails' },
        updateGuardrail: { _name: 'updateGuardrail' },
      },
    },
  }),
  { virtual: true },
);

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', role: 'admin', organizationId: 'o1' } }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...p }: any) => <button {...p}>{children}</button>,
}));
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));
jest.mock('@/components/ui/card', () => ({ Card: ({ children }: any) => <div>{children}</div> }));
jest.mock('@/components/ui/switch', () => ({
  Switch: ({ onCheckedChange, checked }: any) => (
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

// ── Module under test ──
import AIGovernancePanel from '@/components/ai/AIGovernancePanel';

describe('AIGovernancePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
  });

  it('renders without crashing while data is loading', () => {
    const { container } = render(<AIGovernancePanel />);
    expect(container).toBeTruthy();
  });

  it('renders the overview tab by default', () => {
    render(<AIGovernancePanel />);
    // The page header owns the "AI Governance" title; the panel starts with tabs.
    expect(screen.getByText('aiGovernance » overview')).toBeInTheDocument();
  });

  it('renders all 5 tab buttons', () => {
    render(<AIGovernancePanel />);
    expect(screen.getByText('aiGovernance » overview')).toBeInTheDocument();
    expect(screen.getByText('aiGovernance » agents')).toBeInTheDocument();
    expect(screen.getByText('aiGovernance » guardrails')).toBeInTheDocument();
    expect(screen.getByText('aiGovernance » audit')).toBeInTheDocument();
    expect(screen.getByText('aiGovernance » policies')).toBeInTheDocument();
  });

  it('shows placeholder stats before data loads', () => {
    render(<AIGovernancePanel />);
    expect(screen.getByText('Total AI Requests')).toBeInTheDocument();
    // Undefined query result → placeholder dashes, not fabricated numbers.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders real stats from the query result', () => {
    queryResults.getStats = { total: 1247, blocked: 23, activeAgents: 5, avgLatencyMs: 1200 };
    render(<AIGovernancePanel />);
    expect(screen.getByText('1,247')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('1.2s')).toBeInTheDocument();
  });

  it('shows empty-state when there is no AI activity', () => {
    queryResults.getRecentActivity = [];
    queryResults.getAgentHealth = [];
    render(<AIGovernancePanel />);
    expect(screen.getByText('No AI activity yet')).toBeInTheDocument();
    expect(screen.getByText('No agent traffic yet')).toBeInTheDocument();
  });
});
