/**
 * Tests for AddEmployeeModal — the 6/7-step wizard that creates an employee
 * (personal → work → role/type → salary → identity → review, plus an org
 * selection step for superadmins).
 *
 * Covers: open/close gating, per-step validation, department/position selects,
 * role & employee-type toggle (incl. contractor email auto-detection), the
 * salary step, the identity step (passport fields, date of birth, the hiring
 * document packet with its language select and mandatory preview), the review
 * summary, the full submit pipeline (createUser payload, SRC verification,
 * passport scan upload, hiring packet generation, telegram notify), error
 * paths, the superadmin org-selection flow, draft restore/start-over and the
 * travel-allowance preview.
 *
 * Mocks: convex/react (useMutation/useQuery keyed by _name), generated api,
 * auth store, useOrgUnits, useWizardDraft (controllable), WizardDraftNotice,
 * SalaryCalculatorStep and PassportFields sub-components, travelAllowance,
 * dialog + select + button + input + label + ShieldLoader, sonner, cssMotion,
 * lucide, next imports. taxRules and payrollCalculator are real.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'object' ? key : (fallback ?? key)),
    i18n: { language: 'en' },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockMutations: Record<string, jest.Mock> = {};
const mockQueries: Record<string, any> = {};
jest.mock('convex/react', () => ({
  useMutation: (m: any) => mockMutations[m?._name] ?? jest.fn(),
  useQuery: (q: any) => (q?._name in mockQueries ? mockQueries[q._name] : undefined),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    users: { mutations: { createUser: { _name: 'createUser' } } },
    employeeProfiles: {
      uploadDocument: { _name: 'uploadDocument' },
      recordTaxIdVerification: { _name: 'recordTaxIdVerification' },
    },
    hiringPackets: { generate: { _name: 'generate' } },
    organizations: {
      getAllOrganizations: { _name: 'getAllOrganizations' },
      getMyOrganization: { _name: 'getMyOrganization' },
    },
    payroll: { queries: { getSalarySettings: { _name: 'getSalarySettings' } } },
  },
}));

// ── Auth / org units ─────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = { id: 'u1', role: 'admin', email: 'admin@x.com' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

let mockDepartments: any[] = [];
let mockPositions: any[] = [];
jest.mock('@/hooks/useOrgUnits', () => ({
  useOrgUnits: () => ({ departments: mockDepartments, positions: mockPositions }),
}));

// ── Draft (controllable) ─────────────────────────────────────────────────────
let mockDraft: { restored: boolean; restoredStep: number; clearDraft: jest.Mock };
jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (opts: any) => {
    // Always register the effect so the hook count stays stable across renders.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      if (mockDraft.restored) {
        opts.onRestore?.(
          {
            name: 'Restored Name',
            email: 'restored@x.com',
            departmentId: 'd1',
            positionId: 'p1',
            phone: '+374000000',
            role: 'supervisor',
            type: 'contractor',
            selectedOrgId: 'org-2',
            registrationDate: '2026-01-01',
            salary: { mode: 'gross', amount: 400000, currency: 'AMD', country: 'armenia' },
            passport: { passportNumber: 'AB123', socialCardNumber: 'SC1' },
            passportScan: null,
            dateOfBirth: '1990-05-05',
            documentLanguage: 'en',
            generatePacket: false,
          },
          mockDraft.restoredStep,
        );
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return {
      restored: mockDraft.restored,
      restoredStep: mockDraft.restoredStep,
      clearDraft: mockDraft.clearDraft,
      dismissNotice: jest.fn(),
    };
  },
}));

jest.mock('@/components/ui/WizardDraftNotice', () => ({
  WizardDraftNotice: ({ show, onReset }: any) =>
    show ? (
      <div data-testid="draft-notice">
        <button type="button" onClick={onReset}>
          Start over
        </button>
      </div>
    ) : null,
}));

// ── Toast / animation / utils ────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/lib/travelAllowance', () => ({
  resolveTravelAllowance: jest.fn(() => 12000),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const names = [
    'UserPlus',
    'User',
    'Mail',
    'Briefcase',
    'Phone',
    'CheckCircle',
    'Check',
    'ChevronRight',
    'ChevronLeft',
    'Building2',
    'Shield',
    'DollarSign',
    'IdCard',
    'CalendarDays',
    'FileText',
    'Languages',
  ];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── Sub-components ───────────────────────────────────────────────────────────
jest.mock('@/components/employees/SalaryCalculatorStep', () => ({
  SalaryCalculatorStep: ({ value, onChange }: any) => (
    <div data-testid="salary-step" data-mode={value.mode} data-amount={value.amount}>
      <button
        type="button"
        data-testid="salary-gross"
        onClick={() => onChange({ mode: 'gross', amount: 300000 })}
      >
        Set gross
      </button>
      <button
        type="button"
        data-testid="salary-net"
        onClick={() => onChange({ mode: 'net', amount: 250000 })}
      >
        Set net
      </button>
    </div>
  ),
}));

jest.mock('@/components/employees/PassportFields', () => ({
  EMPTY_PASSPORT: {
    passportNumber: '',
    passportIssuedBy: '',
    passportIssueDate: '',
    passportExpiryDate: '',
    socialCardNumber: '',
    nationality: '',
  },
  PassportFields: ({ value, onChange, onScanUploaded, onDateOfBirth, onTaxIdVerified }: any) => (
    <div data-testid="passport-fields">
      <input
        data-testid="passport-number"
        value={value.passportNumber ?? ''}
        onChange={(e) => onChange({ passportNumber: e.target.value })}
      />
      <input
        data-testid="social-card"
        value={value.socialCardNumber ?? ''}
        onChange={(e) => onChange({ socialCardNumber: e.target.value })}
      />
      <button
        type="button"
        data-testid="upload-scan"
        onClick={() => onScanUploaded({ name: 'scan.pdf', url: 'https://cdn/x.pdf', size: 1024 })}
      >
        Upload scan
      </button>
      <button type="button" data-testid="set-dob" onClick={() => onDateOfBirth('1990-01-15')}>
        Set DOB
      </button>
      <button
        type="button"
        data-testid="verify-taxid"
        onClick={() => onTaxIdVerified('valid_local')}
      >
        Verify
      </button>
    </div>
  ),
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          close
        </button>
        {children}
      </div>
    ) : null,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: (props: any) => <label {...props} />,
}));

jest.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children, disabled }: any) => {
    const options: any[] = [];
    React.Children.forEach(children, (child: any) => {
      if (!child?.props) return;
      if (child.props.value) options.push(child);
      else if (child.props.children) {
        React.Children.forEach(child.props.children, (grand: any) => {
          if (grand?.props?.value) options.push(grand);
        });
      }
    });
    return (
      <div data-testid="select" data-disabled={!!disabled}>
        <button type="button" data-testid={`select-current-${value}`}>
          {value}
        </button>
        <div data-testid="select-options">
          {options.map((opt) => (
            <button
              key={opt.props.value}
              type="button"
              data-testid={`select-option-${opt.props.value}`}
              onClick={() => onValueChange(opt.props.value)}
            >
              {opt.props.value}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return {
    Select,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <div value={value}>{children}</div>,
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: () => null,
  };
});

import { AddEmployeeModal } from '@/components/employees/AddEmployeeModal';
import { toast } from 'sonner';
import { resolveTravelAllowance } from '@/lib/travelAllowance';

// ── Helpers ──────────────────────────────────────────────────────────────────
const next = () => fireEvent.click(screen.getByText('wizard.next'));
const prev = () => fireEvent.click(screen.getByText('wizard.previous'));
const submitButton = () => screen.getAllByText('employees.addEmployee').slice(-1)[0];
const onReviewStep = () => screen.getAllByText('common.review').length > 0;

function fillPersonal(name = 'Anna', email = 'anna@x.com') {
  fireEvent.change(screen.getByLabelText(/common.name/), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/common.email/), { target: { value: email } });
}

function setupDepts() {
  mockDepartments = [
    { _id: 'd1', name: 'Engineering' },
    { _id: 'd2', name: 'Sales' },
  ];
  mockPositions = [{ _id: 'p1', title: 'Engineer', departmentId: 'd1' }];
}

async function toWorkStep() {
  fillPersonal();
  next();
  expect(screen.getByText('wizard.workDetails')).toBeInTheDocument();
}

async function toSalaryStep() {
  await toWorkStep();
  fireEvent.click(screen.getByTestId('select-option-d1'));
  fireEvent.click(screen.getByTestId('select-option-p1'));
  next(); // role & type
  expect(screen.getByText('wizard.roleType')).toBeInTheDocument();
  next(); // salary
  expect(screen.getByTestId('salary-step')).toBeInTheDocument();
}

async function toIdentityStep() {
  await toSalaryStep();
  next(); // identity
  expect(screen.getByText('wizard.identityInfo')).toBeInTheDocument();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', role: 'admin', email: 'admin@x.com' };
  mockDepartments = [];
  mockPositions = [];
  mockQueries.getAllOrganizations = [{ _id: 'org-2', name: 'Org B', country: 'armenia' }];
  mockQueries.getMyOrganization = { _id: 'org-1', name: 'Acme', country: 'armenia' };
  mockQueries.getSalarySettings = { travelAllowance: { enabled: false } };
  mockMutations.createUser = jest.fn().mockResolvedValue('user-99');
  mockMutations.uploadDocument = jest.fn().mockResolvedValue(undefined);
  mockMutations.recordTaxIdVerification = jest.fn().mockResolvedValue(undefined);
  mockMutations.generate = jest.fn().mockResolvedValue(undefined);
  (resolveTravelAllowance as jest.Mock).mockReturnValue(12000);
  (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
  mockDraft = {
    restored: false,
    restoredStep: 0,
    clearDraft: jest.fn(() => {
      mockDraft.restored = false;
    }),
  };
});

afterEach(() => {
  (global as any).fetch = undefined;
});

describe('AddEmployeeModal', () => {
  // ── Rendering & gating ──────────────────────────────────────────────────

  it('renders nothing while closed', () => {
    render(<AddEmployeeModal open={false} onClose={jest.fn()} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('closes when the dialog overlay is dismissed', () => {
    const onClose = jest.fn();
    render(<AddEmployeeModal open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the wizard header, stepper and the first step when open', () => {
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('employees.addEmployee').length).toBeGreaterThan(0);
    expect(screen.getByText('wizard.personalInfo')).toBeInTheDocument();
    expect(screen.getByText('common.step 1 / 6')).toBeInTheDocument();
  });

  it('validates required name and email on the first step', () => {
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    next();
    expect(screen.getByText('common.name errors.required')).toBeInTheDocument();
    expect(screen.getByText('common.email errors.required')).toBeInTheDocument();
    expect(screen.getByText('wizard.personalInfo')).toBeInTheDocument();
  });

  it('rejects an invalid email format', () => {
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    fillPersonal('Anna', 'not-an-email');
    next();
    expect(screen.getByText('errors.invalidEmail')).toBeInTheDocument();
  });

  it('navigates back to the previous step', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toWorkStep();
    expect(screen.getByText('wizard.previous')).toBeInTheDocument();
    prev();
    expect(screen.getByText('wizard.personalInfo')).toBeInTheDocument();
  });

  // ── Work details ────────────────────────────────────────────────────────

  it('validates department and position, then proceeds', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toWorkStep();
    next();
    expect(screen.getByText('employees.department errors.required')).toBeInTheDocument();
    expect(screen.getByText('employees.position errors.required')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('select-option-d1'));
    fireEvent.click(screen.getByTestId('select-option-p1'));
    next();
    expect(screen.getByText('wizard.roleType')).toBeInTheDocument();
  });

  it('clears the position when the department no longer matches it', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toWorkStep();
    fireEvent.click(screen.getByTestId('select-option-d1'));
    fireEvent.click(screen.getByTestId('select-option-p1'));
    expect(screen.getByTestId('select-current-p1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('select-option-d2'));
    // p1 belongs to d1 → the position select falls back to empty
    expect(screen.getByTestId('select-current-')).toBeInTheDocument();
  });

  it('shows the empty-departments hint when the org has no units', async () => {
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toWorkStep();
    expect(screen.getByText('employees.noDepartments')).toBeInTheDocument();
    expect(screen.getByText('employees.noPositions')).toBeInTheDocument();
  });

  // ── Role & type ─────────────────────────────────────────────────────────

  it('toggles the employee type and records the phone and registration date', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toWorkStep();
    fireEvent.click(screen.getByTestId('select-option-d1'));
    fireEvent.click(screen.getByTestId('select-option-p1'));
    next();
    expect(screen.getByText('wizard.roleType')).toBeInTheDocument();

    fireEvent.click(screen.getByText('employees.contractor'));
    fireEvent.change(screen.getByLabelText('common.phone'), { target: { value: '+3749111' } });
    next();
    expect(screen.getByTestId('salary-step')).toBeInTheDocument();
  });

  it('records the registration date on the personal step', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    fireEvent.change(document.querySelector('#emp-regdate') as HTMLInputElement, {
      target: { value: '2026-03-10' },
    });
    fillPersonal();
    next();
    expect(screen.getByText('wizard.workDetails')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('select-option-d1'));
    fireEvent.click(screen.getByTestId('select-option-p1'));
    next();
    expect(screen.getByText('wizard.roleType')).toBeInTheDocument();
  });

  it('changes the role from the role select', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toWorkStep();
    fireEvent.click(screen.getByTestId('select-option-d1'));
    fireEvent.click(screen.getByTestId('select-option-p1'));
    next();
    expect(screen.getByText('wizard.roleType')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('select-option-supervisor'));
    expect(screen.getByTestId('select-current-supervisor')).toBeInTheDocument();
    next();
    expect(screen.getByTestId('salary-step')).toBeInTheDocument();
  });

  it('auto-selects contractor from an email containing "contractor"', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    fillPersonal('Bob', 'bob-contractor@x.com');
    next();
    expect(screen.getByText('wizard.workDetails')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('select-option-d1'));
    fireEvent.click(screen.getByTestId('select-option-p1'));
    next();
    // the type card shows contractor selected
    const contractorBtn = screen.getByText('employees.contractor').closest('button') as HTMLElement;
    expect(contractorBtn.className).toContain('btn-gradient');
  });

  // ── Salary & identity ───────────────────────────────────────────────────

  it('collects a gross salary and moves through the identity step', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toSalaryStep();
    fireEvent.click(screen.getByTestId('salary-gross'));
    fireEvent.click(screen.getByTestId('salary-net')); // now net mode
    expect(screen.getByTestId('salary-step')).toHaveAttribute('data-mode', 'net');

    next(); // to identity
    expect(screen.getByText('wizard.identityInfo')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('passport-number'), { target: { value: 'AB123456' } });
    fireEvent.change(screen.getByTestId('social-card'), { target: { value: 'SC-77' } });
    next(); // to review
    expect(onReviewStep()).toBe(true);
    expect(screen.getByText('AB123456')).toBeInTheDocument();
    // salary shown in net mode
    expect(screen.getByText(/250,000/)).toBeInTheDocument();
  });

  it('sets the date of birth and passport scan from the identity step', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toIdentityStep();
    fireEvent.click(screen.getByTestId('set-dob'));
    fireEvent.click(screen.getByTestId('upload-scan'));
    fireEvent.click(screen.getByTestId('verify-taxid'));
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1991-02-20' } });
    next();
    expect(screen.getByText('scan.pdf')).toBeInTheDocument();
  });

  it('lists the hiring packet documents with mandatory badges and a language select', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toIdentityStep();
    // The t-mock renders fallback strings, so assert on the real labels.
    expect(screen.getByText('Hiring document packet')).toBeInTheDocument();
    expect(screen.getByText('Second document language')).toBeInTheDocument();
    expect(screen.getAllByText('required').length).toBeGreaterThan(0);
    // language select with ru/en/de options
    fireEvent.click(screen.getByTestId('select-option-en'));
    expect(screen.getByTestId('select-current-en')).toBeInTheDocument();
    // unchecking the packet checkbox hides the preview
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.queryByText('required')).not.toBeInTheDocument());
  });

  // ── Review & submit ─────────────────────────────────────────────────────

  it('submits the full payload and generates the hiring packet', async () => {
    setupDepts();
    const onClose = jest.fn();
    render(<AddEmployeeModal open onClose={onClose} />);
    await toIdentityStep();
    fireEvent.change(screen.getByTestId('passport-number'), { target: { value: 'AB123456' } });
    fireEvent.change(screen.getByTestId('social-card'), { target: { value: 'SC-77' } });
    fireEvent.click(screen.getByTestId('set-dob'));
    fireEvent.click(screen.getByTestId('upload-scan'));
    fireEvent.click(screen.getByTestId('verify-taxid'));
    next();
    fireEvent.click(submitButton());

    await waitFor(() => expect(mockMutations.createUser).toHaveBeenCalled());
    expect(mockMutations.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'u1',
        name: 'Anna',
        email: 'anna@x.com',
        role: 'employee',
        departmentId: 'd1',
        positionId: 'p1',
        employeeType: 'staff',
        language: 'en',
        dateOfBirth: '1990-01-15',
      }),
    );
    expect(mockMutations.recordTaxIdVerification).toHaveBeenCalledWith({
      userId: 'user-99',
      status: 'valid_local',
    });
    expect(mockMutations.uploadDocument).toHaveBeenCalledWith({
      userId: 'user-99',
      uploaderId: 'u1',
      category: 'id_document',
      fileName: 'scan.pdf',
      fileUrl: 'https://cdn/x.pdf',
      fileSize: 1024,
    });
    expect(mockMutations.generate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-99', secondaryLocale: 'en' }),
    );
    expect(toast.success).toHaveBeenCalledWith('hiringPacket.createdWithPacket');
    expect(global.fetch).toHaveBeenCalledWith('/api/telegram/notify', expect.anything());
    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('skips the packet generation when unchecked and shows the plain success toast', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toIdentityStep();
    fireEvent.click(screen.getByRole('checkbox')); // generatePacket → off
    next();
    fireEvent.click(submitButton());
    await waitFor(() => expect(mockMutations.createUser).toHaveBeenCalled());
    expect(mockMutations.generate).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('success.created');
  });

  it('submits the computed gross salary when net mode was selected', async () => {
    setupDepts();
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toSalaryStep();
    fireEvent.click(screen.getByTestId('salary-net'));
    next(); // to identity
    expect(screen.getByText('wizard.identityInfo')).toBeInTheDocument();
    next(); // to review
    fireEvent.click(submitButton());
    await waitFor(() => expect(mockMutations.createUser).toHaveBeenCalled());
    const args = mockMutations.createUser.mock.calls[0][0];
    expect(args.baseSalary).toEqual(expect.any(Number));
    expect(args.salaryCurrency).toBe('AMD');
  });

  it('shows the error toast when creation fails', async () => {
    setupDepts();
    mockMutations.createUser = jest.fn().mockRejectedValue(new Error('convex boom'));
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toIdentityStep();
    next();
    fireEvent.click(submitButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('convex boom'));
  });

  it('shows a warning when packet generation fails but the employee is created', async () => {
    setupDepts();
    mockMutations.generate = jest.fn().mockRejectedValue(new Error('packet down'));
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toIdentityStep();
    next();
    fireEvent.click(submitButton());
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('packet down'));
    expect(toast.success).toHaveBeenCalledWith('success.created');
  });

  it('does nothing when there is no current user', async () => {
    setupDepts();
    mockUser = null;
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toIdentityStep();
    next();
    fireEvent.click(submitButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.userIdNotFound'));
    expect(mockMutations.createUser).not.toHaveBeenCalled();
  });

  it('keeps working when the tax-id verification or scan upload rejects', async () => {
    setupDepts();
    mockMutations.recordTaxIdVerification = jest.fn().mockRejectedValue(new Error('nope'));
    mockMutations.uploadDocument = jest.fn().mockRejectedValue(new Error('cdn'));
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toIdentityStep();
    fireEvent.click(screen.getByTestId('upload-scan'));
    fireEvent.click(screen.getByTestId('verify-taxid'));
    next();
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('hiringPacket.createdWithPacket'),
    );
  });

  // ── Superadmin ──────────────────────────────────────────────────────────

  it('adds the organization step for superadmins and includes it in the payload', async () => {
    setupDepts();
    mockUser = { id: 'u1', role: 'superadmin', email: 'root@x.com' };
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    expect(screen.getByText('employees.selectOrganization')).toBeInTheDocument();
    expect(screen.getByText('common.step 1 / 7')).toBeInTheDocument();

    // next without an org → error
    next();
    expect(screen.getByText('employees.organization errors.required')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('select-option-org-2'));
    next();
    expect(screen.getByText('wizard.personalInfo')).toBeInTheDocument();

    // walk through with the org selected
    fillPersonal();
    next();
    fireEvent.click(screen.getByTestId('select-option-d1'));
    fireEvent.click(screen.getByTestId('select-option-p1'));
    next();
    next();
    next();
    next(); // role + salary + identity + review
    expect(onReviewStep()).toBe(true);
    fireEvent.click(submitButton());
    await waitFor(() => expect(mockMutations.createUser).toHaveBeenCalled());
    expect(mockMutations.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-2' }),
    );
  });

  // ── Draft ───────────────────────────────────────────────────────────────

  it('restores a draft and jumps to its saved step', async () => {
    mockDraft = { restored: true, restoredStep: 5, clearDraft: jest.fn() };
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await waitFor(() => expect(onReviewStep()).toBe(true));
    expect(screen.getByTestId('draft-notice')).toBeInTheDocument();
    expect(screen.getByText('Restored Name')).toBeInTheDocument();
    expect(screen.getByText('restored@x.com')).toBeInTheDocument();
  });

  it('start over clears the draft and resets the form', async () => {
    mockDraft = {
      restored: true,
      restoredStep: 5,
      clearDraft: jest.fn(() => {
        mockDraft.restored = false;
      }),
    };
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await waitFor(() => expect(onReviewStep()).toBe(true));
    fireEvent.click(screen.getByText('Start over'));
    expect(mockDraft.clearDraft).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('wizard.personalInfo')).toBeInTheDocument());
  });

  // ── Travel allowance ────────────────────────────────────────────────────

  it('shows the travel allowance preview on review when the policy is enabled', async () => {
    setupDepts();
    mockQueries.getSalarySettings = {
      travelAllowance: { enabled: true, amount: 15000 },
    };
    render(<AddEmployeeModal open onClose={jest.fn()} />);
    await toIdentityStep();
    next();
    expect(screen.getByText('employees.travelAllowance')).toBeInTheDocument();
    expect(resolveTravelAllowance).toHaveBeenCalled();
    expect(screen.getByText(/12,000/)).toBeInTheDocument();
  });
});
