/**
 * Tests for wizard-step-components — ready-made Wizard step widgets:
 * TextInputStep, TextareaStep, SelectStep, CardSelectionStep, RadioGroupStep,
 * CheckboxStep and FileUploadStep.
 *
 * Mocks: wizard context, select/radio-group/checkbox primitives, cloudinary
 * action, toast, logger, cssMotion, lucide, next/image. FileReader is stubbed
 * to resolve data URLs synchronously so the upload pipeline runs
 * deterministically.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let mockLanguage = 'en';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: mockLanguage },
  }),
}));

const mockCtx = { stepData: {} as Record<string, unknown>, updateStepData: jest.fn() };
jest.mock('@/components/ui/wizard', () => ({
  useWizardContext: () => mockCtx,
}));

const mockUploadTaskAttachment = jest.fn();
jest.mock('@/actions/cloudinary', () => ({
  uploadTaskAttachment: (...args: any[]) => mockUploadTaskAttachment(...args),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  return {
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <ReactMod.Fragment>{children}</ReactMod.Fragment>,
  };
});

jest.mock('lucide-react', () => {
  const icons = ['Upload', 'FileText', 'Image', 'Video', 'Music', 'File'];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

// Radix-based primitives render nothing useful in jsdom — stubbing keeps the
// step components focused on their own wiring.
jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      <button type="button" onClick={() => onValueChange?.('ru')}>
        select-option-ru
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/radio-group', () => {
  const ReactMod = require('react');
  const Ctx = ReactMod.createContext((_v: string) => {});
  return {
    RadioGroup: ({ children, value, onValueChange }: any) => (
      <Ctx.Provider value={onValueChange}>
        <div data-testid="radio-group" data-value={value}>
          {children}
        </div>
      </Ctx.Provider>
    ),
    RadioGroupItem: ({ value, id }: any) => {
      const onValueChange = ReactMod.useContext(Ctx);
      return <input type="radio" value={value} id={id} onChange={() => onValueChange(value)} />;
    },
  };
});

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <input type="checkbox" checked={!!checked} onChange={() => onCheckedChange?.(!checked)} />
  ),
}));

const OriginalFileReader = (globalThis as any).FileReader;

class MockFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_file: File) {
    this.result = 'data:image/png;base64,QUJD';
    if (this.onload) this.onload();
  }
}

const makeFile = (name: string, type: string, size = 1024): File =>
  new File([new ArrayBuffer(size)], name, { type });

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

const SAMPLE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
];

describe('wizard-step-components', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = 'en';
    mockCtx.stepData = {};
    mockUploadTaskAttachment.mockResolvedValue('https://cdn.test/file.png');
    (globalThis as any).FileReader = MockFileReader;
  });

  afterEach(() => {
    (globalThis as any).FileReader = OriginalFileReader;
  });

  // ── TextInputStep ──────────────────────────────────────────────────────

  it('TextInputStep renders label, value and updates on change', () => {
    const update = jest.fn();
    render(
      <TextInputStep
        stepData={{ name: 'Anna' }}
        updateStepData={update}
        field="name"
        label="Full name"
      />,
    );
    expect(screen.getByText('Full name')).toBeInTheDocument();
    const input = screen.getByLabelText('Full name') as HTMLInputElement;
    expect(input.value).toBe('Anna');
    fireEvent.change(input, { target: { value: 'Bob' } });
    expect(update).toHaveBeenCalledWith('name', 'Bob');
  });

  it('TextInputStep marks required fields and shows the default value', () => {
    render(
      <TextInputStep
        field="email"
        label="Email"
        required
        defaultValue="a@b.c"
        description="Work email"
        type="email"
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe('a@b.c');
    expect(screen.getByText('Work email')).toBeInTheDocument();
  });

  it('TextInputStep falls back to wizard context when props are omitted', () => {
    mockCtx.stepData = { name: 'Ctx' };
    render(<TextInputStep field="name" label="Name" />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    expect(input.value).toBe('Ctx');
    fireEvent.change(input, { target: { value: 'New' } });
    expect(mockCtx.updateStepData).toHaveBeenCalledWith('name', 'New');
  });

  // ── TextareaStep ───────────────────────────────────────────────────────

  it('TextareaStep renders and updates on change', () => {
    const update = jest.fn();
    render(
      <TextareaStep
        stepData={{ notes: 'hello' }}
        updateStepData={update}
        field="notes"
        label="Notes"
        description="Optional"
      />,
    );
    const textarea = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    expect(textarea.value).toBe('hello');
    fireEvent.change(textarea, { target: { value: 'world' } });
    expect(update).toHaveBeenCalledWith('notes', 'world');
    expect(screen.getByText('Optional')).toBeInTheDocument();
  });

  it('TextareaStep renders required marker and rows', () => {
    render(<TextareaStep field="notes" label="Notes" required rows={6} />);
    expect(screen.getByText('*')).toBeInTheDocument();
    expect((screen.getByLabelText(/Notes/) as HTMLTextAreaElement).rows).toBe(6);
  });

  // ── SelectStep ─────────────────────────────────────────────────────────

  it('SelectStep renders options and forwards the selection', () => {
    const update = jest.fn();
    render(
      <SelectStep
        stepData={{ lang: 'en' }}
        updateStepData={update}
        field="lang"
        label="Language"
        options={SAMPLE_OPTIONS}
        placeholder="Pick…"
      />,
    );
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Russian')).toBeInTheDocument();
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'en');
    fireEvent.click(screen.getByText('select-option-ru'));
    expect(update).toHaveBeenCalledWith('lang', 'ru');
  });

  it('SelectStep uses the placeholder for an empty value', () => {
    render(
      <SelectStep field="lang" label="Language" options={SAMPLE_OPTIONS} placeholder="Pick one" />,
    );
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', '');
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('SelectStep falls back to defaultValue when nothing is stored', () => {
    render(<SelectStep field="lang" label="Language" options={SAMPLE_OPTIONS} defaultValue="ru" />);
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'ru');
  });

  it('SelectStep falls back to wizard context', () => {
    mockCtx.stepData = { lang: 'ru' };
    render(<SelectStep field="lang" label="Language" options={SAMPLE_OPTIONS} />);
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'ru');
    fireEvent.click(screen.getByText('select-option-ru'));
    expect(mockCtx.updateStepData).toHaveBeenCalledWith('lang', 'ru');
  });

  // ── CardSelectionStep ──────────────────────────────────────────────────

  const CARD_OPTIONS = [
    { value: 'a', title: 'Plan A', description: 'Basic', icon: <span>🔵</span> },
    { value: 'b', title: 'Plan B', description: 'Pro', icon: <span>🟢</span>, badge: '2 left' },
  ];

  it('CardSelectionStep selects a card and shows the selected badge', () => {
    const update = jest.fn();
    render(
      <CardSelectionStep
        stepData={{ plan: 'a' }}
        updateStepData={update}
        field="plan"
        label="Choose a plan"
        options={CARD_OPTIONS}
        description="Pick one"
      />,
    );
    expect(screen.getByText('Choose a plan')).toBeInTheDocument();
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    // the selected badge renders "✓ Selected"
    expect(screen.getAllByText(/Selected/).length).toBe(1);
    expect(screen.getByText('2 left')).toBeInTheDocument(); // badge on unselected card

    fireEvent.click(screen.getByText('Plan B'));
    expect(update).toHaveBeenCalledWith('plan', 'b');
  });

  it('CardSelectionStep localizes the selected badge per i18n language', () => {
    const renderCard = () =>
      render(
        <CardSelectionStep
          stepData={{ plan: 'a' }}
          updateStepData={jest.fn()}
          field="plan"
          label="Plan"
          options={CARD_OPTIONS}
          required
        />,
      );

    // the badge renders "✓ Выбрано" — match on the localized word
    mockLanguage = 'ru';
    const ru = renderCard();
    expect(ru.getAllByText(/Выбрано/).length).toBe(1);
    ru.unmount();

    mockLanguage = 'hy';
    const hy = renderCard();
    expect(hy.getAllByText(/Ընտրված/).length).toBe(1);
    hy.unmount();

    mockLanguage = 'en';
    const en = renderCard();
    expect(en.getAllByText(/Selected/).length).toBe(1);
  });

  it('CardSelectionStep renders a required marker when nothing is selected', () => {
    const update = jest.fn();
    render(
      <CardSelectionStep
        stepData={{}}
        updateStepData={update}
        field="plan"
        label="Plan"
        options={CARD_OPTIONS}
        required
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.queryByText(/Selected/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Plan A'));
    expect(update).toHaveBeenCalledWith('plan', 'a');
  });

  it('CardSelectionStep supports 3 and 4 column layouts', () => {
    const { container: c3 } = render(
      <CardSelectionStep
        field="plan"
        label="Plan"
        options={CARD_OPTIONS}
        updateStepData={jest.fn()}
        columns={3}
      />,
    );
    expect(c3.innerHTML).toContain('md:grid-cols-3');
    const { container: c4 } = render(
      <CardSelectionStep
        field="plan"
        label="Plan"
        options={CARD_OPTIONS}
        updateStepData={jest.fn()}
        columns={4}
      />,
    );
    expect(c4.innerHTML).toContain('md:grid-cols-4');
  });

  // ── RadioGroupStep ─────────────────────────────────────────────────────

  it('RadioGroupStep renders options and selects on click', () => {
    const update = jest.fn();
    render(
      <RadioGroupStep
        stepData={{ shift: 'day' }}
        updateStepData={update}
        field="shift"
        label="Shift"
        options={[
          { value: 'day', label: 'Day', description: '9-18' },
          { value: 'night', label: 'Night' },
        ]}
        required
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByTestId('radio-group')).toHaveAttribute('data-value', 'day');
    expect(screen.getByText('9-18')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Night'));
    expect(update).toHaveBeenCalledWith('shift', 'night');
  });

  it('RadioGroupStep forwards the onValueChange from the radio input', () => {
    const update = jest.fn();
    render(
      <RadioGroupStep
        stepData={{ shift: 'day' }}
        updateStepData={update}
        field="shift"
        label="Shift"
        options={[
          { value: 'day', label: 'Day' },
          { value: 'night', label: 'Night' },
        ]}
      />,
    );
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0].value).toBe('day');
    // jsdom radios fire change on click like a real browser
    fireEvent.click(radios[1]);
    expect(update).toHaveBeenCalledWith('shift', 'night');
  });

  it('RadioGroupStep falls back to wizard context and default value', () => {
    mockCtx.stepData = { shift: 'night' };
    render(
      <RadioGroupStep
        field="shift"
        label="Shift"
        options={[
          { value: 'day', label: 'Day' },
          { value: 'night', label: 'Night' },
        ]}
      />,
    );
    expect(screen.getByTestId('radio-group')).toHaveAttribute('data-value', 'night');
    fireEvent.click(screen.getByText('Day'));
    expect(mockCtx.updateStepData).toHaveBeenCalledWith('shift', 'day');
  });

  // ── CheckboxStep ───────────────────────────────────────────────────────

  it('CheckboxStep toggles values on and off', () => {
    const update = jest.fn();
    render(
      <CheckboxStep
        stepData={{ perms: ['read'] }}
        updateStepData={update}
        field="perms"
        label="Permissions"
        options={[
          { value: 'read', label: 'Read' },
          { value: 'write', label: 'Write', description: 'Full access' },
        ]}
      />,
    );
    const read = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(read.checked).toBe(true);
    expect(screen.getByText('Full access')).toBeInTheDocument();

    // click the row for 'write' → adds it
    fireEvent.click(screen.getByText('Write'));
    expect(update).toHaveBeenCalledWith('perms', ['read', 'write']);

    // toggle 'read' off via the checkbox
    fireEvent.click(read);
    expect(update).toHaveBeenCalledWith('perms', []);
  });

  it('CheckboxStep starts empty when no value is stored', () => {
    render(
      <CheckboxStep
        field="perms"
        label="Permissions"
        options={[{ value: 'read', label: 'Read' }]}
      />,
    );
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false);
  });

  // ── FileUploadStep ─────────────────────────────────────────────────────

  it('FileUploadStep renders the drop zone with limits', () => {
    render(<FileUploadStep field="files" label="Documents" maxFiles={3} maxSizeMB={2} />);
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Drag files here or click to select')).toBeInTheDocument();
    expect(screen.getByText('Max 3 files, up to 2MB each')).toBeInTheDocument();
  });

  it('FileUploadStep uploads a selected image and stores the attachment', async () => {
    const update = jest.fn();
    render(
      <FileUploadStep stepData={{}} updateStepData={update} field="files" label="Documents" />,
    );

    fireEvent.change(fileInput(), {
      target: { files: [makeFile('photo.png', 'image/png')] },
    });

    await waitFor(() =>
      expect(mockUploadTaskAttachment).toHaveBeenCalledWith(
        'data:image/png;base64,QUJD',
        'photo.png',
        'image/png',
      ),
    );
    expect(update).toHaveBeenCalledWith(
      'files',
      JSON.stringify([
        { url: 'https://cdn.test/file.png', name: 'photo.png', type: 'image/png', size: 1024 },
      ]),
    );
    expect(toast.success).toHaveBeenCalledWith('Uploaded 1 file(s)');
  });

  it('FileUploadStep rejects files over the size limit', async () => {
    const update = jest.fn();
    render(
      <FileUploadStep
        stepData={{}}
        updateStepData={update}
        field="files"
        label="Documents"
        maxSizeMB={1}
      />,
    );

    fireEvent.change(fileInput(), {
      target: { files: [makeFile('big.png', 'image/png', 2 * 1024 * 1024)] },
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('File "big.png" exceeds 1MB limit'),
    );
    expect(mockUploadTaskAttachment).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('FileUploadStep handles drag enter/leave and drop', async () => {
    const update = jest.fn();
    const { container } = render(
      <FileUploadStep stepData={{}} updateStepData={update} field="files" label="Documents" />,
    );
    const dropZone = container.querySelector('.border-2') as HTMLElement;

    // active drop-zone style marker (unique vs the hover:… classes)
    const activeMarker = 'bg-(--primary)/5';
    fireEvent.dragEnter(dropZone);
    expect(dropZone.className).toContain(activeMarker);
    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain(activeMarker);
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toContain(activeMarker);

    fireEvent.drop(dropZone, { dataTransfer: { files: [makeFile('a.png', 'image/png')] } });
    await waitFor(() => expect(mockUploadTaskAttachment).toHaveBeenCalled());
  });

  it('FileUploadStep renders stored attachments and removes one', () => {
    const update = jest.fn();
    const stored = [
      { url: 'https://cdn.test/a.png', name: 'a.png', type: 'image/png', size: 1536 },
      { url: 'https://cdn.test/b.pdf', name: 'b.pdf', type: 'application/pdf', size: 2048 },
    ];
    render(
      <FileUploadStep
        stepData={{ files: JSON.stringify(stored) }}
        updateStepData={update}
        field="files"
        label="Documents"
      />,
    );

    expect(screen.getByText('a.png')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument(); // formatSize(1536)
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument(); // formatSize(2048)
    expect(screen.getByTestId('icon-FileText')).toBeInTheDocument(); // pdf icon

    fireEvent.click(screen.getAllByText('×')[1]);
    expect(update).toHaveBeenCalledWith('files', JSON.stringify([stored[0]]));
  });

  it('FileUploadStep renders the fallback icon and MB sizes for other files', () => {
    const stored = [{ url: 'u1', name: 'notes.txt', type: 'text/plain', size: 3 * 1024 * 1024 }];
    render(
      <FileUploadStep
        stepData={{ files: JSON.stringify(stored) }}
        updateStepData={jest.fn()}
        field="files"
        label="Documents"
      />,
    );
    expect(screen.getByTestId('icon-File')).toBeInTheDocument(); // unknown type fallback
    expect(screen.getByText('3.0 MB')).toBeInTheDocument(); // formatSize MB branch
  });

  it('FileUploadStep shows an error toast when the upload fails', async () => {
    mockUploadTaskAttachment.mockRejectedValue(new Error('cloud down'));
    render(
      <FileUploadStep stepData={{}} updateStepData={jest.fn()} field="files" label="Documents" />,
    );

    fireEvent.change(fileInput(), {
      target: { files: [makeFile('photo.png', 'image/png')] },
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to upload files'));
    expect(logger.error).toHaveBeenCalled();
  });

  it('FileUploadStep opens the file picker when the drop zone is clicked', () => {
    const { container } = render(<FileUploadStep field="files" label="Documents" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(container.querySelector('.border-2') as HTMLElement);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});

import {
  TextInputStep,
  TextareaStep,
  SelectStep,
  CardSelectionStep,
  RadioGroupStep,
  CheckboxStep,
  FileUploadStep,
} from '@/components/ui/wizard-step-components';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
