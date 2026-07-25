import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ──
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// Convex
const mockUseQuery = jest.fn();
jest.mock('convex/react', () => ({ useQuery: (...args: any[]) => mockUseQuery(...args) }));

// Convex generated api — virtual because real file imports convex/server
jest.mock(
  '@/convex/_generated/api',
  () => ({
    api: { users: { queries: { getAuditLogs: 'getAuditLogs' } } },
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
  Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}));
jest.mock('@/components/ui/card', () => ({ Card: ({ children }: any) => <div>{children}</div> }));
jest.mock('@/components/ui/input', () => ({ Input: (p: any) => <input {...p} /> }));

// ── Mock data ──
const mockLogs = [
  {
    _id: 'l1',
    _creationTime: Date.now() - 2 * 60000,
    action: 'user.login',
    details: 'Login success',
    ip: '1.1.1.1',
    userId: 'u1' as any,
    organizationId: 'o1' as any,
    createdAt: Date.now() - 2 * 60000,
  },
  {
    _id: 'l2',
    _creationTime: Date.now() - 5 * 60000,
    action: 'leave.approved',
    details: 'Leave approved',
    userId: 'u2' as any,
    organizationId: 'o1' as any,
    createdAt: Date.now() - 5 * 60000,
  },
  {
    _id: 'l3',
    _creationTime: Date.now() - 2 * 3600000,
    action: 'security.rate_limit.exceeded',
    details: 'Rate limit exceeded',
    ip: '2.2.2.2',
    userId: 'sys' as any,
    organizationId: 'o1' as any,
    createdAt: Date.now() - 2 * 3600000,
  },
];

// ── Module under test ──
import AuditLogDashboard from '@/components/compliance/AuditLogDashboard';

describe('AuditLogDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(mockLogs);
  });

  it('renders without crashing', () => {
    const { container } = render(<AuditLogDashboard />);
    expect(container).toBeTruthy();
  });

  it('renders title and subtitle', () => {
    render(<AuditLogDashboard />);
    expect(screen.getByText('Audit Trail')).toBeInTheDocument();
  });

  it('renders stat card labels', () => {
    render(<AuditLogDashboard />);
    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Active Users')).toBeInTheDocument();
    // The numbers are inside stat cards — use getAllByText if counts repeat
    const eventCards = screen.getAllByText(/Events|Critical|Warnings|Users/);
    expect(eventCards.length).toBeGreaterThanOrEqual(3);
  });

  it('renders search input', () => {
    render(<AuditLogDashboard />);
    expect(screen.getByPlaceholderText(/Search events/)).toBeInTheDocument();
  });

  it('filters logs by search query', () => {
    render(<AuditLogDashboard />);
    const input = screen.getByPlaceholderText(/Search events/);
    fireEvent.change(input, { target: { value: 'login' } });

    expect(screen.getByText('user · login')).toBeInTheDocument();
    expect(screen.queryByText('leave · approved')).not.toBeInTheDocument();
  });

  it('shows empty state when no results', () => {
    mockUseQuery.mockReturnValue([]);
    render(<AuditLogDashboard />);
    expect(screen.getByText(/No audit events match/)).toBeInTheDocument();
  });

  it('shows timeline entries from real data', () => {
    render(<AuditLogDashboard />);
    expect(screen.getByText('user · login')).toBeInTheDocument();
    expect(screen.getByText('leave · approved')).toBeInTheDocument();
    expect(screen.getByText('security · rate_limit · exceeded')).toBeInTheDocument();
  });

  it('shows IP addresses when present', () => {
    render(<AuditLogDashboard />);
    expect(screen.getByText('1.1.1.1')).toBeInTheDocument();
    expect(screen.getByText('2.2.2.2')).toBeInTheDocument();
  });
});
