/**
 * Tests for DocJsonEditor — the field-by-field document editor opened from
 * the Data Browser's detail drawer.
 *
 * Pins down the edit contract: only changed fields are written back, removals
 * become `field: undefined` patches, invalid JSON blocks saving, and the
 * editor renders type-aware controls for scalars, booleans and nested values.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => {
  const KEY_MAP: Record<string, string> = {
    'superadmin.database.editor.title': 'Edit document',
    'superadmin.database.editor.changed': 'changed',
    'superadmin.database.editor.hint': 'Edit field values below.',
    'superadmin.database.editor.new': 'new',
    'superadmin.database.editor.removeField': 'Remove field',
    'superadmin.database.editor.addField': 'Add field',
    'superadmin.database.editor.keyPlaceholder': 'field_name',
    'superadmin.database.editor.keyRequired': 'Every field needs a key',
    'superadmin.database.editor.duplicateKey': 'Duplicate field: {{key}}',
    'superadmin.database.editor.invalidValue': 'Invalid value for field: {{key}}',
    'superadmin.database.editor.noChanges': 'No changes to save',
    'superadmin.database.rowSaved': 'Row updated',
    'superadmin.database.saveFailed': 'Could not save the row',
    'superadmin.database.saving': 'Saving…',
    'superadmin.database.save': 'Save',
    'actions.cancel': 'Cancel',
    'common.close': 'Close',
  };
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
        const template = KEY_MAP[key] ?? fallback ?? key;
        return String(template).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
          String(options?.[name] ?? ''),
        );
      },
      i18n: { language: 'en' },
    }),
  };
});

jest.mock('@/components/ui/sheet', () => ({
  Sheet: (props: any) => (props.open ? <div data-testid="sheet">{props.children}</div> : null),
  SheetContent: ({ children, className }: any) => (
    <div data-testid="sheet-content" className={className}>
      {children}
    </div>
  ),
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
}));

import { DocJsonEditor } from '@/components/superadmin/DocJsonEditor';

const ROW = {
  id: 'u1',
  doc: {
    name: 'Anna',
    age: 30,
    active: true,
    meta: { team: 'hr' },
    tags: ['a', 'b'],
  },
};

function setup(overrides: Partial<{ patchDbRow: any; onSaved: () => void }> = {}) {
  const patchDbRow = overrides.patchDbRow ?? jest.fn(async () => ({ success: true }));
  const onSaved = overrides.onSaved ?? jest.fn();
  const onOpenChange = jest.fn();
  const { container } = render(
    <DocJsonEditor
      open
      onOpenChange={onOpenChange}
      tableName="users"
      row={ROW}
      patchDbRow={patchDbRow}
      onSaved={onSaved}
    />,
  );
  return { patchDbRow, onSaved, onOpenChange, container };
}

/** Find the field row card by its key label. */
function fieldRow(key: string, container: HTMLElement) {
  const label = screen.getByText(key);
  const row = label.closest('.rounded-card') as HTMLElement;
  if (!row) throw new Error(`No field row for ${key}`);
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DocJsonEditor', () => {
  it('renders every field with a type-aware editor', () => {
    const { container } = setup();
    for (const key of ['name', 'age', 'active', 'meta', 'tags']) {
      expect(screen.getByText(key)).toBeTruthy();
    }
    // Nested values are JSON textareas (two: meta + tags).
    const textareas = container.querySelectorAll('textarea');
    expect(textareas).toHaveLength(2);
    expect(textareas[0].value).toBe(JSON.stringify({ team: 'hr' }, null, 2));
    expect(textareas[1].value).toBe(JSON.stringify(['a', 'b'], null, 2));
    // Boolean renders as a select.
    expect(within(fieldRow('active', container)).getByRole('combobox')).toBeTruthy();
  });

  it('saves only the changed field when a scalar value is edited', async () => {
    const { patchDbRow, onOpenChange } = setup();
    const nameInput = screen.getByDisplayValue('Anna');
    fireEvent.change(nameInput, { target: { value: 'Anna Petrova' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(patchDbRow).toHaveBeenCalledTimes(1));
    const args = patchDbRow.mock.calls[0][0];
    expect(args.tableName).toBe('users');
    expect(args.docId).toBe('u1');
    expect(args.patch).toEqual({ name: 'Anna Petrova' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('removing a field patches it to undefined (Convex delete)', async () => {
    const { patchDbRow } = setup();
    const removeButtons = screen.getAllByLabelText('Remove field');
    const tagsRowIndex = Object.keys(ROW.doc).indexOf('tags');
    fireEvent.click(removeButtons[tagsRowIndex]);
    // The row disappears from the editor right away.
    expect(screen.queryByText('tags')).toBeNull();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(patchDbRow).toHaveBeenCalledTimes(1));
    expect(patchDbRow.mock.calls[0][0].patch).toEqual({ tags: undefined });
  });

  it('blocks saving invalid JSON in an object field', async () => {
    const { patchDbRow, onOpenChange, container } = setup();
    const metaTextarea = container.querySelectorAll('textarea')[0];
    fireEvent.change(metaTextarea, { target: { value: '{ broken' } });
    fireEvent.click(screen.getByText('Save'));
    expect(patchDbRow).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid value for field: meta')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('adds a new field and includes it in the patch', async () => {
    const { patchDbRow } = setup();
    fireEvent.click(screen.getByText('Add field'));
    // New row: a key input (empty) plus a value input (empty). Re-query after
    // each change — React re-renders and DOM nodes are replaced.
    let emptyInputs = screen.getAllByDisplayValue('');
    fireEvent.change(emptyInputs[0], { target: { value: 'phone' } });
    emptyInputs = screen.getAllByDisplayValue('');
    fireEvent.change(emptyInputs[0], { target: { value: '+374 55 123 456' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(patchDbRow).toHaveBeenCalledTimes(1));
    expect(patchDbRow.mock.calls[0][0].patch).toEqual({ phone: '+374 55 123 456' });
  });

  it('reports "no changes" without patching when nothing changed', async () => {
    const { patchDbRow, onOpenChange } = setup();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(patchDbRow).not.toHaveBeenCalled();
  });
});
