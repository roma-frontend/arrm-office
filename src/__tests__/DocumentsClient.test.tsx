/**
 * Tests for DocumentsClient — the document management dashboard.
 *
 * Mocks: convex/react (useQuery keyed by ref _name with args recording,
 * useMutation lazily creating jest.fn()s), next/navigation useRouter,
 * auth store (mutable user), selected-org hook, react-i18next (fallback t),
 * generated api, UI primitives (Card/Badge/Button/ShieldLoader + context
 * Tabs mock), sonner toast, lucide icons, and the four heavy children
 * (DocumentUploadWizard / DocumentTemplateWizard / DocumentBuilderTab /
 * IssuedDocumentsTab) as prop-capturing stubs.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

let mockUser: any = { id: 'u1', role: 'admin', organizationId: 'org-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
  useAuthUser: () => mockUser,
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => null,
}));

let mockPush: jest.Mock;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let queryResults: Record<string, unknown> = {};
let queryCalls: Record<string, unknown[]> = {};
let mutationImpls: Record<string, jest.Mock> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args?: unknown) => {
    const name = ref?._name ?? '';
    queryCalls[name] = [...(queryCalls[name] ?? []), args];
    return queryResults[name];
  },
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    mutationImpls[name] = mutationImpls[name] ?? jest.fn();
    return mutationImpls[name];
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    documents: {
      listDocuments: { _name: 'listDocuments' },
      getMyDocumentViews: { _name: 'getMyDocumentViews' },
      getTeamDocumentOverview: { _name: 'getTeamDocumentOverview' },
      getDocumentCategories: { _name: 'getDocumentCategories' },
      updateDocument: { _name: 'updateDocument' },
      deleteDocument: { _name: 'deleteDocument' },
      recordDocumentView: { _name: 'recordDocumentView' },
    },
    signatures: {
      listTemplates: { _name: 'listTemplates' },
      deleteTemplate: { _name: 'deleteTemplate' },
    },
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, onClick }: any) => (
    <div data-testid="card" className={className} onClick={onClick}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ message }: any) => <div data-testid="loader">{message}</div>,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    FileText: Icon,
    Upload: Icon,
    Eye: Icon,
    BarChart3: Icon,
    FolderOpen: Icon,
    CheckCircle: Icon,
    Clock: Icon,
    Plus: Icon,
    Trash2: Icon,
    PenTool: Icon,
    Languages: Icon,
    FileSignature: Icon,
  };
});

// ── Context-based Tabs mock ────────────────────────────────────────────────
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

let uploadWizardProps: any = null;
let templateWizardProps: any = null;
let builderProps: any = null;
let issuedProps: any = null;
jest.mock('@/components/documents/MyIssuedDocuments', () => ({
  __esModule: true,
  default: () => <div data-testid="my-issued-documents">MyIssuedDocuments</div>,
}));

jest.mock('@/components/documents/DocumentUploadWizard', () => ({
  __esModule: true,
  default: (props: any) => {
    uploadWizardProps = props;
    return <div data-testid="upload-wizard" data-template-id={props.templateId ?? ''} />;
  },
}));
jest.mock('@/components/documents/DocumentTemplateWizard', () => ({
  __esModule: true,
  default: (props: any) => {
    templateWizardProps = props;
    return <div data-testid="template-wizard" data-open={props.open} />;
  },
}));
jest.mock('@/components/documents/DocumentBuilderTab', () => ({
  __esModule: true,
  default: (props: any) => {
    builderProps = props;
    return <div data-testid="builder-tab">builder</div>;
  },
}));
jest.mock('@/components/documents/IssuedDocumentsTab', () => ({
  __esModule: true,
  default: (props: any) => {
    issuedProps = props;
    return <div data-testid="issued-tab">issued</div>;
  },
}));

import DocumentsClient from '@/components/documents/DocumentsClient';
import { toast } from 'sonner';

// jsdom ships a native window.open (logs "Not implemented") — keep it so
// afterEach can restore it instead of leaving window.open as undefined.
const originalOpen = window.open;

const DOCS: any[] = [
  {
    _id: 'd1',
    _creationTime: 1,
    organizationId: 'org-1',
    title: 'HR Policy',
    description: 'Employee handbook',
    category: 'policy',
    fileUrl: 'https://x/p.pdf',
    fileName: 'p.pdf',
    fileSize: 500,
    uploadedBy: 'u1',
    isPublished: true,
    isMandatory: true,
    createdAt: 1755000000000,
    updatedAt: 1755000000000,
    uploaderName: 'Alice',
  },
  {
    _id: 'd2',
    _creationTime: 2,
    organizationId: 'org-1',
    title: 'Vendor Contract',
    category: 'contract',
    fileUrl: 'https://x/c.pdf',
    fileName: 'c.pdf',
    fileSize: 2048,
    uploadedBy: 'u1',
    isPublished: true,
    isMandatory: false,
    createdAt: 1754000000000,
    updatedAt: 1754000000000,
    uploaderName: 'Bob',
  },
  {
    _id: 'd3',
    _creationTime: 3,
    organizationId: 'org-1',
    title: 'Q3 Report',
    category: 'report',
    fileUrl: 'https://x/r.pdf',
    fileName: 'r.pdf',
    fileSize: 5 * 1024 * 1024,
    uploadedBy: 'u1',
    isPublished: false,
    isMandatory: false,
    createdAt: 1753000000000,
    updatedAt: 1753000000000,
    uploaderName: 'Carol',
  },
  {
    // No fileSize — the card must omit the size span entirely.
    _id: 'd4',
    _creationTime: 4,
    organizationId: 'org-1',
    title: 'Meeting Notes',
    category: 'other',
    fileUrl: 'https://x/n.pdf',
    fileName: 'n.pdf',
    uploadedBy: 'u1',
    isPublished: true,
    isMandatory: false,
    createdAt: 1752000000000,
    updatedAt: 1752000000000,
    uploaderName: 'Dave',
  },
];

const OVERVIEW = {
  totalDocuments: 42,
  publishedDocuments: 30,
  totalViews: 120,
  acknowledgmentRate: 87,
};

const TEMPLATES: any[] = [
  {
    _id: 't1',
    organizationId: 'org-1',
    title: 'Offer Letter',
    description: 'Hiring offer',
    category: 'contract',
    fields: ['name', 'salary'],
  },
];

const VIEWS: any[] = [{ _id: 'v1', documentId: 'd1', acknowledged: true }];

describe('DocumentsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    mockPush = jest.fn();
    queryResults = {
      listDocuments: DOCS,
      listTemplates: TEMPLATES,
      getMyDocumentViews: VIEWS,
      getTeamDocumentOverview: OVERVIEW,
      getDocumentCategories: ['policy'],
    };
    queryCalls = {};
    mutationImpls = {};
    uploadWizardProps = null;
    templateWizardProps = null;
    builderProps = null;
    issuedProps = null;
  });

  afterEach(() => {
    (window.open as any) = originalOpen;
  });

  const lastArgs = (name: string) => {
    const calls = queryCalls[name] ?? [];
    return calls[calls.length - 1];
  };

  // ── Loading & role gates ────────────────────────────────────────────────

  it('shows the loader while documents are pending', () => {
    queryResults.listDocuments = undefined;
    render(<DocumentsClient />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.getByText('Loading documents...')).toBeInTheDocument();
  });

  it('renders the document grid with cards for an admin', () => {
    render(<DocumentsClient />);
    expect(screen.getByText('Document Management')).toBeInTheDocument();
    expect(screen.getByText('HR Policy')).toBeInTheDocument();
    expect(screen.getByText('Vendor Contract')).toBeInTheDocument();
    expect(screen.getByText('Q3 Report')).toBeInTheDocument();
  });

  it('hides admin-only chrome for regular employees', () => {
    mockUser = { id: 'u1', role: 'employee', organizationId: 'org-1' };
    render(<DocumentsClient />);
    // No upload button, no admin tabs, no team overview, no publish/delete.
    expect(screen.queryByText('Upload Document')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpublished' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bilingual templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Issued')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Documents')).not.toBeInTheDocument();
    expect(screen.queryByText('Publish')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    // The library is staff-only: employees get the My Documents tab instead
    // and never see the document grid.
    expect(screen.queryByText('HR Policy')).not.toBeInTheDocument();
    expect(screen.getByTestId('my-issued-documents')).toBeInTheDocument();
    expect(screen.getByText('My Documents')).toBeInTheDocument();
    expect(screen.queryByText('All Documents')).not.toBeInTheDocument();
  });

  it('passes includeUnpublished: true for admins', () => {
    render(<DocumentsClient />);
    const args = lastArgs('listDocuments') as any;
    expect(args).toEqual({
      organizationId: 'org-1',
      category: undefined,
      search: undefined,
      includeUnpublished: true,
    });
  });

  it('skips queries when the user has no organization', () => {
    mockUser = { id: 'u1', role: 'admin' };
    render(<DocumentsClient />);
    expect(lastArgs('listDocuments')).toBe('skip');
    expect(lastArgs('listTemplates')).toBe('skip');
    expect(lastArgs('getMyDocumentViews')).toBe('skip');
    expect(lastArgs('getTeamDocumentOverview')).toBe('skip');
  });

  // ── Team overview stats ─────────────────────────────────────────────────

  it('renders the team overview stats for admins', () => {
    render(<DocumentsClient />);
    expect(screen.getByText('Total Documents')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Published Documents')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('Total Views')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Acknowledgment Rate')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
  });

  // ── Search & category filter ────────────────────────────────────────────

  it('records the search query in the listDocuments args', () => {
    render(<DocumentsClient />);
    fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
      target: { value: 'contract' },
    });
    const args = lastArgs('listDocuments') as any;
    expect(args.search).toBe('contract');
  });

  it('records the category filter in the listDocuments args', () => {
    render(<DocumentsClient />);
    fireEvent.change(screen.getByDisplayValue('All Categories'), {
      target: { value: 'policy' },
    });
    const args = lastArgs('listDocuments') as any;
    expect(args.category).toBe('policy');
  });

  it('hides the search bar on the builder and issued tabs', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Bilingual templates'));
    expect(screen.queryByPlaceholderText('Search documents...')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Issued'));
    expect(screen.queryByPlaceholderText('Search documents...')).not.toBeInTheDocument();
  });

  // ── Tab filtering ───────────────────────────────────────────────────────

  it('filters to mandatory documents on the mandatory tab', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Mandatory' }));
    expect(screen.getByText('HR Policy')).toBeInTheDocument();
    expect(screen.queryByText('Vendor Contract')).not.toBeInTheDocument();
    expect(screen.queryByText('Q3 Report')).not.toBeInTheDocument();
  });

  it('filters to unpublished documents on the unpublished tab', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Unpublished' }));
    expect(screen.getByText('Q3 Report')).toBeInTheDocument();
    expect(screen.queryByText('HR Policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendor Contract')).not.toBeInTheDocument();
  });

  it('renders the empty state when the filtered list is empty', () => {
    queryResults.listDocuments = [];
    render(<DocumentsClient />);
    expect(screen.getByText('No documents available')).toBeInTheDocument();
    expect(screen.getByText('Check back later or contact your admin')).toBeInTheDocument();
  });

  // ── Document metadata ───────────────────────────────────────────────────

  it('formats file sizes as B, KB and MB and omits them when absent', () => {
    render(<DocumentsClient />);
    expect(screen.getByText('500 B')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('5.0 MB')).toBeInTheDocument();
    // Exactly three size spans — the fileSize-less document shows none.
    expect(screen.getAllByText(/B$/).length).toBe(3);
  });

  it('renders uploader, formatted date and description', () => {
    render(<DocumentsClient />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Employee handbook')).toBeInTheDocument();
    expect(screen.getByText(new Date(1755000000000).toLocaleDateString())).toBeInTheDocument();
  });

  it('falls back to the no-description label for documents without one', () => {
    render(<DocumentsClient />);
    expect(screen.getAllByText('No description available').length).toBe(3);
  });

  it('renders the mandatory, unpublished and acknowledged badges', () => {
    const { container } = render(<DocumentsClient />);
    // Badges are distinguished by their colored pill classes (tab labels reuse
    // the same translated strings, so scope by class within this render).
    expect(container.querySelector('[class*="bg-(--danger-quiet)"]')?.textContent).toBe(
      'Mandatory',
    );
    expect(container.querySelector('[class*="bg-(--warning-quiet)"]')?.textContent).toBe(
      'Unpublished',
    );
    expect(container.querySelector('[class*="bg-(--success-quiet)"]')?.textContent).toBe(
      'Acknowledged',
    );
  });

  it('renders all seven category icons', () => {
    queryResults.listDocuments = [
      { ...DOCS[0], category: 'policy' },
      { ...DOCS[1], category: 'contract', _id: 'c1' },
      { ...DOCS[2], category: 'report', _id: 'r1', isPublished: true },
      { ...DOCS[0], _id: 't1', category: 'template', title: 'T' },
      { ...DOCS[0], _id: 'f1', category: 'form', title: 'F' },
      { ...DOCS[0], _id: 'c2', category: 'certificate', title: 'C' },
      { ...DOCS[0], _id: 'o1', category: 'other', title: 'O' },
    ];
    const { container } = render(<DocumentsClient />);
    expect(container.querySelector('[class*="text-(--brand-text)"]')).not.toBeNull();
    expect(container.querySelector('[class*="text-(--success-text)"]')).not.toBeNull();
    expect(container.querySelector('[class*="text-(--purple-text)"]')).not.toBeNull();
    expect(container.querySelector('[class*="text-(--warning-text)"]')).not.toBeNull();
    expect(container.querySelector('[class*="text-(--cyan-text)"]')).not.toBeNull();
    expect(container.querySelector('[class*="text-(--text-3)"]')).not.toBeNull();
  });

  // ── View / publish / delete flows ───────────────────────────────────────

  it('opens a document after recording the view', async () => {
    const openMock = jest.fn();
    (window as any).open = openMock;
    mutationImpls.recordDocumentView = jest.fn().mockResolvedValue(undefined);
    render(<DocumentsClient />);

    fireEvent.click(screen.getAllByText('View')[0]);

    await waitFor(() => {
      expect(mutationImpls.recordDocumentView).toHaveBeenCalledWith({
        organizationId: 'org-1',
        documentId: 'd1',
      });
      expect(openMock).toHaveBeenCalledWith('https://x/p.pdf', '_blank', 'noopener,noreferrer');
    });
  });

  it('shows an error toast when recording the view fails', async () => {
    mutationImpls.recordDocumentView = jest.fn().mockRejectedValue(new Error('boom'));
    render(<DocumentsClient />);

    fireEvent.click(screen.getAllByText('View')[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to record document view');
    });
  });

  it('deletes a document and shows a success toast', async () => {
    mutationImpls.deleteDocument = jest.fn().mockResolvedValue(undefined);
    render(<DocumentsClient />);

    fireEvent.click(screen.getAllByText('Delete')[0]);

    await waitFor(() => {
      expect(mutationImpls.deleteDocument).toHaveBeenCalledWith({ documentId: 'd1' });
      expect(toast.success).toHaveBeenCalledWith('Document deleted successfully');
    });
  });

  it('shows an error toast when deleting fails', async () => {
    mutationImpls.deleteDocument = jest.fn().mockRejectedValue(new Error('boom'));
    render(<DocumentsClient />);

    fireEvent.click(screen.getAllByText('Delete')[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete document');
    });
  });

  it('publishes an unpublished document and shows a success toast', async () => {
    mutationImpls.updateDocument = jest.fn().mockResolvedValue(undefined);
    render(<DocumentsClient />);

    fireEvent.click(screen.getByText('Publish'));

    await waitFor(() => {
      expect(mutationImpls.updateDocument).toHaveBeenCalledWith({
        documentId: 'd3',
        isPublished: true,
      });
      expect(toast.success).toHaveBeenCalledWith('Document published successfully');
    });
  });

  it('shows an error toast when publishing fails', async () => {
    mutationImpls.updateDocument = jest.fn().mockRejectedValue(new Error('boom'));
    render(<DocumentsClient />);

    fireEvent.click(screen.getByText('Publish'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to publish document');
    });
  });

  it('navigates to the document detail page on card click', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('HR Policy'));
    expect(mockPush).toHaveBeenCalledWith('/documents/d1');
  });

  // ── Templates tab ───────────────────────────────────────────────────────

  it('shows the templates loader while templates are pending', () => {
    queryResults.listTemplates = undefined;
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.getByText('Loading templates...')).toBeInTheDocument();
  });

  it('shows the empty templates state with a create-first button for admins', () => {
    queryResults.listTemplates = [];
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));
    expect(screen.getByText('No templates available')).toBeInTheDocument();
    expect(screen.getByText('Create your first template')).toBeInTheDocument();
  });

  it('renders template cards with category and field count badges', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));
    expect(screen.getByText('Document Templates')).toBeInTheDocument();
    expect(screen.getByText('Offer Letter')).toBeInTheDocument();
    expect(screen.getByText('Hiring offer')).toBeInTheDocument();
    const badges = screen.getAllByTestId('badge');
    expect(badges[0].textContent).toBe('contract');
    expect(badges[1].textContent).toBe('2 fields');
  });

  it('opens the upload wizard with a template id via Use Template', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));
    fireEvent.click(screen.getByText('Use Template'));
    expect(screen.getByTestId('upload-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('upload-wizard').getAttribute('data-template-id')).toBe('t1');
  });

  it('deletes a template and shows a success toast', async () => {
    mutationImpls.deleteTemplate = jest.fn().mockResolvedValue(undefined);
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));

    const card = screen.getByText('Offer Letter').closest('[data-testid="card"]')!;
    // The delete-template button is icon-only (Trash2) — scope by variant.
    const deleteBtn = (card as HTMLElement).querySelector('button[data-variant="destructive"]')!;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mutationImpls.deleteTemplate).toHaveBeenCalledWith({ templateId: 't1' });
      expect(toast.success).toHaveBeenCalledWith('Template deleted successfully');
    });
  });

  it('shows an error toast when deleting a template fails', async () => {
    mutationImpls.deleteTemplate = jest.fn().mockRejectedValue(new Error('boom'));
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));

    const card = screen.getByText('Offer Letter').closest('[data-testid="card"]')!;
    const deleteBtn = (card as HTMLElement).querySelector('button[data-variant="destructive"]')!;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete template');
    });
  });

  // ── Wizards ─────────────────────────────────────────────────────────────

  it('opens the upload wizard from the header button and closes it', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Upload Document'));
    expect(screen.getByTestId('upload-wizard')).toBeInTheDocument();
    expect(uploadWizardProps.templateId).toBeUndefined();

    act(() => uploadWizardProps.onClose());
    expect(screen.queryByTestId('upload-wizard')).not.toBeInTheDocument();
  });

  it('closes the upload wizard on success', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Upload Document'));
    act(() => uploadWizardProps.onSuccess());
    expect(screen.queryByTestId('upload-wizard')).not.toBeInTheDocument();
  });

  it('opens the template wizard from the header button', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));
    fireEvent.click(screen.getByText('Create Template'));
    expect(screen.getByTestId('template-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('template-wizard').getAttribute('data-open')).toBe('true');
  });

  it('closes the template wizard via onClose', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));
    fireEvent.click(screen.getByText('Create Template'));
    act(() => templateWizardProps.onClose());
    expect(screen.queryByTestId('template-wizard')).not.toBeInTheDocument();
  });

  it('closes the template wizard on success', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));
    fireEvent.click(screen.getByText('Create Template'));
    act(() => templateWizardProps.onSuccess());
    expect(screen.queryByTestId('template-wizard')).not.toBeInTheDocument();
  });

  it('opens the template wizard from the empty-state button', () => {
    queryResults.listTemplates = [];
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Templates'));
    fireEvent.click(screen.getByText('Create your first template'));
    expect(screen.getByTestId('template-wizard')).toBeInTheDocument();
  });

  // ── Builder & issued tabs ───────────────────────────────────────────────

  it('renders the bilingual builder tab with the org id', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Bilingual templates'));
    expect(screen.getByTestId('builder-tab')).toBeInTheDocument();
    expect(builderProps.organizationId).toBe('org-1');
  });

  it('renders the issued documents tab with the org id', () => {
    render(<DocumentsClient />);
    fireEvent.click(screen.getByText('Issued'));
    expect(screen.getByTestId('issued-tab')).toBeInTheDocument();
    expect(issuedProps.organizationId).toBe('org-1');
  });

  it('does not offer builder or issued tabs for non-admins', () => {
    mockUser = { id: 'u1', role: 'employee', organizationId: 'org-1' };
    render(<DocumentsClient />);
    expect(screen.queryByText('Bilingual templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Issued')).not.toBeInTheDocument();
  });
});
