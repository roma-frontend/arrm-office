/**
 * Tests for EditEmployeeModal — the 5-step (6 for superadmin) edit wizard:
 * access guards (superadmin / other-admin protection), step navigation with
 * per-step validation, salary & passport hydration from queries, legacy
 * department/position name matching, supervisor reset on org change, and the
 * full save flow (updateUser + updateSalary + updatePassport + optional
 * uploadDocument).
 *
 * Mocks: convex/react (useQuery/useMutation keyed by _name), generated api,
 * react-i18next (returns keys), @/lib/cssMotion, @/store/useAuthStore
 * (stateful mock), @/hooks/useOrgUnits, @/components/ui/{dialog,select,button,
 * CustomSelect,avatar-upload,ShieldLoader},
 * @/components/employees/PassportFields, sonner.
 */

// Must precede the component import: EditEmployeeModal captures
// NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL at module scope.
import './setAdminEnv';

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditEmployeeModal, type Employee } from '@/components/employees/EditEmployeeModal';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) =>
      typeof fallback === 'string'
        ? fallback
        : fallback && typeof fallback === 'object' && 'defaultValue' in fallback
          ? (fallback.defaultValue ?? key)
          : key,
    i18n: { language: 'en' },
  }),
}));

// ── Convex: query results and per-mutation impls keyed by _name ──────────────
let queryResults: Record<string, unknown> = {};
const mutationCalls: Record<string, Array<{ args: any }>> = {};
const mutationImpl: Record<string, (...args: any[]) => Promise<unknown>> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    return async (...args: any[]) => {
      (mutationCalls[name] ??= []).push({ args });
      if (mutationImpl[name]) return mutationImpl[name](...args);
      return Promise.resolve();
    };
  },
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    users: {
      queries: { getSupervisors: { _name: 'getSupervisors' } },
      mutations: { updateUser: { _name: 'updateUser' } },
    },
    employeeProfiles: {
      updateSalary: { _name: 'updateSalary' },
      updatePassport: { _name: 'updatePassport' },
      uploadDocument: { _name: 'uploadDocument' },
      getSalary: { _name: 'getSalary' },
      getEmployeeProfile: { _name: 'getEmployeeProfile' },
    },
    organizations: { getAllOrganizations: { _name: 'getAllOrganizations' } },
  },
}));

// ── Auth store: supports both useAuthStore() and useAuthStore(selector) ──────
let mockUserState: { user: Record<string, unknown> | null };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (sel?: any) => (sel ? sel(mockUserState) : mockUserState),
}));

// ── Org units ────────────────────────────────────────────────────────────────
let mockDepartments: any[] = [];
let mockPositions: any[] = [];
let mockAllPositions: any[] = [];
jest.mock('@/hooks/useOrgUnits', () => ({
  useOrgUnits: () => ({
    departments: mockDepartments,
    positions: mockPositions,
    allPositions: mockAllPositions,
  }),
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  const Elem =
    (tag: string) =>
    ({ children, ...props }: any) =>
      ReactMod.createElement(tag, props, children);
  return {
    motion: { div: Elem('div'), button: Elem('button') },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          close-dialog
        </button>
      </>
    ) : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

// data-value mirrors the controlled value so tests can assert empty values that
// a native <select> would normalize to its first option.
jest.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      data-testid="ui-select"
      data-value={value ?? ''}
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder ?? ''}</span>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

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

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/avatar-upload', () => ({
  AvatarUpload: () => <div data-testid="avatar-upload" />,
}));

jest.mock('@/components/employees/PassportFields', () => ({
  EMPTY_PASSPORT: {},
  PassportFields: ({ onChange, onScanUploaded }: any) => (
    <div data-testid="passport-fields">
      <button onClick={() => onChange({ passportNumber: 'AB123456' })}>fill-passport</button>
      <button
        onClick={() => onScanUploaded({ name: 'scan.pdf', url: 'https://x/scan.pdf', size: 100 })}
      >
        upload-scan
      </button>
    </div>
  ),
}));

const toast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({
  toast: {
    success: (...a: any[]) => toast.success(...a),
    error: (...a: any[]) => toast.error(...a),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    _id: 'u1',
    name: 'Anna Petrova',
    email: 'anna@example.com',
    role: 'employee',
    employeeType: 'staff',
    departmentId: 'd1',
    positionId: 'p1',
    department: 'Engineering',
    position: 'Engineer',
    phone: '+374 00 000 000',
    supervisorId: 's1',
    isActive: true,
    organizationId: 'org-1',
    travelAllowance: 0,
    paidLeaveBalance: 10,
    sickLeaveBalance: 5,
    familyLeaveBalance: 3,
    createdAt: new Date(2023, 10, 14).getTime(),
    ...overrides,
  };
}

const DEPARTMENTS = [
  { _id: 'd1', name: 'Engineering' },
  { _id: 'd2', name: 'Sales' },
];
const POSITIONS = [{ _id: 'p1', title: 'Engineer', departmentId: 'd1' }];
const SUPERVISORS = [{ _id: 's1', name: 'Boris Ivanov' }];
const ORGS = [{ _id: 'o1', name: 'Org One' }];
const SALARY = { baseSalary: 200, bonuses: 10, overtimeHours: 5, salaryCurrency: 'USD' };
const PROFILE = {
  profile: {
    passportNumber: 'P-001',
    passportIssuedBy: 'MVD',
    passportIssueDate: '2020-01-01',
    passportExpiryDate: '2030-01-01',
    socialCardNumber: 'SC-1',
    nationality: 'AM',
  },
};

function renderModal(emp: Employee, onClose: () => void = jest.fn()) {
  return render(<EditEmployeeModal employee={emp} open onClose={onClose} />);
}

function selectValue(el: HTMLElement): string {
  return el.getAttribute('data-value') ?? '';
}

beforeEach(() => {
  jest.clearAllMocks();
  queryResults = {
    getSupervisors: SUPERVISORS,
    getSalary: SALARY,
    getEmployeeProfile: PROFILE,
    getAllOrganizations: ORGS,
  };
  Object.keys(mutationCalls).forEach((k) => delete mutationCalls[k]);
  Object.keys(mutationImpl).forEach((k) => delete mutationImpl[k]);
  mockDepartments = DEPARTMENTS;
  mockPositions = POSITIONS;
  mockAllPositions = POSITIONS;
  mockUserState = { user: { id: 'u_admin', role: 'admin', email: 'a@x.com' } };
});

// ── Access guards ────────────────────────────────────────────────────────────
describe('access guards', () => {
  it('blocks non-superadmins from editing a superadmin', () => {
    const onClose = jest.fn();
    renderModal(employee({ role: 'superadmin' }), onClose);
    expect(screen.getByText('editEmployee.accessDenied')).toBeTruthy();
    expect(screen.getByText('editEmployee.cannotEditSuperadmin')).toBeTruthy();
    fireEvent.click(screen.getByText('common.close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks an admin from editing another admin', () => {
    mockUserState = { user: { id: 'u_admin', role: 'admin', email: 'a@x.com' } };
    renderModal(employee({ _id: 'u2', role: 'admin' }));
    expect(screen.getByText('editEmployee.onlySuperadminCanEditAdmins')).toBeTruthy();
  });

  it('allows an admin to edit themselves', () => {
    mockUserState = { user: { id: 'u1', role: 'admin', email: 'a@x.com' } };
    renderModal(employee({ role: 'admin' }));
    expect(screen.getByText('modals.editEmployee.title')).toBeTruthy();
  });

  it('allows the actual superadmin account to edit admins', () => {
    // setAdminEnv sets NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL=root@x.com.
    mockUserState = { user: { id: 'u_root', role: 'admin', email: 'root@x.com' } };
    renderModal(employee({ _id: 'u2', role: 'admin' }));
    expect(screen.getByText('modals.editEmployee.title')).toBeTruthy();
  });
});

// ── Wizard navigation + validation ───────────────────────────────────────────
describe('wizard navigation', () => {
  it('renders the personal-info step with the employee email and hydrated date', () => {
    renderModal(employee());
    expect(screen.getByText('modals.editEmployee.title')).toBeTruthy();
    // Email appears in the dialog description and the read-only email field.
    expect(screen.getAllByText('anna@example.com').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Anna Petrova')).toBeTruthy();
    expect(screen.getByDisplayValue('2023-11-14')).toBeTruthy();
    expect(screen.getByText('common.step 1 / 5')).toBeTruthy();
  });

  it('blocks advancing when the name is empty and blurs the input red', () => {
    renderModal(employee({ name: '' }));
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByText('common.name errors.required')).toBeTruthy();
    const name = screen.getByDisplayValue('') as HTMLInputElement;
    fireEvent.blur(name);
    expect(name.style.borderColor).toBe('rgb(239, 68, 68)');
    // Still on the first step.
    expect(screen.getByText('common.step 1 / 5')).toBeTruthy();
  });

  it('edits the personal fields and their focus states', () => {
    renderModal(employee());
    const name = screen.getByDisplayValue('Anna Petrova') as HTMLInputElement;
    fireEvent.focus(name);
    expect(name.style.borderColor).toBe('rgb(37, 99, 235)');
    fireEvent.blur(name);
    expect(name.style.borderColor).toBe('var(--border)');

    const phone = screen.getByDisplayValue('+374 00 000 000') as HTMLInputElement;
    fireEvent.focus(phone);
    expect(phone.style.borderColor).toBe('rgb(37, 99, 235)');
    fireEvent.blur(phone);
    expect(phone.style.borderColor).toBe('var(--border)');
    fireEvent.change(phone, { target: { value: '+374 11 222 333' } });
    expect(phone.value).toBe('+374 11 222 333');

    const date = screen.getByDisplayValue('2023-11-14') as HTMLInputElement;
    fireEvent.focus(date);
    expect(date.style.borderColor).toBe('rgb(37, 99, 235)');
    fireEvent.blur(date);
    expect(date.style.borderColor).toBe('var(--border)');
    fireEvent.change(date, { target: { value: '2024-01-01' } });
    expect(date.value).toBe('2024-01-01');
  });

  it('goes back with the Previous button', () => {
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByText('common.step 2 / 5')).toBeTruthy();
    fireEvent.click(screen.getByText('wizard.previous'));
    expect(screen.getByText('common.step 1 / 5')).toBeTruthy();
  });

  it('requires department and position on the work step', () => {
    // No names either — otherwise the legacy name-matching effect fills the IDs.
    renderModal(
      employee({
        departmentId: undefined,
        positionId: undefined,
        department: undefined,
        position: undefined,
      }),
    );
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByText('employees.department errors.required')).toBeTruthy();
    expect(screen.getByText('employees.position errors.required')).toBeTruthy();

    const deptSelect = screen.getAllByTestId('custom-select')[0];
    const posSelect = screen.getAllByTestId('custom-select')[1];
    fireEvent.change(deptSelect, { target: { value: 'd1' } });
    fireEvent.change(posSelect, { target: { value: 'p1' } });
    // Role cards (superadmin filtered out for a plain admin) and employee type.
    fireEvent.click(screen.getByText('roles.supervisor'));
    expect(screen.queryByText('roles.admin')).toBeNull();
    fireEvent.click(screen.getByText('employeeTypes.contractor'));
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByText('common.step 3 / 5')).toBeTruthy();
  });

  it('clears the position when the department changes to an incompatible one', () => {
    renderModal(employee({ departmentId: undefined, positionId: undefined }));
    fireEvent.click(screen.getByText('wizard.next'));
    const deptSelect = screen.getAllByTestId('custom-select')[0];
    const posSelect = screen.getAllByTestId('custom-select')[1];
    fireEvent.change(deptSelect, { target: { value: 'd1' } });
    fireEvent.change(posSelect, { target: { value: 'p1' } });
    // Switching to Sales clears the Engineer position (belongs to Engineering).
    fireEvent.change(deptSelect, { target: { value: 'd2' } });
    expect((posSelect as HTMLSelectElement).value).toBe('');
  });

  it('hides the supervisor selector when no supervisors exist', () => {
    queryResults['getSupervisors'] = [];
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.queryByText('labels.supervisor')).toBeNull();
  });

  it('matches legacy department/position names to directory records', () => {
    renderModal(employee({ departmentId: undefined, positionId: undefined }));
    fireEvent.click(screen.getByText('wizard.next'));
    const deptSelect = screen.getAllByTestId('custom-select')[0] as HTMLSelectElement;
    const posSelect = screen.getAllByTestId('custom-select')[1] as HTMLSelectElement;
    expect(deptSelect.value).toBe('d1');
    expect(posSelect.value).toBe('p1');
  });

  it('shows placeholder options when the org has no departments or positions', () => {
    mockDepartments = [];
    mockPositions = [];
    mockAllPositions = [];
    renderModal(employee({ department: undefined, position: undefined }));
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByText('employees.noDepartments')).toBeTruthy();
    expect(screen.getByText('employees.noPositions')).toBeTruthy();
  });

  it('tolerates missing directory data entirely', () => {
    mockDepartments = undefined as any;
    mockPositions = undefined as any;
    mockAllPositions = undefined as any;
    renderModal(employee({ department: undefined, position: undefined }));
    fireEvent.click(screen.getByText('wizard.next'));
    // Work step renders with placeholder-only selects; no crash.
    expect(screen.getByText('wizard.workDetails')).toBeTruthy();
  });
});

// ── Salary & passport hydration ──────────────────────────────────────────────
describe('salary and identity steps', () => {
  it('hydrates salary fields from the query and lets the user edit them', () => {
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next')); // personal
    fireEvent.click(screen.getByText('wizard.next')); // work
    expect(screen.getByText('common.step 3 / 5')).toBeTruthy();
    expect(screen.getByDisplayValue('200')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(screen.getByDisplayValue('5')).toBeTruthy();

    const currency = screen.getAllByTestId('ui-select')[0];
    expect(selectValue(currency)).toBe('USD');
    fireEvent.change(currency, { target: { value: 'RUB' } });
    expect(selectValue(currency)).toBe('RUB');

    // Edits + focus states for the numeric salary inputs.
    const base = screen.getByDisplayValue('200') as HTMLInputElement;
    fireEvent.focus(base);
    expect(base.style.borderColor).toBe('rgb(37, 99, 235)');
    fireEvent.blur(base);
    expect(base.style.borderColor).toBe('var(--border)');
    fireEvent.change(base, { target: { value: '250' } });
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '15' } });
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '' } });
    expect((screen.getByDisplayValue('250') as HTMLInputElement).value).toBe('250');
  });

  it('renders the passport fields and forwards a scan upload', () => {
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next')); // salary
    expect(screen.getByTestId('passport-fields')).toBeTruthy();
    fireEvent.click(screen.getByText('fill-passport'));
    fireEvent.click(screen.getByText('upload-scan'));
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByText('common.step 5 / 5')).toBeTruthy();
  });
});

// ── Save flow ────────────────────────────────────────────────────────────────
describe('save flow', () => {
  it('saves the full wizard through all four mutations', async () => {
    const onClose = jest.fn();
    renderModal(employee(), onClose);

    // Personal.
    fireEvent.change(screen.getByDisplayValue('Anna Petrova'), {
      target: { value: 'Anna Updated' },
    });
    fireEvent.click(screen.getByText('wizard.next'));
    // Work.
    expect((screen.getAllByTestId('custom-select')[0] as HTMLSelectElement).value).toBe('d1');
    expect(selectValue(screen.getAllByTestId('ui-select')[0])).toBe('s1');
    fireEvent.click(screen.getByText('wizard.next'));
    // Salary.
    fireEvent.change(screen.getByDisplayValue('200'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('wizard.next'));
    // Identity.
    fireEvent.click(screen.getByText('fill-passport'));
    fireEvent.click(screen.getByText('upload-scan'));
    fireEvent.click(screen.getByText('wizard.next'));
    // Review.
    expect(screen.getByText('wizard.review')).toBeTruthy();
    expect(screen.getByText('Anna Updated')).toBeTruthy();
    expect(screen.getByText('Engineering')).toBeTruthy();
    expect(screen.getByText('Engineer')).toBeTruthy();
    // Leave balances + status toggle (the pill switch is a separate button).
    const paidLeave = screen.getByDisplayValue('10') as HTMLInputElement;
    fireEvent.change(paidLeave, { target: { value: '25' } });
    const toggle = Array.from(document.querySelectorAll('button')).find((b) =>
      b.className.includes('w-12 h-6'),
    )!;
    fireEvent.click(toggle);
    fireEvent.click(screen.getByText('modals.editEmployee.saveChanges'));

    await waitFor(() => expect(mutationCalls['updateUser']).toHaveLength(1));
    expect(mutationCalls['updateUser'][0].args[0]).toMatchObject({
      adminId: 'u_admin',
      userId: 'u1',
      name: 'Anna Updated',
      role: 'employee',
      employeeType: 'staff',
      departmentId: 'd1',
      positionId: 'p1',
      phone: '+374 00 000 000',
      supervisorId: 's1',
      isActive: false,
      paidLeaveBalance: 25,
      sickLeaveBalance: 5,
      familyLeaveBalance: 3,
      createdAt: new Date('2023-11-14T00:00:00').getTime(),
    });
    expect(mutationCalls['updateSalary'][0].args[0]).toMatchObject({
      baseSalary: 500,
      bonuses: 10,
      overtimeHours: 5,
      salaryCurrency: 'USD',
    });
    expect(mutationCalls['updatePassport'][0].args[0]).toMatchObject({
      passportNumber: 'AB123456',
    });
    expect(mutationCalls['uploadDocument'][0].args[0]).toMatchObject({
      category: 'id_document',
      fileName: 'scan.pdf',
      fileUrl: 'https://x/scan.pdf',
      fileSize: 100,
    });
    expect(toast.success).toHaveBeenCalledWith('modals.editEmployee.updatedSuccess');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server error message when saving fails', async () => {
    mutationImpl['updateUser'] = jest.fn().mockRejectedValue(new Error('Cannot edit'));
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('modals.editEmployee.saveChanges'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot edit'));
  });

  it('shows the generic error toast for a non-Error rejection', async () => {
    mutationImpl['updateUser'] = jest.fn().mockRejectedValue('boom');
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('modals.editEmployee.saveChanges'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('modals.editEmployee.failedToUpdate'),
    );
  });

  it('guards saving when the current user id is missing', async () => {
    mockUserState = { user: { role: 'admin' } };
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('modals.editEmployee.saveChanges'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.userIdNotFound'));
    expect(mutationCalls['updateUser']).toBeUndefined();
  });

  it('closes the dialog via onOpenChange', () => {
    const onClose = jest.fn();
    renderModal(employee(), onClose);
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing and skips the queries when closed', () => {
    render(<EditEmployeeModal employee={employee()} open={false} onClose={jest.fn()} />);
    expect(screen.queryByText('modals.editEmployee.title')).toBeNull();
    expect(screen.queryByTestId('dialog-content')).toBeNull();
  });

  it('tolerates missing salary and profile data', () => {
    queryResults['getSalary'] = undefined;
    queryResults['getEmployeeProfile'] = undefined;
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    // Salary inputs stay empty, no crash from hydration effects.
    expect(screen.getAllByText('payroll.salary').length).toBeGreaterThan(0);
  });

  it('defaults null salary fields to zero and AMD', () => {
    queryResults['getSalary'] = {
      baseSalary: null,
      bonuses: null,
      overtimeHours: null,
      salaryCurrency: null,
    };
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    expect(selectValue(screen.getAllByTestId('ui-select')[0])).toBe('AMD');
    // Empty-string display values for the zeroed numbers.
    const emptyNumberInputs = screen
      .getAllByRole('spinbutton')
      .filter((i) => (i as HTMLInputElement).value === '');
    expect(emptyNumberInputs.length).toBe(3);
  });

  it('hydrates a partial passport profile with empty fallbacks', () => {
    queryResults['getEmployeeProfile'] = { profile: { passportNumber: 'X-1' } };
    renderModal(employee());
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByTestId('passport-fields')).toBeTruthy();
  });

  it('keeps selects empty when legacy names match nothing', () => {
    renderModal(
      employee({
        departmentId: undefined,
        positionId: undefined,
        department: 'Ghost Department',
        position: 'Ghost Position',
      }),
    );
    fireEvent.click(screen.getByText('wizard.next'));
    const deptSelect = screen.getAllByTestId('custom-select')[0] as HTMLSelectElement;
    const posSelect = screen.getAllByTestId('custom-select')[1] as HTMLSelectElement;
    expect(deptSelect.value).toBe('');
    expect(posSelect.value).toBe('');
  });

  it('ignores a failed document upload during save', async () => {
    mutationImpl['uploadDocument'] = jest.fn().mockRejectedValue(new Error('storage full'));
    const onClose = jest.fn();
    renderModal(employee(), onClose);
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('upload-scan'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('modals.editEmployee.saveChanges'));

    await waitFor(() => expect(mutationCalls['uploadDocument']).toHaveLength(1));
    // The upload rejection is swallowed; the save still succeeds.
    expect(toast.success).toHaveBeenCalledWith('modals.editEmployee.updatedSuccess');
    expect(onClose).toHaveBeenCalled();
  });

  it('saves a sparse employee without optional fields', async () => {
    const onClose = jest.fn();
    queryResults['getSupervisors'] = [];
    // No profile → passport stays empty (no hydration).
    queryResults['getEmployeeProfile'] = undefined;
    renderModal(
      employee({
        phone: undefined,
        supervisorId: undefined,
        createdAt: undefined,
        department: undefined,
        position: undefined,
        organizationId: undefined,
      }),
      onClose,
    );
    fireEvent.click(screen.getByText('wizard.next'));
    // No supervisors → selector hidden, empty phone/date inputs render '—' defaults.
    expect(screen.queryByText('labels.supervisor')).toBeNull();
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('modals.editEmployee.saveChanges'));

    await waitFor(() => expect(mutationCalls['updateUser']).toHaveLength(1));
    expect(mutationCalls['updateUser'][0].args[0]).toMatchObject({
      phone: undefined,
      supervisorId: undefined,
      createdAt: undefined,
    });
    expect(mutationCalls['updatePassport'][0].args[0]).toMatchObject({
      passportNumber: undefined,
      passportIssuedBy: undefined,
      nationality: undefined,
    });
    expect(mutationCalls['uploadDocument']).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith('modals.editEmployee.updatedSuccess');
    expect(onClose).toHaveBeenCalled();
  });
});

// ── Superadmin flow ──────────────────────────────────────────────────────────
describe('superadmin flow', () => {
  beforeEach(() => {
    mockUserState = { user: { id: 'u_super', role: 'superadmin', email: 's@x.com' } };
  });

  it('requires an organization on the first step', () => {
    renderModal(employee({ organizationId: '' }));
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByText('employees.organization errors.required')).toBeTruthy();
    const orgSelect = screen.getAllByTestId('ui-select')[0];
    fireEvent.change(orgSelect, { target: { value: 'o1' } });
    fireEvent.click(screen.getByText('wizard.next'));
    expect(screen.getByText('common.step 2 / 6')).toBeTruthy();
  });

  it('resets a supervisor from the previous org when the org changes', () => {
    // Employee is linked to org-1 with supervisor s1; the new org only has s2.
    queryResults['getSupervisors'] = [{ _id: 's2', name: 'Other' }];
    renderModal(employee({ organizationId: '' }));
    fireEvent.change(screen.getAllByTestId('ui-select')[0], { target: { value: 'o1' } });
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next')); // personal
    const supSelect = screen.getAllByTestId('ui-select')[0];
    expect(selectValue(supSelect)).toBe('');
    fireEvent.change(supSelect, { target: { value: 's2' } });
    expect(selectValue(supSelect)).toBe('s2');
  });

  it('walks all six steps and saves', async () => {
    const onClose = jest.fn();
    renderModal(employee({ organizationId: '' }), onClose);

    fireEvent.change(screen.getAllByTestId('ui-select')[0], { target: { value: 'o1' } });
    fireEvent.click(screen.getByText('wizard.next'));
    fireEvent.click(screen.getByText('wizard.next')); // personal
    fireEvent.click(screen.getByText('wizard.next')); // work
    fireEvent.click(screen.getByText('wizard.next')); // salary
    fireEvent.click(screen.getByText('wizard.next')); // identity
    expect(screen.getByText('common.step 6 / 6')).toBeTruthy();
    // Review shows the selected organization.
    expect(screen.getByText('Org One')).toBeTruthy();
    fireEvent.click(screen.getByText('modals.editEmployee.saveChanges'));

    await waitFor(() => expect(mutationCalls['updateUser']).toHaveLength(1));
    expect(mutationCalls['updateUser'][0].args[0]).toMatchObject({
      supervisorId: 's1',
      role: 'employee',
    });
    expect(toast.success).toHaveBeenCalledWith('modals.editEmployee.updatedSuccess');
    expect(onClose).toHaveBeenCalled();
  });
});
