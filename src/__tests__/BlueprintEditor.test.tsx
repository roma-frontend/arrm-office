/**
 * Tests for BlueprintEditor — the two-column bilingual document template
 * editor: meta fields (name/description/category/locales/series/accent/
 * signature), printed headings, segment rows (kind, full-width, missing
 * translation, move/insert/remove), add-segment buttons, token palette with
 * clipboard copy, live preview toggle, and the save / publish flows (create
 * vs update, error paths, closing).
 *
 * Mocks: convex/react (useMutation keyed by _name), generated api,
 * react-i18next (returns keys/fallbacks), sonner toast,
 * @/hooks/useDocumentLabels, @/components/ui/{select,dropdown-menu},
 * @/components/documents/DocumentBlocksPreview (DocumentSheet), and
 * navigator.clipboard. The bilingualDocument helpers run real.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import BlueprintEditor, { type BlueprintDraft } from '@/components/documents/BlueprintEditor';
import type { Id } from '../../convex/_generated/dataModel';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) =>
      typeof fallback === 'string'
        ? fallback
        : fallback && typeof fallback === 'object' && 'defaultValue' in fallback
          ? (fallback.defaultValue ?? key)
          : key,
    i18n: { language: 'en' },
  }),
}));

// ── Convex: per-mutation impls keyed by _name ────────────────────────────────
const mutationCalls: Record<string, Array<{ args: any }>> = {};
const mutationImpl: Record<string, (...args: any[]) => Promise<unknown>> = {};

jest.mock('convex/react', () => ({
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    return async (...args: any[]) => {
      (mutationCalls[name] ??= []).push({ args });
      if (mutationImpl[name]) return mutationImpl[name](...args);
      return Promise.resolve();
    };
  },
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    documentBlueprints: {
      create: { _name: 'create' },
      update: { _name: 'update' },
      publish: { _name: 'publish' },
    },
  },
}));

// ── Labels ───────────────────────────────────────────────────────────────────
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

// ── Toast ────────────────────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { toast } from 'sonner';

// ── UI primitives ────────────────────────────────────────────────────────────
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
        <button type="button" data-testid={`select-current-${value ?? 'undefined'}`}>
          {value ?? ''}
        </button>
        <div data-testid="select-options">
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
      </div>
    );
  };
  return {
    Select,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => (
      <div data-testid={`select-item-${value}`}>{children}</div>
    ),
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: () => null,
  };
});

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
}));

jest.mock('@/components/documents/DocumentBlocksPreview', () => ({
  DocumentSheet: (props: any) => (
    <div data-testid="document-sheet" data-title={props.title} data-meta={props.meta ?? ''}>
      sheet
    </div>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_ID = 'org-test' as Id<'organizations'>;

function baseDraft(overrides: Partial<BlueprintDraft> = {}): BlueprintDraft {
  return {
    name: 'Employment contract 2026',
    description: 'Used for permanent staff',
    category: 'hiring',
    accent: 'blue',
    titles: { hy: 'Աշխատանքային պայմանագիր' },
    segments: [
      { id: 's1', kind: 'paragraph', text: { hy: 'Տեքստ', ru: 'Текст' } },
      { id: 's2', kind: 'section', text: { hy: 'ԲԱԺԻՆ 1' } },
    ],
    signature: false,
    ...overrides,
  };
}

function renderEditor(initial?: BlueprintDraft, onClose?: (id?: any) => void) {
  const close = onClose ?? jest.fn();
  const utils = render(
    <BlueprintEditor organizationId={ORG_ID} initial={initial ?? baseDraft()} onClose={close} />,
  );
  return { ...utils, close };
}

/**
 * Select render order in the component: 0 = category, 1 = mandatory language,
 * 2 = second language, then one kind-select per segment row.
 */
function selectAt(index: number): HTMLElement {
  return screen.getAllByTestId('select')[index];
}

function pickOption(selectIndex: number, optionValue: string) {
  fireEvent.click(within(selectAt(selectIndex)).getByTestId(`select-option-${optionValue}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  for (const key of Object.keys(mutationCalls)) delete mutationCalls[key];
  for (const key of Object.keys(mutationImpl)) delete mutationImpl[key];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe('BlueprintEditor — meta card', () => {
  it('renders name and description from the draft', () => {
    renderEditor();
    expect((screen.getByLabelText('Template name') as HTMLInputElement).value).toBe(
      'Employment contract 2026',
    );
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe(
      'Used for permanent staff',
    );
  });

  it('updates name and description on input', () => {
    renderEditor();
    const name = screen.getByLabelText('Template name');
    fireEvent.change(name, { target: { value: 'Contract v2' } });
    expect((name as HTMLInputElement).value).toBe('Contract v2');
    const desc = screen.getByLabelText('Description');
    fireEvent.change(desc, { target: { value: 'Updated' } });
    expect((desc as HTMLInputElement).value).toBe('Updated');
  });

  it('switches the category through the select', () => {
    renderEditor();
    pickOption(0, 'consent');
    expect(within(selectAt(0)).getByTestId('select-current-consent')).toBeInTheDocument();
  });

  it('sets the mandatory language and syncs the primary locale', () => {
    renderEditor();
    pickOption(1, 'ru');
    expect(within(selectAt(1)).getByTestId('select-current-ru')).toBeInTheDocument();
    // The primary heading field now reads titles.ru (empty) instead of titles.hy.
    expect(screen.queryByDisplayValue('Աշխատանքային պայմանագիր')).toBeNull();
  });

  it('clears the mandatory language via the none option', () => {
    renderEditor();
    pickOption(1, 'none');
    expect(within(selectAt(1)).getByTestId('select-current-none')).toBeInTheDocument();
  });

  it('chooses a second language and renders two heading fields', () => {
    renderEditor();
    pickOption(2, 'ru');
    expect(within(selectAt(2)).getByTestId('select-current-ru')).toBeInTheDocument();
    // The ru column now renders: secondary textareas appear next to the hy ones.
    expect(screen.getByDisplayValue('Текст')).toBeInTheDocument();
  });

  it('clears the second language via the monolingual option', () => {
    const draft = baseDraft({ defaultSecondaryLocale: 'ru' as const });
    renderEditor(draft);
    expect(within(selectAt(2)).getByTestId('select-current-ru')).toBeInTheDocument();
    pickOption(2, 'none');
    expect(within(selectAt(2)).getByTestId('select-current-none')).toBeInTheDocument();
  });

  it('uppercases the series input', () => {
    renderEditor();
    const series = screen.getByPlaceholderText('HR');
    fireEvent.change(series, { target: { value: 'hr-26' } });
    expect((series as HTMLInputElement).value).toBe('HR-26');
  });

  it('switches accent via the color buttons', () => {
    renderEditor();
    const emerald = screen.getByLabelText('emerald');
    expect(emerald).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(emerald);
    expect(emerald).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles the signature block checkbox', () => {
    renderEditor();
    const checkbox = screen.getByLabelText('Print a signature block');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('toggles the preview on and off', () => {
    renderEditor();
    expect(screen.getByTestId('document-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hide preview'));
    expect(screen.queryByTestId('document-sheet')).toBeNull();
    fireEvent.click(screen.getByText('Show preview'));
    expect(screen.getByTestId('document-sheet')).toBeInTheDocument();
  });
});

describe('BlueprintEditor — headings and segments', () => {
  it('renders a heading input for the primary locale', () => {
    renderEditor();
    expect(screen.getByDisplayValue('Աշխատանքային պայմանագիր')).toBeInTheDocument();
  });

  it('edits the printed heading', () => {
    renderEditor();
    const heading = screen.getByDisplayValue('Աշխատանքային պայմանագիր');
    fireEvent.change(heading, { target: { value: 'Նոր վերնագիր' } });
    expect((heading as HTMLInputElement).value).toBe('Նոր վերնագիր');
  });

  it('renders bilingual text areas when a second language is set', () => {
    const draft = baseDraft({ defaultSecondaryLocale: 'ru' as const });
    renderEditor(draft);
    expect(screen.getByDisplayValue('Տեքստ')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Текст')).toBeInTheDocument();
  });

  it('edits the primary segment text', () => {
    renderEditor();
    const primary = screen.getByDisplayValue('Տեքստ');
    fireEvent.change(primary, { target: { value: 'Նոր տեքստ' } });
    expect((primary as HTMLTextAreaElement).value).toBe('Նոր տեքստ');
  });

  it('edits the secondary segment text', () => {
    const draft = baseDraft({ defaultSecondaryLocale: 'ru' as const });
    renderEditor(draft);
    const secondary = screen.getByDisplayValue('Текст');
    fireEvent.change(secondary, { target: { value: 'Новый текст' } });
    expect((secondary as HTMLTextAreaElement).value).toBe('Новый текст');
  });

  it('toggles the full-width checkbox on a bilingual segment', () => {
    const draft = baseDraft({ defaultSecondaryLocale: 'ru' as const });
    renderEditor(draft);
    const checkboxes = screen.getAllByLabelText('Full width');
    expect(checkboxes[0]).not.toBeChecked();
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
  });

  it('edits the secondary printed heading', () => {
    const draft = baseDraft({ defaultSecondaryLocale: 'ru' as const });
    renderEditor(draft);
    // The secondary heading input sits in the card labelled "Printed heading",
    // is empty (no titles.ru) and is not one of the meta inputs.
    const headingCard = screen.getByText('Printed heading').closest('div')!.parentElement!;
    const secondaryInput = Array.from(headingCard.querySelectorAll('input')).find(
      (input) => (input as HTMLInputElement).value === '',
    );
    expect(secondaryInput).toBeTruthy();
    fireEvent.change(secondaryInput!, { target: { value: 'Трудовой договор' } });
    expect((secondaryInput as HTMLInputElement).value).toBe('Трудовой договор');
  });

  it('shows the missing-translation marker on an empty secondary column', () => {
    const draft = baseDraft({ defaultSecondaryLocale: 'ru' as const });
    renderEditor(draft);
    expect(screen.getAllByText('Translation missing').length).toBeGreaterThanOrEqual(1);
  });

  it('switches a segment kind through its select', () => {
    renderEditor();
    // Row 0 kind select shows 'paragraph' for s1.
    pickOption(3, 'bullets');
    expect(within(selectAt(3)).getByTestId('select-current-bullets')).toBeInTheDocument();
  });

  it('moves a segment up when the up button is enabled', () => {
    renderEditor();
    const ups = screen.getAllByTitle('Move up');
    expect(ups[0]).toBeDisabled(); // index 0
    fireEvent.click(ups[1]);
    // After the move the previously-second row sits at index 0.
    expect(screen.getAllByTitle('Move up')[0]).toBeDisabled();
  });

  it('moves a segment down when the down button is enabled', () => {
    renderEditor();
    const downs = screen.getAllByTitle('Move down');
    expect(downs[1]).toBeDisabled(); // last row
    fireEvent.click(downs[0]);
    expect(screen.getAllByTitle('Move down')[1]).toBeDisabled();
  });

  it('inserts a paragraph below a segment', () => {
    renderEditor();
    const before = screen.getAllByPlaceholderText(/Free text/).length;
    fireEvent.click(screen.getAllByTitle('Insert below')[0]);
    expect(screen.getAllByPlaceholderText(/Free text/).length).toBe(before + 1);
  });

  it('removes a segment', () => {
    renderEditor();
    expect(screen.getByDisplayValue('Տեքստ')).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('Remove')[0]);
    expect(screen.queryByDisplayValue('Տեքստ')).toBeNull();
  });

  it('adds a segment via each kind button', () => {
    renderEditor();
    const addButton = (label: string) =>
      screen
        .getAllByRole('button', { name: label })
        .find((button) => !button.closest('[data-testid="select"]'))!;
    const countBefore = screen.getAllByRole('textbox').length;
    fireEvent.click(addButton('Heading'));
    fireEvent.click(addButton('Paragraph'));
    fireEvent.click(addButton('List'));
    fireEvent.click(addButton('Label / value'));
    fireEvent.click(addButton('Note'));
    expect(screen.getAllByRole('textbox').length).toBe(countBefore + 5);
  });

  it('shows a missing-translation badge in the header', () => {
    const draft = baseDraft({ defaultSecondaryLocale: 'ru' as const });
    renderEditor(draft);
    expect(screen.getByText(/without translation/)).toBeInTheDocument();
  });

  it('shows the unknown-tokens badge when a token is unknown', () => {
    const draft = baseDraft({
      segments: [{ id: 's1', kind: 'paragraph', text: { hy: '{{employee.nope}}' } }],
    });
    renderEditor(draft);
    expect(screen.getByText(/Unknown tokens:/)).toBeInTheDocument();
  });

  it('shows no audit badges for a clean bilingual draft', () => {
    const draft = baseDraft({
      defaultSecondaryLocale: 'ru' as const,
      segments: [
        { id: 's1', kind: 'paragraph', text: { hy: 'Ա', ru: 'Б' } },
        { id: 's2', kind: 'paragraph', text: { hy: 'Գ', ru: 'Д' } },
      ],
    });
    renderEditor(draft);
    expect(screen.queryByText(/without translation/)).toBeNull();
    expect(screen.queryByText(/Unknown tokens:/)).toBeNull();
  });

  it('renders the series placeholder in the preview meta', () => {
    const draft = baseDraft({ series: 'HR' });
    renderEditor(draft);
    expect(screen.getByTestId('document-sheet')).toHaveAttribute('data-meta', 'HR-…');
  });
});

describe('BlueprintEditor — token palette', () => {
  it('copies a token to the clipboard and flashes the check', async () => {
    renderEditor();
    fireEvent.click(screen.getByText('Merge fields'));
    fireEvent.click(screen.getByText('employee.fullName'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{{employee.fullName}}'),
    );
  });

  it('flashes the check icon on the copied token then clears it', async () => {
    jest.useFakeTimers();
    renderEditor();
    fireEvent.click(screen.getByText('Merge fields'));
    const tokenButton = screen.getByText('employee.fullName');
    fireEvent.click(tokenButton);
    await waitFor(() => expect(tokenButton.querySelector('svg')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(tokenButton.querySelector('svg')).toBeNull();
    jest.useRealTimers();
  });

  it('reports a clipboard failure', async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error('denied'));
    renderEditor();
    fireEvent.click(screen.getByText('Merge fields'));
    fireEvent.click(screen.getByText('employee.fullName'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not copy — select and copy the token manually',
      ),
    );
  });
});

describe('BlueprintEditor — save and publish', () => {
  it('creates a new blueprint on save', async () => {
    renderEditor();
    fireEvent.click(screen.getByText('Save draft'));
    await waitFor(() => expect(mutationCalls['create']).toHaveLength(1));
    const { args } = mutationCalls['create'][0];
    expect(args[0].organizationId).toBe(ORG_ID);
    expect(args[0].name).toBe('Employment contract 2026');
    expect(args[0].category).toBe('hiring');
    expect(args[0].signature).toBe(false);
    expect(mutationCalls['update']).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith('Template saved');
  });

  it('updates an existing blueprint on save', async () => {
    const draft = baseDraft({ _id: 'bp-1' as any });
    renderEditor(draft);
    fireEvent.click(screen.getByText('Save draft'));
    await waitFor(() => expect(mutationCalls['update']).toHaveLength(1));
    const { args } = mutationCalls['update'][0];
    expect(args[0].blueprintId).toBe('bp-1');
    expect(mutationCalls['create']).toBeUndefined();
  });

  it('shows an error toast when save fails', async () => {
    mutationImpl['create'] = async () => {
      throw new Error('boom');
    };
    renderEditor();
    fireEvent.click(screen.getByText('Save draft'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
  });

  it('shows the generic save error toast for non-Error throws', async () => {
    mutationImpl['create'] = async () => {
      throw 'string-error';
    };
    renderEditor();
    fireEvent.click(screen.getByText('Save draft'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save the template'));
  });

  it('publishes: saves then publishes and closes with the id', async () => {
    mutationImpl['create'] = async () => 'bp-new';
    mutationImpl['publish'] = async () => ({ version: 3 });
    const close = jest.fn();
    renderEditor(undefined, close);
    fireEvent.click(screen.getByText('Publish'));
    await waitFor(() => expect(mutationCalls['publish']).toHaveLength(1));
    expect(mutationCalls['create']).toHaveLength(1);
    await waitFor(() => expect(close).toHaveBeenCalledWith('bp-new'));
    expect(toast.success).toHaveBeenCalledWith('Published as version 3');
  });

  it('publishes an existing blueprint via update', async () => {
    const draft = baseDraft({ _id: 'bp-2' as any });
    mutationImpl['update'] = async () => undefined;
    mutationImpl['publish'] = async () => ({ version: 4 });
    const close = jest.fn();
    renderEditor(draft, close);
    fireEvent.click(screen.getByText('Publish'));
    await waitFor(() => expect(mutationCalls['update']).toHaveLength(1));
    await waitFor(() => expect(mutationCalls['publish']).toHaveLength(1));
    await waitFor(() => expect(close).toHaveBeenCalledWith('bp-2'));
  });

  it('does not publish when the save fails', async () => {
    mutationImpl['create'] = async () => {
      throw new Error('save boom');
    };
    renderEditor();
    fireEvent.click(screen.getByText('Publish'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('save boom'));
    expect(mutationCalls['publish']).toBeUndefined();
  });

  it('shows an error toast when publishing fails', async () => {
    mutationImpl['create'] = async () => 'bp-9';
    mutationImpl['publish'] = async () => {
      throw new Error('publish boom');
    };
    const close = jest.fn();
    renderEditor(undefined, close);
    fireEvent.click(screen.getByText('Publish'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('publish boom'));
    expect(close).not.toHaveBeenCalled();
  });

  it('shows the generic publish error for a non-Error throw', async () => {
    mutationImpl['create'] = async () => 'bp-9';
    mutationImpl['publish'] = async () => {
      throw 'publish-string-error';
    };
    renderEditor();
    fireEvent.click(screen.getByText('Publish'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not publish the template'));
  });

  it('renders with no description at all', () => {
    const draft = baseDraft({ description: undefined });
    renderEditor(draft);
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('');
  });

  it('closes with the saved id via the Close button', () => {
    const close = jest.fn();
    renderEditor(undefined, close);
    fireEvent.click(screen.getByText('Close'));
    expect(close).toHaveBeenCalledWith(undefined);
  });

  it('closes with the blueprint id after editing an existing one', () => {
    const draft = baseDraft({ _id: 'bp-7' as any });
    const close = jest.fn();
    renderEditor(draft, close);
    fireEvent.click(screen.getByText('Close'));
    expect(close).toHaveBeenCalledWith('bp-7');
  });
});
