/**
 * Tests for PromptDialog, the replacement for `window.prompt` in the resolve
 * flows.
 *
 * What the native prompt could not do is what these cover: labels and hints,
 * validation before anything is sent, several values in one form, and keeping
 * the user's text when the action fails.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && 'min' in params ? `${key}:${String(params.min)}` : key,
    i18n: { language: 'en' },
  }),
}));

import { PromptDialog } from '@/components/ui/prompt-dialog';

const onSubmit = jest.fn<(values: Record<string, string>) => Promise<void>>();
const onOpenChange = jest.fn();

function renderDialog(overrides: Partial<React.ComponentProps<typeof PromptDialog>> = {}) {
  return render(
    <PromptDialog
      open
      onOpenChange={onOpenChange}
      title="Resolve ticket"
      description="The reporter sees this."
      fields={[{ name: 'resolution', label: 'Resolution', multiline: true, minLength: 10 }]}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('PromptDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onSubmit.mockResolvedValue(undefined);
  });

  it('labels the field and shows the description', () => {
    renderDialog();
    expect(screen.getByText('Resolve ticket')).toBeInTheDocument();
    expect(screen.getByText('The reporter sees this.')).toBeInTheDocument();
    expect(screen.getByLabelText('Resolution')).toBeInTheDocument();
  });

  it('submits the trimmed value', async () => {
    renderDialog();
    type('Resolution', '  restarted the worker pool  ');
    fireEvent.click(screen.getByRole('button', { name: 'buttons.save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ resolution: 'restarted the worker pool' });
    });
  });

  it('closes itself once the action succeeds', async () => {
    renderDialog();
    type('Resolution', 'restarted the worker pool');
    fireEvent.click(screen.getByRole('button', { name: 'buttons.save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('refuses an answer shorter than the minimum, without calling the action', async () => {
    renderDialog();
    type('Resolution', 'fixed');
    fireEvent.click(screen.getByRole('button', { name: 'buttons.save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('forms.minChars:10');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the confirm button disabled while a required field is empty', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'buttons.save' })).toBeDisabled();
  });

  it('keeps the text on screen when the action fails', async () => {
    onSubmit.mockRejectedValue(new Error('network'));
    renderDialog();
    type('Resolution', 'restarted the worker pool');
    fireEvent.click(screen.getByRole('button', { name: 'buttons.save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Two native prompts in a row lost the first answer on any failure; here it
    // survives and the dialog stays open.
    expect(screen.getByLabelText('Resolution')).toHaveValue('restarted the worker pool');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('collects several values in one form', async () => {
    renderDialog({
      fields: [
        { name: 'rootCause', label: 'Root cause', multiline: true },
        { name: 'resolution', label: 'Resolution', multiline: true },
      ],
    });

    type('Root cause', 'expired certificate');
    type('Resolution', 'renewed and redeployed');
    fireEvent.click(screen.getByRole('button', { name: 'buttons.save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        rootCause: 'expired certificate',
        resolution: 'renewed and redeployed',
      });
    });
  });

  it('marks a field invalid for assistive technology', async () => {
    renderDialog();
    type('Resolution', 'no');
    fireEvent.click(screen.getByRole('button', { name: 'buttons.save' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Resolution')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('confirms a textarea with the keyboard shortcut', async () => {
    renderDialog();
    const field = screen.getByLabelText('Resolution');
    fireEvent.change(field, { target: { value: 'restarted the worker pool' } });
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('does not submit on a bare Enter in a textarea', () => {
    renderDialog();
    const field = screen.getByLabelText('Resolution');
    fireEvent.change(field, { target: { value: 'restarted the worker pool' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows an optional field to stay empty', async () => {
    renderDialog({
      fields: [{ name: 'note', label: 'Note', required: false }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'buttons.save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ note: '' }));
  });
});
