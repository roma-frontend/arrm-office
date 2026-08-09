import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import IssuedDocumentsTab, {
  blockText,
  blockKind,
} from '@/components/documents/IssuedDocumentsTab';
import { toast } from 'sonner';
import { DocxImportError, parseEditableDocx } from '@/lib/docxRoundTrip';
import { exportDocumentToPDF, exportEditableDocx } from '@/lib/exportDocument';
import { uploadDocument } from '@/actions/cloudinary';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'string' ? opts : key),
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, any> = {};
let convexQueryResults: Record<string, any> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const mutationImpls: Record<string, (...args: any[]) => any> = {};

jest.mock('convex/react', () => ({
  useConvex: () => ({
    query: (ref: { _name?: string }) => Promise.resolve(convexQueryResults[ref?._name ?? '']),
  }),
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      const impl = mutationImpls[ref?._name ?? ''];
      return impl ? impl(...args) : Promise.resolve();
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    issuedDocuments: {
      list: { _name: 'list' },
      getSummary: { _name: 'getSummary' },
      applyDocxOverride: { _name: 'applyDocxOverride' },
      revertToTemplate: { _name: 'revertToTemplate' },
      ensureDocumentNumber: { _name: 'ensureDocumentNumber' },
      sendForSignature: { _name: 'sendForSignature' },
      cancel: { _name: 'cancel' },
      remove: { _name: 'remove' },
      getRenderSource: { _name: 'getRenderSource' },
    },
    documentLibrary: { getEmployeeMergeData: { _name: 'getEmployeeMergeData' } },
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

const mockToast = toast as unknown as {
  success: jest.Mock;
  error: jest.Mock;
  warning: jest.Mock;
};

let mockUser: any = {
  id: 'user-1',
  name: 'Alice',
  position: 'HR Manager',
  organizationName: 'ACME',
};
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

jest.mock('@/hooks/useDocumentLabels', () => ({
  useDocumentLabels: () => ({
    signature: 'Signature',
    name: 'Name',
    position: 'Position',
    date: 'Date',
    generatedOn: 'Generated on',
    integrity: 'Integrity',
  }),
}));

let mockBuildBlocks: any[] = [{ type: 'paragraph', text: 'built' }];
jest.mock('@/lib/bilingualDocument', () => ({
  LOCALE_CAPTIONS: { en: 'English', ru: 'Russian', hy: 'Armenian', de: 'German' },
  isBilingualPair: (l: any) => Boolean(l.primary && l.secondary),
  documentFileName: (title: string, name: string, ext: string) => `${title}-${name}.${ext}`,
  documentTitle: (titles: any, locales: any) => (titles ? titles[locales.primary] : undefined),
  encodeDocumentContent: (opts: any) =>
    JSON.stringify({ version: opts.version, title: opts.title, edited: opts.edited }),
  buildDocumentBlocks: () => mockBuildBlocks,
  parseTemplateBodyToBlocks: (body: string) => (body ? [{ type: 'paragraph', text: body }] : []),
}));

jest.mock('@/lib/exportDocument', () => ({
  exportDocumentToPDF: jest.fn().mockResolvedValue(undefined),
  exportEditableDocx: jest.fn().mockResolvedValue(undefined),
  isBlockBody: (body: any) => Array.isArray(body) && body.length > 0,
}));

jest.mock('@/lib/docxRoundTrip', () => {
  class DocxImportError extends Error {}
  return { DocxImportError, parseEditableDocx: jest.fn() };
});

jest.mock('@/lib/documentCatalog', () => ({
  getCatalogTemplate: (id: string) =>
    id === 't-1' ? { accent: 'green', signature: true } : undefined,
  localizedContent: (template: any, locale: string) => ({
    body: `body-${locale}`,
    title: `Title-${locale}`,
  }),
}));

jest.mock('@/actions/cloudinary', () => ({
  uploadDocument: jest.fn().mockResolvedValue({ url: 'https://cdn.test/x.docx' }),
}));

jest.mock('@/components/documents/DocumentBlocksPreview', () => ({
  DocumentPreview: ({ doc }: any) => <div data-testid="document-preview">{doc.title}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => (
    <button type={props.type || 'button'} {...props}>
      {props.children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => <span className={className}>{children}</span>,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

let dialogProps: any = {};
jest.mock('@/components/ui/dialog', () => ({
  Dialog: (props: any) => {
    dialogProps = props;
    return props.open ? <div data-testid="dialog">{props.children}</div> : null;
  },
  DialogContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
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

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const baseRow: any = {
  _id: 'doc-1',
  organizationId: 'org-1',
  recipientId: 'user-2',
  recipientName: 'Bob',
  recipientPosition: 'Engineer',
  issuerName: 'Alice',
  source: 'blueprint',
  blueprintId: 'bp-1',
  blueprintVersion: 2,
  primaryLocale: 'en',
  secondaryLocale: 'hy',
  title: 'Offer Letter',
  status: 'draft',
  createdAt: 12345,
};

const draftRow = { ...baseRow, documentNumber: 'N-1' };
const editedRow = {
  ...baseRow,
  _id: 'doc-2',
  title: 'Edited Doc',
  status: 'edited',
  bodyOverride: JSON.stringify([{ type: 'paragraph', text: 'Edited' }]),
  sourceDocxName: 'edited.docx',
};
const sentRow = { ...baseRow, _id: 'doc-3', title: 'Sent Doc', status: 'sent' };
const signedRow = { ...baseRow, _id: 'doc-4', title: 'Signed Doc', status: 'signed' };
const cancelledRow = { ...baseRow, _id: 'doc-5', title: 'Cancelled Doc', status: 'cancelled' };
const catalogRow = {
  ...baseRow,
  _id: 'doc-6',
  title: 'Catalog Doc',
  source: 'catalog',
  templateId: 't-1',
  blueprintId: undefined,
};

const mergeData = {
  employee: { name: 'Bob' },
  organization: { name: 'ACME' },
};

const renderSource = {
  source: 'blueprint',
  snapshot: {
    segments: [{ id: 's1', kind: 'paragraph', text: { en: 'Hi' } }],
    accent: 'blue',
    signature: true,
    titles: { en: 'Offer Letter' },
  },
};

const seed = () => {
  queryResults = {
    list: [draftRow],
    getSummary: { draft: 2, edited: 1, sent: 3, signed: 4 },
  };
  convexQueryResults = {
    getEmployeeMergeData: mergeData,
    getRenderSource: renderSource,
  };
  mutationCalls.length = 0;
  Object.keys(mutationImpls).forEach((key) => delete mutationImpls[key]);
  mutationImpls.ensureDocumentNumber = jest.fn().mockResolvedValue({ documentNumber: 'N-9' });
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockToast.warning.mockClear();
  dialogProps = {};
  mockBuildBlocks = [{ type: 'paragraph', text: 'built' }];
  (exportDocumentToPDF as jest.Mock).mockClear();
  (exportEditableDocx as jest.Mock).mockClear();
  (uploadDocument as jest.Mock).mockClear();
  (uploadDocument as jest.Mock).mockResolvedValue({ url: 'https://cdn.test/x.docx' });
  (parseEditableDocx as jest.Mock).mockReset();
  mockUser = {
    id: 'user-1',
    name: 'Alice',
    position: 'HR Manager',
    organizationName: 'ACME',
  };
};

beforeEach(seed);

const renderTab = (rows: any[]) => {
  queryResults.list = rows;
  return render(<IssuedDocumentsTab organizationId="org-1" as any />);
};

File.prototype.arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(8));

describe('IssuedDocumentsTab', () => {
  it('shows the loading state', () => {
    queryResults.list = undefined;
    render(<IssuedDocumentsTab organizationId="org-1" as any />);
    expect(screen.getByText('Loading documents…')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    renderTab([]);
    expect(
      screen.getByText('No documents issued yet. Issue one from the Templates tab.'),
    ).toBeInTheDocument();
  });

  it('renders a row with recipient, captions and document number', () => {
    renderTab([draftRow]);
    expect(screen.getByText('Offer Letter')).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(screen.getByText(/Engineer/)).toBeInTheDocument();
    expect(screen.getAllByText(/English \+ Armenian/).length).toBeGreaterThan(0);
    expect(screen.getByText(/N-1/)).toBeInTheDocument();
  });

  it('renders a status badge for every status', () => {
    renderTab([draftRow, editedRow, sentRow, signedRow, cancelledRow]);
    expect(screen.getByText('Ready to send')).toBeInTheDocument();
    expect(screen.getByText('Edited in Word')).toBeInTheDocument();
    expect(screen.getByText('Awaiting signature')).toBeInTheDocument();
    expect(screen.getByText('Signed')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows the summary counters', () => {
    renderTab();
    expect(screen.getByText('issued.statusDraft: 3')).toBeInTheDocument();
    expect(screen.getByText('issued.statusSent: 3')).toBeInTheDocument();
    expect(screen.getByText('issued.statusSigned: 4')).toBeInTheDocument();
  });

  it('filters by status and searches', () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Title, employee or number…'), {
      target: { value: 'offer' },
    });
    fireEvent.click(screen.getByTestId('select-option-sent'));
    expect(screen.getByTestId('select-current-sent')).toBeInTheDocument();
  });

  it('hides editing actions for frozen documents', () => {
    renderTab([sentRow]);
    expect(screen.queryByTitle('Download for editing in Word')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Upload the edited Word file')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Revert to the template')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Cancel')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Send')).not.toBeInTheDocument();
    expect(screen.getByTitle('Download PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Preview')).toBeInTheDocument();
  });

  it('shows a delete action for cancelled documents', async () => {
    renderTab([cancelledRow]);
    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'remove',
        args: [{ issuedDocumentId: 'doc-5' }],
      }),
    );
  });

  it('opens the preview dialog with a built document', async () => {
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getByTestId('document-preview')).toBeInTheDocument());
    expect(screen.getAllByText('Offer Letter').length).toBeGreaterThan(0);
    expect(screen.getByText(/ACME/)).toBeInTheDocument();
  });

  it('shows the source docx name on the row', () => {
    renderTab([editedRow]);
    expect(screen.getByText(/edited\.docx/)).toBeInTheDocument();
  });

  it('toasts a build failure when the render source is missing', async () => {
    convexQueryResults.getRenderSource = null;
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
  });

  it('toasts a build failure when a blueprint snapshot is missing', async () => {
    convexQueryResults.getRenderSource = {
      source: 'blueprint',
      snapshot: null,
    };
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
  });

  it('toasts a build failure when the catalog template is unknown', async () => {
    convexQueryResults.getRenderSource = {
      source: 'catalog',
      templateId: 'missing',
    };
    renderTab([catalogRow]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
  });

  it('previews a catalog template document', async () => {
    convexQueryResults.getRenderSource = {
      source: 'catalog',
      templateId: 't-1',
    };
    renderTab([catalogRow]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getByTestId('document-preview')).toBeInTheDocument());
  });

  it('downloads a PDF with a reserved document number', async () => {
    mutationImpls.ensureDocumentNumber = jest.fn().mockResolvedValue({ documentNumber: 'N-9' });
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Download PDF'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'ensureDocumentNumber',
        args: [{ issuedDocumentId: 'doc-1' }],
      }),
    );
    expect(exportDocumentToPDF).toHaveBeenCalledWith(
      expect.objectContaining({ documentNumber: 'N-9' }),
      'Offer Letter-Bob.pdf',
    );
  });

  it('downloads an editable docx and shows the hint', async () => {
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Download for editing in Word'));
    await waitFor(() =>
      expect(exportEditableDocx).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.any(Array) }),
        'Offer Letter-Bob.docx',
      ),
    );
    expect(mockToast.success).toHaveBeenCalledWith(
      'Word file downloaded — edit the text and upload it back.',
    );
  });

  it('toasts a build failure when the PDF source is missing', async () => {
    convexQueryResults.getRenderSource = null;
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Download PDF'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
    expect(exportDocumentToPDF).not.toHaveBeenCalled();
  });

  it('toasts a build failure when the docx source is missing', async () => {
    convexQueryResults.getRenderSource = null;
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Download for editing in Word'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
    expect(exportEditableDocx).not.toHaveBeenCalled();
  });

  it('closes the preview dialog', async () => {
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getByTestId('document-preview')).toBeInTheDocument());
    act(() => {
      dialogProps.onOpenChange(false);
    });
    expect(screen.queryByTestId('document-preview')).not.toBeInTheDocument();
  });

  it('sends the document for signature', async () => {
    renderTab([draftRow]);
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'sendForSignature',
        args: [
          expect.objectContaining({
            issuedDocumentId: 'doc-1',
            countersignerId: 'user-1',
            content: expect.stringContaining('Offer Letter'),
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Sent for signature');
  });

  it('blocks sending when the built body is empty', async () => {
    mockBuildBlocks = [];
    renderTab([draftRow]);
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
  });

  it('reverts an edited document to the template', async () => {
    renderTab([editedRow]);
    fireEvent.click(screen.getByTitle('Revert to the template'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'revertToTemplate',
        args: [{ issuedDocumentId: 'doc-2' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Reverted to the template');
  });

  it('cancels a draft document', async () => {
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Cancel'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'cancel',
        args: [{ issuedDocumentId: 'doc-1' }],
      }),
    );
  });

  it('toasts an error message when an action fails', async () => {
    mutationImpls.cancel = jest.fn().mockRejectedValue(new Error('nope'));
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Cancel'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('nope'));
  });

  it('uses the fallback message for non-Error failures', async () => {
    mutationImpls.cancel = jest.fn().mockRejectedValue('nope');
    renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Cancel'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Action failed'));
  });

  it('rejects files larger than the size limit', async () => {
    const { container } = renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [big] },
    });
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('The file is larger than 10 MB'),
    );
  });

  it('applies an uploaded edited document', async () => {
    const { container } = renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    (parseEditableDocx as jest.Mock).mockResolvedValue({
      blocks: [{ type: 'paragraph', text: 'New text' }],
      warnings: ['warning here'],
    });
    const file = new File(['content'], 'edited.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'applyDocxOverride',
        args: [
          expect.objectContaining({
            issuedDocumentId: 'doc-1',
            sourceDocxName: 'edited.docx',
          }),
        ],
      }),
    );
    expect(mockToast.warning).toHaveBeenCalledWith('warning here');
    expect(uploadDocument).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('The edited document was applied');
  });

  it('shows the import error when the docx cannot be parsed', async () => {
    const { container } = renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    (parseEditableDocx as jest.Mock).mockRejectedValue(new DocxImportError('bad file'));
    const file = new File(['x'], 'bad.docx', { type: 'application/octet-stream' });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('bad file'));
  });

  it('uses the generic message when parsing fails with another error', async () => {
    const { container } = renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    (parseEditableDocx as jest.Mock).mockRejectedValue(new Error('boom'));
    const file = new File(['x'], 'bad.docx', { type: 'application/octet-stream' });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('The document could not be imported'),
    );
  });

  it('warns when the original file cannot be archived', async () => {
    const { container } = renderTab([draftRow]);
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    (parseEditableDocx as jest.Mock).mockResolvedValue({
      blocks: [{ type: 'paragraph', text: 'X' }],
      warnings: [],
    });
    (uploadDocument as jest.Mock).mockRejectedValue(new Error('cdn down'));
    const file = new File(['x'], 'ok.docx', { type: 'application/octet-stream' });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(mockToast.warning).toHaveBeenCalledWith(
        'The edited text was applied, but the original file could not be archived.',
      ),
    );
  });
});

describe('blockText / blockKind', () => {
  it('renders section titles with or without an index', () => {
    expect(blockText({ type: 'section', title: 'Solo' } as any)).toBe('Solo');
    expect(blockText({ type: 'section', index: 2, title: 'Heading' } as any)).toBe('2. Heading');
  });

  it('renders paragraph and callout text', () => {
    expect(blockText({ type: 'paragraph', text: 'P' } as any)).toBe('P');
    expect(blockText({ type: 'callout', text: 'C' } as any)).toBe('C');
  });

  it('renders bullets and field rows', () => {
    expect(blockText({ type: 'bullets', items: ['a', 'b'] } as any)).toBe('- a\n- b');
    expect(blockText({ type: 'fields', rows: [{ label: 'L', value: 'V' }] } as any)).toBe('L: V');
  });

  it('returns an empty string for unknown block types', () => {
    expect(blockText({ type: 'mystery' } as any)).toBe('');
  });

  it('maps every block kind and falls back to paragraph', () => {
    const section = { type: 'section' };
    const bullets = { type: 'bullets' };
    const fields = { type: 'fields' };
    const callout = { type: 'callout' };
    const paragraph = { type: 'paragraph' };
    expect(blockKind(new Map([['en', [section]]]), 0)).toBe('section');
    expect(blockKind(new Map([['en', [bullets]]]), 0)).toBe('bullets');
    expect(blockKind(new Map([['en', [fields]]]), 0)).toBe('fields');
    expect(blockKind(new Map([['en', [callout]]]), 0)).toBe('callout');
    expect(blockKind(new Map([['en', [paragraph]]]), 0)).toBe('paragraph');
    expect(blockKind(new Map([['en', [paragraph]]]), 5)).toBe('paragraph');
  });
});
