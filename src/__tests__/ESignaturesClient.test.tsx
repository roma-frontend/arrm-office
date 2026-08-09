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
    t: (key: string, fallback?: string | { defaultValue?: string; names?: string }) => {
      if (typeof fallback === 'object' && fallback?.defaultValue) {
        return fallback.defaultValue.replace('{{names}}', fallback.names ?? '');
      }
      return fallback || key;
    },
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
/** Per-mutation result overrides, keyed by _name. */
const mutationResults: Record<string, unknown> = {};

jest.mock('@/lib/convex-typed', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      const result = mutationResults[ref?._name ?? ''];
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result);
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

jest.mock('@/components/ui/select', () => {
  const ReactMod = require('react');
  const SelectCtx = ReactMod.createContext({ onValueChange: (_v: string) => {} });
  return {
    Select: ({ children, onValueChange }: any) => (
      <SelectCtx.Provider value={{ onValueChange: onValueChange || (() => {}) }}>
        <div data-testid="select">{children}</div>
      </SelectCtx.Provider>
    ),
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const { onValueChange } = ReactMod.useContext(SelectCtx);
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

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
  { _id: 'u-4', name: 'Carol Jones', email: 'carol@example.com', role: 'employee' },
];

const AUDIT_LOG = [
  { _id: 'a-1', action: 'created', timestamp: 1_750_000_000_000 },
  { _id: 'a-2', action: 'signed', timestamp: 1_750_000_100_000 },
];

describe('ESignaturesClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    for (const k of Object.keys(mutationResults)) delete mutationResults[k];
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

  it('signs a document after drawing a signature on the pad', async () => {
    queryResults['getDocument'] = DOC;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    const canvas = dialog.querySelector('canvas') as HTMLCanvasElement;
    const ctx = {
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      clearRect: jest.fn(),
    };
    (canvas as any).getContext = () => ctx;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;

    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 40 });
    (canvas as any).toDataURL = () => 'data:image/png;base64,SIG';
    fireEvent.click(within(dialog).getByText('Apply Signature'));

    // "Sign Document" appears both in the dialog title and on the action button.
    const signButtons = within(dialog).getAllByText('Sign Document');
    fireEvent.click(signButtons[signButtons.length - 1]);
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'signDocument',
            args: [
              { requestId: 'req-1', signatureData: 'data:image/png;base64,SIG', userId: 'user-1' },
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Document signed successfully!');
  });

  it('shows the redraw option after capturing a signature', async () => {
    queryResults['getDocument'] = DOC;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    const canvas = dialog.querySelector('canvas') as HTMLCanvasElement;
    const ctx = {
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      clearRect: jest.fn(),
    };
    (canvas as any).getContext = () => ctx;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 40 });
    (canvas as any).toDataURL = () => 'data:image/png;base64,SIG';
    fireEvent.click(within(dialog).getByText('Apply Signature'));

    expect(within(dialog).getByText('Redraw')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Redraw'));
    // Pad is back.
    expect(within(dialog).queryByText('Apply Signature')).toBeInTheDocument();
  });

  it('blocks signing while waiting for a previous signer', async () => {
    queryResults['getDocument'] = {
      ...DOC,
      requests: [
        { _id: 'req-0', status: 'pending', order: 1, signerName: 'First Guy' },
        { _id: 'req-1', status: 'pending', order: 2, signerName: 'Bob Smith' },
      ],
    };
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText('Waiting for First Guy')).toBeInTheDocument();
    const signButtons = within(dialog).getAllByText('Sign Document');
    expect(signButtons[signButtons.length - 1]).toBeDisabled();
  });

  it('shows a fallback error when the sign mutation rejects', async () => {
    queryResults['getDocument'] = DOC;
    mutationResults['signDocument'] = new Error('server down');
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    const canvas = dialog.querySelector('canvas') as HTMLCanvasElement;
    const ctx = {
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      clearRect: jest.fn(),
    };
    (canvas as any).getContext = () => ctx;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 40 });
    (canvas as any).toDataURL = () => 'data:image/png;base64,SIG';
    fireEvent.click(within(dialog).getByText('Apply Signature'));
    const signButtons = within(dialog).getAllByText('Sign Document');
    fireEvent.click(signButtons[signButtons.length - 1]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to sign document');
    });
  });

  it('warns about previous signers when the mutation says so', async () => {
    queryResults['getDocument'] = DOC;
    mutationResults['signDocument'] = new Error('Previous signers have not signed');
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    const canvas = dialog.querySelector('canvas') as HTMLCanvasElement;
    const ctx = {
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      clearRect: jest.fn(),
    };
    (canvas as any).getContext = () => ctx;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 40 });
    (canvas as any).toDataURL = () => 'data:image/png;base64,SIG';
    fireEvent.click(within(dialog).getByText('Apply Signature'));
    const signButtons = within(dialog).getAllByText('Sign Document');
    fireEvent.click(signButtons[signButtons.length - 1]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Waiting for previous signers');
    });
  });

  it('archives the signed PDF when the sign completes the document', async () => {
    queryResults['getDocument'] = { ...DOC, status: 'completed' };
    mutationResults['signDocument'] = { completed: true };
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    const canvas = dialog.querySelector('canvas') as HTMLCanvasElement;
    const ctx = {
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      clearRect: jest.fn(),
    };
    (canvas as any).getContext = () => ctx;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 40 });
    (canvas as any).toDataURL = () => 'data:image/png;base64,SIG';
    fireEvent.click(within(dialog).getByText('Apply Signature'));
    const signButtons = within(dialog).getAllByText('Sign Document');
    fireEvent.click(signButtons[signButtons.length - 1]);

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'attachSignedPdf',
            args: [expect.objectContaining({ documentId: 'doc-1' })],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Signed document archived');
  });

  it('prefills the wizard from a selected template', async () => {
    queryResults['listTemplates'] = TEMPLATES;
    queryResults['getUsersByOrganizationId'] = USERS;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('New Document'));

    fireEvent.click(screen.getByText('NDA'));
    const titleInput = screen.getByPlaceholderText(
      'e.g., Employment Contract — John Doe',
    ) as HTMLInputElement;
    expect(titleInput.value).toBe('NDA');
    const contentArea = screen.getByPlaceholderText(
      'Enter document text...',
    ) as HTMLTextAreaElement;
    expect(contentArea.value).toBe('Template body');
  });

  it('goes back through the wizard and cancels from the first step', async () => {
    queryResults['getUsersByOrganizationId'] = USERS;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('New Document'));

    const back = () => screen.getByText('Back');
    fireEvent.change(screen.getByPlaceholderText('e.g., Employment Contract — John Doe'), {
      target: { value: 'Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter document text...'), {
      target: { value: 'Body' },
    });
    fireEvent.click(screen.getByText('Next'));
    // Step 2 offers the Back button.
    fireEvent.click(back());
    // Step 1 again — the footer button is labelled Cancel.
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create Document for Signing')).not.toBeInTheDocument();
  });

  it('backs out of decline mode in the sign dialog', async () => {
    queryResults['getDocument'] = DOC;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Decline'));
    expect(within(dialog).getByText('Confirm Decline')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Back'));
    expect(within(dialog).getAllByText('Sign Document').length).toBeGreaterThan(0);
  });

  it('backs out of the template creation form', async () => {
    queryResults['listTemplates'] = TEMPLATES;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Templates'));
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('New Template'));
    fireEvent.click(within(dialog).getByText('Back'));
    expect(within(dialog).getByText('New Template')).toBeInTheDocument();
  });

  it('sets an expiration date in the wizard review step', async () => {
    queryResults['getUsersByOrganizationId'] = USERS;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('New Document'));

    fireEvent.change(screen.getByPlaceholderText('e.g., Employment Contract — John Doe'), {
      target: { value: 'Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter document text...'), {
      target: { value: 'Body' },
    });
    fireEvent.click(screen.getByText('Next'));

    // The expiration date lives on the Signers step.
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByText('Bob Smith'));
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Expires')).toBeInTheDocument();
  });

  it('removes a signer from the wizard selection and reorders the rest', async () => {
    queryResults['getUsersByOrganizationId'] = USERS;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('New Document'));

    fireEvent.change(screen.getByPlaceholderText('e.g., Employment Contract — John Doe'), {
      target: { value: 'Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter document text...'), {
      target: { value: 'Body' },
    });
    fireEvent.click(screen.getByText('Next'));

    // Two signers — the second gets order #2.
    fireEvent.click(screen.getByText('Bob Smith'));
    fireEvent.click(screen.getByText('Carol Jones'));
    expect(screen.getByText('#2')).toBeInTheDocument();

    // Removing Bob renumbers Carol from #2 → #1.
    fireEvent.click(screen.getByText('Bob Smith'));
    expect(screen.queryByText('#2')).not.toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
  });

  it('toasts a create error when the wizard submit fails', async () => {
    queryResults['getUsersByOrganizationId'] = USERS;
    mutationResults['createDocument'] = new Error('nope');
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('New Document'));

    fireEvent.change(screen.getByPlaceholderText('e.g., Employment Contract — John Doe'), {
      target: { value: 'Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter document text...'), {
      target: { value: 'Body' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Bob Smith'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Send for Signing'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create document');
    });
  });

  it('resets the wizard form when reopened', async () => {
    queryResults['getUsersByOrganizationId'] = USERS;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('New Document'));
    fireEvent.change(screen.getByPlaceholderText('e.g., Employment Contract — John Doe'), {
      target: { value: 'Doc' },
    });
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('New Document'));
    expect(
      (screen.getByPlaceholderText('e.g., Employment Contract — John Doe') as HTMLInputElement)
        .value,
    ).toBe('');
  });

  it('toasts an archive failure in the detail dialog', async () => {
    const completedDoc = { ...DOC, status: 'completed', completedAt: 1_750_000_200_000 };
    queryResults['getDocument'] = completedDoc;
    queryResults['getAuditLog'] = [];
    // Break the export lib so archiveSignedDocument throws.
    const { renderDocumentPdfBase64 } = require('@/lib/exportDocument') as any;
    renderDocumentPdfBase64.mockRejectedValue(new Error('pdf render failed'));
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Archive PDF'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to archive signed PDF: pdf render failed');
    });
    renderDocumentPdfBase64.mockResolvedValue('data:application/pdf;base64,AAA');
  });

  it('toasts an error when cancelling a document fails', async () => {
    queryResults['getDocument'] = DOC;
    queryResults['getAuditLog'] = [];
    mutationResults['cancelDocument'] = new Error('boom');
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Cancel Document'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to cancel');
    });
  });

  it('toasts an error when sending a reminder fails', async () => {
    queryResults['getDocument'] = DOC;
    queryResults['getAuditLog'] = [];
    mutationResults['sendReminder'] = new Error('nope');
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getAllByTestId('icon-RefreshCw')[0]);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to send reminder');
    });
  });

  it('toasts an error when exporting the completed PDF fails', async () => {
    const completedDoc = { ...DOC, status: 'completed', completedAt: 1_750_000_200_000 };
    queryResults['getDocument'] = completedDoc;
    queryResults['getAuditLog'] = [];
    const { exportDocumentToPDF } = require('@/lib/exportDocument') as any;
    exportDocumentToPDF.mockRejectedValue(new Error('no pdf'));
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Export PDF'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to export PDF');
    });
    exportDocumentToPDF.mockResolvedValue(undefined);
  });

  it('toasts an error when exporting the Word copy fails', async () => {
    const completedDoc = { ...DOC, status: 'completed', completedAt: 1_750_000_200_000 };
    queryResults['getDocument'] = completedDoc;
    queryResults['getAuditLog'] = [];
    const { renderDocumentDocxBlob } = require('@/lib/exportDocument') as any;
    renderDocumentDocxBlob.mockRejectedValue(new Error('no docx'));
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Export Word'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to export');
    });
    renderDocumentDocxBlob.mockResolvedValue(new Blob());
  });

  it('toasts an error when declining fails', async () => {
    queryResults['getDocument'] = DOC;
    mutationResults['declineDocument'] = new Error('nope');
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Decline'));
    fireEvent.change(within(dialog).getByPlaceholderText('Explain why you are declining...'), {
      target: { value: 'Not for me' },
    });
    fireEvent.click(within(dialog).getByText('Confirm Decline'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to decline');
    });
  });

  it('toasts an error when creating a template fails', async () => {
    queryResults['listTemplates'] = TEMPLATES;
    mutationResults['createTemplate'] = new Error('nope');
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Templates'));

    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('New Template'));
    fireEvent.change(within(dialog).getByPlaceholderText('e.g., NDA Agreement'), {
      target: { value: 'Offer Letter' },
    });
    const textboxes = within(dialog).getAllByRole('textbox');
    fireEvent.change(textboxes[2], { target: { value: 'Offer body' } });
    fireEvent.click(within(dialog).getByText('Save Template'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create template');
    });
  });

  it('opens the wizard from the empty documents state', async () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
    queryResults['listDocuments'] = [];
    queryResults['getUsersByOrganizationId'] = USERS;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('Documents'));
    fireEvent.click(screen.getByText('Create your first document'));
    expect(screen.getAllByText('Create Document for Signing').length).toBeGreaterThan(0);
  });

  it('resets the wizard form after a successful send', async () => {
    queryResults['listTemplates'] = TEMPLATES;
    queryResults['getUsersByOrganizationId'] = USERS;
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('New Document'));

    fireEvent.change(screen.getByPlaceholderText('e.g., Employment Contract — John Doe'), {
      target: { value: 'Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter document text...'), {
      target: { value: 'Body' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Bob Smith'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Send for Signing'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Document sent for signing!');
    });
    // Reopening shows a fresh form.
    fireEvent.click(screen.getByText('New Document'));
    expect(
      (screen.getByPlaceholderText('e.g., Employment Contract — John Doe') as HTMLInputElement)
        .value,
    ).toBe('');
  });

  it('skips archiving when the signed PDF is already stored', async () => {
    queryResults['getDocument'] = {
      ...DOC,
      status: 'completed',
      signedPdfUrl: 'https://cdn/x.pdf',
    };
    mutationResults['signDocument'] = { completed: true };
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    const canvas = dialog.querySelector('canvas') as HTMLCanvasElement;
    const ctx = {
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      clearRect: jest.fn(),
    };
    (canvas as any).getContext = () => ctx;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 40 });
    (canvas as any).toDataURL = () => 'data:image/png;base64,SIG';
    fireEvent.click(within(dialog).getByText('Apply Signature'));
    const signButtons = within(dialog).getAllByText('Sign Document');
    fireEvent.click(signButtons[signButtons.length - 1]);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Document signed successfully!');
    });
    // No attachSignedPdf call — the URL already exists.
    expect(mutationCalls.some((m) => m.name === 'attachSignedPdf')).toBe(false);
  });

  it('toasts an archive failure when signing completes the document', async () => {
    queryResults['getDocument'] = { ...DOC, status: 'completed' };
    mutationResults['signDocument'] = { completed: true };
    const { renderDocumentPdfBase64 } = require('@/lib/exportDocument') as any;
    renderDocumentPdfBase64.mockRejectedValue(new Error('render failed'));
    render(<ESignaturesClient />);
    fireEvent.click(screen.getByText('NDA Agreement'));

    const dialog = screen.getByTestId('dialog');
    const canvas = dialog.querySelector('canvas') as HTMLCanvasElement;
    const ctx = {
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      clearRect: jest.fn(),
    };
    (canvas as any).getContext = () => ctx;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 40 });
    (canvas as any).toDataURL = () => 'data:image/png;base64,SIG';
    fireEvent.click(within(dialog).getByText('Apply Signature'));
    const signButtons = within(dialog).getAllByText('Sign Document');
    fireEvent.click(signButtons[signButtons.length - 1]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to archive signed PDF');
    });
    renderDocumentPdfBase64.mockResolvedValue('data:application/pdf;base64,AAA');
  });
});
