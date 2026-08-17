/**
 * DocJsonEditor — the "Edit" view for a database row, modeled on the Convex
 * dashboard's document editor.
 *
 * Instead of a raw JSON textarea (easy to fat-finger), every field of the
 * document becomes a labelled row with a type-aware editor: text inputs for
 * strings, number inputs, a true/false select for booleans, JSON textareas
 * for nested objects/arrays, and a disabled "null" slot. Fields can be added
 * and removed; keys stay read-only because Convex documents cannot rename a
 * field (a browser edit cannot smuggle in columns the schema rejects).
 *
 * Saving patches only what actually changed (including removals, which Convex
 * expresses as `field: undefined`), so the write goes through the same
 * `ctx.db.patch` validation as inline editing and lands in the audit trail.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Braces, KeyRound, Plus, Save, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface RowDoc {
  id: string;
  doc: Record<string, unknown>;
}

type FieldKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

interface FieldState {
  key: string;
  raw: string;
  kind: FieldKind;
}

function kindOf(value: unknown): FieldKind {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object') return 'object';
  return 'string';
}

/** Lossless string form of a value for the editor (objects get pretty JSON). */
function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Parse an editor value back into a typed value, respecting the field kind. */
function parseByKind(raw: string, kind: FieldKind): { ok: true; value: unknown } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: undefined };
  if (kind === 'string') return { ok: true, value: raw };
  if (kind === 'number') {
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return { ok: false };
    return { ok: true, value: Number(trimmed) };
  }
  if (kind === 'boolean') return { ok: true, value: trimmed === 'true' };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false };
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface DocJsonEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  row: RowDoc;
  patchDbRow: (args: {
    tableName: string;
    docId: string;
    patch: Record<string, unknown>;
  }) => Promise<unknown>;
  onSaved?: () => void;
}

export function DocJsonEditor({
  open,
  onOpenChange,
  tableName,
  row,
  patchDbRow,
  onSaved,
}: DocJsonEditorProps) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<FieldState[]>([]);
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Rebuild the field list every time the sheet opens with a (possibly new)
  // document — editing is always a fresh snapshot of the row.
  useEffect(() => {
    if (!open) return;
    setFields(
      Object.entries(row.doc).map(([key, value]) => ({
        key,
        raw: stringifyValue(value),
        kind: kindOf(value),
      })),
    );
    setDeletedKeys(new Set());
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row.id]);

  const updateField = (index: number, patch: Partial<FieldState>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const addField = () => {
    setFields((prev) => [...prev, { key: '', raw: '', kind: 'string' }]);
  };

  const removeField = (index: number) => {
    const field = fields[index];
    if (!field) return;
    // Removing a real column = delete it from the doc on save (patch to
    // undefined). Nothing is written until Save, so removal is naturally
    // undoable — the row just disappears from the editor for now.
    if (Object.prototype.hasOwnProperty.call(row.doc, field.key)) {
      setDeletedKeys((prev) => new Set(prev).add(field.key));
    }
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  /** Kind of a newly added field: infer from what the user typed. */
  const inferKind = (raw: string): FieldKind => {
    const trimmed = raw.trim();
    if (trimmed === 'true' || trimmed === 'false') return 'boolean';
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'number';
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return 'array';
      if (parsed !== null && typeof parsed === 'object') return 'object';
    } catch {
      // fall through
    }
    return 'string';
  };

  const validate = (): string | null => {
    const seen = new Set<string>();
    for (const field of fields) {
      const key = field.key.trim();
      if (!key) return t('superadmin.database.editor.keyRequired', 'Every field needs a key');
      if (seen.has(key)) {
        return t('superadmin.database.editor.duplicateKey', 'Duplicate field: {{key}}', { key });
      }
      seen.add(key);
      const result = parseByKind(field.raw, field.kind);
      if (!result.ok) {
        return t('superadmin.database.editor.invalidValue', 'Invalid value for field: {{key}}', {
          key,
        });
      }
    }
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      const result = parseByKind(field.raw, field.kind);
      if (!result.ok) continue; // validated above; keep the compiler happy
      const value = result.value;
      const isOriginal = Object.prototype.hasOwnProperty.call(row.doc, field.key);
      if (!isOriginal || !same(row.doc[field.key], value)) {
        patch[field.key] = value;
      }
    }
    for (const key of deletedKeys) patch[key] = undefined;

    if (Object.keys(patch).length === 0) {
      toast.info(t('superadmin.database.editor.noChanges', 'No changes to save'));
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      await patchDbRow({ tableName, docId: row.id, patch });
      toast.success(t('superadmin.database.rowSaved', 'Row updated'));
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('superadmin.database.saveFailed', 'Could not save the row'),
      );
    } finally {
      setSaving(false);
    }
  };

  const changedCount = useMemo(() => {
    let count = deletedKeys.size;
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(row.doc, field.key)) {
        const result = parseByKind(field.raw, field.kind);
        if (result.ok && !same(row.doc[field.key], result.value)) count += 1;
      } else if (field.key.trim()) {
        count += 1;
      }
    }
    return count;
  }, [fields, deletedKeys, row.doc]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="xl" closeLabel={t('common.close', 'Close')} className="p-0">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2 font-mono text-sm">
            <Braces className="h-4 w-4 text-(--brand-text)" />
            {t('superadmin.database.editor.title', 'Edit document')}
            <span className="text-(--text-muted)">· {tableName}</span>
            <span className="max-w-[240px] truncate text-(--text-muted)">· {row.id}</span>
            {changedCount > 0 && (
              <span className="num ml-auto rounded-pill bg-(--brand-quiet) px-2 py-0.5 text-[10px] font-semibold text-(--brand-text)">
                {changedCount} {t('superadmin.database.editor.changed', 'changed')}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-2 px-5 py-4">
          <p className="text-xs text-(--text-muted)">
            {t(
              'superadmin.database.editor.hint',
              'Edit field values below. Only changed fields are written back — through the same schema validation the app uses, with undo available in change history.',
            )}
          </p>

          <div className="space-y-2">
            {fields.map((field, index) => {
              const isNew = !Object.prototype.hasOwnProperty.call(row.doc, field.key);
              const kind = isNew ? inferKind(field.raw) : field.kind;
              const invalid = field.kind !== 'null' && parseByKind(field.raw, kind).ok === false;
              return (
                /* Stable key: the row must not remount when its key text
                   changes (that would drop focus mid-typing). State lives in
                   `fields`, so re-indexing on add/remove is safe. */
                <div
                  key={index}
                  className="rounded-card border border-(--border) bg-(--surface-2) p-2.5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {/* Key — read-only for existing fields (Convex documents
                        cannot rename a field); typed freely for new ones. */}
                    {isNew ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <Input
                          value={field.key}
                          onChange={(e) => updateField(index, { key: e.target.value })}
                          placeholder={t('superadmin.database.editor.keyPlaceholder', 'field_name')}
                          className="h-7 min-w-0 flex-1 font-mono text-[11px] font-semibold text-(--brand-text)"
                        />
                        <span className="shrink-0 rounded-pill bg-(--brand-quiet) px-1.5 py-0.5 text-[9px] font-semibold text-(--brand-text)">
                          {t('superadmin.database.editor.new', 'new')}
                        </span>
                      </div>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[11px] font-semibold text-(--brand-text)">
                        <KeyRound className="h-3 w-3 shrink-0 opacity-60" />
                        <span className="truncate" title={field.key}>
                          {field.key}
                        </span>
                      </span>
                    )}
                    <span className="shrink-0 rounded-pill bg-(--background-subtle) px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-(--text-muted)">
                      {kind}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      className="press-subtle rounded-control p-1 text-(--text-muted) transition-colors hover:bg-(--danger-quiet) hover:text-(--danger-text)"
                      aria-label={t('superadmin.database.editor.removeField', 'Remove field')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="mt-2">
                    {field.kind === 'null' ? (
                      <Input
                        value="null"
                        disabled
                        className="h-8 cursor-not-allowed font-mono text-[11px] text-(--text-muted)"
                      />
                    ) : field.kind === 'boolean' ? (
                      <select
                        value={field.raw}
                        onChange={(e) => updateField(index, { raw: e.target.value })}
                        className="h-8 w-28 rounded-lg border border-(--input-border) bg-(--input) px-2 font-mono text-[11px] text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--brand-text)"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : field.kind === 'number' ? (
                      <Input
                        value={field.raw}
                        onChange={(e) => updateField(index, { raw: e.target.value })}
                        className={cn(
                          'h-8 font-mono text-[11px]',
                          invalid && 'border-(--danger-outline) focus:ring-(--danger-solid)',
                        )}
                      />
                    ) : field.kind === 'object' || field.kind === 'array' ? (
                      <textarea
                        value={field.raw}
                        onChange={(e) => updateField(index, { raw: e.target.value })}
                        spellCheck={false}
                        rows={Math.min(10, Math.max(3, field.raw.split('\n').length))}
                        className={cn(
                          'w-full resize-y rounded-lg border border-(--input-border) bg-(--input) p-2 font-mono text-[11px] leading-relaxed text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--brand-text)',
                          invalid &&
                            'border-(--danger-outline) focus:ring-(--danger-solid) bg-(--danger-quiet)/30',
                        )}
                      />
                    ) : (
                      <Input
                        value={field.raw}
                        onChange={(e) => updateField(index, { raw: e.target.value })}
                        className={cn(
                          'h-8 font-mono text-[11px]',
                          invalid && 'border-(--danger-outline) focus:ring-(--danger-solid)',
                        )}
                      />
                    )}
                    {invalid && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-(--danger-text)">
                        <AlertTriangle className="h-3 w-3" />
                        {t(
                          'superadmin.database.editor.invalidValue',
                          'Invalid value for field: {{key}}',
                          { key: field.key },
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add field */}
          <button
            type="button"
            onClick={addField}
            className="flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-(--border-strong) py-2.5 text-xs font-medium text-(--text-muted) transition-colors duration-140 ease-spark hover:border-(--brand) hover:bg-(--brand-quiet) hover:text-(--brand-text)"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('superadmin.database.editor.addField', 'Add field')}
          </button>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="mr-1 h-4 w-4" />
            {t('actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving
              ? t('superadmin.database.saving', 'Saving…')
              : t('superadmin.database.save', 'Save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
