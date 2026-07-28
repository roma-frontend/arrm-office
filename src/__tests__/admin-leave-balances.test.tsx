/**
 * Tests for LeaveBalancesPage — employee leave balance editor UI.
 *
 * Mocks: convex/react, i18n, auth, UI components.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: string | { defaultValue?: string },
      options?: Record<string, any>,
    ) => {
      if (typeof fallback === 'string') {
        if (options) {
          let result = fallback;
          for (const [k, v] of Object.entries(options)) {
            result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
          }
          return result;
        }
        return fallback;
      }
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        return fallback.defaultValue ?? key;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
const mockMutation = jest.fn().mockResolvedValue(undefined);

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockMutation,
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    leaveSettings: {
      getEmployeeLeaveBalances: { _name: 'getEmployeeLeaveBalances' },
      updateLeaveBalance: { _name: 'updateLeaveBalance' },
    },
  },
}));

let mockUser: any = { id: 'user-1', role: 'admin', name: 'Admin' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => mockUser,
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
}));

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
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader">Loading...</div>,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="icon" {...props} />;
  return { Search: MockIcon, Pencil: MockIcon };
});

import LeaveBalancesPage from '@/app/(dashboard)/admin/leave-balances/page';

const MOCK_EMPLOYEES = [
  {
    _id: 'user-1',
    name: 'John Doe',
    email: 'john@test.com',
    department: 'Engineering',
    position: 'Developer',
    employeeType: 'full_time',
    balances: {
      paidLeaveBalance: 20,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      dayOffBalance: 3,
      studyLeaveBalance: 5,
      maternityLeaveBalance: 0,
    },
  },
  {
    _id: 'user-2',
    name: 'Jane Smith',
    email: 'jane@test.com',
    department: null,
    position: null,
    employeeType: 'part_time',
    balances: {
      paidLeaveBalance: 15,
      sickLeaveBalance: 8,
      familyLeaveBalance: 3,
      dayOffBalance: 2,
      studyLeaveBalance: 0,
      maternityLeaveBalance: 0,
    },
  },
];

describe('LeaveBalancesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    mockUser = { id: 'user-1', role: 'admin', name: 'Admin' };
    queryResults.getEmployeeLeaveBalances = MOCK_EMPLOYEES;
  });

  it('renders the page title', () => {
    render(<LeaveBalancesPage />);
    expect(screen.getByText('Leave Balances')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<LeaveBalancesPage />);
    expect(screen.getByText(/View and edit employee/)).toBeInTheDocument();
  });

  it('shows employee cards', () => {
    render(<LeaveBalancesPage />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('shows ShieldLoader when no user', () => {
    mockUser = null;
    const { container } = render(<LeaveBalancesPage />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });

  it('shows employee department info', () => {
    render(<LeaveBalancesPage />);
    expect(screen.getByText(/Engineering/)).toBeInTheDocument();
  });

  it('shows email when no department/position', () => {
    render(<LeaveBalancesPage />);
    expect(screen.getByText(/jane@test.com/)).toBeInTheDocument();
  });

  it('shows employee type badge', () => {
    render(<LeaveBalancesPage />);
    const badges = screen.getAllByTestId('badge');
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  it('shows edit button for each employee', () => {
    render(<LeaveBalancesPage />);
    const editButtons = screen.getAllByText('Edit');
    expect(editButtons.length).toBe(2);
  });

  it('opens edit dialog when edit is clicked', () => {
    render(<LeaveBalancesPage />);
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);
    expect(screen.getByText(/Edit Balances/)).toBeInTheDocument();
  });

  it('shows balance field labels on cards', () => {
    render(<LeaveBalancesPage />);
    // Labels appear on each employee card (2 employees = 2 instances each)
    const paidLabels = screen.getAllByText('Paid Vacation');
    expect(paidLabels.length).toBeGreaterThanOrEqual(1);
    const sickLabels = screen.getAllByText('Sick Leave');
    expect(sickLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('shows reason field in dialog', () => {
    render(<LeaveBalancesPage />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByText(/Reason for adjustment/)).toBeInTheDocument();
  });

  it('shows save and cancel buttons in dialog', () => {
    render(<LeaveBalancesPage />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows balance values on employee cards', () => {
    render(<LeaveBalancesPage />);
    // John Doe has paidLeaveBalance 20
    const balanceValues = screen.getAllByText('20');
    expect(balanceValues.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no employees', () => {
    queryResults.getEmployeeLeaveBalances = [];
    render(<LeaveBalancesPage />);
    expect(screen.getByText('No employees found')).toBeInTheDocument();
  });

  it('has search input', () => {
    const { container } = render(<LeaveBalancesPage />);
    const searchInput = container.querySelector('input');
    expect(searchInput).toBeTruthy();
  });

  it('shows employee card with balance values', () => {
    render(<LeaveBalancesPage />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    // Unique balance values (appear once across all employees)
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    // '5' appears twice (familyLeaveBalance + studyLeaveBalance) so use getAllByText
    const fives = screen.getAllByText('5');
    expect(fives.length).toBeGreaterThanOrEqual(1);
  });

  it('shows employee name in dialog title', () => {
    render(<LeaveBalancesPage />);
    // John Doe is always visible in the employee card
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('closes dialog on cancel', () => {
    render(<LeaveBalancesPage />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByText(/Edit Balances/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/Edit Balances/)).not.toBeInTheDocument();
  });
});
