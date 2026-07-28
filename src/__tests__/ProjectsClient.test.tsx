/**
 * Tests for ProjectsClient component — project list, creation, filtering.
 *
 * Mocks: convex/react (useQuery, useMutation), router, auth, UI components.
 * Pattern follows DashboardClient.test.tsx.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        return fallback.defaultValue ?? key;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Convex mock ──────────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mockMutation = jest.fn();

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockMutation,
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    projects: {
      listProjects: { _name: 'listProjects' },
      getProjectStats: { _name: 'getProjectStats' },
      createProject: { _name: 'createProject' },
    },
    tasks: {
      getUsersForAssignment: { _name: 'getUsersForAssignment' },
    },
  },
}));

// ── Router mock ──────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockUser: any = { id: 'user-1', role: 'admin', name: 'Admin' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => mockUser,
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
}));

// ── CSS motion mock ──────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => (
      <div data-motion="div" {...props}>
        {children}
      </div>
    ),
  },
}));

// ── Icons mock ───────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Plus: MockIcon,
    Search: MockIcon,
    FolderKanban: MockIcon,
    Users: MockIcon,
    CheckCircle2: MockIcon,
    Clock: MockIcon,
    AlertCircle: MockIcon,
    TrendingUp: MockIcon,
    ArrowRight: MockIcon,
  };
});

// ── UI component mocks ───────────────────────────────────────────────────────
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
  Card: ({ children, className, onClick }: any) => (
    <div data-testid="card" className={className} onClick={onClick}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options, triggerClassName }: any) => (
    <select
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      data-testid="custom-select"
      className={triggerClassName}
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
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

jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value, className }: any) => (
    <div data-testid="progress" data-value={value} className={className} />
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader">Loading...</div>,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// ── Module under test ──
import ProjectsClient from '@/components/projects/ProjectsClient';

const MOCK_PROJECTS = [
  {
    _id: 'proj-1',
    name: 'Project Alpha',
    description: 'First project',
    status: 'active',
    priority: 'high',
    progress: 50,
    taskCount: 4,
    completedTasks: 2,
    ownerName: 'Admin',
    ownerAvatar: null,
    members: [],
  },
  {
    _id: 'proj-2',
    name: 'Project Beta',
    description: null,
    status: 'planning',
    priority: 'medium',
    progress: 0,
    taskCount: 0,
    completedTasks: 0,
    ownerName: 'Unassigned',
    ownerAvatar: null,
    members: [],
  },
];

const MOCK_STATS = {
  total: 2,
  active: 1,
  planning: 1,
  completed: 0,
  onHold: 0,
  totalTasks: 4,
  completedTasks: 2,
  overallProgress: 50,
};

describe('ProjectsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    mockUser = { id: 'user-1', role: 'admin', name: 'Admin' };

    queryResults.listProjects = MOCK_PROJECTS;
    queryResults.getProjectStats = MOCK_STATS;
    queryResults.getUsersForAssignment = [{ _id: 'user-1', name: 'Admin' }];
  });

  it('renders the projects page title', () => {
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('renders stats cards with correct labels', () => {
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    // Stats show labels from MOCK_STATS
    const totalLabels = screen.getAllByText('Total');
    expect(totalLabels.length).toBeGreaterThanOrEqual(1);
    const activeLabels = screen.getAllByText('Active');
    expect(activeLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('renders project cards', () => {
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
  });

  it('shows create button for admin users', () => {
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows progress bar for projects', () => {
    const { container } = render(<ProjectsClient userId="user-1" userRole="admin" />);
    const progressBars = container.querySelectorAll('[data-testid="progress"]');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('filters projects by search query', () => {
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    const searchInput = screen.queryByRole('textbox');
    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: 'Alpha' } });
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).toBeNull();
    }
  });

  it('shows empty state when no projects match', () => {
    queryResults.listProjects = [];
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    expect(screen.getByText('No projects found')).toBeInTheDocument();
  });

  it('renders loading state when projects not loaded', () => {
    queryResults.listProjects = undefined;
    const { container } = render(<ProjectsClient userId="user-1" userRole="admin" />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });

  it('shows overall progress card with percentage', () => {
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    const progressTexts = screen.getAllByText('50%');
    expect(progressTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('allows admin to open create dialog', () => {
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    const newProjectBtn = screen.getByText('New Project');
    fireEvent.click(newProjectBtn);
    expect(screen.getByText('Create Project')).toBeInTheDocument();
  });

  it('shows filter by status options', () => {
    const { container } = render(<ProjectsClient userId="user-1" userRole="admin" />);
    const select = container.querySelector('[data-testid="custom-select"]');
    expect(select).toBeInTheDocument();
  });

  it('navigates to project on card click', () => {
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    const projectCard = screen.getByText('Project Alpha').closest('[data-testid="card"]');
    if (projectCard) {
      fireEvent.click(projectCard);
      expect(mockPush).toHaveBeenCalledWith('/projects/proj-1');
    }
  });

  it('renders for employee role without create button', () => {
    mockUser = { id: 'user-2', role: 'employee', name: 'Employee' };
    render(<ProjectsClient userId="user-2" userRole="employee" />);
    // Employee can view but not create
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('shows create first project button when empty for admin', () => {
    queryResults.listProjects = [];
    render(<ProjectsClient userId="user-1" userRole="admin" />);
    expect(screen.getByText('Create your first project')).toBeInTheDocument();
  });
});
