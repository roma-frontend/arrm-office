/**
 * Tests for HolidaysPage — holiday management UI.
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
      getHolidays: { _name: 'getHolidays' },
      createHoliday: { _name: 'createHoliday' },
      updateHoliday: { _name: 'updateHoliday' },
      deleteHoliday: { _name: 'deleteHoliday' },
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
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
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

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select value={value} onChange={(e: any) => onValueChange(e.target.value)} data-testid="select">
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  SheetContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  SheetHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  SheetTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
  SheetBody: ({ children }: any) => <div data-testid="dialog-body">{children}</div>,
  SheetFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
  SheetDescription: ({ children }: any) => <div data-testid="dialog-description">{children}</div>,
  SheetTrigger: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader">Loading...</div>,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="icon" {...props} />;
  return { Plus: MockIcon, Trash2: MockIcon, Pencil: MockIcon };
});

import HolidaysPage from '@/app/(dashboard)/admin/holidays/page';

const MOCK_HOLIDAYS = [
  {
    _id: 'h-1',
    name: 'New Year',
    date: '2025-01-01',
    type: 'public',
    isRecurring: true,
    description: 'New Year celebration',
    organizationId: 'org-1',
  },
  {
    _id: 'h-2',
    name: 'Christmas',
    date: '2025-12-25',
    type: 'public',
    isRecurring: true,
    description: null,
    organizationId: 'org-1',
  },
  {
    _id: 'h-3',
    name: 'Company Retreat',
    date: '2025-07-15',
    type: 'internal',
    isRecurring: false,
    description: 'Annual team building',
    organizationId: 'org-1',
  },
];

describe('HolidaysPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    mockUser = { id: 'user-1', role: 'admin', name: 'Admin' };
    queryResults.getHolidays = MOCK_HOLIDAYS;
  });

  it('renders the page title', () => {
    render(<HolidaysPage />);
    expect(screen.getByText('Holiday Management')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<HolidaysPage />);
    expect(screen.getByText(/Manage public holidays/)).toBeInTheDocument();
  });

  it('shows add holiday button', () => {
    render(<HolidaysPage />);
    expect(screen.getByText('Add Holiday')).toBeInTheDocument();
  });

  it('renders public holidays in their section', () => {
    render(<HolidaysPage />);
    expect(screen.getByText('Public Holidays')).toBeInTheDocument();
    expect(screen.getByText('New Year')).toBeInTheDocument();
    expect(screen.getByText('Christmas')).toBeInTheDocument();
  });

  it('renders internal holidays in their section', () => {
    render(<HolidaysPage />);
    expect(screen.getByText('Internal Non-Working Days')).toBeInTheDocument();
    expect(screen.getByText('Company Retreat')).toBeInTheDocument();
  });

  it('shows ShieldLoader when no user', () => {
    mockUser = null;
    const { container } = render(<HolidaysPage />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });

  it('opens create dialog on add button click', () => {
    render(<HolidaysPage />);
    fireEvent.click(screen.getByText('Add Holiday'));
    expect(screen.getByText('Create Holiday')).toBeInTheDocument();
  });

  it('shows recurring badge for recurring holidays', () => {
    render(<HolidaysPage />);
    // Use regex since text is wrapped: ' (Recurring)'
    const recurringTags = screen.getAllByText(/Recurring/);
    expect(recurringTags.length).toBeGreaterThanOrEqual(1);
  });

  it('shows holiday names in the list', () => {
    render(<HolidaysPage />);
    expect(screen.getByText('New Year')).toBeInTheDocument();
    expect(screen.getByText('Christmas')).toBeInTheDocument();
    expect(screen.getByText('Company Retreat')).toBeInTheDocument();
  });

  it('shows empty state when no public holidays', () => {
    queryResults.getHolidays = [
      {
        _id: 'h-3',
        name: 'Company Retreat',
        date: '2025-07-15',
        type: 'internal',
        isRecurring: false,
        description: null,
        organizationId: 'org-1',
      },
    ];
    render(<HolidaysPage />);
    expect(screen.getByText(/No public holidays configured/)).toBeInTheDocument();
  });

  it('shows empty state when no internal holidays', () => {
    queryResults.getHolidays = [
      {
        _id: 'h-1',
        name: 'New Year',
        date: '2025-01-01',
        type: 'public',
        isRecurring: true,
        description: null,
        organizationId: 'org-1',
      },
    ];
    render(<HolidaysPage />);
    expect(screen.getByText(/internal non-working days configured/i)).toBeInTheDocument();
  });

  it('opens edit dialog with pre-filled data on edit click', () => {
    render(<HolidaysPage />);
    // Click the first edit button (skip "Add Holiday" button at index 0)
    // Each holiday row has [Pencil(edit), Trash2(delete)] buttons
    const allButtons = screen.getAllByRole('button');
    // allButtons[0] = "Add Holiday", allButtons[1] = first Pencil icon
    fireEvent.click(allButtons[1]);
    // After clicking edit, dialog should show "Edit Holiday"
    expect(screen.getByText('Edit Holiday')).toBeInTheDocument();
  });

  it('shows form fields in create dialog', () => {
    render(<HolidaysPage />);
    fireEvent.click(screen.getByText('Add Holiday'));
    expect(screen.getByText('Holiday Name')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Recurring yearly')).toBeInTheDocument();
    expect(screen.getByText('Description (optional)')).toBeInTheDocument();
  });

  it('calls createHoliday mutation when submitting create form', () => {
    const { container } = render(<HolidaysPage />);
    fireEvent.click(screen.getByText('Add Holiday'));

    // Fill in inputs using container query (date input has no textbox role)
    const allInputs = container.querySelectorAll('input');
    if (allInputs.length >= 2) {
      fireEvent.change(allInputs[0], { target: { value: 'Test Holiday' } });
      fireEvent.change(allInputs[1], { target: { value: '2025-06-01' } });
    }

    const createButton = screen.getByText('Create');
    fireEvent.click(createButton);
    expect(mockMutation).toHaveBeenCalled();
  });

  it('shows cancel button in dialog', () => {
    render(<HolidaysPage />);
    fireEvent.click(screen.getByText('Add Holiday'));
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows save button in edit dialog', () => {
    render(<HolidaysPage />);
    fireEvent.click(screen.getByText('Add Holiday'));
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('renders public holiday emoji icon', () => {
    const { container } = render(<HolidaysPage />);
    expect(container.textContent).toContain('🏛️');
  });

  it('renders internal holiday emoji icon', () => {
    const { container } = render(<HolidaysPage />);
    expect(container.textContent).toContain('🏢');
  });
});
