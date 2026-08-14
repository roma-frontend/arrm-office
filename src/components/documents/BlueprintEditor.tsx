'use client';

/**
 * Two-column template editor.
 *
 * The editor is deliberately shaped like the printed page: one row per segment,
 * the binding language on the left and its translation on the right. That is
 * what keeps a bilingual document honest — the author sees immediately that a
 * paragraph has no Russian text, instead of finding out when the columns drift
 * apart in the PDF.
 *
 * What it does not offer, on purpose: free-form rich text. Every segment is one
 * of five block kinds, because that is what survives the round trip through Word
 * and the two-column layout. A WYSIWYG surface would break both.
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  Columns2,
  Eye,
  FileText,
  Languages,
  List,
  Loader2,
  Plus,
  Quote,
  Save,
  Table,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DocumentSheet } from '@/components/documents/DocumentBlocksPreview';
import { useDocumentLabels } from '@/hooks/useDocumentLabels';
import {
  DOCUMENT_LOCALES,
  LOCALE_CAPTIONS,
  auditSegments,
  buildDocumentBlocks,
  documentTitle,
  newSegmentId,
  type DocumentSegment,
  type DocumentSegmentKind,
  type LocalePair,
  type LocalizedText,
} from '@/lib/bilingualDocument';
import { ACCENT_HEX, type AccentColor, type DocumentCategory } from '@/lib/documentCatalog';
import { AVAILABLE_TOKENS } from '@/lib/documentTokens';
import type { SupportedLocale } from '@/lib/date-format';

/** Blueprint shape the editor works with — a subset of the Convex document. */
export interface BlueprintDraft {
  _id?: Id<'documentBlueprints'>;
  name: string;
  description?: string;
  category: DocumentCategory | 'other';
  accent: AccentColor;
  titles: LocalizedText;
  segments: DocumentSegment[];
  requiredLocale?: SupportedLocale;
  defaultPrimaryLocale?: SupportedLocale;
  defaultSecondaryLocale?: SupportedLocale;
  signature: boolean;
  series?: string;
  status?: 'draft' | 'published' | 'archived';
  version?: number;
  forkedFromTemplateId?: string;
}

const SEGMENT_KINDS: Array<{
  kind: DocumentSegmentKind;
  icon: typeof Type;
  labelKey: string;
  fallback: string;
}> = [
  { kind: 'section', icon: Type, labelKey: 'docBuilder.kindSection', fallback: 'Heading' },
  {
    kind: 'paragraph',
    icon: FileText,
    labelKey: 'docBuilder.kindParagraph',
    fallback: 'Paragraph',
  },
  { kind: 'bullets', icon: List, labelKey: 'docBuilder.kindBullets', fallback: 'List' },
  { kind: 'fields', icon: Table, labelKey: 'docBuilder.kindFields', fallback: 'Label / value' },
  { kind: 'callout', icon: Quote, labelKey: 'docBuilder.kindCallout', fallback: 'Note' },
];

const CATEGORIES: Array<DocumentCategory | 'other'> = [
  'certificate',
  'hiring',
  'consent',
  'order',
  'other',
];

const ACCENTS: AccentColor[] = ['blue', 'slate', 'emerald', 'burgundy'];

/** Placeholder text per kind, so an empty segment explains its own conventions. */
function placeholderFor(kind: DocumentSegmentKind): string {
  switch (kind) {
    case 'section':
      return 'CONTRACT TERMS';
    case 'bullets':
      return '- first item\n- second item';
    case 'fields':
      return 'Name: {{employee.fullName}}\nPosition: {{employee.position}}';
    case 'callout':
      return 'Important note for the reader';
    default:
      return 'Free text with {{employee.fullName}} tokens…';
  }
}

/** Group the token list by its prefix for a browsable palette. */
function groupTokens(): Array<{ group: string; tokens: string[] }> {
  const groups = new Map<string, string[]>();
  for (const token of AVAILABLE_TOKENS) {
    const [group = 'other'] = token.split('.');
    const list = groups.get(group) ?? [];
    list.push(token);
    groups.set(group, list);
  }
  return [...groups.entries()].map(([group, tokens]) => ({ group, tokens: tokens.sort() }));
}

export default function BlueprintEditor({
  organizationId,
  initial,
  onClose,
}: {
  organizationId: Id<'organizations'>;
  /** Existing blueprint to edit, or a pre-filled draft when forking a catalog template. */
  initial: BlueprintDraft;
  onClose: (savedId?: Id<'documentBlueprints'>) => void;
}) {
  const { t } = useTranslation();
  const labels = useDocumentLabels();

  const createBlueprint = useMutation(api.documentBlueprints.create);
  const updateBlueprint = useMutation(api.documentBlueprints.update);
  const publishBlueprint = useMutation(api.documentBlueprints.publish);

  const [draft, setDraft] = useState<BlueprintDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [blueprintId, setBlueprintId] = useState<Id<'documentBlueprints'> | undefined>(initial._id);

  const locales: LocalePair = useMemo(
    () => ({
      primary: draft.defaultPrimaryLocale ?? draft.requiredLocale ?? 'hy',
      secondary: draft.defaultSecondaryLocale,
    }),
    [draft.defaultPrimaryLocale, draft.defaultSecondaryLocale, draft.requiredLocale],
  );

  const secondary = locales.secondary;
  const audit = useMemo(
    () => auditSegments(draft.segments, locales, draft.titles),
    [draft.segments, locales, draft.titles],
  );

  /** Preview blocks: tokens are left unresolved so authors see what they wrote. */
  const previewBlocks = useMemo(
    () =>
      buildDocumentBlocks({
        segments: draft.segments,
        locales,
        labels,
        parties: draft.signature
          ? [
              { id: 'recipient', name: '', role: labels.signature },
              { id: 'issuer', name: '', role: labels.position },
            ]
          : [],
      }),
    [draft.segments, locales, labels, draft.signature],
  );

  const patch = useCallback((changes: Partial<BlueprintDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  const patchSegment = useCallback((id: string, changes: Partial<DocumentSegment>) => {
    setDraft((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === id ? { ...segment, ...changes } : segment,
      ),
    }));
  }, []);

  const setSegmentText = useCallback((id: string, locale: SupportedLocale, value: string) => {
    setDraft((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === id ? { ...segment, text: { ...segment.text, [locale]: value } } : segment,
      ),
    }));
  }, []);

  const addSegment = useCallback((kind: DocumentSegmentKind = 'paragraph', afterIndex?: number) => {
    setDraft((current) => {
      const segment: DocumentSegment = { id: newSegmentId(), kind, text: {} };
      const segments = current.segments.slice();
      segments.splice(afterIndex === undefined ? segments.length : afterIndex + 1, 0, segment);
      return { ...current, segments };
    });
  }, []);

  const moveSegment = useCallback((index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.segments.length) return current;
      const segments = current.segments.slice();
      const [moved] = segments.splice(index, 1);
      if (moved) segments.splice(target, 0, moved);
      return { ...current, segments };
    });
  }, []);

  const removeSegment = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      segments: current.segments.filter((segment) => segment.id !== id),
    }));
  }, []);

  /** Save without publishing: the draft stays invisible to issuers. */
  const handleSave = useCallback(async (): Promise<Id<'documentBlueprints'> | undefined> => {
    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        category: draft.category,
        accent: draft.accent,
        titles: draft.titles,
        segments: draft.segments,
        requiredLocale: draft.requiredLocale,
        defaultPrimaryLocale: draft.defaultPrimaryLocale,
        defaultSecondaryLocale: draft.defaultSecondaryLocale,
        signature: draft.signature,
        series: draft.series,
      };

      if (blueprintId) {
        await updateBlueprint({ blueprintId, ...payload });
        toast.success(t('docBuilder.saved', 'Template saved'));
        return blueprintId;
      }

      const id = await createBlueprint({
        organizationId,
        ...payload,
        forkedFromTemplateId: draft.forkedFromTemplateId,
      });
      setBlueprintId(id);
      toast.success(t('docBuilder.saved', 'Template saved'));
      return id;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('docBuilder.saveFailed', 'Could not save the template'),
      );
      return undefined;
    } finally {
      setSaving(false);
    }
  }, [blueprintId, createBlueprint, draft, organizationId, t, updateBlueprint]);

  /** Publish: saves first, so what gets snapshotted is what is on screen. */
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const id = await handleSave();
      if (!id) return;
      const { version } = await publishBlueprint({ blueprintId: id });
      toast.success(
        t('docBuilder.published', { version, defaultValue: `Published as version ${version}` }),
      );
      onClose(id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('docBuilder.publishFailed', 'Could not publish the template'),
      );
    } finally {
      setPublishing(false);
    }
  }, [handleSave, onClose, publishBlueprint, t]);

  const titleForPreview = documentTitle(draft.titles, locales);

  return (
    <div className="space-y-4">
      {/* ── Meta ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="bp-name" className="text-xs font-medium text-(--text-muted)">
                {t('docBuilder.name', 'Template name')}
              </label>
              <Input
                id="bp-name"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder={t('docBuilder.namePlaceholder', 'Employment contract 2026')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bp-description" className="text-xs font-medium text-(--text-muted)">
                {t('docBuilder.description', 'Description')}
              </label>
              <Input
                id="bp-description"
                value={draft.description ?? ''}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder={t('docBuilder.descriptionPlaceholder', 'Used for permanent staff')}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-(--text-muted)">
                {t('docBuilder.category', 'Category')}
              </span>
              <Select
                value={draft.category}
                onValueChange={(value) => patch({ category: value as DocumentCategory | 'other' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {t(`docBuilder.category_${category}`, category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-(--text-muted)">
                {t('docBuilder.requiredLocale', 'Mandatory language')}
              </span>
              <Select
                value={draft.requiredLocale ?? 'none'}
                onValueChange={(value) =>
                  patch({
                    requiredLocale: value === 'none' ? undefined : (value as SupportedLocale),
                    // The mandatory language is the binding column by definition.
                    defaultPrimaryLocale:
                      value === 'none' ? draft.defaultPrimaryLocale : (value as SupportedLocale),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t('docBuilder.noRequiredLocale', 'Not fixed')}
                  </SelectItem>
                  {DOCUMENT_LOCALES.map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {LOCALE_CAPTIONS[locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-(--text-muted)">
                {t('docBuilder.secondLanguage', 'Second language')}
              </span>
              <Select
                value={draft.defaultSecondaryLocale ?? 'none'}
                onValueChange={(value) =>
                  patch({
                    defaultSecondaryLocale:
                      value === 'none' ? undefined : (value as SupportedLocale),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t('docBuilder.monolingual', 'One language only')}
                  </SelectItem>
                  {DOCUMENT_LOCALES.filter((locale) => locale !== locales.primary).map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {LOCALE_CAPTIONS[locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-(--text-muted)">
                {t('docBuilder.series', 'Number series')}
              </span>
              <Input
                value={draft.series ?? ''}
                onChange={(e) => patch({ series: e.target.value.toUpperCase() })}
                placeholder="HR"
                maxLength={8}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-(--text-muted)">
                {t('docBuilder.accent', 'Accent')}
              </span>
              <div className="flex gap-1.5">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    onClick={() => patch({ accent })}
                    aria-label={accent}
                    aria-pressed={draft.accent === accent}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      draft.accent === accent
                        ? 'border-(--text-primary) scale-110'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: ACCENT_HEX[accent] }}
                  />
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-(--text-muted)">
              <input
                type="checkbox"
                checked={draft.signature}
                onChange={(e) => patch({ signature: e.target.checked })}
                className="h-4 w-4 rounded border-(--border)"
              />
              {t('docBuilder.withSignature', 'Print a signature block')}
            </label>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((value) => !value)}
              className="ml-auto"
            >
              <Eye className="mr-2 h-4 w-4" />
              {showPreview
                ? t('docBuilder.hidePreview', 'Hide preview')
                : t('docBuilder.showPreview', 'Show preview')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Titles ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-(--text-primary)">
              {t('docBuilder.headings', 'Printed heading')}
            </h4>
          </div>
          <div className={`grid gap-3 ${secondary ? 'md:grid-cols-2' : ''}`}>
            <TitleField
              locale={locales.primary}
              value={draft.titles[locales.primary] ?? ''}
              onChange={(value) => patch({ titles: { ...draft.titles, [locales.primary]: value } })}
            />
            {secondary && (
              <TitleField
                locale={secondary}
                value={draft.titles[secondary] ?? ''}
                onChange={(value) => patch({ titles: { ...draft.titles, [secondary]: value } })}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Segments ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Columns2 className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-(--text-primary)">
              {t('docBuilder.segments', 'Content')}
            </h4>
            <Badge variant="outline">{draft.segments.length}</Badge>
            {audit.missing.length > 0 && (
              <Badge className="border-(--warning-outline) bg-(--warning-quiet) text-(--warning-text)">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {t('docBuilder.missingTranslations', {
                  count: audit.missing.length,
                  defaultValue: `${audit.missing.length} without translation`,
                })}
              </Badge>
            )}
            {audit.unknownTokens.length > 0 && (
              <Badge className="border-(--danger-outline) bg-(--danger-quiet) text-(--danger-text)">
                {t('docBuilder.unknownTokens', {
                  tokens: audit.unknownTokens.join(', '),
                  defaultValue: `Unknown tokens: ${audit.unknownTokens.join(', ')}`,
                })}
              </Badge>
            )}
          </div>
          <TokenPalette />
        </div>

        {draft.segments.map((segment, index) => (
          <SegmentRow
            key={segment.id}
            segment={segment}
            index={index}
            total={draft.segments.length}
            locales={locales}
            missing={audit.missing.includes(segment.id)}
            onKind={(kind) => patchSegment(segment.id, { kind })}
            onFullWidth={(fullWidth) => patchSegment(segment.id, { fullWidth })}
            onText={(locale, value) => setSegmentText(segment.id, locale, value)}
            onMove={(direction) => moveSegment(index, direction)}
            onRemove={() => removeSegment(segment.id)}
            onInsertBelow={() => addSegment('paragraph', index)}
          />
        ))}

        <div className="flex flex-wrap gap-2">
          {SEGMENT_KINDS.map(({ kind, icon: Icon, labelKey, fallback }) => (
            <Button key={kind} variant="outline" size="sm" onClick={() => addSegment(kind)}>
              <Icon className="mr-2 h-4 w-4" />
              {t(labelKey, fallback)}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Live preview ─────────────────────────────────────── */}
      {showPreview && (
        <div className="space-y-2">
          <p className="text-xs text-(--text-muted)">
            {t(
              'docBuilder.previewHint',
              'Tokens are shown unresolved — they are filled in per recipient when the document is issued.',
            )}
          </p>
          <DocumentSheet
            title={titleForPreview}
            meta={draft.series ? `${draft.series}-…` : undefined}
            blocks={previewBlocks}
            accentHex={ACCENT_HEX[draft.accent]}
          />
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────── */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-(--border) bg-(--bg-primary)/95 py-3 backdrop-blur">
        <Button variant="ghost" onClick={() => onClose(blueprintId)}>
          {t('docBuilder.close', 'Close')}
        </Button>
        <Button variant="outline" onClick={() => void handleSave()} disabled={saving || publishing}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t('docBuilder.save', 'Save draft')}
        </Button>
        <Button onClick={() => void handlePublish()} disabled={saving || publishing}>
          {publishing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {t('docBuilder.publish', 'Publish')}
        </Button>
      </div>
    </div>
  );
}

function TitleField({
  locale,
  value,
  onChange,
}: {
  locale: SupportedLocale;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
        {LOCALE_CAPTIONS[locale]}
      </span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * One segment: its kind, and its text in each chosen language side by side.
 *
 * The two textareas are the whole point of the editor — a translation that is
 * missing or out of step is visible at a glance rather than at print time.
 */
function SegmentRow({
  segment,
  index,
  total,
  locales,
  missing,
  onKind,
  onFullWidth,
  onText,
  onMove,
  onRemove,
  onInsertBelow,
}: {
  segment: DocumentSegment;
  index: number;
  total: number;
  locales: LocalePair;
  missing: boolean;
  onKind: (kind: DocumentSegmentKind) => void;
  onFullWidth: (fullWidth: boolean) => void;
  onText: (locale: SupportedLocale, value: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onInsertBelow: () => void;
}) {
  const { t } = useTranslation();
  const secondary = locales.secondary;
  const bilingual = !!secondary && secondary !== locales.primary;

  return (
    <Card className={missing ? 'border-amber-500/40' : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-(--text-muted)">{index + 1}</span>

          <Select
            value={segment.kind}
            onValueChange={(value) => onKind(value as DocumentSegmentKind)}
          >
            <SelectTrigger className="h-8 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEGMENT_KINDS.map(({ kind, labelKey, fallback }) => (
                <SelectItem key={kind} value={kind}>
                  {t(labelKey, fallback)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {bilingual && (
            <label className="flex items-center gap-1.5 text-xs text-(--text-muted)">
              <input
                type="checkbox"
                checked={!!segment.fullWidth}
                onChange={(e) => onFullWidth(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-(--border)"
              />
              {t('docBuilder.fullWidth', 'Full width')}
            </label>
          )}

          {missing && (
            <span className="inline-flex items-center gap-1 text-xs text-(--warning-text)">
              <AlertTriangle className="h-3 w-3" />
              {t('docBuilder.segmentMissing', 'Translation missing')}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              title={t('docBuilder.moveUp', 'Move up')}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              title={t('docBuilder.moveDown', 'Move down')}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onInsertBelow}
              title={t('docBuilder.insertBelow', 'Insert below')}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              title={t('docBuilder.removeSegment', 'Remove')}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>

        <div className={`grid gap-3 ${bilingual ? 'md:grid-cols-2' : ''}`}>
          <SegmentTextArea
            locale={locales.primary}
            value={segment.text[locales.primary] ?? ''}
            placeholder={placeholderFor(segment.kind)}
            onChange={(value) => onText(locales.primary, value)}
          />
          {bilingual && secondary && (
            <SegmentTextArea
              locale={secondary}
              value={segment.text[secondary] ?? ''}
              placeholder={placeholderFor(segment.kind)}
              onChange={(value) => onText(secondary, value)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SegmentTextArea({
  locale,
  value,
  placeholder,
  onChange,
}: {
  locale: SupportedLocale;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
          {LOCALE_CAPTIONS[locale]}
        </span>
        {!value.trim() && <span className="text-[10px] text-(--warning-text)">•</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        lang={locale}
        className="w-full resize-y rounded-lg border border-(--border) bg-(--bg-primary) p-2.5 text-xs leading-relaxed text-(--text-primary) outline-none focus:border-primary"
      />
    </div>
  );
}

/** Browsable list of merge tokens; clicking one copies it to the clipboard. */
function TokenPalette() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const groups = useMemo(groupTokens, []);

  const copy = async (token: string) => {
    const text = `{{${token}}}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error(
        t('docBuilder.copyFailed', 'Could not copy — select and copy the token manually'),
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Braces className="mr-2 h-4 w-4" />
          {t('docBuilder.tokens', 'Merge fields')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[420px] w-[320px] overflow-y-auto p-3">
        <p className="mb-2 text-xs text-(--text-muted)">
          {t('docBuilder.tokensHint', 'Click to copy, then paste into any language column.')}
        </p>
        <div className="space-y-3">
          {groups.map(({ group, tokens }) => (
            <div key={group} className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                {group}
              </p>
              <div className="flex flex-wrap gap-1">
                {tokens.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={(event) => {
                      // Keep the palette open: authors copy several tokens in a row.
                      event.preventDefault();
                      void copy(token);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-(--border) px-1.5 py-0.5 font-mono text-[10px] text-(--text-muted) transition hover:border-primary hover:text-(--text-primary)"
                  >
                    {copied === token && <Check className="h-3 w-3 text-(--success-text)" />}
                    {token}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
