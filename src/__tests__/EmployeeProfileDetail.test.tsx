/**
 * Tests for EmployeeProfileDetail — employee profile with Convex queries/mutations,
 * conditional rendering based on roles, delete flow, ratings, etc.
 *
 * Pattern: AIGovernancePanel.test.tsx — query results driven by _name map.
 */

import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback)
        return fallback.defaultValue ?? key;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Convex query mock ────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mockMutation = jest.fn();

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockMutation,
  // The hiring packet panel reaches for the client directly to fetch a
  // signature image on demand when exporting a signed document.
  useConvex: () => ({ query: jest.fn().mockResolvedValue(null) }),
}));

// ── API mock (relative path matching EmployeeProfileDetail's import) ─────────
jest.mock('../../convex/_generated/api', () => ({
  api: {
    users: {
      queries: { getUserById: { _name: 'getUserById' } },
      mutations: { deleteUser: { _name: 'deleteUser' } },
    },
    employeeProfiles: { getEmployeeProfile: { _name: 'getEmployeeProfile' } },
    // Hiring packet panel (rendered inside the profile). Left unstubbed in
    // `queryResults`, so `useQuery` returns undefined and the panel shows its
    // loading state instead of interfering with these assertions.
    hiringPackets: {
      listForEmployee: { _name: 'listForEmployee' },
      applyDocxOverride: { _name: 'applyDocxOverride' },
      revertToTemplate: { _name: 'revertToTemplate' },
      setSkipped: { _name: 'setSkipped' },
      sendForSignature: { _name: 'sendForSignature' },
      ensureDocumentNumber: { _name: 'ensureDocumentNumber' },
    },
    documentLibrary: { getEmployeeMergeData: { _name: 'getEmployeeMergeData' } },
    signatures: { getDocument: { _name: 'getSignatureDocument' } },
    aiEvaluator: { calculateEmployeeScore: { _name: 'calculateEmployeeScore' } },
    supervisorRatings: {
      getLatestRating: { _name: 'getLatestRating' },
      getEmployeeRatings: { _name: 'getEmployeeRatings' },
      getRatingEligibility: { _name: 'getRatingEligibility' },
    },
    timeTracking: { getMonthlyStats: { _name: 'getMonthlyStats' } },
    settlement: { getSettlementPreview: { _name: 'getSettlementPreview' } },
    probation: {
      getProbationForEmployee: { _name: 'getProbationForEmployee' },
      startProbation: { _name: 'probationStart' },
      extendProbation: { _name: 'probationExtend' },
      completeProbation: { _name: 'probationComplete' },
    },
  },
}));

// ── next/navigation mock (ProbationCard reads ?probation=extend) ────────────
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/employees/e-1',
  useSearchParams: () => new URLSearchParams(),
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockCurrentUser: any = { id: 'admin-1', role: 'admin', name: 'Admin', organizationId: 'org-1' };

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockCurrentUser }),
}));

// ── UI mocks ─────────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children, as }: any) => {
    const Tag = as || 'h3';
    return <Tag data-testid="card-title">{children}</Tag>;
  },
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, ...props }: any) => (
    <button
      data-testid="button"
      data-variant={variant || 'default'}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ size, variant }: any) => <div data-testid="shield-loader">Loading...</div>,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }: any) => <div data-testid="dialog-description">{children}</div>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: { div: ({ children }: any) => <div>{children}</div> },
  AnimatePresence: ({ children }: any) => <div data-testid="animate-presence">{children}</div>,
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="icon" />;
  return {
    User: MockIcon,
    Mail: MockIcon,
    Phone: MockIcon,
    Building2: MockIcon,
    Calendar: MockIcon,
    Briefcase: MockIcon,
    Star: MockIcon,
    Clock: MockIcon,
    Target: MockIcon,
    Award: MockIcon,
    AlertTriangle: MockIcon,
    Plus: MockIcon,
    Edit2: MockIcon,
    Trash2: MockIcon,
    IdCard: MockIcon,
    Calculator: MockIcon,
    Download: MockIcon,
    Loader2: MockIcon,
    Wallet: MockIcon,
    CalendarDays: MockIcon,
    LayoutGrid: MockIcon,
    FileText: MockIcon,
    BadgeCheck: MockIcon,
    ShieldAlert: MockIcon,
    ShieldQuestion: MockIcon,
    Hourglass: MockIcon,
    CalendarClock: MockIcon,
    CheckCircle2: MockIcon,
    XCircle: MockIcon,
  };
});

jest.mock('next/image', () => ({ src, alt, ...props }: any) => (
  <img src={src} alt={alt} {...props} />
));

jest.mock('@/components/attendance/SupervisorRatingForm', () => ({
  SupervisorRatingForm: ({ employeeName, onClose }: any) => (
    <div data-testid="rating-form">
      <span>Rating for {employeeName}</span>
      <button data-testid="close-rating" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

jest.mock('@/components/employees/EditEmployeeModal', () => ({
  EditEmployeeModal: ({ open, onClose }: any) =>
    open ? (
      <div data-testid="edit-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

jest.mock('@/components/employees/EmployeeProfileHero', () => ({
  __esModule: true,
  default: ({
    employee,
    score,
    canEdit,
    canDelete,
    canRate,
    showRatingForm,
    onEdit,
    onDelete,
    onRate,
  }: any) => (
    <div data-testid="employee-profile-hero">
      <h2 data-testid="employee-name">{employee?.name}</h2>
      <span data-testid="employee-position">{employee?.position}</span>
      <span data-testid="employee-email">{employee?.email}</span>
      <span data-testid="employee-phone">{employee?.phone}</span>
      <span data-testid="employee-department">{employee?.department}</span>
      <span data-testid="badge" data-variant="default">
        roles.{employee?.role}
      </span>
      <span data-testid="badge" data-variant="secondary">
        employeeTypes.{employee?.employeeType}
      </span>
      <span data-testid="badge" data-variant="outline">
        statuses.{employee?.isActive ? 'active' : 'inactive'}
      </span>
      {score && (
        <span data-testid="ai-score">
          <span>{'employeeProfile.aiScore'}</span>
          <span>{score.overallScore}/100</span>
        </span>
      )}
      {canRate && (
        <button data-testid="rate-button" onClick={onRate}>
          {'employeeProfile.ratePerformance'}
        </button>
      )}
      {canEdit && (
        <button data-testid="edit-button" onClick={onEdit} data-variant="outline">
          Edit
        </button>
      )}
      {canDelete && (
        <button data-testid="delete-button" onClick={onDelete}>
          Delete
        </button>
      )}
      {showRatingForm && <div data-testid="rating-form-placeholder" />}
    </div>
  ),
}));

jest.mock('@/components/employees/ReportingLineWidget', () => ({
  // Named export — EmployeeProfileDetail does `import { ReportingLineWidget }`
  ReportingLineWidget: () => <div data-testid="reporting-line-widget" />,
}));

jest.mock('@/components/employees/ExtendedProfileSection', () => ({
  __esModule: true,
  default: ({ data, canEdit, onEdit }: any) => <div data-testid="extended-profile-section" />,
  // EmployeeProfileDetail uses this to decide whether the Profile tab has
  // anything to show.
  hasExtendedProfileData: (data: any) => Boolean(data?.address || data?.workFormat),
}));

// ── Tabs mock (pattern: DocumentsClient.test.tsx) ────────────────────────────
jest.mock('@/components/ui/tabs', () => {
  const ReactMod = require('react');
  const TabsCtx = ReactMod.createContext({ value: '', setValue: (_v: string) => {} });
  return {
    Tabs: ({ defaultValue, value, onValueChange, children }: any) => {
      const [internal, setInternal] = ReactMod.useState(value ?? defaultValue ?? '');
      const active = value !== undefined ? value : internal;
      const setValue = (v: string) => {
        setInternal(v);
        onValueChange?.(v);
      };
      return <TabsCtx.Provider value={{ value: active, setValue }}>{children}</TabsCtx.Provider>;
    },
    TabsList: ({ children }: any) => <div>{children}</div>,
    TabsTrigger: ({ value, children }: any) => {
      const ctx = ReactMod.useContext(TabsCtx);
      return (
        <button type="button" onClick={() => ctx.setValue(value)} data-value={value}>
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children }: any) => {
      const ctx = ReactMod.useContext(TabsCtx);
      return ctx.value === value ? <div data-testid={`tab-${value}`}>{children}</div> : null;
    },
  };
});

jest.mock('@/components/employees/HiringPacketPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="hiring-packet-panel" />,
}));

jest.mock('@/components/employees/AssignManagerModal', () => ({
  // Named export — EmployeeProfileDetail does `import { AssignManagerModal }`
  AssignManagerModal: ({ open }: any) => (open ? <div data-testid="assign-manager-modal" /> : null),
}));

jest.mock('@/components/employees/EditExtendedProfileModal', () => ({
  __esModule: true,
  default: ({ open }: any) => (open ? <div data-testid="edit-extended-modal" /> : null),
}));

jest.mock('@/components/settlement/SettlementPreviewDialog', () => ({
  __esModule: true,
  default: ({ open }: any) => (open ? <div data-testid="settlement-dialog" /> : null),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('date-fns', () => ({
  format: () => 'Jan 1, 2024',
}));

jest.mock('date-fns/locale', () => ({
  enUS: {},
  ru: {},
  hy: {},
}));

jest.mock('i18next', () => ({
  language: 'en',
}));

// ── Module under test ──
import EmployeeProfileDetail from '@/components/employees/EmployeeProfileDetail';
import type { Id } from '../../convex/_generated/dataModel';

const mockEmployeeId = 'emp-1' as Id<'users'>;

// The profile is tabbed — Overview is the landing tab, so anything else has to
// be selected before its content is in the DOM. The `t` mock returns the
// fallback, so triggers are labelled in English.
const openTab = (label: 'Overview' | 'Profile' | 'Performance' | 'Documents') => {
  fireEvent.click(screen.getByText(label));
};

const defaultEmployee = {
  _id: 'emp-1',
  organizationId: 'org-1',
  name: 'John Doe',
  email: 'john@example.com',
  role: 'employee',
  employeeType: 'full_time',
  isActive: true,
  phone: '+1234567890',
  department: 'Engineering',
  position: 'Senior Developer',
  createdAt: Date.now() - 365 * 24 * 60 * 60 * 1000,
  paidLeaveBalance: 15,
  sickLeaveBalance: 10,
  familyLeaveBalance: 5,
  avatarUrl: '',
};

const defaultMonthlyStats = {
  totalDays: 20,
  totalWorkedHours: 160,
  punctualityRate: 95,
  lateDays: 2,
  earlyLeaveDays: 1,
};

const defaultScore = {
  overallScore: 85,
  breakdown: { performance: 90, attendance: 85, behavior: 80, leaveHistory: 85 },
};

const defaultLatestRating = {
  overallRating: 4.2,
  qualityOfWork: 4,
  efficiency: 4,
  teamwork: 5,
  initiative: 4,
  communication: 4,
  reliability: 4,
  strengths: 'Great team player',
  areasForImprovement: 'Could improve documentation',
  generalComments: 'Solid performer overall',
  supervisor: { name: 'Supervisor' },
  ratingPeriod: '2024-Q1',
};

const defaultProfile = {
  profile: {
    passportNumber: 'AB123456',
    nationality: 'Armenian',
    passportIssueDate: '2020-01-01',
    biography: {
      skills: ['JavaScript', 'React'],
      languages: ['English', 'Russian'],
    },
  },
  documents: [{ _id: 'doc-1', fileName: 'resume.pdf', category: 'CV', uploadedAt: Date.now() }],
};

describe('EmployeeProfileDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { id: 'admin-1', role: 'admin', name: 'Admin', organizationId: 'org-1' };
    queryResults = {
      getUserById: undefined,
      getEmployeeProfile: undefined,
      calculateEmployeeScore: undefined,
      getLatestRating: undefined,
      getMonthlyStats: undefined,
      getEmployeeRatings: undefined,
      getSettlementPreview: undefined,
      // Who may rate whom is now a server decision (reporting line + head
      // policy), so the Rate button follows `getRatingEligibility` instead of
      // comparing roles in the client. Allowed by default; the tests that care
      // seed a refusal.
      getRatingEligibility: { allowed: true, reason: null },
    };
  });

  describe('Loading state', () => {
    it('shows loading text when employee is undefined', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('employees.loadingProfile')).toBeInTheDocument();
    });
  });

  describe('Employee header', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('renders employee name', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('renders employee position', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('Senior Developer')).toBeInTheDocument();
    });

    it('renders role, type, and status badges', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('roles.employee')).toBeInTheDocument();
      expect(screen.getByText('employeeTypes.full_time')).toBeInTheDocument();
      expect(screen.getByText('statuses.active')).toBeInTheDocument();
    });

    it('renders employee email', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('renders employee phone', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('+1234567890')).toBeInTheDocument();
    });

    it('renders department', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });

    it('renders AI score when available', () => {
      queryResults.calculateEmployeeScore = defaultScore;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('employeeProfile.aiScore')).toBeInTheDocument();
      expect(screen.getByText('85/100')).toBeInTheDocument();
    });
  });

  describe('Superadmin permissions', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('shows rating button for admin/supervisor', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('employeeProfile.ratePerformance')).toBeInTheDocument();
    });
  });

  describe('Attendance stats', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('renders attendance stats', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('160h')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
    });

    it('shows alert when late days > 0', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText(/attendance\.(lateArrivals|earlyLeaves)/)).toBeInTheDocument();
    });
  });

  describe('Performance rating', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('renders latest rating card', () => {
      queryResults.getLatestRating = defaultLatestRating;
      queryResults.getEmployeeRatings = [defaultLatestRating];
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Performance');
      expect(screen.getByText('employeeProfile.latestPerformanceRating')).toBeInTheDocument();
      expect(screen.getByText('4.2')).toBeInTheDocument();
    });

    it('renders strengths section', () => {
      queryResults.getLatestRating = defaultLatestRating;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Performance');
      expect(screen.getByText('Great team player')).toBeInTheDocument();
    });

    it('renders areas for improvement', () => {
      queryResults.getLatestRating = defaultLatestRating;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Performance');
      expect(screen.getByText('Could improve documentation')).toBeInTheDocument();
    });

    it('renders general comments', () => {
      queryResults.getLatestRating = defaultLatestRating;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Performance');
      expect(screen.getByText('Solid performer overall')).toBeInTheDocument();
    });
  });

  describe('Leave balances', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('renders leave balances', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('AI performance breakdown', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('renders performance breakdown scores', () => {
      queryResults.calculateEmployeeScore = defaultScore;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      // 90% = performance, 80% = behavior — unique values
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
      // 85% appears twice (attendance + leaveHistory), use getAllByText
      const eightyFives = screen.getAllByText('85%');
      expect(eightyFives.length).toBe(2);
    });
  });

  describe('Identity / biography / documents', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('renders passport number from profile', () => {
      queryResults.getEmployeeProfile = defaultProfile;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Profile');
      expect(screen.getByText('AB123456')).toBeInTheDocument();
    });

    it('renders nationality from profile', () => {
      queryResults.getEmployeeProfile = defaultProfile;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Profile');
      expect(screen.getByText('Armenian')).toBeInTheDocument();
    });

    it('renders skills from biography', () => {
      queryResults.getEmployeeProfile = defaultProfile;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Profile');
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
      expect(screen.getByText('React')).toBeInTheDocument();
    });

    it('renders languages from biography', () => {
      queryResults.getEmployeeProfile = defaultProfile;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Profile');
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('Russian')).toBeInTheDocument();
    });

    it('renders documents section', () => {
      queryResults.getEmployeeProfile = defaultProfile;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Documents');
      expect(screen.getByText('resume.pdf')).toBeInTheDocument();
    });
  });

  describe('No rating state', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('shows add first rating button when latestRating is null', () => {
      queryResults.getLatestRating = null;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Performance');
      expect(screen.getByText('employeeProfile.noRatingYet')).toBeInTheDocument();
      expect(screen.getByText('employeeProfile.addFirstRating')).toBeInTheDocument();
    });

    it('opens rating form when add first rating is clicked', () => {
      queryResults.getLatestRating = null;
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      openTab('Performance');
      fireEvent.click(screen.getByText('employeeProfile.addFirstRating'));
      expect(screen.getByTestId('rating-form')).toBeInTheDocument();
    });
  });

  describe('Supervisor rating form', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('toggles rating form on rate button click', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      fireEvent.click(screen.getByText('employeeProfile.ratePerformance'));
      expect(screen.getByTestId('rating-form')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('close-rating'));
      expect(screen.queryByTestId('rating-form')).not.toBeInTheDocument();
    });

    it('follows the rate action into the Performance tab', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      // Rate is in the hero, above the tabs — the form it opens lives in the
      // Performance tab, so selecting that tab is part of the action.
      expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      fireEvent.click(screen.getByText('employeeProfile.ratePerformance'));
      expect(screen.getByTestId('tab-performance')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-overview')).not.toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('lands on the Overview tab', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      expect(screen.getByTestId('reporting-line-widget')).toBeInTheDocument();
    });

    it('hides the Profile tab when there is no profile data and the viewer cannot edit', () => {
      mockCurrentUser = { id: 'peer-1', role: 'employee', name: 'Peer', organizationId: 'org-1' };
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.queryByText('Profile')).not.toBeInTheDocument();
    });

    it('offers the Profile tab to an editor even with an empty profile', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });
  });

  describe('Edit modal', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('opens edit modal on edit button click', () => {
      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);

      // Find the edit button from EmployeeProfileHero mock
      const editBtn = screen.getByTestId('edit-button');
      fireEvent.click(editBtn);

      expect(screen.getByTestId('edit-modal')).toBeInTheDocument();
    });
  });

  describe('Organization scoping', () => {
    beforeEach(() => {
      queryResults.getUserById = defaultEmployee;
      queryResults.getMonthlyStats = defaultMonthlyStats;
    });

    it('hides edit/delete buttons for an admin from a different organization', () => {
      mockCurrentUser = {
        id: 'admin-2',
        role: 'admin',
        name: 'Other Org Admin',
        organizationId: 'org-999',
      };
      // Cross-org refusals come from the server for rating, same as for editing.
      queryResults.getRatingEligibility = {
        allowed: false,
        reason: 'Access denied: cross-organization operation',
      };

      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);

      expect(screen.queryByTestId('edit-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('rate-button')).not.toBeInTheDocument();
    });

    it('shows edit/delete/rate buttons for a superadmin regardless of organization', () => {
      mockCurrentUser = {
        id: 'super-1',
        role: 'superadmin',
        name: 'Superadmin',
        organizationId: 'org-999',
      };

      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);

      expect(screen.getByTestId('edit-button')).toBeInTheDocument();
      expect(screen.getByTestId('delete-button')).toBeInTheDocument();
      expect(screen.getByTestId('rate-button')).toBeInTheDocument();
    });

    // Equal role used to mean "unrateable", which is precisely why a CEO could
    // not rate their own HR admin. Rating now follows the reporting line, so an
    // admin target is rateable when the server says so.
    it('shows the rate button on an admin colleague when the server allows it', () => {
      queryResults.getUserById = { ...defaultEmployee, role: 'admin' };

      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);

      expect(screen.getByTestId('edit-button')).toBeInTheDocument();
      expect(screen.getByTestId('rate-button')).toBeInTheDocument();
    });

    it('hides the rate button when the target is the head of the organization', () => {
      queryResults.getUserById = { ...defaultEmployee, role: 'admin' };
      queryResults.getRatingEligibility = {
        allowed: false,
        reason: 'The head of the organization is not rated',
      };

      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);

      expect(screen.getByTestId('edit-button')).toBeInTheDocument();
      expect(screen.queryByTestId('rate-button')).not.toBeInTheDocument();
    });

    it('hides the rate button when the target is inactive (non-superadmin viewer)', () => {
      queryResults.getUserById = { ...defaultEmployee, isActive: false };
      queryResults.getRatingEligibility = {
        allowed: false,
        reason: 'Cannot rate inactive employees',
      };

      render(<EmployeeProfileDetail employeeId={mockEmployeeId} />);

      expect(screen.getByTestId('edit-button')).toBeInTheDocument();
      expect(screen.queryByTestId('rate-button')).not.toBeInTheDocument();
    });
  });
});
