/**
 * Tests for EmployeesClient — the employees directory: paginated user list,
 * debounced search, role/type/status filters, grid/list views, load-more,
 * add/edit/delete flows and the team sidebar.
 *
 * Mocks: @/lib/convex-typed (useMutation/usePaginatedQuery keyed by _name),
 * generated api, auth store, selected org, media query, main ref, router,
 * cssMotion, use-debounce (immediate), CustomSelect, avatar-upload,
 * ShieldLoader, mobile-card, Add/EditEmployeeModal, TeamSidebar, sonner,
 * next/image. lucide-react runs for real.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { EmployeesClient } from '@/components/employees/EmployeesClient';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Return the key itself so tests can assert on i18n keys in the DOM.
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// ── Convex: paginated query + mutation keyed by _name ────────────────────────
let paginatedResults: any[] | undefined = [];
let paginatedStatus = 'CanLoadMore';
let mockLoadMore = jest.fn();
const mutationCalls: Record<string, Array<{ args: any[] }>> = {};
const mutationImpl: Record<string, (...args: any[]) => Promise<unknown>> = {};

jest.mock('@/lib/convex-typed', () => ({
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    return async (...args: any[]) => {
      (mutationCalls[name] ??= []).push({ args });
      const impl = mutationImpl[name];
      if (impl) return impl(...args);
      return Promise.resolve();
    };
  },
  usePaginatedQuery: () => ({
    results: paginatedResults,
    status: paginatedStatus,
    loadMore: mockLoadMore,
  }),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    users: {
      listUsersPaginated: { _name: 'listUsersPaginated' },
      deleteUser: { _name: 'deleteUser' },
    },
  },
}));

// ── Auth / org / router / media / main ref ───────────────────────────────────
let mockUser: Record<string, unknown> | null = { id: 'u_admin', role: 'admin', email: 'a@x.com' };
// The component calls useAuthStore(useShallow((s) => s.user)). The mock applies
// the real useShallow-wrapped selector to the store snapshot so the selector
// body itself is exercised.
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (sel: any) => sel({ user: mockUser }),
}));

let mockSelectedOrg: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

let mockIsMobile = false;
jest.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockIsMobile,
}));

let mainRefValue: { current: { scrollTo: unknown } | null } = {
  current: { scrollTo: jest.fn() },
};
jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => mainRefValue,
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// The profile slide-over lazily loads EmployeeProfileDetail, which pulls in tabs,
// charts, a rating form and three edit modals — none of which this suite is about.
// The stub records which employee was handed to it.
jest.mock('@/components/employees/EmployeeSheet', () => ({
  EmployeeSheet: ({ employeeId }: { employeeId: string | null }) =>
    employeeId ? <div data-testid="employee-sheet" data-employee-id={employeeId} /> : null,
}));

// ── CSS motion / debounce ────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('use-debounce', () => ({
  useDebouncedCallback: (fn: (...args: any[]) => void) => fn,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options }: any) => (
    <select data-testid="custom-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/ui/avatar-upload', () => ({
  AvatarUpload: () => <div data-testid="avatar-upload" />,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/mobile-card', () => ({
  MobileCard: ({ title, subtitle, ...props }: any) => (
    <div data-testid="mobile-card" {...props}>
      {title}
      <span>{subtitle}</span>
    </div>
  ),
}));

jest.mock('@/components/employees/AddEmployeeModal', () => ({
  AddEmployeeModal: ({ open, onClose }: any) =>
    open ? (
      <div data-testid="add-modal">
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}));

jest.mock('@/components/employees/EditEmployeeModal', () => ({
  EditEmployeeModal: ({ employee, open, onClose }: any) =>
    open ? (
      <div data-testid="edit-modal">
        {employee?.name}
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}));

jest.mock('@/components/employees/TeamSidebar', () => ({
  TeamSidebar: ({ userId, onToggle }: any) => (
    <div data-testid="team-sidebar">
      {userId}
      <button onClick={() => onToggle(true)}>toggle-panel</button>
    </div>
  ),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

const toast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({
  toast: {
    success: (...a: any[]) => toast.success(...a),
    error: (...a: any[]) => toast.error(...a),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
function empDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'u1',
    name: 'Anna Petrova',
    email: 'anna@example.com',
    position: 'Engineer',
    department: 'Engineering',
    phone: '+374 00 000 000',
    role: 'employee',
    employeeType: 'staff',
    isActive: true,
    avatarUrl: undefined,
    supervisorId: undefined,
    presenceStatus: undefined,
    ...overrides,
  };
}

const STAFF: any[] = [
  empDoc({ _id: 'u_emp', name: 'Anna Petrova' }),
  empDoc({ _id: 'u_sup', name: 'Boris Ivanov', role: 'supervisor', position: 'Team Lead' }),
  empDoc({
    _id: 'u_driver',
    name: 'Vahagn',
    role: 'driver',
    employeeType: 'contractor',
    department: 'Logistics',
    phone: undefined,
  }),
  empDoc({
    _id: 'u_off',
    name: 'Marina',
    role: 'employee',
    isActive: false,
    presenceStatus: 'in_meeting',
  }),
  empDoc({ _id: 'u_super', name: 'God Mode', role: 'superadmin' }),
];

function renderClient() {
  return render(<EmployeesClient />);
}

beforeEach(() => {
  jest.clearAllMocks();
  paginatedResults = [];
  paginatedStatus = 'CanLoadMore';
  mockLoadMore = jest.fn();
  mockUser = { id: 'u_admin', role: 'admin', email: 'a@x.com' };
  mockSelectedOrg = 'org-1';
  mockIsMobile = false;
  mockPush.mockReset();
  mainRefValue = { current: { scrollTo: jest.fn() } };
  Object.keys(mutationCalls).forEach((k) => delete mutationCalls[k]);
  Object.keys(mutationImpl).forEach((k) => delete mutationImpl[k]);
});

// ── Loading / empty ──────────────────────────────────────────────────────────
describe('loading and empty states', () => {
  it('shows the loader while the first page is undefined', () => {
    paginatedResults = undefined;
    renderClient();
    expect(screen.getByTestId('shield-loader')).toBeTruthy();
  });

  it('shows the empty state with an add button for managers', () => {
    renderClient();
    expect(screen.getByText('employees.noEmployees')).toBeTruthy();
    fireEvent.click(screen.getByText('employees.addFirstEmployee'));
    expect(screen.getByTestId('add-modal')).toBeTruthy();
  });

  it('hides the empty-state add button for non-managers', () => {
    mockUser = { id: 'u_emp', role: 'employee', email: 'e@x.com' };
    renderClient();
    expect(screen.getByText('employees.noEmployees')).toBeTruthy();
    expect(screen.queryByText('employees.addFirstEmployee')).toBeNull();
  });
});

// ── Header / stats / banner ──────────────────────────────────────────────────
describe('header and stats', () => {
  it('renders the title, counts and the admin info banner', () => {
    paginatedResults = [
      empDoc({ isActive: true }),
      empDoc({ _id: 'u2', employeeType: 'contractor', isActive: false }),
      empDoc({ _id: 'u3', role: 'admin', isActive: true }),
      empDoc({ _id: 'u4', role: 'supervisor', employeeType: 'contractor', isActive: true }),
    ];
    renderClient();

    expect(screen.getByText('nav.employees')).toBeTruthy();
    // active = Anna + admin + supervisor = 3; staff = Anna + admin = 2; contractors = supervisor = 1.
    expect(
      screen.getByText('3 employees.total · 2 employeeTypes.staff · 1 employeeTypes.contractors'),
    ).toBeTruthy();
    expect(screen.getByText('employees.infoBannerTitle')).toBeTruthy();
    expect(screen.getByText('employees.addEmployee')).toBeTruthy();
  });

  it('hides the banner and add button for employees', () => {
    mockUser = { id: 'u_emp', role: 'employee', email: 'e@x.com' };
    paginatedResults = [empDoc()];
    renderClient();

    expect(screen.queryByText('employees.infoBannerTitle')).toBeNull();
    expect(screen.queryByText('employees.addEmployee')).toBeNull();
  });
});

// ── Grid view ────────────────────────────────────────────────────────────────
describe('grid view', () => {
  it('renders employee cards with role/type/status badges and contact info', () => {
    paginatedResults = [
      empDoc(),
      empDoc({
        _id: 'u2',
        name: 'Driver Person',
        email: 'driver@example.com',
        role: 'driver',
        employeeType: 'contractor',
        phone: undefined,
      }),
    ];
    renderClient();

    expect(screen.getByText('Anna Petrova')).toBeTruthy();
    expect(screen.getByText('anna@example.com')).toBeTruthy();
    expect(screen.getByText('+374 00 000 000')).toBeTruthy();
    expect(screen.getByText('roles.employee')).toBeTruthy();
    expect(screen.getByText('employeeTypes.staff')).toBeTruthy();
    expect(screen.getByText('roles.driver')).toBeTruthy();
    expect(screen.getByText('employeeTypes.contractor')).toBeTruthy();
    expect(screen.getAllByText('common.active')).toHaveLength(2);
  });

  it('resolves the supervisor name from the lookup map', () => {
    paginatedResults = [
      empDoc({ supervisorId: 'u_sup' }),
      empDoc({ _id: 'u_sup', name: 'Boris Ivanov', role: 'supervisor' }),
    ];
    renderClient();
    // Boris appears twice: his own card title and as Anna's supervisor label.
    expect(screen.getAllByText('Boris Ivanov').length).toBeGreaterThan(0);
  });

  it('falls back to the no-supervisor label when the supervisor is unknown', () => {
    paginatedResults = [empDoc({ supervisorId: 'ghost' })];
    renderClient();
    expect(screen.getByText('employees.noSupervisor')).toBeTruthy();
  });

  it('falls back to noPosition when the position is missing', () => {
    paginatedResults = [empDoc({ position: undefined })];
    renderClient();
    expect(screen.getAllByText('employees.noPosition').length).toBeGreaterThan(0);
  });

  it('marks deactivated employees with an overlay and dims the card', () => {
    paginatedResults = [empDoc({ isActive: false })];
    renderClient();
    // The default status filter is 'active', so switch to 'inactive' first.
    fireEvent.change(screen.getAllByTestId('custom-select')[2], {
      target: { value: 'inactive' },
    });
    expect(screen.getByText('employees.deactivatedBadge')).toBeTruthy();
    expect(screen.getByText('common.inactive')).toBeTruthy();
  });

  it('excludes superadmins from the directory', () => {
    paginatedResults = [...STAFF];
    renderClient();
    // Marina is inactive; show everyone to see the superadmin exclusion.
    fireEvent.change(screen.getAllByTestId('custom-select')[2], {
      target: { value: 'all' },
    });
    expect(screen.queryByText('God Mode')).toBeNull();
    expect(screen.getByText('Anna Petrova')).toBeTruthy();
    expect(screen.getByText('Vahagn')).toBeTruthy();
    expect(screen.getByText('Marina')).toBeTruthy();
  });

  // The list no longer navigates away: it opens the profile in a slide-over so
  // the search text, filters, view mode and scroll position survive. The sheet is
  // stubbed below, so what is asserted here is that the right employee was handed
  // to it.
  it('opens the profile slide-over when a card is clicked', () => {
    paginatedResults = [empDoc()];
    renderClient();
    expect(screen.queryByTestId('employee-sheet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Anna Petrova'));

    const sheet = screen.getByTestId('employee-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet.getAttribute('data-employee-id')).toBe('u1');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the noFound placeholder when filters match nothing', () => {
    paginatedResults = [empDoc()];
    renderClient();
    const roleSelect = screen.getAllByTestId('custom-select')[0];
    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    expect(screen.getByText('employees.noFound')).toBeTruthy();
  });
});

// ── Search and filters ───────────────────────────────────────────────────────
describe('search and filters', () => {
  it('filters by a debounced search across name/email/department/position', () => {
    paginatedResults = [
      empDoc({ name: 'Anna Petrova' }),
      empDoc({ _id: 'u2', name: 'Boris', email: 'boris@example.com', department: undefined }),
      empDoc({ _id: 'u3', name: 'Vahagn', department: 'Logistics', position: undefined }),
    ];
    renderClient();

    fireEvent.change(screen.getByPlaceholderText('placeholders.searchByName'), {
      target: { value: 'boris' },
    });
    expect(screen.queryByText('Anna Petrova')).toBeNull();
    expect(screen.getByText('Boris')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('placeholders.searchByName'), {
      target: { value: 'logistics' },
    });
    expect(screen.getByText('Vahagn')).toBeTruthy();
    expect(screen.queryByText('Boris')).toBeNull();
  });

  it('clears the search with the ✕ button', () => {
    paginatedResults = [empDoc(), empDoc({ _id: 'u2', name: 'Boris' })];
    renderClient();
    fireEvent.change(screen.getByPlaceholderText('placeholders.searchByName'), {
      target: { value: 'boris' },
    });
    expect(screen.queryByText('Anna Petrova')).toBeNull();
    fireEvent.click(screen.getByText('✕'));
    expect(screen.getByText('Anna Petrova')).toBeTruthy();
  });

  it('filters by role through the CustomSelect', () => {
    paginatedResults = [empDoc(), empDoc({ _id: 'u2', role: 'admin', name: 'Admin Person' })];
    renderClient();
    const roleSelect = screen.getAllByTestId('custom-select')[0];
    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    expect(screen.getByText('Admin Person')).toBeTruthy();
    expect(screen.queryByText('Anna Petrova')).toBeNull();
  });

  it('filters by employee type', () => {
    paginatedResults = [
      empDoc(),
      empDoc({ _id: 'u2', employeeType: 'contractor', name: 'Contractor' }),
    ];
    renderClient();
    const typeSelect = screen.getAllByTestId('custom-select')[1];
    fireEvent.change(typeSelect, { target: { value: 'contractor' } });
    expect(screen.getByText('Contractor')).toBeTruthy();
    expect(screen.queryByText('Anna Petrova')).toBeNull();
  });

  it('filters by account status (manager only)', () => {
    paginatedResults = [
      empDoc({ isActive: true }),
      empDoc({ _id: 'u2', isActive: false, name: 'Inactive' }),
    ];
    renderClient();
    const statusSelect = screen.getAllByTestId('custom-select')[2];
    fireEvent.change(statusSelect, { target: { value: 'inactive' } });
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.queryByText('Anna Petrova')).toBeNull();
  });

  it('hides the status filter for non-managers', () => {
    mockUser = { id: 'u_emp', role: 'employee', email: 'e@x.com' };
    paginatedResults = [empDoc()];
    renderClient();
    // Role + Type selects only.
    expect(screen.getAllByTestId('custom-select')).toHaveLength(2);
  });
});

// ── List view ────────────────────────────────────────────────────────────────
describe('list view', () => {
  it('switches to the list view with mobile cards and the desktop table', () => {
    paginatedResults = [
      empDoc(),
      empDoc({ _id: 'u2', name: 'Boris', role: 'admin', department: 'Sales' }),
    ];
    renderClient();

    fireEvent.click(screen.getByTitle('ariaLabels.listView'));
    expect(screen.getAllByTestId('mobile-card')).toHaveLength(2);
    expect(screen.getByText('dashboard.employee')).toBeTruthy();
    expect(screen.getByText('employeeInfo.department')).toBeTruthy();
    expect(screen.getByText('roles.supervisor')).toBeTruthy();
    expect(screen.getByText('dashboard.status')).toBeTruthy();
    expect(screen.getByText('dashboard.type')).toBeTruthy();

    // Names/departments appear in both the mobile cards and the desktop table.
    expect(screen.getAllByText('Anna Petrova').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('common.none').length).toBeGreaterThan(0);
  });

  it('navigates from the list-row view action', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.listView'));

    const viewButtons = screen.getAllByTitle('common.view');
    expect(viewButtons.length).toBeGreaterThan(0);
    fireEvent.click(viewButtons[0]);
    expect(screen.getByTestId('employee-sheet').getAttribute('data-employee-id')).toBe('u1');
  });

  it('navigates when a mobile card is tapped', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.listView'));
    fireEvent.click(screen.getAllByTestId('mobile-card')[0]);
    expect(screen.getByTestId('employee-sheet').getAttribute('data-employee-id')).toBe('u1');
  });

  it('renders every list cell with fallbacks for sparse employees', () => {
    paginatedResults = [
      empDoc({
        _id: 'u_sparse',
        name: 'Sparse Person',
        avatarUrl: 'https://img/x.png',
        presenceStatus: 'in_meeting',
        position: undefined,
        department: undefined,
        employeeType: 'intern',
        isActive: false,
        supervisorId: 'u_sup',
      }),
      empDoc({ _id: 'u_sup', name: 'Boris Ivanov', role: 'supervisor' }),
      empDoc({ _id: 'u_ghost', name: 'Ghost Person', supervisorId: 'nope' }),
    ];
    renderClient();
    // Show the inactive sparse employee.
    fireEvent.change(screen.getAllByTestId('custom-select')[2], {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByTitle('ariaLabels.listView'));

    // Mobile cards + desktop table rows.
    expect(screen.getAllByTestId('mobile-card')).toHaveLength(3);
    // Position fallback.
    expect(screen.getAllByText('employees.noPosition').length).toBeGreaterThan(0);
    // Unknown employee type falls back to the staff badge.
    expect(screen.getAllByText('employeeTypes.staff').length).toBeGreaterThan(0);
    // Department + unknown-supervisor fallbacks.
    expect(screen.getAllByText('common.none').length).toBeGreaterThan(0);
    // Inactive badge.
    expect(screen.getAllByText('common.inactive').length).toBeGreaterThan(0);
    // Resolved supervisor name + own card title.
    expect(screen.getAllByText('Boris Ivanov').length).toBeGreaterThan(0);
    // Avatar images render in the mobile cards and the table.
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
  });

  it('shows the noFound placeholder in the list view', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.listView'));
    fireEvent.change(screen.getAllByTestId('custom-select')[0], {
      target: { value: 'admin' },
    });
    expect(screen.getAllByText('employees.noFound').length).toBeGreaterThan(0);
  });

  it('navigates when a desktop table row is clicked', () => {
    paginatedResults = [empDoc(), empDoc({ _id: 'u2', name: 'Boris' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.listView'));
    // First match is the mobile card title, second is the desktop table row.
    fireEvent.click(screen.getAllByText('Anna Petrova')[1]);
    expect(screen.getByTestId('employee-sheet').getAttribute('data-employee-id')).toBe('u1');
  });

  it('switches back to the grid view with the toggle', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.listView'));
    expect(screen.getByText('dashboard.employee')).toBeTruthy();
    fireEvent.click(screen.getByTitle('ariaLabels.gridView'));
    expect(screen.queryByText('dashboard.employee')).toBeNull();
    expect(screen.getByText('Anna Petrova')).toBeTruthy();
  });
});

// ── Load more ────────────────────────────────────────────────────────────────
describe('load more', () => {
  it('loads the next page when available', () => {
    paginatedResults = [empDoc()];
    renderClient();
    const loadMoreButton = screen.getByText('common.loadMore');
    fireEvent.click(loadMoreButton);
    expect(mockLoadMore).toHaveBeenCalledWith(50);
  });

  it('hides load more while a page is loading', () => {
    paginatedResults = [empDoc()];
    paginatedStatus = 'LoadingMore';
    renderClient();
    // hasMore derives from 'CanLoadMore', so the button disappears while loading.
    expect(screen.queryByText('common.loadMore')).toBeNull();
  });

  it('hides load more when the list is empty', () => {
    renderClient();
    expect(screen.queryByText('common.loadMore')).toBeNull();
  });
});

// ── Add / edit modals ────────────────────────────────────────────────────────
describe('modals', () => {
  it('opens the add modal from the header button', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByText('employees.addEmployee'));
    expect(screen.getByTestId('add-modal')).toBeTruthy();
  });

  it('opens the edit modal from the row menu', () => {
    paginatedResults = [empDoc({ _id: 'u_emp', name: 'Anna Petrova' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('common.edit'));
    expect(screen.getByTestId('edit-modal')).toBeTruthy();
    expect(within(screen.getByTestId('edit-modal')).getByText('Anna Petrova')).toBeTruthy();
  });

  it('closes the add modal via onClose', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByText('employees.addEmployee'));
    expect(screen.getByTestId('add-modal')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('add-modal')).getByText('close'));
    expect(screen.queryByTestId('add-modal')).toBeNull();
  });

  it('closes the edit modal via onClose', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('common.edit'));
    expect(screen.getByTestId('edit-modal')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('edit-modal')).getByText('close'));
    expect(screen.queryByTestId('edit-modal')).toBeNull();
  });

  it('closes the confirm dialog from the backdrop', () => {
    paginatedResults = [empDoc({ _id: 'u_emp' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('employees.deactivate'));
    expect(screen.getByText('employees.deactivateTitle')).toBeTruthy();
    fireEvent.click(screen.getByTestId('dialog-overlay'));
    expect(screen.queryByText('employees.deactivateTitle')).toBeNull();
  });

  it('navigates to the profile from the row menu', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('common.viewProfile'));
    expect(screen.getByTestId('employee-sheet').getAttribute('data-employee-id')).toBe('u1');
  });

  it('toggles the row menu closed with a second click', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    expect(screen.getByText('common.viewProfile')).toBeTruthy();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    expect(screen.queryByText('common.viewProfile')).toBeNull();
  });

  it('closes the menu via the outside-click overlay', () => {
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    expect(screen.getByText('common.edit')).toBeTruthy();
    fireEvent.click(screen.getByTestId('menu-overlay'));
    expect(screen.queryByText('common.edit')).toBeNull();
  });
});

// ── Kebab menu & delete flow ─────────────────────────────────────────────────
describe('row menu and deactivation', () => {
  it('hides the deactivate action for non-admin managers', () => {
    mockUser = { id: 'u_sup', role: 'supervisor', email: 's@x.com' };
    paginatedResults = [empDoc({ _id: 'u_emp' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    expect(screen.getByText('common.edit')).toBeTruthy();
    expect(screen.queryByText('employees.deactivate')).toBeNull();
  });

  it('hides the deactivate action for admin rows', () => {
    paginatedResults = [empDoc({ _id: 'u_admin_row', role: 'admin', name: 'Other Admin' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    expect(screen.queryByText('employees.deactivate')).toBeNull();
  });

  it('deactivates a user through the confirm dialog', async () => {
    paginatedResults = [empDoc({ _id: 'u_emp' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('employees.deactivate'));

    expect(screen.getByText('employees.deactivateTitle')).toBeTruthy();
    fireEvent.click(screen.getByText('employees.deactivate'));

    await waitFor(() => expect(mutationCalls.deleteUser).toHaveLength(1));
    expect(mutationCalls.deleteUser[0].args[0]).toEqual({
      adminId: 'u_admin',
      userId: 'u_emp',
    });
    expect(toast.success).toHaveBeenCalledWith('employees.deactivated');
  });

  it('cancels the confirm dialog without calling the mutation', () => {
    paginatedResults = [empDoc({ _id: 'u_emp' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('employees.deactivate'));
    expect(screen.getByText('employees.deactivateTitle')).toBeTruthy();

    fireEvent.click(screen.getByText('common.cancel'));
    expect(screen.queryByText('employees.deactivateTitle')).toBeNull();
    expect(mutationCalls.deleteUser).toBeUndefined();
  });

  it('shows the server error message when deactivation fails', async () => {
    mutationImpl.deleteUser = jest.fn().mockRejectedValue(new Error('Cannot delete yourself'));
    paginatedResults = [empDoc({ _id: 'u_emp' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('employees.deactivate'));
    fireEvent.click(screen.getByText('employees.deactivate'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot delete yourself'));
  });

  it('shows the generic error toast for a non-Error rejection', async () => {
    mutationImpl.deleteUser = jest.fn().mockRejectedValue('boom');
    paginatedResults = [empDoc({ _id: 'u_emp' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('employees.deactivate'));
    fireEvent.click(screen.getByText('employees.deactivate'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('employees.deactivateFailed'));
  });

  it('guards deactivation when the current user id is missing', async () => {
    // canManage stays true (admin role) but there is no user id to pass.
    mockUser = { role: 'admin' };
    paginatedResults = [empDoc({ _id: 'u_emp' })];
    renderClient();
    fireEvent.click(screen.getByTitle('ariaLabels.rowMenu'));
    fireEvent.click(screen.getByText('employees.deactivate'));
    fireEvent.click(screen.getByText('employees.deactivate'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.userIdNotFound'));
    expect(mutationCalls.deleteUser).toBeUndefined();
  });
});

// ── Team sidebar & misc ──────────────────────────────────────────────────────
describe('team sidebar and misc', () => {
  it('renders the team sidebar with the current user id', () => {
    paginatedResults = [empDoc()];
    renderClient();
    expect(screen.getByTestId('team-sidebar')).toHaveTextContent('u_admin');
  });

  it('expands the content area when the sidebar panel is opened', () => {
    paginatedResults = [empDoc()];
    renderClient();
    const content = screen.getByTestId('team-sidebar').parentElement!;
    expect(content.style.paddingRight).toBe('5rem');
    fireEvent.click(screen.getByText('toggle-panel'));
    expect(content.style.paddingRight).toBe('19rem');
  });

  it('renders the avatar for a user with an image URL', () => {
    paginatedResults = [empDoc({ avatarUrl: 'https://img/x.png' })];
    renderClient();
    expect(screen.getByTestId('avatar-upload')).toBeTruthy();
  });

  it('skips the org filter when no organization is selected', () => {
    mockSelectedOrg = null;
    paginatedResults = [empDoc()];
    renderClient();
    expect(screen.getByText('Anna Petrova')).toBeTruthy();
  });

  it('lays out the mobile container on a small viewport', () => {
    mockIsMobile = true;
    paginatedResults = [empDoc()];
    renderClient();
    expect(screen.getByText('Anna Petrova')).toBeTruthy();
    expect(screen.getAllByTestId('custom-select').length).toBeGreaterThan(0);
  });

  it('falls back to window scrolling when the main ref is detached', () => {
    mainRefValue = { current: null };
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    paginatedResults = [empDoc()];
    renderClient();
    fireEvent.click(screen.getByText('employees.addEmployee'));
    expect(screen.getByTestId('add-modal')).toBeTruthy();
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('falls back to window scrolling from the empty state button', () => {
    mainRefValue = { current: null };
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderClient();
    fireEvent.click(screen.getByText('employees.addFirstEmployee'));
    expect(screen.getByTestId('add-modal')).toBeTruthy();
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('falls back to the available presence badge for unknown statuses', () => {
    paginatedResults = [empDoc({ presenceStatus: 'mystery' })];
    renderClient();
    expect(screen.getByText('Anna Petrova')).toBeTruthy();
  });

  it('falls back to the staff badge for unknown employee types', () => {
    paginatedResults = [empDoc({ employeeType: 'intern' })];
    renderClient();
    expect(screen.getAllByText('employeeTypes.staff').length).toBeGreaterThan(0);
  });
});
