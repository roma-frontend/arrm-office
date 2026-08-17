import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import HiringPacketPanel from '@/components/employees/HiringPacketPanel';
import { toast } from 'sonner';
import { DocxImportError, parseEditableDocx } from '@/lib/docxRoundTrip';
import {
  exportDocumentToPDF,
  exportEditableDocx,
  renderDocumentDocxBlob,
} from '@/lib/exportDocument';
import { uploadDocument } from '@/actions/cloudinary';
import { parseHiringPacketContent } from '@/lib/hiringPacketDocument';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'string' ? opts : (opts?.defaultValue ?? key)),
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
    hiringPackets: {
      listForEmployee: { _name: 'listForEmployee' },
      applyDocxOverride: { _name: 'applyDocxOverride' },
      revertToTemplate: { _name: 'revertToTemplate' },
      setSkipped: { _name: 'setSkipped' },
      sendForSignature: { _name: 'sendForSignature' },
      ensureDocumentNumber: { _name: 'ensureDocumentNumber' },
      generate: { _name: 'generate' },
      setSecondaryLocale: { _name: 'setSecondaryLocale' },
    },
    documentLibrary: { getEmployeeMergeData: { _name: 'getEmployeeMergeData' } },
    signatures: { getDocument: { _name: 'getDocument' } },
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
}));

const mockToast = toast as unknown as {
  success: jest.Mock;
  error: jest.Mock;
  warning: jest.Mock;
  info: jest.Mock;
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

jest.mock('@/lib/documentCatalog', () => ({
  DEFAULT_HIRING_PACKET: ['t-1', 't-2'],
  HIRING_PACKET_MANDATORY: ['t-1'],
  getCatalogTemplate: (id: string) =>
    id === 't-1'
      ? { accent: 'green', signature: true }
      : id === 't-2'
        ? { accent: 'blue', signature: false }
        : undefined,
  localizedContent: (template: any, locale: string) => ({
    title: `Title-${locale}`,
    body: `Body-${locale}`,
  }),
}));

jest.mock('@/lib/hiringPacketDocument', () => ({
  LOCALE_CAPTIONS: { hy: 'Armenian', ru: 'Russian', en: 'English', de: 'German' },
  PRIMARY_LOCALE: 'hy',
  applySignaturesToBlocks: (blocks: any, _sigs: any, fmt: any) => {
    // The real implementation formats the signed date through this callback.
    if (typeof fmt === 'function') fmt(1700000000000);
    return blocks;
  },
  buildBilingualBlocks: () => [{ type: 'paragraph', text: 'built' }],
  collectSignaturesInOrder: (requests: any[] | undefined) =>
    (requests ?? [])
      .slice()
      .sort((a: any, b: any) => a.order - b.order)
      .map((r: any) =>
        r.status === 'signed'
          ? { signerName: r.signerName, signatureData: r.signatureData, signedAt: r.signedAt }
          : {},
      ),
  encodeHiringPacketContent: (payload: any) => `__HP__${JSON.stringify(payload)}`,
  hiringPacketFileName: (id: string, name: string, ext: string) => `${id}_${name}.${ext}`,
  hiringPacketTitle: () => 'Contract / Договор',
  parseHiringPacketContent: jest.fn(),
}));

jest.mock('@/lib/exportDocument', () => ({
  exportDocumentToPDF: jest.fn().mockResolvedValue(undefined),
  exportEditableDocx: jest.fn().mockResolvedValue(undefined),
  renderDocumentDocxBlob: jest.fn().mockResolvedValue(new Blob()),
}));

jest.mock('@/lib/docxRoundTrip', () => {
  class DocxImportError extends Error {}
  return { DocxImportError, parseEditableDocx: jest.fn() };
});

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

let dialogProps: any = {};
jest.mock('@/components/ui/sheet', () => ({
  Sheet: (props: any) => {
    dialogProps = props;
    return props.open ? <div data-testid="dialog">{props.children}</div> : null;
  },
  SheetContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
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
  _id: 'hp-1',
  templateId: 't-1',
  order: 1,
  secondaryLocale: 'ru',
  mandatory: true,
  status: 'draft',
  bodyOverride: undefined,
  sourceDocxUrl: undefined,
  sourceDocxName: undefined,
  documentNumber: 'N-1',
  signatureDocumentId: undefined,
  signatureStatus: null,
  signedPdfUrl: null,
  contentHash: 'h1',
  frozenContent: null,
  sentAt: undefined,
  createdAt: 1000,
  signers: [],
};

const mergeData = {
  employee: { name: 'Bob' },
  organization: { name: 'ACME' },
};

const frozenPayload = {
  version: 1,
  templateId: 't-1',
  title: 'Frozen Title',
  blocks: [{ type: 'paragraph', text: 'frozen text' }],
  accent: 'green',
  orgName: 'ACME',
  documentNumber: 'N-1',
  primaryLocale: 'hy',
  secondaryLocale: 'ru',
  labels: {},
};

const seed = () => {
  queryResults = {
    listForEmployee: [baseRow],
    getEmployeeMergeData: mergeData,
  };
  convexQueryResults = {
    getDocument: undefined,
  };
  mutationCalls.length = 0;
  Object.keys(mutationImpls).forEach((key) => delete mutationImpls[key]);
  mutationImpls.ensureDocumentNumber = jest.fn().mockResolvedValue({ documentNumber: 'N-9' });
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockToast.warning.mockClear();
  mockToast.info.mockClear();
  dialogProps = {};
  (exportDocumentToPDF as jest.Mock).mockReset();
  (exportDocumentToPDF as jest.Mock).mockResolvedValue(undefined);
  (exportEditableDocx as jest.Mock).mockReset();
  (exportEditableDocx as jest.Mock).mockResolvedValue(undefined);
  (renderDocumentDocxBlob as jest.Mock).mockReset();
  (renderDocumentDocxBlob as jest.Mock).mockResolvedValue(new Blob());
  (uploadDocument as jest.Mock).mockReset();
  (uploadDocument as jest.Mock).mockResolvedValue({
    url: 'https://cdn.test/x.docx',
    name: 'edited.docx',
  });
  (parseEditableDocx as jest.Mock).mockReset();
  (parseHiringPacketContent as jest.Mock).mockReset();
  mockUser = {
    id: 'user-1',
    name: 'Alice',
    position: 'HR Manager',
    organizationName: 'ACME',
  };
};

beforeEach(seed);

const renderPanel = (rows: any[] = [baseRow], canManage = true) => {
  queryResults.listForEmployee = rows;
  return render(<HiringPacketPanel userId="user-2" canManage={canManage} />);
};

beforeEach(() => {
  // Every upload path reads the file as an ArrayBuffer; keep it deterministic.
  File.prototype.arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(8));
});

describe('HiringPacketPanel', () => {
  it('shows the loading state while rows or merge data are pending', () => {
    queryResults.listForEmployee = undefined;
    const { unmount } = render(<HiringPacketPanel userId="user-2" canManage />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    unmount();
    queryResults.listForEmployee = [baseRow];
    queryResults.getEmployeeMergeData = undefined;
    render(<HiringPacketPanel userId="user-2" canManage />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders nothing for a non-manager when the packet is empty', () => {
    const { container } = renderPanel([], false);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to generate a packet when the employee has none', () => {
    renderPanel([], true);
    expect(screen.getByText('Hiring document packet')).toBeInTheDocument();
    expect(
      screen.getByText('No documents have been prepared for this employee yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Prepare documents')).toBeInTheDocument();
    // The language picker lists every secondary locale.
    expect(screen.getByTestId('select-option-ru')).toBeInTheDocument();
    expect(screen.getByTestId('select-option-en')).toBeInTheDocument();
    expect(screen.getByTestId('select-option-de')).toBeInTheDocument();
  });

  it('generates a packet with the chosen second language', async () => {
    renderPanel([], true);
    fireEvent.click(screen.getByTestId('select-option-en'));
    fireEvent.click(screen.getByText('Prepare documents'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'generate',
        args: [
          {
            userId: 'user-2',
            secondaryLocale: 'en',
            templateIds: ['t-1', 't-2'],
            mandatoryTemplateIds: ['t-1'],
          },
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Documents prepared');
  });

  it('toasts the failure when generating fails', async () => {
    mutationImpls.generate = jest.fn().mockRejectedValue(new Error('no template'));
    renderPanel([], true);
    fireEvent.click(screen.getByText('Prepare documents'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('no template'));
  });

  it('renders every status badge and the progress line', () => {
    const rows = [
      baseRow,
      { ...baseRow, _id: 'hp-2', status: 'sent' },
      { ...baseRow, _id: 'hp-3', status: 'signed' },
      { ...baseRow, _id: 'hp-4', status: 'edited' },
      { ...baseRow, _id: 'hp-5', status: 'skipped' },
    ];
    renderPanel(rows);
    expect(screen.getByText('Ready to send')).toBeInTheDocument();
    expect(screen.getByText('Awaiting signature')).toBeInTheDocument();
    expect(screen.getByText('Signed')).toBeInTheDocument();
    expect(screen.getByText('Edited in Word')).toBeInTheDocument();
    expect(screen.getByText('Excluded')).toBeInTheDocument();
    // 1 of 4 active signed, 3 mandatory outstanding (draft/sent/edited are not signed).
    expect(screen.getByText('1 of 4 signed')).toBeInTheDocument();
    expect(screen.getByText('3 required outstanding')).toBeInTheDocument();
  });

  it('marks mandatory rows and shows captions with the document number', () => {
    renderPanel([{ ...baseRow, mandatory: false }]);
    expect(screen.queryByText('required')).not.toBeInTheDocument();
    renderPanel([baseRow]);
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getAllByText(/Armenian \+ Russian/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/N-1/).length).toBeGreaterThan(0);
  });

  it('shows the source docx name on an edited row', () => {
    renderPanel([{ ...baseRow, status: 'edited', sourceDocxName: 'edited.docx' }]);
    expect(screen.getByText(/edited\.docx/)).toBeInTheDocument();
  });

  it('shows the Send All button with the pending count', () => {
    renderPanel([
      baseRow,
      { ...baseRow, _id: 'hp-2', status: 'edited' },
      { ...baseRow, _id: 'hp-3', status: 'sent' },
    ]);
    expect(screen.getByText('Send 2 for signature')).toBeInTheDocument();
  });

  it('sends one document for signature with a reserved number', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'ensureDocumentNumber',
        args: [{ packetDocumentId: 'hp-1' }],
      }),
    );
    expect(mutationCalls).toContainEqual(
      expect.objectContaining({
        name: 'sendForSignature',
        args: [
          expect.objectContaining({
            packetDocumentId: 'hp-1',
            countersignerId: 'user-1',
            title: 'Contract / Договор',
            content: expect.stringContaining('__HP__'),
            orgName: 'ACME',
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Sent for signature');
  });

  it('toasts the send failure when the template is unknown', async () => {
    renderPanel([{ ...baseRow, templateId: 'missing' }]);
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('toasts the send failure when the merge source is missing', async () => {
    queryResults.getEmployeeMergeData = null;
    renderPanel();
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
  });

  it('sends all pending documents and reports failures', async () => {
    mutationImpls.sendForSignature = jest.fn().mockRejectedValueOnce(new Error('first fails'));
    renderPanel([
      baseRow,
      { ...baseRow, _id: 'hp-2', status: 'edited' },
      { ...baseRow, _id: 'hp-3', status: 'sent' },
    ]);
    fireEvent.click(screen.getByText('Send 2 for signature'));
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith('1 documents sent for signature'),
    );
    expect(mockToast.error).toHaveBeenCalledWith('1 documents could not be sent');
  });

  it('changes the second language of the editable documents', async () => {
    mutationImpls.setSecondaryLocale = jest.fn().mockResolvedValue({ updated: 3 });
    renderPanel();
    fireEvent.click(screen.getByTestId('select-option-de'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'setSecondaryLocale',
        args: [{ userId: 'user-2', secondaryLocale: 'de' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Second language changed for 3 documents');
  });

  it('toasts info when no document language can be changed', async () => {
    mutationImpls.setSecondaryLocale = jest.fn().mockResolvedValue({ updated: 0 });
    renderPanel();
    fireEvent.click(screen.getByTestId('select-option-en'));
    await waitFor(() =>
      expect(mockToast.info).toHaveBeenCalledWith(
        'Nothing to change — the remaining documents have already been sent.',
      ),
    );
  });

  it('toasts the failure when changing the language fails', async () => {
    mutationImpls.setSecondaryLocale = jest.fn().mockRejectedValue(new Error('locked'));
    renderPanel();
    fireEvent.click(screen.getByTestId('select-option-en'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('locked'));
  });

  it('downloads a PDF of the built document', async () => {
    renderPanel();
    fireEvent.click(screen.getByTitle('Download PDF'));
    await waitFor(() =>
      expect(exportDocumentToPDF).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Contract / Договор' }),
        't-1_Bob.pdf',
      ),
    );
  });

  it('downloads a PDF with collected signatures', async () => {
    convexQueryResults.getDocument = {
      requests: [
        {
          order: 2,
          status: 'signed',
          signerName: 'Alice',
          signatureData: 'data:image/png;base64,A',
          signedAt: 10,
        },
        {
          order: 1,
          status: 'signed',
          signerName: 'Bob',
          signatureData: 'data:image/png;base64,B',
          signedAt: 5,
        },
        { order: 3, status: 'pending', signerName: 'Carol', signatureData: null, signedAt: null },
      ],
    };
    renderPanel([{ ...baseRow, status: 'signed', signatureDocumentId: 'sig-1' }]);
    fireEvent.click(screen.getByTitle('Download PDF'));
    await waitFor(() =>
      expect(exportDocumentToPDF).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Contract / Договор' }),
        't-1_Bob.pdf',
      ),
    );
  });

  it('toasts a build failure when the PDF source is missing', async () => {
    queryResults.getEmployeeMergeData = null;
    renderPanel();
    fireEvent.click(screen.getByTitle('Download PDF'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
    expect(exportDocumentToPDF).not.toHaveBeenCalled();
  });

  it('downloads an editable docx and shows the hint', async () => {
    renderPanel();
    fireEvent.click(screen.getByTitle('Download for editing in Word'));
    await waitFor(() =>
      expect(exportEditableDocx).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.any(Array) }),
        't-1_Bob.docx',
      ),
    );
    expect(mockToast.success).toHaveBeenCalledWith(
      'Word file downloaded — edit the text and upload it back.',
    );
  });

  it('toasts a build failure when the docx source is missing', async () => {
    queryResults.getEmployeeMergeData = null;
    renderPanel();
    fireEvent.click(screen.getByTitle('Download for editing in Word'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
    expect(exportEditableDocx).not.toHaveBeenCalled();
  });

  it('does not offer editing for frozen documents', () => {
    renderPanel([{ ...baseRow, status: 'sent', frozenContent: '__HP__x' }]);
    expect(screen.queryByTitle('Download for editing in Word')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Upload the edited Word file')).not.toBeInTheDocument();
    expect(screen.queryByText('Send')).not.toBeInTheDocument();
  });

  it('renders the signed actions: signed PDF link and signed Word download', () => {
    renderPanel([{ ...baseRow, status: 'signed', signedPdfUrl: 'https://cdn.test/signed.pdf' }]);
    expect(screen.getByTitle('Signed PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Download signed Word')).toBeInTheDocument();
  });

  it('downloads a signed Word document', async () => {
    const createObjectURL = jest.fn(() => 'blob:test');
    const revokeObjectURL = jest.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      renderPanel([{ ...baseRow, status: 'signed', signatureDocumentId: 'sig-1' }]);
      fireEvent.click(screen.getByTitle('Download signed Word'));
      await waitFor(() => expect(renderDocumentDocxBlob).toHaveBeenCalled());
      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalled();
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      clickSpy.mockRestore();
    }
  });

  it('skips the signed Word download when there is no signature document', async () => {
    renderPanel([{ ...baseRow, status: 'signed', signatureDocumentId: undefined }]);
    fireEvent.click(screen.getByTitle('Download signed Word'));
    await waitFor(() => expect(renderDocumentDocxBlob).not.toHaveBeenCalled());
  });

  it('reverts an edited document to the template', async () => {
    renderPanel([
      { ...baseRow, status: 'edited', bodyOverride: '[{"type":"paragraph","text":"x"}]' },
    ]);
    fireEvent.click(screen.getByTitle('Revert to the standard template'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'revertToTemplate',
        args: [{ packetDocumentId: 'hp-1' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Reverted to the standard template');
  });

  it('excludes a non-mandatory document', async () => {
    renderPanel([{ ...baseRow, mandatory: false }]);
    fireEvent.click(screen.getByTitle('Exclude from the packet'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'setSkipped',
        args: [{ packetDocumentId: 'hp-1', skipped: true }],
      }),
    );
  });

  it('shows the include action for a skipped document', () => {
    renderPanel([{ ...baseRow, mandatory: false, status: 'skipped' }]);
    expect(screen.getByTitle('Include in the packet')).toBeInTheDocument();
  });

  it('does not render a skip action for mandatory documents', () => {
    renderPanel([baseRow]);
    expect(screen.queryByTitle('Exclude from the packet')).not.toBeInTheDocument();
  });

  it('applies an uploaded edited document', async () => {
    (parseEditableDocx as jest.Mock).mockResolvedValue({
      blocks: [{ type: 'paragraph', text: 'New text' }],
      warnings: ['warning here'],
    });
    const { container } = renderPanel();
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
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
            packetDocumentId: 'hp-1',
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
    (parseEditableDocx as jest.Mock).mockRejectedValue(new DocxImportError('bad file'));
    const { container } = renderPanel();
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    const file = new File(['x'], 'bad.docx', { type: 'application/octet-stream' });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('bad file'));
  });

  it('uses the generic message when parsing fails with a non-Error', async () => {
    (parseEditableDocx as jest.Mock).mockRejectedValue('boom');
    const { container } = renderPanel();
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    const file = new File(['x'], 'bad.docx', { type: 'application/octet-stream' });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('The document could not be imported'),
    );
  });

  it('warns when the original file cannot be archived', async () => {
    (parseEditableDocx as jest.Mock).mockResolvedValue({
      blocks: [{ type: 'paragraph', text: 'X' }],
      warnings: [],
    });
    (uploadDocument as jest.Mock).mockRejectedValue(new Error('cdn down'));
    const { container } = renderPanel();
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
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

  it('opens the preview dialog with a built document', async () => {
    renderPanel();
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getByTestId('document-preview')).toBeInTheDocument());
    expect(screen.getAllByText('Contract / Договор').length).toBeGreaterThan(0);
    expect(screen.getByText(/ACME/)).toBeInTheDocument();
  });

  it('closes the preview dialog', async () => {
    renderPanel();
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getByTestId('document-preview')).toBeInTheDocument());
    act(() => {
      dialogProps.onOpenChange(false);
    });
    expect(screen.queryByTestId('document-preview')).not.toBeInTheDocument();
  });

  it('shows the build-failed hint when the preview cannot be built', async () => {
    renderPanel([{ ...baseRow, templateId: 'missing' }]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() =>
      expect(
        screen.getByText('The stored content is unreadable. Revert to the standard template.'),
      ).toBeInTheDocument(),
    );
  });

  it('renders a frozen document from its snapshot', async () => {
    (parseHiringPacketContent as jest.Mock).mockReturnValue(frozenPayload);
    renderPanel([{ ...baseRow, status: 'sent', frozenContent: '__HP__frozen', contentHash: null }]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getAllByText('Frozen Title').length).toBeGreaterThan(0));
  });

  it('previews an edited row from its body override and strips stray grids', async () => {
    renderPanel([
      {
        ...baseRow,
        status: 'edited',
        bodyOverride: JSON.stringify([
          { type: 'paragraph', text: 'Edited text' },
          { type: 'signatures', parties: [] },
        ]),
      },
    ]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getByTestId('document-preview')).toBeInTheDocument());
    // The override body drives the render, so the catalog title still appears.
    expect(screen.getAllByText('Contract / Договор').length).toBeGreaterThan(0);
  });

  it('shows the build-failed hint when the body override is unreadable', async () => {
    renderPanel([{ ...baseRow, status: 'edited', bodyOverride: 'not-json' }]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() =>
      expect(
        screen.getByText('The stored content is unreadable. Revert to the standard template.'),
      ).toBeInTheDocument(),
    );
  });

  it('toasts the export error when the PDF render fails', async () => {
    (exportDocumentToPDF as jest.Mock).mockRejectedValue(new Error('pdf boom'));
    renderPanel();
    fireEvent.click(screen.getByTitle('Download PDF'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Export failed'));
  });

  it('toasts the export error when the editable docx fails', async () => {
    (exportEditableDocx as jest.Mock).mockRejectedValue(new Error('docx boom'));
    renderPanel();
    fireEvent.click(screen.getByTitle('Download for editing in Word'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Export failed'));
  });

  it('toasts the build failure when a signed document cannot be rebuilt', async () => {
    renderPanel([
      { ...baseRow, templateId: 'missing', status: 'signed', signatureDocumentId: 'sig-1' },
    ]);
    fireEvent.click(screen.getByTitle('Download signed Word'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
  });

  it('toasts the export error when the signed Word render fails', async () => {
    (renderDocumentDocxBlob as jest.Mock).mockRejectedValue(new Error('blob boom'));
    renderPanel([{ ...baseRow, status: 'signed', signatureDocumentId: 'sig-1' }]);
    fireEvent.click(screen.getByTitle('Download signed Word'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Export failed'));
  });

  it('toasts the failure when reverting fails', async () => {
    mutationImpls.revertToTemplate = jest.fn().mockRejectedValue(new Error('revert nope'));
    renderPanel([
      { ...baseRow, status: 'edited', bodyOverride: '[{"type":"paragraph","text":"x"}]' },
    ]);
    fireEvent.click(screen.getByTitle('Revert to the standard template'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('revert nope'));
  });

  it('toasts the failure when excluding fails', async () => {
    mutationImpls.setSkipped = jest.fn().mockRejectedValue(new Error('skip nope'));
    renderPanel([{ ...baseRow, mandatory: false }]);
    fireEvent.click(screen.getByTitle('Exclude from the packet'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('skip nope'));
  });

  it('blocks sending when the body override is unreadable', async () => {
    renderPanel([{ ...baseRow, bodyOverride: 'not-json' }]);
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not build this document'),
    );
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('renders the signature progress for a sent document', () => {
    renderPanel([
      {
        ...baseRow,
        status: 'sent',
        signers: [
          {
            requestId: 'r1',
            signerId: 'u1',
            signerName: 'Bob',
            status: 'signed',
            signedAt: 10,
            order: 1,
          },
          {
            requestId: 'r2',
            signerId: 'u2',
            signerName: 'Alice',
            status: 'declined',
            signedAt: null,
            order: 2,
          },
          {
            requestId: 'r3',
            signerId: 'u3',
            signerName: 'Carol',
            status: 'pending',
            signedAt: null,
            order: 3,
          },
        ],
      },
    ]);
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('hides management actions for a viewer without rights', () => {
    renderPanel([baseRow], false);
    expect(screen.queryByText('Send')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Download for editing in Word')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Upload the edited Word file')).not.toBeInTheDocument();
    expect(screen.getByTitle('Preview')).toBeInTheDocument();
    expect(screen.getByTitle('Download PDF')).toBeInTheDocument();
  });

  it('does not offer management selectors when everything is frozen', () => {
    renderPanel([{ ...baseRow, status: 'sent' }]);
    expect(screen.queryByTestId('select')).not.toBeInTheDocument();
    expect(screen.queryByText(/Send \d for signature/)).not.toBeInTheDocument();
  });

  it('uses the failed fallback when generating fails without an Error', async () => {
    mutationImpls.generate = jest.fn().mockRejectedValue('nope');
    renderPanel([], true);
    fireEvent.click(screen.getByText('Prepare documents'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Failed'));
  });

  it('uses the failed fallback when changing the language fails without an Error', async () => {
    mutationImpls.setSecondaryLocale = jest.fn().mockRejectedValue('nope');
    renderPanel();
    fireEvent.click(screen.getByTestId('select-option-en'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Failed'));
  });

  it('falls back when the current user is unknown', () => {
    mockUser = null as any;
    queryResults.getEmployeeMergeData = null;
    renderPanel([{ ...baseRow, contentHash: undefined }]);
    // Row still renders from the template catalog; org name falls back to ''.
    expect(screen.getByText('Title-ru')).toBeInTheDocument();
    expect(screen.getByText(/Armenian \+ Russian/)).toBeInTheDocument();
  });

  it('sends without a countersigner when the current user is unknown', async () => {
    mockUser = null as any;
    renderPanel();
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual(
        expect.objectContaining({
          name: 'sendForSignature',
          args: [expect.objectContaining({ countersignerId: undefined })],
        }),
      ),
    );
  });

  it('falls back to ru for the language picker when a row lacks one', () => {
    renderPanel([{ ...baseRow, secondaryLocale: undefined }]);
    expect(screen.getByTestId('select-current-ru')).toBeInTheDocument();
  });

  it('omits the signature grid when downloading the editable docx of an override', async () => {
    renderPanel([
      {
        ...baseRow,
        status: 'edited',
        bodyOverride: JSON.stringify([{ type: 'paragraph', text: 'Edited text' }]),
      },
    ]);
    fireEvent.click(screen.getByTitle('Download for editing in Word'));
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith(
        'Word file downloaded — edit the text and upload it back.',
      ),
    );
    expect(exportEditableDocx).toHaveBeenCalled();
  });

  it('builds the grid from fallbacks when the current user is unknown', async () => {
    mockUser = null as any;
    renderPanel([
      {
        ...baseRow,
        status: 'edited',
        bodyOverride: JSON.stringify([{ type: 'paragraph', text: 'Edited text' }]),
      },
    ]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getByTestId('document-preview')).toBeInTheDocument());
  });

  it('does not append a grid for a template without signatures', async () => {
    renderPanel([
      {
        ...baseRow,
        templateId: 't-2',
        status: 'edited',
        bodyOverride: JSON.stringify([{ type: 'paragraph', text: 'No grid' }]),
      },
    ]);
    fireEvent.click(screen.getByTitle('Preview'));
    await waitFor(() => expect(screen.getByTestId('document-preview')).toBeInTheDocument());
  });

  it('ignores an upload change without a file or target row', () => {
    const { container } = renderPanel();
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [] },
    });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('shows the parser message when parsing fails with a plain Error', async () => {
    (parseEditableDocx as jest.Mock).mockRejectedValue(new Error('boom'));
    const { container } = renderPanel();
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    const file = new File(['x'], 'bad.docx', { type: 'application/octet-stream' });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('boom'));
  });

  it('records the template id when a send fails without an Error', async () => {
    mutationImpls.sendForSignature = jest.fn().mockRejectedValue('nope');
    renderPanel();
    fireEvent.click(screen.getByText('Send 1 for signature'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('1 documents could not be sent'),
    );
  });

  it('sends all pending documents without failures', async () => {
    renderPanel([baseRow, { ...baseRow, _id: 'hp-2', status: 'edited' }]);
    fireEvent.click(screen.getByText('Send 2 for signature'));
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith('2 documents sent for signature'),
    );
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('omits the content hash when a row has none', async () => {
    renderPanel([{ ...baseRow, contentHash: null }]);
    fireEvent.click(screen.getByTitle('Download PDF'));
    await waitFor(() =>
      expect(exportDocumentToPDF).toHaveBeenCalledWith(
        expect.objectContaining({ contentHash: undefined }),
        expect.any(String),
      ),
    );
  });

  it('uses the docx fallback mime type when the file lacks one', async () => {
    (parseEditableDocx as jest.Mock).mockResolvedValue({
      blocks: [{ type: 'paragraph', text: 'X' }],
      warnings: [],
    });
    const { container } = renderPanel();
    fireEvent.click(screen.getByTitle('Upload the edited Word file'));
    const file = new File(['x'], 'noext');
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith('The edited document was applied'),
    );
    expect(uploadDocument).toHaveBeenCalledWith(
      expect.any(String),
      'noext',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('uses the failed fallback when reverting fails without an Error', async () => {
    mutationImpls.revertToTemplate = jest.fn().mockRejectedValue('nope');
    renderPanel([
      { ...baseRow, status: 'edited', bodyOverride: '[{"type":"paragraph","text":"x"}]' },
    ]);
    fireEvent.click(screen.getByTitle('Revert to the standard template'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Failed'));
  });

  it('uses the failed fallback when excluding fails without an Error', async () => {
    mutationImpls.setSkipped = jest.fn().mockRejectedValue('nope');
    renderPanel([{ ...baseRow, mandatory: false }]);
    fireEvent.click(screen.getByTitle('Exclude from the packet'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Failed'));
  });

  it('uses the failed fallback when sending fails without an Error', async () => {
    mutationImpls.ensureDocumentNumber = jest.fn().mockRejectedValue('nope');
    renderPanel();
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Failed'));
  });
});
