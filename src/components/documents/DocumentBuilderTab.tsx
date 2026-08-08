'use client';

/**
 * Templates tab — the organization's own document templates.
 *
 * Two libraries live side by side here:
 *
 *   - the organization's blueprints, authored in the two-column editor;
 *   - the fourteen built-in templates, read-only, offered as a starting point.
 *     Forking one converts its four flat locale bodies into segments, so HR edits
 *     a legally vetted text instead of an empty page.
 *
 * Issuing happens from this tab too: pick a template, a recipient and a language
 * pair, and a row appears in the registry with its own registration number.
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileSignature,
  FileText,
  Languages,
  Loader2,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPicker } from '@/components/ui/UserPicker';
import BlueprintEditor, { type BlueprintDraft } from '@/components/documents/BlueprintEditor';
import {
  DOCUMENT_LOCALES,
  LOCALE_CAPTIONS,
  documentTitle,
  isBilingualPair,
  segmentsFromBodies,
  type LocalePair,
} from '@/lib/bilingualDocument';
import {
  ACCENT_HEX,
  CATALOG,
  CATEGORY_ORDER,
  getCatalogTemplate,
  localizedContent,
  type AccentColor,
  type DocumentCategory,
} from '@/lib/documentCatalog';
import type { SupportedLocale } from '@/lib/date-format';

type Blueprint = {
  _id: Id<'documentBlueprints'>;
  name: string;
  description?: string;
  category: DocumentCategory | 'other';
  accent: AccentColor;
  titles: Record<string, string | undefined>;
  segments: BlueprintDraft['segments'];
  requiredLocale?: SupportedLocale;
  defaultPrimaryLocale?: SupportedLocale;
  defaultSecondaryLocale?: SupportedLocale;
  signature: boolean;
  series?: string;
  status: 'draft' | 'published' | 'archived';
  version: number;
  forkedFromTemplateId?: string;
  updatedAt: number;
};

/** A fresh blueprint: Armenian binding column with a Russian translation. */
function emptyDraft(): BlueprintDraft {
  return {
    name: '',
    category: 'other',
    accent: 'blue',
    titles: {},
    segments: [],
    defaultPrimaryLocale: 'hy',
    defaultSecondaryLocale: 'ru',
    signature: true,
  };
}

/**
 * Convert a built-in template into an editable blueprint draft.
 *
 * @param uiLang Language the admin is working in; it names the draft. The
 *   catalog falls back to English for languages it has no copy in.
 */
function draftFromCatalog(
  templateId: string,
  spine: SupportedLocale,
  uiLang: SupportedLocale,
): BlueprintDraft | null {
  const template = getCatalogTemplate(templateId);
  if (!template) return null;

  const bodies: Partial<Record<SupportedLocale, string>> = {};
  const titles: Record<string, string | undefined> = {};
  for (const locale of DOCUMENT_LOCALES) {
    const content = template.locales[locale];
    if (!content) continue;
    bodies[locale] = content.body;
    titles[locale] = content.title;
  }

  const { segments, warnings } = segmentsFromBodies(bodies, spine);
  if (warnings.length > 0) {
    // Worth surfacing: the built-in bodies are translations of one structure, so
    // a mismatch means the fork needs a read-through before it is published.
    toast.warning(warnings.join(' · '));
  }

  return {
    name: localizedContent(template, uiLang).title,
    category: template.category,
    accent: template.accent,
    titles,
    segments,
    requiredLocale: spine,
    defaultPrimaryLocale: spine,
    defaultSecondaryLocale: spine === 'ru' ? 'hy' : 'ru',
    signature: template.signature,
    forkedFromTemplateId: template.id,
  };
}

export default function DocumentBuilderTab({
  organizationId,
}: {
  organizationId: Id<'organizations'>;
}) {
  const { t, i18n: i18nInstance } = useTranslation();
  // Template names follow the interface language; the catalog falls back to
  // English for languages it carries no copy in. Read off the instance bound to
  // this render rather than the module singleton, so a language switch renames
  // the list instead of leaving it in whatever language it first rendered in.
  const lang = (i18nInstance.language?.slice(0, 2) as SupportedLocale) || 'en';

  const blueprints = useQuery(api.documentBlueprints.list, {
    organizationId,
    includeUnpublished: true,
  }) as Blueprint[] | undefined;

  const duplicate = useMutation(api.documentBlueprints.duplicate);
  const setArchived = useMutation(api.documentBlueprints.setArchived);
  const remove = useMutation(api.documentBlueprints.remove);

  const [editing, setEditing] = useState<BlueprintDraft | null>(null);
  const [issuing, setIssuing] = useState<Blueprint | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const rows = blueprints ?? [];
    const order: Array<DocumentCategory | 'other'> = [...CATEGORY_ORDER, 'other'];
    return order
      .map((category) => ({ category, items: rows.filter((row) => row.category === category) }))
      .filter((group) => group.items.length > 0);
  }, [blueprints]);

  const handleDuplicate = useCallback(
    async (blueprint: Blueprint) => {
      setBusyId(blueprint._id);
      try {
        await duplicate({ blueprintId: blueprint._id });
        toast.success(t('docBuilder.duplicated', 'Copy created'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error');
      } finally {
        setBusyId(null);
      }
    },
    [duplicate, t],
  );

  const handleArchive = useCallback(
    async (blueprint: Blueprint, archived: boolean) => {
      setBusyId(blueprint._id);
      try {
        await setArchived({ blueprintId: blueprint._id, archived });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error');
      } finally {
        setBusyId(null);
      }
    },
    [setArchived],
  );

  const handleRemove = useCallback(
    async (blueprint: Blueprint) => {
      setBusyId(blueprint._id);
      try {
        await remove({ blueprintId: blueprint._id });
        toast.success(t('docBuilder.removed', 'Template deleted'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error');
      } finally {
        setBusyId(null);
      }
    },
    [remove, t],
  );

  if (editing) {
    return (
      <BlueprintEditor
        organizationId={organizationId}
        initial={editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-(--text-primary)">
            {t('docBuilder.title', 'Document templates')}
          </h3>
          <p className="text-xs text-(--text-muted)">
            {t(
              'docBuilder.subtitle',
              'Two languages side by side on one A4 page, with merge fields filled in per employee.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCatalogOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t('docBuilder.fromCatalog', 'From a built-in template')}
          </Button>
          <Button onClick={() => setEditing(emptyDraft())}>
            <Plus className="mr-2 h-4 w-4" />
            {t('docBuilder.create', 'New template')}
          </Button>
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────────── */}
      {blueprints === undefined ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-(--text-muted)">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {t('docBuilder.loading', 'Loading templates…')}
          </CardContent>
        </Card>
      ) : blueprints.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-(--text-muted)" />
            <p className="text-sm text-(--text-primary)">
              {t('docBuilder.emptyTitle', 'No templates yet')}
            </p>
            <p className="mx-auto max-w-md text-xs text-(--text-muted)">
              {t(
                'docBuilder.emptyHint',
                'Start from one of the fourteen built-in bilingual templates, or write your own from scratch.',
              )}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" onClick={() => setCatalogOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                {t('docBuilder.fromCatalog', 'From a built-in template')}
              </Button>
              <Button onClick={() => setEditing(emptyDraft())}>
                <Plus className="mr-2 h-4 w-4" />
                {t('docBuilder.create', 'New template')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        grouped.map(({ category, items }) => (
          <div key={category} className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-(--text-muted)">
              {t(`docBuilder.category_${category}`, category)}
            </p>
            <div className="grid gap-2 lg:grid-cols-2">
              {items.map((blueprint) => (
                <BlueprintCard
                  key={blueprint._id}
                  blueprint={blueprint}
                  busy={busyId === blueprint._id}
                  onEdit={() => setEditing({ ...blueprint, _id: blueprint._id })}
                  onIssue={() => setIssuing(blueprint)}
                  onDuplicate={() => void handleDuplicate(blueprint)}
                  onArchive={(archived) => void handleArchive(blueprint, archived)}
                  onRemove={() => void handleRemove(blueprint)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {/* ── Built-in catalog ─────────────────────────────────── */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogTitle>{t('docBuilder.catalogTitle', 'Built-in templates')}</DialogTitle>
          <DialogDescription>
            {t(
              'docBuilder.catalogHint',
              'A copy is created in your organization — the original stays untouched.',
            )}
          </DialogDescription>
          <div className="mt-4 space-y-2">
            {CATALOG.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  const draft = draftFromCatalog(template.id, 'hy', lang);
                  if (!draft) return;
                  setCatalogOpen(false);
                  setEditing(draft);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-(--border) p-3 text-left transition hover:border-primary"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: ACCENT_HEX[template.accent] }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-(--text-primary)">
                    {localizedContent(template, lang).title}
                  </span>
                  <span className="block text-xs text-(--text-muted)">
                    {t(`docBuilder.category_${template.category}`, template.category)} ·{' '}
                    {DOCUMENT_LOCALES.filter((locale) => template.locales[locale])
                      .map((locale) => LOCALE_CAPTIONS[locale])
                      .join(' · ')}
                  </span>
                </span>
                <Copy className="h-4 w-4 shrink-0 text-(--text-muted)" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Issue ────────────────────────────────────────────── */}
      {issuing && (
        <IssueDialog
          organizationId={organizationId}
          blueprint={issuing}
          onClose={() => setIssuing(null)}
        />
      )}
    </div>
  );
}

function BlueprintCard({
  blueprint,
  busy,
  onEdit,
  onIssue,
  onDuplicate,
  onArchive,
  onRemove,
}: {
  blueprint: Blueprint;
  busy: boolean;
  onEdit: () => void;
  onIssue: () => void;
  onDuplicate: () => void;
  onArchive: (archived: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const locales: LocalePair = {
    primary: blueprint.defaultPrimaryLocale ?? blueprint.requiredLocale ?? 'hy',
    secondary: blueprint.defaultSecondaryLocale,
  };

  const statusBadge = () => {
    switch (blueprint.status) {
      case 'published':
        return (
          <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
            {t('docBuilder.statusPublished', {
              version: blueprint.version,
              defaultValue: `v${blueprint.version}`,
            })}
          </Badge>
        );
      case 'archived':
        return <Badge variant="outline">{t('docBuilder.statusArchived', 'Archived')}</Badge>;
      default:
        return (
          <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-600">
            {t('docBuilder.statusDraft', 'Draft')}
          </Badge>
        );
    }
  };

  return (
    <Card className={blueprint.status === 'archived' ? 'opacity-60' : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: ACCENT_HEX[blueprint.accent] }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-(--text-primary)">
                {blueprint.name}
              </span>
              {statusBadge()}
              {blueprint.forkedFromTemplateId && (
                <Badge variant="outline" className="text-[10px]">
                  {t('docBuilder.forked', 'Based on a built-in')}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-(--text-muted)">
              {documentTitle(blueprint.titles, locales) || blueprint.description || '—'}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-(--text-muted)">
              <span className="inline-flex items-center gap-1">
                <Languages className="h-3 w-3" />
                {LOCALE_CAPTIONS[locales.primary]}
                {isBilingualPair(locales) && ` + ${LOCALE_CAPTIONS[locales.secondary!]}`}
              </span>
              <span>
                {t('docBuilder.segmentCount', {
                  count: blueprint.segments.length,
                  defaultValue: `${blueprint.segments.length} segments`,
                })}
              </span>
              {blueprint.series && <span>· {blueprint.series}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} disabled={busy}>
            <Pencil className="mr-1.5 h-4 w-4" />
            {t('docBuilder.edit', 'Edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate} disabled={busy}>
            <Copy className="mr-1.5 h-4 w-4" />
            {t('docBuilder.duplicate', 'Duplicate')}
          </Button>
          {blueprint.status === 'archived' ? (
            <Button variant="ghost" size="sm" onClick={() => onArchive(false)} disabled={busy}>
              <ArchiveRestore className="mr-1.5 h-4 w-4" />
              {t('docBuilder.restore', 'Restore')}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => onArchive(true)} disabled={busy}>
              <Archive className="mr-1.5 h-4 w-4" />
              {t('docBuilder.archive', 'Archive')}
            </Button>
          )}
          {blueprint.version === 0 && (
            <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
              <Trash2 className="mr-1.5 h-4 w-4 text-red-500" />
              {t('docBuilder.delete', 'Delete')}
            </Button>
          )}
          <Button
            size="sm"
            className="ml-auto"
            onClick={onIssue}
            disabled={busy || blueprint.status !== 'published'}
            title={
              blueprint.status !== 'published'
                ? t('docBuilder.publishFirst', 'Publish the template before issuing it')
                : undefined
            }
          >
            <Send className="mr-1.5 h-4 w-4" />
            {t('docBuilder.issue', 'Issue')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pick a recipient and a language pair, then create the issued document. */
function IssueDialog({
  organizationId,
  blueprint,
  onClose,
}: {
  organizationId: Id<'organizations'>;
  blueprint: Blueprint;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const issue = useMutation(api.issuedDocuments.issue);

  const [recipientId, setRecipientId] = useState('');
  const [primary, setPrimary] = useState<SupportedLocale>(
    blueprint.defaultPrimaryLocale ?? blueprint.requiredLocale ?? 'hy',
  );
  const [secondary, setSecondary] = useState<SupportedLocale | 'none'>(
    blueprint.defaultSecondaryLocale ?? 'none',
  );
  const [submitting, setSubmitting] = useState(false);

  const locales: LocalePair = {
    primary,
    secondary: secondary === 'none' ? undefined : secondary,
  };
  const title = documentTitle(blueprint.titles, locales) || blueprint.name;

  /** The template may pin the language it is legally invalid without. */
  const requiredMissing =
    !!blueprint.requiredLocale &&
    blueprint.requiredLocale !== primary &&
    blueprint.requiredLocale !== locales.secondary;

  const handleIssue = async () => {
    if (!recipientId) return;
    setSubmitting(true);
    try {
      const result = await issue({
        organizationId,
        recipientIds: [recipientId as Id<'users'>],
        source: 'blueprint',
        blueprintId: blueprint._id,
        primaryLocale: primary,
        secondaryLocale: secondary === 'none' ? undefined : secondary,
        title,
      });
      if (result.created === 0) {
        toast.error(t('docBuilder.issueSkipped', 'The recipient is not part of this organization'));
        return;
      }
      toast.success(t('docBuilder.issued', 'Document issued — find it under "Issued"'));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          {t('docBuilder.issueTitle', 'Issue a document')}
        </DialogTitle>
        <DialogDescription>{blueprint.name}</DialogDescription>

        <div className="mt-4 space-y-4">
          <UserPicker
            organizationId={organizationId}
            value={recipientId}
            onChange={setRecipientId}
            label={t('docBuilder.recipient', 'Recipient')}
            hint={t('docBuilder.recipientHint', 'Merge fields are filled in from their profile.')}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-(--text-muted)">
                {t('docBuilder.bindingLanguage', 'Binding language')}
              </span>
              <Select
                value={primary}
                onValueChange={(value) => setPrimary(value as SupportedLocale)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
                value={secondary}
                onValueChange={(value) => setSecondary(value as SupportedLocale | 'none')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t('docBuilder.monolingual', 'One language only')}
                  </SelectItem>
                  {DOCUMENT_LOCALES.filter((locale) => locale !== primary).map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {LOCALE_CAPTIONS[locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {requiredMissing && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600">
              {t('docBuilder.requiredLocaleMissing', {
                locale: LOCALE_CAPTIONS[blueprint.requiredLocale!],
                defaultValue: `This template must include ${LOCALE_CAPTIONS[blueprint.requiredLocale!]} — it is the binding language.`,
              })}
            </p>
          )}

          <div className="rounded-lg border border-(--border) p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-(--text-muted)">
              {t('docBuilder.willBeIssued', 'Will be issued as')}
            </p>
            <p className="mt-1 text-sm text-(--text-primary)">{title}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('docBuilder.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={() => void handleIssue()}
            disabled={!recipientId || requiredMissing || submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {t('docBuilder.issue', 'Issue')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
