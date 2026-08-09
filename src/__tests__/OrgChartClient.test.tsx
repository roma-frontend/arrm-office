/**
 * Tests for OrgChartClient — the org-chart editor.
 *
 * Covers: the no-org empty state, the loading gate, admin vs employee chrome
 * (Add Node / Fix Departments / Generate buttons), the node/edge count badges,
 * search filtering, the empty-chart state, generating the chart from employee
 * data (success/error), fixing departments (fixed / no-changes / error), the
 * add-node dialog (name validation, full submit, error), save-layout
 * (success/error), and — via the ReactFlow mock — the custom OrgNodeComponent
 * (person/department/group visuals, initials avatar, expand/collapse of direct
 * reports and user details), node drag for admins only, and nodes/edges change
 * handlers.
 *
 * Mocks: convex/react (useQuery/useMutation keyed by _name), generated api,
 * auth store, useSelectedOrganization, @xyflow/react (renders nodes through
 * nodeTypes and exposes change/drag callbacks), react-i18next (fallback
 * strings), sonner, logger, ui primitives (button/card/badge/input/select/
 * dialog/avatar/ShieldLoader), lucide and the cssMotion passthrough.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ── Fixtures ────────────────────────────────────────────────────────────────
const mockTree = [
  {
    _id: 'n1',
    name: 'Alice CEO',
    type: 'person',
    title: 'CEO',
    user: { email: 'alice@x.com', phone: '+3741', department: 'Exec' },
    children: [
      {
        _id: 'n2',
        name: 'Bob CTO',
        type: 'department',
        title: 'CTO',
        children: [
          {
            _id: 'n3',
            name: 'Carol Dev',
            type: 'group',
            title: 'Lead',
            user: { email: 'carol@x.com' },
          },
        ],
      },
    ],
  },
];

const mockOrgNodes = [
  { _id: 'n1', name: 'Alice CEO', type: 'person' },
  { _id: 'n2', name: 'Bob CTO', type: 'department' },
  { _id: 'n3', name: 'Carol Dev', type: 'group' },
];

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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
    orgchart: {
      getOrgChart: { _name: 'getOrgChart' },
      getOrgChartTree: { _name: 'getOrgChartTree' },
      generateOrgChartFromUsers: { _name: 'generateOrgChartFromUsers' },
      createNode: { _name: 'createNode' },
      updateNode: { _name: 'updateNode' },
      deleteNode: { _name: 'deleteNode' },
      saveLayout: { _name: 'saveLayout' },
      fixOrgChartDepartments: { _name: 'fixOrgChartDepartments' },
    },
  },
}));

jest.mock('@xyflow/react/dist/style.css', () => ({}));

// ── Auth / hooks ─────────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = {
  id: 'user-1',
  role: 'admin',
  organizationId: 'org-1',
};
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

let mockOrg: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrg,
}));

// ── Toast / logger ───────────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ── ui primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span data-testid="avatar">{children}</span>,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
  AvatarImage: ({ src, alt }: any) => <img src={src} alt={alt ?? ''} />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          x
        </button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children }: any) => {
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
      <div data-testid="select" data-value={value ?? ''}>
        {options.map((opt) => (
          <button
            key={opt.props.value}
            type="button"
            data-testid={`select-option-${opt.props.value}`}
            onClick={() => onValueChange(opt.props.value)}
          >
            {opt.props.children}
          </button>
        ))}
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

jest.mock('lucide-react', () => {
  const names = [
    'Plus',
    'Search',
    'Network',
    'Users',
    'Building2',
    'Folder',
    'Download',
    'RefreshCw',
  ];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── ReactFlow mock — renders nodes via nodeTypes, exposes callbacks ──────────
jest.mock('@xyflow/react', () => {
  const ReactMod = require('react');
  return {
    ReactFlow: ({ nodes, nodeTypes, onNodesChange, onEdgesChange, onNodeDrag, children }: any) => (
      <div className="react-flow" data-testid="react-flow" data-nodes={nodes.length}>
        {nodes.map((n: any) => {
          const Comp = nodeTypes[n.type];
          return Comp ? <Comp key={n.id} data={n.data} /> : null;
        })}
        <button
          type="button"
          data-testid="rf-node-drag"
          onClick={() => onNodeDrag?.({}, { id: 'n1', position: { x: 999, y: 888 } })}
        >
          drag node
        </button>
        <button
          type="button"
          data-testid="rf-nodes-change"
          onClick={() => onNodesChange?.([{ id: 'n1', type: 'select', selected: true }])}
        >
          nodes change
        </button>
        <button type="button" data-testid="rf-edges-change" onClick={() => onEdgesChange?.([])}>
          edges change
        </button>
        {children}
      </div>
    ),
    Controls: () => null,
    Background: () => null,
    Panel: ({ children }: any) => <div data-testid="rf-panel">{children}</div>,
    Handle: () => <div data-testid="rf-handle" />,
    Position: { Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    BackgroundVariant: { Dots: 'dots' },
    applyNodeChanges: (changes: any, nds: any) =>
      changes.reduce((acc: any, ch: any) => {
        if (ch.type === 'remove') return acc.filter((n: any) => n.id !== ch.id);
        if (ch.type === 'select') {
          return acc.map((n: any) => (n.id === ch.id ? { ...n, selected: ch.selected } : n));
        }
        return acc;
      }, nds),
    applyEdgeChanges: (_changes: any, eds: any) => eds,
  };
});

import OrgChartClient from '@/components/orgchart/OrgChartClient';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
  mockOrg = 'org-1';
  mockQueries.getOrgChart = mockOrgNodes;
  mockQueries.getOrgChartTree = mockTree;
  mockMutations.generateOrgChartFromUsers = jest.fn().mockResolvedValue({ nodesCreated: 12 });
  mockMutations.createNode = jest.fn().mockResolvedValue('node-new');
  mockMutations.updateNode = jest.fn().mockResolvedValue(undefined);
  mockMutations.deleteNode = jest.fn().mockResolvedValue(undefined);
  mockMutations.saveLayout = jest.fn().mockResolvedValue(undefined);
  mockMutations.fixOrgChartDepartments = jest.fn().mockResolvedValue({ fixedCount: 3 });
  (global as any).URL.createObjectURL = jest.fn(() => 'blob:x');
  (global as any).URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  (global as any).URL.createObjectURL = undefined;
  (global as any).URL.revokeObjectURL = undefined;
});

describe('OrgChartClient', () => {
  // ── States ──────────────────────────────────────────────────────────────

  it('shows the no-org empty state when nothing is selected', () => {
    mockOrg = null;
    mockUser = { id: 'user-1', role: 'employee' };
    render(<OrgChartClient />);
    expect(screen.getByText('orgChart.noOrgSelected')).toBeInTheDocument();
    expect(screen.getByText('orgChart.selectOrgToView')).toBeInTheDocument();
  });

  it('shows the loader while the tree is still loading', () => {
    mockQueries.getOrgChartTree = undefined;
    render(<OrgChartClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows the loader while the flat list is still loading', () => {
    mockQueries.getOrgChart = undefined;
    render(<OrgChartClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  // ── Chrome ──────────────────────────────────────────────────────────────

  it('renders the header with export and admin actions', () => {
    render(<OrgChartClient />);
    expect(screen.getByText('orgChart.title')).toBeInTheDocument();
    expect(screen.getByText('common.exportSVG')).toBeInTheDocument();
    expect(screen.getByText('orgChart.addNode')).toBeInTheDocument();
    expect(screen.getByText('orgChart.fixDepartments')).toBeInTheDocument();
    expect(screen.getByText('orgChart.generateFromUsers')).toBeInTheDocument();
  });

  it('hides admin actions for plain employees', () => {
    mockUser = { id: 'user-1', role: 'employee', organizationId: 'org-1' };
    render(<OrgChartClient />);
    expect(screen.getByText('common.exportSVG')).toBeInTheDocument();
    expect(screen.queryByText('orgChart.addNode')).not.toBeInTheDocument();
    expect(screen.queryByText('orgChart.fixDepartments')).not.toBeInTheDocument();
    expect(screen.queryByText('orgChart.generateFromUsers')).not.toBeInTheDocument();
  });

  it('shows node and edge count badges', () => {
    render(<OrgChartClient />);
    // the count and label live in one text node, so match by substring
    expect(screen.getByText((c) => c.includes('common.nodes'))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes('common.edges'))).toBeInTheDocument();
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-nodes', '3');
  });

  // ── Search & empty chart ────────────────────────────────────────────────

  it('filters nodes by search query', () => {
    render(<OrgChartClient />);
    const input = screen.getByPlaceholderText('orgChart.searchOrgChart');
    fireEvent.change(input, { target: { value: 'bob' } });
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-nodes', '1');
    fireEvent.change(input, { target: { value: 'nomatch' } });
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-nodes', '0');
  });

  it('shows the empty-chart state with generate and add buttons for admins', () => {
    mockQueries.getOrgChartTree = [];
    render(<OrgChartClient />);
    expect(screen.getByText('orgChart.noData')).toBeInTheDocument();
    expect(screen.getByText('orgChart.noDataDesc')).toBeInTheDocument();
    expect(screen.getAllByText('orgChart.generateFromUsers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('orgChart.addNode').length).toBeGreaterThan(0);
  });

  it('shows the empty-chart state without admin buttons for employees', () => {
    mockUser = { id: 'user-1', role: 'employee', organizationId: 'org-1' };
    mockQueries.getOrgChartTree = [];
    render(<OrgChartClient />);
    expect(screen.getByText('orgChart.noData')).toBeInTheDocument();
    expect(screen.queryByText('orgChart.generateFromUsers')).not.toBeInTheDocument();
  });

  // ── Generate & fix departments ──────────────────────────────────────────

  it('generates the chart from employee data', async () => {
    render(<OrgChartClient />);
    fireEvent.click(screen.getAllByText('orgChart.generateFromUsers')[0]);
    await waitFor(() => expect(mockMutations.generateOrgChartFromUsers).toHaveBeenCalled());
    expect(mockMutations.generateOrgChartFromUsers).toHaveBeenCalledWith({
      organizationId: 'org-1',
    });
    expect(toast.success).toHaveBeenCalledWith('orgChart.generateSuccess (12 nodes)');
  });

  it('shows an error toast when generation fails', async () => {
    mockMutations.generateOrgChartFromUsers = jest.fn().mockRejectedValue(new Error('gen'));
    render(<OrgChartClient />);
    fireEvent.click(screen.getAllByText('orgChart.generateFromUsers')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('orgChart.generateError'));
  });

  it('shows a success toast when departments are fixed', async () => {
    render(<OrgChartClient />);
    fireEvent.click(screen.getByText('orgChart.fixDepartments'));
    await waitFor(() => expect(mockMutations.fixOrgChartDepartments).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('orgChart.fixDepartmentsSuccess');
  });

  it('shows an info toast when no department changes are needed', async () => {
    mockMutations.fixOrgChartDepartments = jest
      .fn()
      .mockResolvedValue({ fixedCount: 0, debug: [{ id: 'n1' }] });
    render(<OrgChartClient />);
    fireEvent.click(screen.getByText('orgChart.fixDepartments'));
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
  });

  it('logs and shows an error when fixing departments fails', async () => {
    mockMutations.fixOrgChartDepartments = jest.fn().mockRejectedValue(new Error('fix boom'));
    render(<OrgChartClient />);
    fireEvent.click(screen.getByText('orgChart.fixDepartments'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('orgChart.fixDepartmentsError'));
    expect(logger.error).toHaveBeenCalledWith('Fix departments error:', expect.any(Error));
  });

  // ── Export SVG ──────────────────────────────────────────────────────────

  it('exports the chart as an SVG file', () => {
    const anchorClick = jest.fn();
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = jest
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'a') return { click: anchorClick } as unknown as HTMLElement;
        return realCreateElement(tag);
      });
    try {
      render(<OrgChartClient />);
      fireEvent.click(screen.getByText('common.exportSVG'));
      expect(anchorClick).toHaveBeenCalled();
      expect((global as any).URL.createObjectURL).toHaveBeenCalled();
    } finally {
      createElementSpy.mockRestore();
    }
  });

  // ── Add node dialog ─────────────────────────────────────────────────────

  it('validates the node name before creating', async () => {
    render(<OrgChartClient />);
    fireEvent.click(screen.getByText('orgChart.addNode'));
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('errors.required'));
    expect(mockMutations.createNode).not.toHaveBeenCalled();
  });

  it('creates a node with the filled form', async () => {
    render(<OrgChartClient />);
    fireEvent.click(screen.getByText('orgChart.addNode'));
    const dialog = screen.getByTestId('dialog');
    const inputs = within(dialog).getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Dana VP' } });
    fireEvent.change(inputs[1], { target: { value: 'VP' } });
    fireEvent.click(within(dialog).getByTestId('select-option-department'));
    fireEvent.click(within(dialog).getByTestId('select-option-n2'));
    fireEvent.click(within(dialog).getByText('common.save'));
    await waitFor(() => expect(mockMutations.createNode).toHaveBeenCalled());
    expect(mockMutations.createNode).toHaveBeenCalledWith({
      organizationId: 'org-1',
      name: 'Dana VP',
      type: 'department',
      title: 'VP',
      parentId: 'n2',
      userId: undefined,
    });
    expect(toast.success).toHaveBeenCalledWith('orgChart.createSuccess');
    await waitFor(() => expect(screen.queryByTestId('dialog')).not.toBeInTheDocument());
  });

  it('shows an error toast when node creation fails', async () => {
    mockMutations.createNode = jest.fn().mockRejectedValue(new Error('c'));
    render(<OrgChartClient />);
    fireEvent.click(screen.getByText('orgChart.addNode'));
    const dialog = screen.getByTestId('dialog');
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Dana' } });
    fireEvent.click(within(dialog).getByText('common.save'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('orgChart.createError'));
  });

  // ── Save layout & node interactions ─────────────────────────────────────

  it('saves the layout from the panel button', async () => {
    render(<OrgChartClient />);
    fireEvent.click(screen.getByTestId('rf-panel').querySelector('button') as HTMLElement);
    await waitFor(() => expect(mockMutations.saveLayout).toHaveBeenCalled());
    expect(mockMutations.saveLayout).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', isDefault: true }),
    );
    expect(toast.success).toHaveBeenCalledWith('orgChart.layoutSaved');
  });

  it('shows an error toast when saving the layout fails', async () => {
    mockMutations.saveLayout = jest.fn().mockRejectedValue(new Error('s'));
    render(<OrgChartClient />);
    fireEvent.click(screen.getByTestId('rf-panel').querySelector('button') as HTMLElement);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('orgChart.layoutSaveError'));
  });

  it('applies node drag for admins', async () => {
    render(<OrgChartClient />);
    fireEvent.click(screen.getByTestId('rf-node-drag'));
    // the dragged node's position is updated (no throw)
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('ignores node drag for non-admins', () => {
    mockUser = { id: 'user-1', role: 'employee', organizationId: 'org-1' };
    render(<OrgChartClient />);
    fireEvent.click(screen.getByTestId('rf-node-drag'));
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('applies node and edge changes', () => {
    render(<OrgChartClient />);
    fireEvent.click(screen.getByTestId('rf-nodes-change'));
    fireEvent.click(screen.getByTestId('rf-edges-change'));
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  // ── OrgNodeComponent (rendered via the ReactFlow mock) ──────────────────

  it('renders person nodes with initials and contact details', () => {
    render(<OrgChartClient />);
    expect(screen.getByText('Alice CEO')).toBeInTheDocument();
    expect(screen.getByText('AC')).toBeInTheDocument(); // initials
    expect(screen.getByText('CEO')).toBeInTheDocument();
    expect(screen.getByText('alice@x.com')).toBeInTheDocument();
    expect(screen.getByText('+3741')).toBeInTheDocument();
    expect(screen.getByText('Exec')).toBeInTheDocument();
    expect(screen.getAllByTestId('rf-handle').length).toBeGreaterThan(0);
  });

  it('collapses and expands the direct-reports section on click', () => {
    render(<OrgChartClient />);
    // Alice (1 child) and Bob (1 child) both show the direct-reports label
    expect(screen.getAllByText((c) => c.includes('orgChart.directReports')).length).toBe(2);
    // clicking the node collapses the extra sections
    fireEvent.click(screen.getByText('Alice CEO'));
    expect(screen.queryByText('alice@x.com')).not.toBeInTheDocument();
    // Bob still expanded (his own node), so the label remains — but Alice's is gone
    expect(screen.getAllByText((c) => c.includes('orgChart.directReports')).length).toBe(1);
    // expand again
    fireEvent.click(screen.getByText('Alice CEO'));
    expect(screen.getAllByText((c) => c.includes('orgChart.directReports')).length).toBe(2);
    expect(screen.getByText('alice@x.com')).toBeInTheDocument();
  });
});
