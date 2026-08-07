/**
 * Tests for AssetsClient — catalog grid/list, search, asset detail, assign and
 * return dialogs, delete confirmation, my-assets/requests/maintenance tabs.
 *
 * Mocks: convex-typed, theme, StatsCard, recharts (dynamic-imports), AssetWizard
 * and QRCodeModal stubs, auth store, selected org, toast, UI primitives, lucide.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];

jest.mock('@/lib/convex-typed', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      return Promise.resolve();
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    assets: {
      getAssetStats: { _name: 'getAssetStats' },
      listAssets: { _name: 'listAssets' },
      listEmployeeAssets: { _name: 'listEmployeeAssets' },
      listAssetRequests: { _name: 'listAssetRequests' },
      getMyAssetRequests: { _name: 'getMyAssetRequests' },
      listMaintenance: { _name: 'listMaintenance' },
      getAsset: { _name: 'getAsset' },
      approveAssetRequest: { _name: 'approveAssetRequest' },
      rejectAssetRequest: { _name: 'rejectAssetRequest' },
      deleteAsset: { _name: 'deleteAsset' },
      assignAsset: { _name: 'assignAsset' },
      returnAsset: { _name: 'returnAsset' },
      sendMovementForm: { _name: 'sendMovementForm' },
    },
    tasks: { getUsersForAssignment: { _name: 'getUsersForAssignment' } },
    signatures: { getDocument: { _name: 'getDocument' } },
  },
}));

let mockUser: any = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
let mockSelectedOrg: string | null = 'org-1';
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

jest.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

jest.mock('@/components/dashboard/StatsCard', () => ({
  StatsCard: ({ title, value }: any) => (
    <div data-testid="stats-card">
      {title}: {value}
    </div>
  ),
}));

jest.mock('@/lib/dynamic-imports', () => {
  const Chart = ({ children }: any) => <div data-testid="chart">{children}</div>;
  return {
    ResponsiveContainer: Chart,
    BarChart: Chart,
    Bar: () => <div data-testid="bar" />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
    Cell: () => <div />,
  };
});

jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

jest.mock('@/components/assets/AssetWizard', () => ({
  __esModule: true,
  default: () => <div data-testid="asset-wizard" />,
}));

jest.mock('@/components/assets/QRCodeModal', () => ({
  __esModule: true,
  default: ({ open }: any) => (open ? <div data-testid="qr-modal" /> : null),
}));

jest.mock('@/lib/exportDocument', () => ({
  exportDocumentToPDF: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/assetFormDocument', () => ({
  parseAssetFormContent: () => null,
  assetFormTitle: () => 'Movement Form',
  assetFormFileName: () => 'form.pdf',
  assetFormDocumentNumber: () => 'N-1',
  assetFormInputFromParsed: (parsed: any) => parsed,
  buildAssetFormBlocks: () => [],
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className, asChild, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      className={className}
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
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => (
    <span className={className} data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div data-testid="select">{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <span>{children}</span>,
}));

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
      const { setValue } = ReactMod.useContext(TabsCtx);
      return (
        <button type="button" onClick={() => setValue(value)}>
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children }: any) => {
      const { value: active } = ReactMod.useContext(TabsCtx);
      return active === value ? <div data-testid={`tab-${value}`}>{children}</div> : null;
    },
  };
});

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Monitor: Icon,
    Laptop: Icon,
    Smartphone: Icon,
    Mouse: Icon,
    Sofa: Icon,
    Key: Icon,
    Car: Icon,
    Package: Icon,
    Plus: Icon,
    Search: Icon,
    Filter: Icon,
    ArrowUpRight: Icon,
    ArrowDownLeft: Icon,
    Wrench: Icon,
    ClipboardCheck: Icon,
    CheckCircle: Icon,
    X: Icon,
    UserPlus: Icon,
    History: Icon,
    FileSignature: Icon,
    FileText: Icon,
    Send: Icon,
    Download: Icon,
    LayoutGrid: Icon,
    List: Icon,
    MapPin: Icon,
    QrCode: Icon,
  };
});

import AssetsClient from '@/components/assets/AssetsClient';
import { toast } from 'sonner';

const ASSETS = [
  {
    _id: 'a-1',
    name: 'MacBook Pro',
    category: 'laptop',
    brand: 'Apple',
    model: 'M3',
    serialNumber: 'SN-001',
    status: 'available',
    location: 'Yerevan',
    purchasePrice: 2500,
    currency: 'USD',
    condition: 'good',
    isAssigned: false,
  },
  {
    _id: 'a-2',
    name: 'Dell Monitor',
    category: 'monitor',
    brand: 'Dell',
    model: 'U2723',
    serialNumber: 'SN-002',
    status: 'assigned',
    location: 'Office',
    currentUser: { name: 'Bob Smith' },
    condition: 'good',
    isAssigned: true,
  },
];

const STATS = {
  total: 2,
  available: 1,
  assigned: 1,
  maintenance: 0,
  pendingRequests: 1,
  retired: 0,
  lost: 0,
  byCategory: { laptop: 1, monitor: 1 },
};

const ASSET_DETAIL = {
  _id: 'a-1',
  name: 'MacBook Pro',
  category: 'laptop',
  brand: 'Apple',
  model: 'M3',
  serialNumber: 'SN-001',
  status: 'available',
  location: 'Yerevan',
  condition: 'good',
  organizationId: 'org-1',
  currentUser: undefined,
  currentAssignment: undefined,
  assignments: [
    {
      _id: 'asg-9',
      status: 'returned',
      userName: 'Old User',
      assignedAt: 1_749_000_000_000,
    },
  ],
  maintenanceHistory: [],
};

const USERS = [{ _id: 'u-2', name: 'Bob Smith', position: 'Engineer' }];

const EMPLOYEE_ASSETS = [
  {
    _id: 'ea-1',
    assetId: 'a-2',
    assetName: 'Dell Monitor',
    assetCategory: 'monitor',
    assetBrand: 'Dell',
    assetModel: 'U2723',
    assetSerialNumber: 'SN-002',
    status: 'active',
    assignedAt: 1_750_000_000_000,
    movementFormStatus: 'pending',
  },
];

const REQUESTS = [
  {
    _id: 'r-1',
    category: 'laptop',
    requesterName: 'Anna Petrova',
    reason: 'Need a new laptop',
    urgency: 'high',
    status: 'pending',
  },
];

const MAINTENANCE = [
  {
    _id: 'm-1',
    assetName: 'MacBook Pro',
    description: 'Screen repair',
    type: 'repair',
    status: 'in_progress',
    scheduledDate: 1_750_000_000_000,
  },
];

describe('AssetsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
    mockSelectedOrg = 'org-1';
    queryResults = {
      getAssetStats: STATS,
      listAssets: ASSETS,
      listEmployeeAssets: [],
      listAssetRequests: [],
      getMyAssetRequests: [],
      listMaintenance: [],
    };
  });

  it('prompts to select an organization when none is set', () => {
    mockSelectedOrg = null;
    mockUser = { id: 'user-1', role: 'admin' };
    render(<AssetsClient />);
    expect(screen.getByText('common.selectOrganization')).toBeInTheDocument();
  });

  it('renders the header and stats', () => {
    render(<AssetsClient />);
    expect(screen.getByText('Asset Management')).toBeInTheDocument();
    expect(screen.getByText(/assets.stats.total/)).toBeInTheDocument();
    expect(screen.getByText(/assets.stats.available/)).toBeInTheDocument();
    expect(screen.getByText(/assets.stats.assigned/)).toBeInTheDocument();
  });

  it('renders assets in the catalog grid', () => {
    render(<AssetsClient />);
    expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
    expect(screen.getByText('Dell Monitor')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('shows an empty catalog state', () => {
    queryResults['listAssets'] = [];
    render(<AssetsClient />);
    expect(screen.getByText('assets.emptyCatalog')).toBeInTheDocument();
    expect(screen.getByText('assets.addFirst')).toBeInTheDocument();
  });

  it('filters assets by search query', () => {
    render(<AssetsClient />);
    fireEvent.change(screen.getByPlaceholderText('assets.searchPlaceholder'), {
      target: { value: 'Dell' },
    });
    expect(screen.queryByText('MacBook Pro')).not.toBeInTheDocument();
    expect(screen.getByText('Dell Monitor')).toBeInTheDocument();
  });

  it('switches to list view and paginates', () => {
    render(<AssetsClient />);
    fireEvent.click(screen.getByTitle('List'));
    // Table headers from the list view
    expect(screen.getByText('assets.name')).toBeInTheDocument();
    expect(screen.getByText('assets.serialNumber')).toBeInTheDocument();
    expect(screen.getByText('2 assets')).toBeInTheDocument();
  });

  it('opens the asset detail card on click', () => {
    queryResults['getAsset'] = ASSET_DETAIL;
    render(<AssetsClient />);
    fireEvent.click(screen.getByText('MacBook Pro'));

    expect(screen.getByText('SN-001')).toBeInTheDocument();
    expect(screen.getByText('assets.assign')).toBeInTheDocument();
    expect(screen.getByText('assets.assignmentHistory')).toBeInTheDocument();
  });

  it('assigns an asset to an employee', async () => {
    queryResults['getAsset'] = ASSET_DETAIL;
    queryResults['getUsersForAssignment'] = USERS;
    render(<AssetsClient />);
    fireEvent.click(screen.getByText('MacBook Pro'));

    fireEvent.click(screen.getByText('assets.assign'));
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Bob Smith'));
    fireEvent.click(within(dialog).getByText('assets.assign'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'assignAsset',
            args: [
              expect.objectContaining({
                organizationId: 'org-1',
                assetId: 'a-1',
                assignedTo: 'u-2',
                assignedBy: 'user-1',
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('assets.assignedSuccess');
  });

  it('returns an assigned asset through the return dialog', async () => {
    const assignedDetail = {
      ...ASSET_DETAIL,
      status: 'assigned',
      currentUser: { name: 'Bob Smith', email: 'bob@example.com' },
      currentAssignment: {
        _id: 'asg-1',
        assignedAt: 1_750_000_000_000,
        assignedByName: 'HR',
        movementFormStatus: 'signed',
      },
    };
    queryResults['getAsset'] = assignedDetail;
    render(<AssetsClient />);
    fireEvent.click(screen.getByText('MacBook Pro'));

    fireEvent.click(screen.getByText('assets.return'));
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('assets.confirmReturn'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'returnAsset',
            args: [
              expect.objectContaining({
                assignmentId: 'asg-1',
                returnedBy: 'user-1',
                condition: 'good',
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('assets.returnedSuccess');
  });

  it('deletes an available asset after confirmation', async () => {
    render(<AssetsClient />);
    // Delete button lives in the hover actions row
    const deleteButtons = screen.getAllByText('common.delete');
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('Delete Asset')).toBeInTheDocument();
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('common.delete'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'deleteAsset', args: [{ assetId: 'a-1' }] }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('assets.deletedSuccess');
  });

  it('blocks deletion of an assigned asset', () => {
    // No getAsset result: the catalog grid stays visible (the delete dialog
    // reads `isAssigned` from the list item, set in the ASSETS fixture).
    render(<AssetsClient />);
    const deleteButtons = screen.getAllByText('common.delete');
    fireEvent.click(deleteButtons[1]);

    expect(screen.getByText('Cannot Delete')).toBeInTheDocument();
    expect(screen.getByText('Open Asset Details')).toBeInTheDocument();
  });

  it('opens the QR code modal from an asset card', () => {
    render(<AssetsClient />);
    const qrButtons = screen.getAllByText('QR');
    fireEvent.click(qrButtons[0]);
    expect(screen.getByTestId('qr-modal')).toBeInTheDocument();
  });

  it('renders my assets with movement form status', () => {
    queryResults['listEmployeeAssets'] = EMPLOYEE_ASSETS;
    render(<AssetsClient />);
    fireEvent.click(screen.getByText('assets.tabs.myAssets'));

    expect(screen.getByText('Dell Monitor')).toBeInTheDocument();
    expect(screen.getByText('assets.movementForm.status.pending')).toBeInTheDocument();
  });

  it('shows an empty my-assets state', () => {
    render(<AssetsClient />);
    fireEvent.click(screen.getByText('assets.tabs.myAssets'));
    expect(screen.getByText('assets.noAssetsAssigned')).toBeInTheDocument();
  });

  it('approves and rejects asset requests', async () => {
    queryResults['listAssetRequests'] = REQUESTS;
    render(<AssetsClient />);
    fireEvent.click(screen.getByText('assets.tabs.requests'));

    expect(screen.getByText(/Anna Petrova/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('common.approve'));
    fireEvent.click(screen.getByText('common.reject'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'approveAssetRequest',
            args: [{ requestId: 'r-1', approvedBy: 'user-1' }],
          }),
        ]),
      );
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'rejectAssetRequest',
            args: [{ requestId: 'r-1', approvedBy: 'user-1' }],
          }),
        ]),
      );
    });
  });

  it('renders the maintenance tab', () => {
    queryResults['listMaintenance'] = MAINTENANCE;
    render(<AssetsClient />);
    fireEvent.click(screen.getByText('assets.tabs.maintenance'));
    expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
    expect(screen.getByText('Screen repair')).toBeInTheDocument();
  });

  it('shows an empty maintenance state', () => {
    render(<AssetsClient />);
    fireEvent.click(screen.getByText('assets.tabs.maintenance'));
    expect(screen.getByText('assets.noMaintenance')).toBeInTheDocument();
  });
});
