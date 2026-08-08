'use client';

/**
 * A dialog that asks for one or more values before running an action.
 *
 * It replaces `window.prompt`, which the resolve flows used to rely on. The
 * native dialog is unstyled and unbranded (it announces `localhost:3000`), it
 * cannot be translated, it takes a single line of plain text with no label,
 * hint, length rule or error message, and it blocks the main thread — so an
 * action needing two values, like resolving an incident, had to stack two
 * prompts back to back and could leave the first answer stranded if the second
 * was dismissed.
 *
 * Here the values are collected in one form, validated before anything is sent,
 * and the dialog stays open with the input intact when the submit handler
 * throws, so a failed request does not cost the user their text.
 */

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface PromptField {
  /** Key under which the value arrives in `onSubmit`. */
  name: string;
  label: string;
  placeholder?: string;
  /** Renders a textarea instead of a single-line input. */
  multiline?: boolean;
  /** Blocks submission while empty. Defaults to `true`. */
  required?: boolean;
  /** Rejects answers shorter than this, so "ok" cannot pass as a resolution. */
  minLength?: number;
  maxLength?: number;
  defaultValue?: string;
  /** Shown under the field as guidance, not as an error. */
  hint?: string;
}

export interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: PromptField[];
  submitLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean;
  /**
   * Runs on submit. Throwing keeps the dialog open with the values intact;
   * returning normally closes it.
   */
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
}

function initialValues(fields: PromptField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? '']));
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  submitLabel,
  cancelLabel,
  destructive = false,
  onSubmit,
}: PromptDialogProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Each opening starts from a clean form; a previous answer must not leak into
  // the next incident or ticket.
  useEffect(() => {
    if (open) {
      setValues(initialValues(fields));
      setErrors({});
      setSubmitting(false);
    }
    // `fields` is a literal at every call site, so tracking its identity would
    // reset the form on each render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validate = useCallback((): Record<string, string> => {
    const found: Record<string, string> = {};
    for (const field of fields) {
      const value = (values[field.name] ?? '').trim();
      const required = field.required !== false;

      if (required && value.length === 0) {
        found[field.name] = t('errors.required');
        continue;
      }
      if (value.length > 0 && field.minLength && value.length < field.minLength) {
        found[field.name] = t('forms.minChars', { min: field.minLength });
      }
    }
    return found;
  }, [fields, values, t]);

  const handleSubmit = useCallback(async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const trimmed = Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, value.trim()]),
    );

    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch {
      // The caller reports the failure; keeping the values on screen lets the
      // user retry without retyping.
      setSubmitting(false);
    }
  }, [validate, values, onSubmit, onOpenChange]);

  const canSubmit = useMemo(
    () =>
      !submitting &&
      fields.every((f) => f.required === false || (values[f.name] ?? '').trim().length > 0),
    [fields, values, submitting],
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          {fields.map((field, index) => {
            const fieldId = `${baseId}-${field.name}`;
            const errorId = `${fieldId}-error`;
            const hintId = `${fieldId}-hint`;
            const error = errors[field.name];
            const describedBy = [error ? errorId : null, field.hint ? hintId : null]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={fieldId}>
                  {field.label}
                  {field.required === false && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t('forms.optional')}
                    </span>
                  )}
                </Label>

                {field.multiline ? (
                  <Textarea
                    id={fieldId}
                    rows={4}
                    value={values[field.name] ?? ''}
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                    autoFocus={index === 0}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      // A textarea keeps Enter for newlines, so confirm with the
                      // shortcut users already expect from chat inputs.
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleSubmit();
                      }
                    }}
                  />
                ) : (
                  <Input
                    id={fieldId}
                    value={values[field.name] ?? ''}
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                    autoFocus={index === 0}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                )}

                {field.hint && !error && (
                  <p id={hintId} className="text-xs text-muted-foreground">
                    {field.hint}
                  </p>
                )}
                {error && (
                  <p id={errorId} role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
              </div>
            );
          })}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {cancelLabel ?? t('buttons.cancel')}
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={!canSubmit}
            >
              {submitting ? t('buttons.saving') : (submitLabel ?? t('buttons.save'))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
