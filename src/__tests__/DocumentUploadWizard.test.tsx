/**
 * Tests for DocumentUploadWizard — the 4-step document upload wizard
 * (file → details → settings → review) with Cloudinary upload, template
 * prefill, draft persistence and publication.
 *
 * Mocks: react-i18next, convex/react (useMutation keyed by _name, useQuery for
 * the template), generated api, cloudinary action, auth store, selected org,
 * useMainRef, useWizardDraft (controllable), WizardDraftNotice, sonner,
 * logger, cssMotion, ShieldLoader, lucide, next/image, and all ui primitives.
 * FileReader is stubbed to resolve data URLs synchronously.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockCreateDocument = jest.fn();
const mockUpdateDocument = jest.fn();
let mockTemplateData: { title: string; description?: string } | undefined;
jest.mock('convex/react', () => ({
  useMutation: (mutation: any) =>
    mutation?._name === 'createDocument' ? mockCreateDocument : mockUpdateDocument,
  useQuery: () => mockTemplateData,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    documents: {
      createDocument: { _name: 'createDocument' },
      updateDocument: { _name: 'updateDocument' },
    },
    signatures: { getTemplate: { _name: 'getTemplate' } },
  },
}));

// ── Cloudinary ───────────────────────────────────────────────────────────────
const mockUploadDocument = jest.fn();
jest.mock('@/actions/cloudinary', () => ({
  uploadDocument: (...args: any[]) => mockUploadDocument(...args),
}));

// ── Auth / org ───────────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> = { id: 'u1', organizationId: 'org-1' };
let mockOrgId: string | null = 'org-1';
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrgId,
}));

jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: { style: { overflow: 'visible' } } }),
}));

// ── Draft (controllable) ─────────────────────────────────────────────────────
let mockDraft: {
  restored: boolean;
  restoredStep: number;
  clearDraft: jest.Mock;
};
jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (opts: any) => {
    // The effect is always registered so the hook count stays stable across
    // renders (a conditional hook here breaks React's hook bookkeeping when
    // restored flips from true to false after "Start over").
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      if (mockDraft.restored) {
        opts.onRestore?.(
          {
            uploadedFile: {
              url: 'https://cdn.test/saved.pdf',
              name: 'saved.pdf',
              size: 2048,
              type: 'application/pdf',
            },
            title: 'Saved title',
            description: 'Saved desc',
            category: 'contract',
            tagsInput: 'draft, tags',
            isMandatory: true,
            publishImmediately: false,
            enableExpiration: false,
            expiresAt: '',
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
  WizardDraftNotice: ({ show, step, onReset }: any) =>
    show ? (
      <div data-testid="draft-notice" data-step={step}>
        <button type="button" onClick={onReset}>
          Start over
        </button>
      </div>
    ) : null,
}));

// ── Toast / logger / animation / icons ───────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), log: jest.fn(), warn: jest.fn() },
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const names = [
    'Upload',
    'FileText',
    'ChevronLeft',
    'ChevronRight',
    'CheckCircle',
    'X',
    'File',
    'Image',
    'Video',
    'Music',
    'Settings',
    'Info',
    'Eye',
  ];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
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

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, id }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
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
      <div data-testid="select">
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

import DocumentUploadWizard from '@/components/documents/DocumentUploadWizard';
import { toast } from 'sonner';
import { logger as log } from '@/lib/logger';
import { uploadDocument } from '@/actions/cloudinary';

// ── Helpers ──────────────────────────────────────────────────────────────────
const DATA_URL = 'data:application/pdf;base64,QUJD';

const OriginalFileReader = (globalThis as any).FileReader;
class MockFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    this.result = DATA_URL;
    if (this.onload) this.onload();
  }
}

const makeFile = (name: string, type: string, size = 1024): File =>
  new File([new ArrayBuffer(size)], name, { type });

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const stepHeading = () => screen.getByRole('heading', { level: 3 }) as HTMLElement;
const nextButton = () => screen.getByText('Next').closest('button') as HTMLButtonElement;
const backButton = () => screen.getByText('Back').closest('button') as HTMLButtonElement;

/** Selects a file through the hidden input. */
function pickFile(name = 'report.pdf', type = 'application/pdf', size = 1024) {
  fireEvent.change(fileInput(), { target: { files: [makeFile(name, type, size)] } });
}

/** Full journey to the details step (select + upload via Next). */
async function goToDetails(name = 'report.pdf', type = 'application/pdf') {
  pickFile(name, type);
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
  fireEvent.click(nextButton());
  await waitFor(() => expect(stepHeading().textContent).toBe('Details'));
}

describe('DocumentUploadWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', organizationId: 'org-1' };
    mockOrgId = 'org-1';
    mockTemplateData = undefined;
    mockUploadDocument.mockResolvedValue({
      url: 'https://cdn.test/doc.pdf',
      name: 'report.pdf',
      size: 2048,
      type: 'application/pdf',
    });
    mockCreateDocument.mockResolvedValue('doc-1');
    mockUpdateDocument.mockResolvedValue(undefined);
    (globalThis as any).FileReader = MockFileReader;
    mockDraft = {
      restored: false,
      restoredStep: 0,
      clearDraft: jest.fn(() => {
        mockDraft.restored = false;
      }),
    };
  });

  afterEach(() => {
    (globalThis as any).FileReader = OriginalFileReader;
  });

  // ── Rendering & navigation ────────────────────────────────────────────────

  it('renders the header, stepper and the file step', () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Upload Document' })).toBeInTheDocument();
    // all four steps in the stepper
    expect(screen.getAllByText('File').length).toBeGreaterThan(0);
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Drag & drop your file here')).toBeInTheDocument();
    expect(stepHeading().textContent).toBe('File');
  });

  it('closes via the header X button', () => {
    const onClose = jest.fn();
    render(<DocumentUploadWizard onClose={onClose} onSuccess={jest.fn()} />);
    fireEvent.click(screen.getByTestId('icon-X'));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Next disabled without a file and Back disabled on step 1', () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    expect(nextButton().disabled).toBe(true);
    expect(backButton().disabled).toBe(true);
  });

  it('enables Next after a file is picked', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    pickFile();
    await waitFor(() => expect(nextButton().disabled).toBe(false));
  });

  it('rejects files larger than 10 MB', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    pickFile('huge.pdf', 'application/pdf', 11 * 1024 * 1024);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('10MB limit')),
    );
    expect(screen.queryByText('huge.pdf')).not.toBeInTheDocument();
    expect(nextButton().disabled).toBe(true);
  });

  // ── File selection / drag & drop ──────────────────────────────────────────

  it('shows the picked file with its formatted size and can remove it', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    pickFile('report.pdf', 'application/pdf', 2048);
    await waitFor(() => expect(screen.getByText('report.pdf')).toBeInTheDocument());
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();

    // remove: the X inside the local-file row (header X comes first)
    fireEvent.click(screen.getAllByTestId('icon-X')[1]);
    await waitFor(() => expect(screen.queryByText('report.pdf')).not.toBeInTheDocument());
    expect(nextButton().disabled).toBe(true);
  });

  it('adds a file dropped onto the dropzone', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    const dropzone = screen.getByText('Drag & drop your file here').closest('div') as HTMLElement;
    fireEvent.drop(dropzone, { dataTransfer: { files: [makeFile('dropped.txt', 'text/plain')] } });
    await waitFor(() => expect(screen.getByText('dropped.txt')).toBeInTheDocument());
  });

  it('highlights the dropzone on drag enter and clears on drag leave', () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    const dropzone = screen.getByText('Drag & drop your file here').closest('div') as HTMLElement;
    expect(dropzone.className).not.toContain('bg-(--primary)/5');
    fireEvent.dragEnter(dropzone);
    expect(dropzone.className).toContain('bg-(--primary)/5');
    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toContain('bg-(--primary)/5');
  });

  it('opens the file browser when the dropzone is clicked', () => {
    const clickSpy = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
      const dropzone = screen.getByText('Drag & drop your file here').closest('div') as HTMLElement;
      fireEvent.click(dropzone);
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('renders a preview for image files', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    pickFile('photo.png', 'image/png');
    await waitFor(() => expect(screen.getByAltText('photo.png')).toBeInTheDocument());
    expect((screen.getByAltText('photo.png') as HTMLImageElement).src).toContain('data:');
  });

  it('shows the missing-data toast when the file has no base64 payload', async () => {
    class NoDataReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = null;
        if (this.onload) this.onload();
      }
    }
    (globalThis as any).FileReader = NoDataReader;
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    pickFile('empty.pdf');
    await waitFor(() => expect(screen.getByText('empty.pdf')).toBeInTheDocument());
    fireEvent.click(nextButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('File data is missing'));
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  // ── Upload flow ───────────────────────────────────────────────────────────

  it('uploads on Next and moves to the details step with the title prefilled', async () => {
    const onSuccess = jest.fn();
    mockUploadDocument.mockResolvedValue({
      url: 'https://cdn.test/doc.pdf',
      name: 'contract_v2.pdf',
      size: 2048,
      type: 'application/pdf',
    });
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={onSuccess} />);
    await goToDetails('contract_v2.pdf');
    expect(mockUploadDocument).toHaveBeenCalledWith(DATA_URL, 'contract_v2.pdf', 'application/pdf');
    expect(toast.success).toHaveBeenCalledWith('File uploaded successfully');
    // title autofilled from the filename (extension stripped, underscores → spaces)
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('contract v2');
  });

  it('shows the uploading indicator while the upload is in flight', async () => {
    let resolveUpload!: (v: any) => void;
    mockUploadDocument.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    pickFile('slow.pdf');
    await waitFor(() => expect(screen.getByText('slow.pdf')).toBeInTheDocument());
    fireEvent.click(nextButton());

    await waitFor(() => expect(screen.getByText('Uploading to Cloudinary...')).toBeInTheDocument());
    // the loader appears both in the progress row and inside the Next button
    expect(screen.getAllByTestId('shield-loader').length).toBeGreaterThan(0);
    // the Next label is replaced by the loader while uploading
    expect(screen.queryByText('Next')).not.toBeInTheDocument();

    await act(async () => {
      resolveUpload({ url: 'u', name: 'slow.pdf', size: 1, type: 'application/pdf' });
    });
    await waitFor(() => expect(stepHeading().textContent).toBe('Details'));
  });

  it('shows the upload error and returns to the file step on failure', async () => {
    mockUploadDocument.mockRejectedValue(new Error('cloud down'));
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    pickFile('report.pdf');
    await waitFor(() => expect(screen.getByText('report.pdf')).toBeInTheDocument());
    fireEvent.click(nextButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('cloud down'));
    expect(log.error).toHaveBeenCalled();
    // local file was cleared, we're still on the file step
    await waitFor(() => expect(screen.queryByText('report.pdf')).not.toBeInTheDocument());
    expect(stepHeading().textContent).toBe('File');
  });

  it('falls back to the generic message for non-Error upload failures', async () => {
    mockUploadDocument.mockRejectedValue('boom');
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    pickFile();
    await waitFor(() => expect(screen.getByText('report.pdf')).toBeInTheDocument());
    fireEvent.click(nextButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to upload file'));
  });

  it('goes back from the details step to the file step', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    await goToDetails();
    fireEvent.click(backButton());
    expect(stepHeading().textContent).toBe('File');
  });

  // ── Details step ──────────────────────────────────────────────────────────

  it('gates Next on the title and accepts category + tags', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    await goToDetails();
    // the upload autofilled the title from the filename — clear it to hit the gate
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: '' } });
    expect(nextButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Q3 report' } });
    expect(nextButton().disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Quarterly numbers' },
    });
    // category
    fireEvent.click(screen.getByTestId('select-option-contract'));
    expect(screen.getByTestId('select-current-contract')).toBeInTheDocument();
    // tags
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'hr,  finance ,' } });
    await waitFor(() => expect(screen.getByText('finance')).toBeInTheDocument());
    expect(screen.getByText('hr')).toBeInTheDocument();
  });

  // ── Settings step ─────────────────────────────────────────────────────────

  it('toggles mandatory, publish and expiration (revealing the date input)', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    await goToDetails();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Doc' } });
    fireEvent.click(nextButton());
    expect(stepHeading().textContent).toBe('Settings');

    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Mandatory'));
    fireEvent.click(screen.getByLabelText('Publish immediately'));
    fireEvent.click(screen.getByLabelText('Set expiration date'));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeInTheDocument();
    fireEvent.change(dateInput, { target: { value: '2027-01-15' } });
    expect(nextButton().disabled).toBe(false);
  });

  // ── Review & submit ───────────────────────────────────────────────────────

  it('submits the full payload and publishes immediately', async () => {
    const onSuccess = jest.fn();
    const onClose = jest.fn();
    render(<DocumentUploadWizard onClose={onClose} onSuccess={onSuccess} />);

    // file → details
    pickFile('report.pdf');
    await waitFor(() => expect(screen.getByText('report.pdf')).toBeInTheDocument());
    fireEvent.click(nextButton());
    await waitFor(() => expect(stepHeading().textContent).toBe('Details'));

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Annual Report' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'FY2026 numbers' },
    });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'finance, annual' } });
    fireEvent.click(screen.getByTestId('select-option-contract'));
    fireEvent.click(nextButton());

    // settings
    fireEvent.click(screen.getByLabelText('Mandatory'));
    fireEvent.click(screen.getByLabelText('Publish immediately'));
    fireEvent.click(screen.getByLabelText('Set expiration date'));
    fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '2027-01-15' },
    });
    fireEvent.click(nextButton());

    // review
    expect(stepHeading().textContent).toBe('Review');
    expect(screen.getByText('Annual Report')).toBeInTheDocument();
    expect(screen.getByText('FY2026 numbers')).toBeInTheDocument();
    expect(screen.getByText('contract')).toBeInTheDocument();
    expect(screen.getByText('finance')).toBeInTheDocument();
    expect(screen.getByText('annual')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Immediately')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() =>
      expect(mockCreateDocument).toHaveBeenCalledWith({
        organizationId: 'org-1',
        title: 'Annual Report',
        description: 'FY2026 numbers',
        category: 'contract',
        fileUrl: 'https://cdn.test/doc.pdf',
        fileName: 'report.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        isMandatory: true,
        expiresAt: expect.any(Number),
        tags: ['finance', 'annual'],
      }),
    );
    expect(mockUpdateDocument).toHaveBeenCalledWith({ documentId: 'doc-1', isPublished: true });
    expect(toast.success).toHaveBeenCalledWith('Document created successfully');
    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not publish when "publish immediately" is off', async () => {
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    await goToDetails();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Draft doc' } });
    fireEvent.click(nextButton());
    fireEvent.click(nextButton()); // settings → review (nothing to toggle)
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => expect(mockCreateDocument).toHaveBeenCalled());
    expect(mockUpdateDocument).not.toHaveBeenCalled();
  });

  it('shows the error toast when creation fails', async () => {
    mockCreateDocument.mockRejectedValue(new Error('convex down'));
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    await goToDetails();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Doc' } });
    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to create document'));
    expect(log.error).toHaveBeenCalled();
    // submit button becomes usable again
    const submitBtn = screen.getByText('Submit').closest('button') as HTMLButtonElement;
    await waitFor(() => expect(submitBtn.disabled).toBe(false));
  });

  it('does nothing on submit when no organization is available', async () => {
    mockOrgId = null;
    mockUser = { id: 'u1', organizationId: null };
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    await goToDetails();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Doc' } });
    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => expect(screen.getByText('Submit')).toBeInTheDocument());
    expect(mockCreateDocument).not.toHaveBeenCalled();
    // the upload itself succeeded — only the creation step must be skipped
    expect(toast.success).not.toHaveBeenCalledWith('Document created successfully');
  });

  // ── Template prefill ──────────────────────────────────────────────────────

  it('prefills title, description and category from a template', async () => {
    mockTemplateData = { title: 'NDA template', description: 'Standard NDA' };
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} templateId="tpl-1" />);
    await goToDetails();
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('NDA template');
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
      'Standard NDA',
    );
    expect(screen.getByTestId('select-current-template')).toBeInTheDocument();
  });

  // ── Draft restore / start over ────────────────────────────────────────────

  it('restores a draft and jumps to its saved step', async () => {
    mockDraft = { restored: true, restoredStep: 1, clearDraft: jest.fn() };
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);

    await waitFor(() => expect(stepHeading().textContent).toBe('Details'));
    expect(screen.getByTestId('draft-notice')).toHaveAttribute('data-step', '1');
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('Saved title');
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Saved desc');
    expect(screen.getByTestId('select-current-contract')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('tags')).toBeInTheDocument();
  });

  it('start over clears the draft and returns to the file step', async () => {
    mockDraft = {
      restored: true,
      restoredStep: 1,
      clearDraft: jest.fn(() => {
        mockDraft.restored = false;
      }),
    };
    render(<DocumentUploadWizard onClose={jest.fn()} onSuccess={jest.fn()} />);
    await waitFor(() => expect(stepHeading().textContent).toBe('Details'));

    fireEvent.click(screen.getByText('Start over'));
    expect(mockDraft.clearDraft).toHaveBeenCalled();
    await waitFor(() => expect(stepHeading().textContent).toBe('File'));
    expect(screen.getByText('Drag & drop your file here')).toBeInTheDocument();
  });
});
