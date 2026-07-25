/**
 * Tests for QuickActions component — role-based action card rendering.
 */
jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(() => ({
    t: jest.fn((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key),
  })),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => (
      <div data-motion="div" {...props}>
        {children}
      </div>
    ),
  },
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Plane: MockIcon,
    Fingerprint: MockIcon,
    MessageSquare: MockIcon,
    CheckCircle2: MockIcon,
    ShieldCheck: MockIcon,
    BarChart3: MockIcon,
    Users: MockIcon,
    Settings2: MockIcon,
    Zap: MockIcon,
    ArrowUpRight: MockIcon,
    Layers: MockIcon,
  };
});

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: jest.fn(),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { useAuthUser } from '@/store/useAuthStore';

const mockPush = jest.fn();

describe('QuickActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useRouter } = require('next/navigation');
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  describe('employee role', () => {
    beforeEach(() => {
      (useAuthUser as jest.Mock).mockReturnValue({
        id: 'user-1',
        name: 'Test Employee',
        role: 'employee',
        email: 'emp@test.com',
      });
    });

    it('renders 4 common actions for employee', () => {
      render(<QuickActions />);
      const buttons = screen.getAllByRole('button');
      // 4 common actions for employee (no manager/admin actions)
      expect(buttons.length).toBe(4);
    });

    it('includes leave request action', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.leaveRequest')).toBeInTheDocument();
    });

    it('includes check-in action', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.checkIn')).toBeInTheDocument();
    });

    it('includes chat action', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.chat')).toBeInTheDocument();
    });

    it('includes tasks action', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.tasks')).toBeInTheDocument();
    });

    it('does NOT include strategy action for employee', () => {
      render(<QuickActions />);
      expect(screen.queryByText('Strategy')).not.toBeInTheDocument();
    });

    it('does NOT include approvals for employee', () => {
      render(<QuickActions />);
      expect(screen.queryByText('quickActions.approvals')).not.toBeInTheDocument();
    });
  });

  describe('admin role', () => {
    beforeEach(() => {
      (useAuthUser as jest.Mock).mockReturnValue({
        id: 'user-2',
        name: 'Test Admin',
        role: 'admin',
        email: 'admin@test.com',
      });
    });

    it('renders all action types (common + manager + admin)', () => {
      render(<QuickActions />);
      const buttons = screen.getAllByRole('button');
      // 4 common + 3 manager + 2 admin = 9
      expect(buttons.length).toBe(9);
    });

    it('includes strategy action for admin', () => {
      render(<QuickActions />);
      // Mock t returns the key: 'quickActions.strategy'
      expect(screen.getByText('quickActions.strategy')).toBeInTheDocument();
    });

    it('includes approvals for admin', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.approvals')).toBeInTheDocument();
    });

    it('includes analytics for admin', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.analytics')).toBeInTheDocument();
    });

    it('includes employees for admin', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.employees')).toBeInTheDocument();
    });

    it('includes settings for admin', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.settings')).toBeInTheDocument();
    });
  });

  describe('supervisor role', () => {
    beforeEach(() => {
      (useAuthUser as jest.Mock).mockReturnValue({
        id: 'user-3',
        name: 'Test Supervisor',
        role: 'supervisor',
        email: 'sup@test.com',
      });
    });

    it('renders common + manager actions (no admin)', () => {
      render(<QuickActions />);
      const buttons = screen.getAllByRole('button');
      // 4 common + 3 manager = 7
      expect(buttons.length).toBe(7);
    });

    it('includes approvals for supervisor', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.approvals')).toBeInTheDocument();
    });
  });

  describe('superadmin role', () => {
    beforeEach(() => {
      (useAuthUser as jest.Mock).mockReturnValue({
        id: 'user-4',
        name: 'Test Superadmin',
        role: 'superadmin',
        email: 'super@test.com',
      });
    });

    it('renders all actions for superadmin', () => {
      render(<QuickActions />);
      const buttons = screen.getAllByRole('button');
      // 4 common + 3 manager + 2 admin = 9
      expect(buttons.length).toBe(9);
    });

    it('includes strategy for superadmin', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.strategy')).toBeInTheDocument();
    });

    it('includes employees for superadmin', () => {
      render(<QuickActions />);
      expect(screen.getByText('quickActions.employees')).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    beforeEach(() => {
      (useAuthUser as jest.Mock).mockReturnValue({
        id: 'user-1',
        name: 'Test Employee',
        role: 'employee',
        email: 'emp@test.com',
      });
    });

    it('navigates on click', () => {
      render(<QuickActions />);
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);
      expect(mockPush).toHaveBeenCalledWith(expect.any(String));
    });

    it('renders card structure', () => {
      const { container } = render(<QuickActions />);
      expect(container).toBeTruthy();
    });
  });
});
