/**
 * Tests for ESignaturesClient — pending signatures, document list, sign/decline
 * dialogs, document detail (cancel/reminder/archive/export), create wizard and
 * template manager.
 *
 * Mocks: convex-typed (queries + mutations + useConvex), auth store (selector
 * form), selected org, export/hiring-packet/asset-form libs, cloudinary,
 * next/image, toast, UI primitives, lucide.
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
  useConvex: () => ({
    query: async (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  }),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    signatures: {
      listDocuments: { _name: 'listDocuments' },
      getMyPendingSignatures: { _name: 'getMyPendingSignatures' },
      getStats: { _name: 'getStats' },
      listTemplates: { _name: 'listTemplates' },
      getDocument: { _name: 'getDocument' },
      getAuditLog: { _name: 'getAuditLog' },
      createDocument: { _name: 'createDocument' },
      signDocument: { _name: 'signDocument' },
      declineDocument: { _name: 'declineDocument' },
      attachSignedPdf: { _name: 'attachSignedPdf' },
      cancelDocument: { _name: 'cancelDocument' },
      sendReminder: { _name: 'sendReminder' },
      createTemplate: { _name: 'createTemplate' },
      deleteTemplate: { _name: 'deleteTemplate' },
    },
    users: { getUsersByOrganizationId: { _name: 'getUsersByOrganizationId' } },
  },
}));

let mockUser: any = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// Document-building helpers: keep the pure parsers deterministic.
jest.mock('@/lib/hiringPacketDocument', () => ({
  parseHiringPacketContent: () => null,
  applySignaturesToBlocks: (blocks: any) => blocks,
  hiringPacketFileName: () => 'doc.docx',
}));

jest.mock('@/lib/assetFormDocument', () => ({
  parseAssetFormContent: () => null,
  assetFormTitle: () => 'Movement Form',
  assetFormFileName: () => 'form.pdf',
  assetFormDocumentNumber: () => 'N-1',
  assetFormInputFromParsed: (parsed: any) => parsed,
  buildAssetFormBlocks: () => [],
}));

jest.mock('@/lib/exportDocument', () => ({
  exportDocumentToPDF: jest.fn().mockResolvedValue(undefined),
  renderDocumentPdfBase64: jest.fn().mockResolvedValue('data:application/pdf;base64,AAA'),
  renderDocumentDocxBlob: jest.fn().mockResolvedValue(new Blob()),
  documentBodyToPlainText: (blocks: any) =>
    Array.isArray(blocks) ? blocks.map((b: any) => b.text || '').join('\n') : String(blocks ?? ''),
}));

jest.mock('@/actions/cloudinary', () => ({
  uploadDocument: jest
    .fn()
    .mockResolvedValue({ url: 'https://cdn.test/signed.pdf', name: 'signed.pdf', size: 100 }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
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

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked }: any) => <input type="checkbox" checked={!!checked} readOnly />,
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
    Tabs: ({ defaultValue, children }: any) => {
      const [value, setValue] = ReactMod.useState(defaultValue);
      return <TabsCtx.Provider value={{ value, setValue }}>{children}</TabsCtx.Provider>;
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

jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  return {
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <ReactMod.Fragment>{children}</ReactMod.Fragment>,
  };
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const icons = [
    'PenTool',
    'FileText',
    'Send',
    'Clock',
    'CheckCircle',
    'XCircle',
    'Plus',
    'Trash2',
    'Eye',
    'ChevronLeft',
    'ChevronRight',
    'RefreshCw',
    'Download',
    'Upload',
    'ImageIcon',
  ];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

import { ESignaturesClient } from '@/components/ESignaturesClient';
import { toast } from 'sonner';
import { exportDocumentToPDF, renderDocumentDocxBlob } from '@/lib/exportDocument';

const DOC = {
  _id: 'doc-1',
  title: 'NDA Agreement',
  content: 'This agreement is confidential.',
  status: 'pending',
  createdAt: 1_750_000_000_000,
  createdBy: 'user-1',
  expiresAt: undefined,
  requests: [{ _id: 'req-1', status: 'pending', order: 1, signerName: 'Bob Smith' }],
};

const PENDING = [
  {
    _id: 'req-1',
    documentId: 'doc-1',
    signerName: 'Bob Smith',
    order: 1,
    document: { title: 'NDA Agreement' },
    waitingFor: [],
    isMyTurn: true,
  },
];

const STATS = { pendingMySignature: 1, completed: 3, awaitingOthers: 2 };

const TEMPLATES = [{ _id: 'tpl-1', title: 'NDA', content: 'Template body', category: 'nda' }];

const USERS = [
  { _id: 'u-2', name: 'Bob Smith', email: 'bob@example.com', role: 'employee' },
  { _id: 'u-3', name: 'Super Admin', email: 'sa@example.com', role: 'superadmin' },
];

const AUDIT_LOG = [
  { _id: 'a-1', action: 'created', timestamp: 1_750_000_000_000 },
  { _id: 'a-2', action: 'signed', timestamp: 1_750_000_100_000 },
];

describe('ESignaturesClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
    queryResults = {
      listDocuments: [DOC],
      getMyPendingSignatures: PENDING,
      getStats: STATS,
    };
    // jsdom lacks URL.createObjectURL — needed by the Word export handler.
    if (typeof URL.createObjectURL !== 'function') {
      (URL as any).createObjectURL = jest.fn(() => 'blob:test');
      (URL as any).revokeObjectURL = jest.fn();
    }
  });

  it('shows a loader when there is no user', () => {
    mockUser = null;
    render(<ESignaturesClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the header and stats', () => {
    render(<ESignaturesClient />);
    expect(screen.getByText('E-Signatures')).toBeInTheDocument();
    expect(screen.getByText('Awaiting My Signature')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Others')).toBeInTheDocument();
  });

  it('lists pending signatures with the sign action', () => {
    render(<ESignaturesClient />);
    expect(screen.getByText('NDA Agreement')).toBeInTheDocument();
    expect(screen.getByText(/#1/)).toBeInTheDocument();
  });

  it('shows an empty pending state', () => {
    queryResults['getMyPendingSignatures'] = [];
    render(<ESignaturesClient />);
    expect(screen.getByText('No documents to sign')).toBeInTheDocument();
  });

  it('lists documents with status badges', () => {
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    expect(screen.getByText('NDA Agreement')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows an empty documents state for non-admin users', () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'employee' };
    queryResults['listDocuments'] = [];
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
  });

  it('declines a pending document through the sign dialog', async () => {
    queryResults['getDocument'] = DOC;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getAllByText('Sign Document').length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByText('Decline'));
    fireEvent.change(within(dialog).getByPlaceholderText('Explain why you are declining...'), {
      target: { value: 'Not for me' },
    });
    fireEvent.click(within(dialog).getByText('Confirm Decline'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'declineDocument',
            args: [{ requestId: 'req-1', reason: 'Not for me', userId: 'user-1' }],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Document declined');
  });

  it('cancels a pending document from the detail dialog', async () => {
    queryResults['getDocument'] = DOC;
    queryResults['getAuditLog'] = AUDIT_LOG;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText('Signers')).toBeInTheDocument();
    expect(within(dialog).getByText('Activity Log')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('Cancel Document'));
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'cancelDocument',
            args: [{ documentId: 'doc-1', userId: 'user-1' }],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Document cancelled');
  });

  it('sends a reminder to a pending signer', async () => {
    queryResults['getDocument'] = DOC;
    queryResults['getAuditLog'] = [];
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getAllByTestId('icon-RefreshCw')[0]); // reminder refresh icon

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'sendReminder',
            args: [{ requestId: 'req-1', userId: 'user-1' }],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Reminder sent');
  });

  it('archives a completed document and attaches the signed PDF', async () => {
    const completedDoc = {
      ...DOC,
      status: 'completed',
      completedAt: 1_750_000_200_000,
      requests: [
        {
          _id: 'req-1',
          status: 'signed',
          order: 1,
          signerName: 'Bob Smith',
          signedAt: 1_750_000_100_000,
        },
      ],
    };
    queryResults['getDocument'] = completedDoc;
    queryResults['getAuditLog'] = [];
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Archive PDF'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'attachSignedPdf',
            args: [
              expect.objectContaining({
                documentId: 'doc-1',
                url: 'https://cdn.test/signed.pdf',
                userId: 'user-1',
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Signed document archived');
  });

  it('exports a completed document as PDF and Word', async () => {
    const completedDoc = { ...DOC, status: 'completed', completedAt: 1_750_000_200_000 };
    queryResults['getDocument'] = completedDoc;
    queryResults['getAuditLog'] = [];
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Export PDF'));
    await waitFor(() => {
      expect(exportDocumentToPDF).toHaveBeenCalled();
    });
    expect(toast.success).toHaveBeenCalledWith('PDF exported successfully');

    fireEvent.click(within(dialog).getByText('Export Word'));
    await waitFor(() => {
      expect(renderDocumentDocxBlob).toHaveBeenCalled();
    });
    expect(toast.success).toHaveBeenCalledWith('Word file exported');
  });

  it('creates a document through the wizard', async () => {
    queryResults['listTemplates'] = TEMPLATES;
    queryResults['getUsersByOrganizationId'] = USERS;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('New Document'));

    // Step 1: title + content
    const next = () => screen.getByText('Next');
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('e.g., Employment Contract — John Doe'), {
      target: { value: 'Employment Contract' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter document text...'), {
      target: { value: 'Contract body' },
    });
    fireEvent.click(next());

    // Step 2: pick a signer (superadmin is excluded)
    fireEvent.click(screen.getByText('Bob Smith'));
    fireEvent.click(next());

    // Step 3: send
    fireEvent.click(screen.getByText('Send for Signing'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'createDocument',
            args: [
              expect.objectContaining({
                organizationId: 'org-1',
                title: 'Employment Contract',
                content: 'Contract body',
                signers: [{ userId: 'u-2', name: 'Bob Smith', email: 'bob@example.com', order: 1 }],
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Document sent for signing!');
  });

  it('creates a template through the template manager', async () => {
    queryResults['listTemplates'] = TEMPLATES;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Templates'));

    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText('NDA')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('New Template'));
    const save = () => within(dialog).getByText('Save Template');
    expect((save() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText('e.g., NDA Agreement'), {
      target: { value: 'Offer Letter' },
    });
    // textboxes: [title, description, content]
    const textboxes = within(dialog).getAllByRole('textbox');
    fireEvent.change(textboxes[2], { target: { value: 'Offer body' } });
    fireEvent.click(save());

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'createTemplate',
            args: [
              expect.objectContaining({
                title: 'Offer Letter',
                content: 'Offer body',
                category: 'custom',
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Template created!');
  });

  it('deletes a template through the template manager', async () => {
    queryResults['listTemplates'] = TEMPLATES;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Templates'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getAllByTestId('icon-Trash2')[0]); // trash icon

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'deleteTemplate',
            args: [{ templateId: 'tpl-1' }],
          }),
        ]),
      );
    });
  });

  it('hides admin-only header buttons for non-admin users', () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'employee' };
    render(<ESignaturesClient />);
    expect(screen.queryByText('New Document')).not.toBeInTheDocument();
    expect(screen.queryByText('Templates')).not.toBeInTheDocument();
  });
});
