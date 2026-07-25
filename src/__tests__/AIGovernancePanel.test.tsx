import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// ── Mocks ──
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// Mock convex/react — component uses useQuery/useMutation
jest.mock('convex/react', () => ({
  useQuery: () => [],
  useMutation: () => jest.fn(),
}));

// Convex generated api must be virtual — real file imports convex/server which can't resolve in jest
jest.mock('@/convex/_generated/api', () => ({ api: {} }), { virtual: true });

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
jest.mock('@/components/ui/switch', () => ({ Switch: () => <input type="checkbox" /> }));

// ── Module under test ──
import AIGovernancePanel from '@/components/ai/AIGovernancePanel';

describe('AIGovernancePanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    const { container } = render(<AIGovernancePanel />);
    expect(container).toBeTruthy();
  });

  it('renders title', () => {
    render(<AIGovernancePanel />);
    expect(screen.getByText('AI Governance')).toBeInTheDocument();
  });

  it('renders all 5 tab buttons', () => {
    render(<AIGovernancePanel />);
    expect(screen.getByText('aiGovernance » overview')).toBeInTheDocument();
    expect(screen.getByText('aiGovernance » agents')).toBeInTheDocument();
    expect(screen.getByText('aiGovernance » guardrails')).toBeInTheDocument();
    expect(screen.getByText('aiGovernance » audit')).toBeInTheDocument();
    expect(screen.getByText('aiGovernance » policies')).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    render(<AIGovernancePanel />);
    expect(screen.getByText('Total AI Requests')).toBeInTheDocument();
    expect(screen.getByText('Blocked Requests')).toBeInTheDocument();
    expect(screen.getByText('Active Agents')).toBeInTheDocument();
    expect(screen.getByText('Avg Response')).toBeInTheDocument();
  });
});
