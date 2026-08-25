'use client';

/**
 * Issued documents tab — the registry of documents handed to employees.
 *
 * Every row offers the full cycle the hiring packet established, now for any
 * template and any recipient: preview, download a themed PDF, download an
 * editable Word file, upload the edited file back, revert to the template, and
 * send for signature.
 *
 * Rendering happens here rather than on the server because the fonts (Armenian
 * glyphs) and both exporters are browser-only. The server keeps the state and, at
 * send time, freezes the text this component produced.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import {
  Ban,
  Check,
  Download,
  Eye,
  FileType,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  Send,
  Trash2,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DocumentPreview } from '@/components/documents/DocumentBlocksPreview';
import {
  useBuildIssuedDocument,
  blockText,
  blockKind,
} from '@/components/documents/useBuildIssuedDocument';

// Re-exported for existing consumers (tests, catalog tooling).
export { blockText, blockKind };
import { useAuthStore } from '@/store/useAuthStore';
import { uploadDocument } from '@/actions/cloudinary';
import {
  LOCALE_CAPTIONS,
  documentFileName,
  encodeDocumentContent,
  isBilingualPair,
  type LocalePair,
} from '@/lib/bilingualDocument';
import {
  exportDocumentToPDF,
  exportEditableDocx,
  isBlockBody,
  type DocumentBlock,
  type RenderableDocument,
} from '@/lib/exportDocument';
import { DocxImportError, parseEditableDocx } from '@/lib/docxRoundTrip';
import type { SupportedLocale } from '@/lib/date-format';

type IssuedRow = {
  _id: Id<'issuedDocuments'>;
  organizationId: Id<'organizations'>;
  recipientId: Id<'users'>;
  recipientName: string;
  recipientPosition?: string;
  issuerName: string;
  source: 'blueprint' | 'catalog';
  blueprintId?: Id<'documentBlueprints'>;
  blueprintVersion?: number;
  templateId?: string;
  primaryLocale: SupportedLocale;
  secondaryLocale?: SupportedLocale;
  title: string;
  status: 'draft' | 'edited' | 'sent' | 'signed' | 'cancelled';
  bodyOverride?: string;
  sourceDocxName?: string;
  documentNumber?: string;
  signatureDocumentId?: Id<'signatureDocuments'>;
  createdAt: number;
};

type StatusFilter = 'all' | IssuedRow['status'];

const MAX_DOCX_BYTES = 10 * 1024 * 1024;

/** Read a File as a base64 data URL (what the Cloudinary action expects). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export default function IssuedDocumentsTab({
  organizationId,
}: {
  organizationId: Id<'organizations'>;
}) {
  const { t } = useTranslation();
  const { buildDoc, labels, orgName, currentUser } = useBuildIssuedDocument();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const rows = useQuery(api.issuedDocuments.list, {
    organizationId,
    ...(status === 'all' ? {} : { status }),
    ...(search.trim() ? { search: search.trim() } : {}),
  }) as IssuedRow[] | undefined;

  const summary = useQuery(api.issuedDocuments.getSummary, { organizationId });

  const applyDocxOverride = useMutation(api.issuedDocuments.applyDocxOverride);
  const revertToTemplate = useMutation(api.issuedDocuments.revertToTemplate);
  const ensureDocumentNumber = useMutation(api.issuedDocuments.ensureDocumentNumber);
  const sendForSignature = useMutation(api.issuedDocuments.sendForSignature);
  const cancelDocument = useMutation(api.issuedDocuments.cancel);
  const removeDocument = useMutation(api.issuedDocuments.remove);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<RenderableDocument | null>(null);
  const [uploadRow, setUploadRow] = useState<IssuedRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const withBusy = useCallback(
    async (row: IssuedRow, action: () => Promise<void>) => {
      setBusyId(row._id);
      try {
        await action();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('issued.actionFailed', 'Action failed'),
        );
      } finally {
        setBusyId(null);
      }
    },
    [t],
  );

  const handlePreview = (row: IssuedRow) =>
    withBusy(row, async () => {
      const doc = await buildDoc(row);
      if (!doc) {
        toast.error(t('issued.buildFailed', 'Could not build this document'));
        return;
      }
      setPreviewDoc(doc);
    });

  const handleDownloadPdf = (row: IssuedRow) =>
    withBusy(row, async () => {
      // Reserve the number first, so the downloaded copy carries the same one as
      // the signed original will.
      const { documentNumber } = await ensureDocumentNumber({ issuedDocumentId: row._id });
      const doc = await buildDoc(row, { documentNumber });
      if (!doc) {
        toast.error(t('issued.buildFailed', 'Could not build this document'));
        return;
      }
      await exportDocumentToPDF(doc, documentFileName(row.title, row.recipientName, 'pdf'));
    });

  const handleDownloadEditableDocx = (row: IssuedRow) =>
    withBusy(row, async () => {
      const doc = await buildDoc(row, { omitSignatures: true });
      if (!doc) {
        toast.error(t('issued.buildFailed', 'Could not build this document'));
        return;
      }
      await exportEditableDocx(doc, documentFileName(row.title, row.recipientName, 'docx'));
      toast.success(
        t('issued.docxDownloaded', 'Word file downloaded — edit the text and upload it back.'),
      );
    });

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const row = uploadRow;
    event.target.value = '';
    if (!file || !row) return;

    if (file.size > MAX_DOCX_BYTES) {
      toast.error(t('issued.fileTooLarge', 'The file is larger than 10 MB'));
      return;
    }

    await withBusy(row, async () => {
      const buffer = await file.arrayBuffer();
      const bilingual = isBilingualPair({
        primary: row.primaryLocale,
        secondary: row.secondaryLocale,
      });

      let parsed;
      try {
        parsed = await parseEditableDocx(buffer, {
          bilingual,
          leftLabel: LOCALE_CAPTIONS[row.primaryLocale],
          rightLabel: row.secondaryLocale ? LOCALE_CAPTIONS[row.secondaryLocale] : undefined,
        });
      } catch (error) {
        toast.error(
          error instanceof DocxImportError
            ? error.message
            : t('issued.importFailed', 'The document could not be imported'),
        );
        return;
      }

      for (const warning of parsed.warnings) toast.warning(warning);

      // Archive the original upload too: the parsed body is what gets signed, but
      // the file the author actually produced is the audit trail.
      let sourceDocxUrl: string | undefined;
      try {
        const dataUrl = await fileToDataUrl(file);
        const uploaded = await uploadDocument(dataUrl, file.name, file.type);
        sourceDocxUrl = uploaded?.url;
      } catch {
        toast.warning(
          t(
            'issued.sourceNotStored',
            'The edited text was applied, but the original file could not be archived.',
          ),
        );
      }

      await applyDocxOverride({
        issuedDocumentId: row._id,
        blocksJson: JSON.stringify(parsed.blocks),
        sourceDocxUrl,
        sourceDocxName: file.name,
      });
      toast.success(t('issued.docxApplied', 'The edited document was applied'));
      setUploadRow(null);
    });
  };

  const handleSend = (row: IssuedRow) =>
    withBusy(row, async () => {
      const { documentNumber } = await ensureDocumentNumber({ issuedDocumentId: row._id });
      const doc = await buildDoc(row, { documentNumber });
      if (!doc || !isBlockBody(doc.body)) {
        toast.error(t('issued.buildFailed', 'Could not build this document'));
        return;
      }

      const content = encodeDocumentContent({
        version: 2,
        source: row.source,
        templateId: row.templateId,
        blueprintId: row.blueprintId,
        blueprintVersion: row.blueprintVersion,
        title: doc.title,
        blocks: doc.body,
        accent: doc.accent,
        orgName,
        documentNumber,
        primaryLocale: row.primaryLocale,
        secondaryLocale: row.secondaryLocale,
        labels,
        edited: !!row.bodyOverride,
      });

      await sendForSignature({
        issuedDocumentId: row._id,
        content,
        title: doc.title,
        accent: doc.accent,
        orgName,
        countersignerId: currentUser?.id ? (currentUser.id as Id<'users'>) : undefined,
      });
      toast.success(t('issued.sent', 'Sent for signature'));
    });

  const statusBadge = (row: IssuedRow) => {
    switch (row.status) {
      case 'signed':
        return (
          <Badge className="border-(--success-outline) bg-(--success-quiet) text-(--success-text)">
            <Check className="mr-1 h-3 w-3" />
            {t('issued.statusSigned', 'Signed')}
          </Badge>
        );
      case 'sent':
        return (
          <Badge className="border-(--brand-outline) bg-(--brand-quiet) text-(--brand-text)">
            {t('issued.statusSent', 'Awaiting signature')}
          </Badge>
        );
      case 'edited':
        return (
          <Badge className="border-(--warning-outline) bg-(--warning-quiet) text-(--warning-text)">
            {t('issued.statusEdited', 'Edited in Word')}
          </Badge>
        );
      case 'cancelled':
        return <Badge variant="outline">{t('issued.statusCancelled', 'Cancelled')}</Badge>;
      default:
        return <Badge variant="outline">{t('issued.statusDraft', 'Ready to send')}</Badge>;
    }
  };

  const counters = useMemo(() => {
    if (!summary) return [];
    return [
      { key: 'draft' as StatusFilter, value: summary.draft + summary.edited },
      { key: 'sent' as StatusFilter, value: summary.sent },
      { key: 'signed' as StatusFilter, value: summary.signed },
    ];
  }, [summary]);

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('issued.search', 'Title, employee or number…')}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-(--text-muted)" />
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('issued.filterAll', 'All statuses')}</SelectItem>
              <SelectItem value="draft">{t('issued.statusDraft', 'Ready to send')}</SelectItem>
              <SelectItem value="edited">{t('issued.statusEdited', 'Edited in Word')}</SelectItem>
              <SelectItem value="sent">{t('issued.statusSent', 'Awaiting signature')}</SelectItem>
              <SelectItem value="signed">{t('issued.statusSigned', 'Signed')}</SelectItem>
              <SelectItem value="cancelled">{t('issued.statusCancelled', 'Cancelled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {counters.length > 0 && (
          <div className="flex items-center gap-1.5">
            {counters.map(({ key, value }) => (
              <Badge key={key} variant="outline" className="cursor-default">
                {t(
                  `issued.status${key === 'draft' ? 'Draft' : key === 'sent' ? 'Sent' : 'Signed'}`,
                )}
                : {value}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* ── Rows ─────────────────────────────────────────────── */}
      {rows === undefined ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-(--text-muted)">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {t('issued.loading', 'Loading documents…')}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-(--text-muted)">
            {t('issued.empty', 'No documents issued yet. Issue one from the Templates tab.')}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const busy = busyId === row._id;
            const frozen = row.status === 'sent' || row.status === 'signed';
            const locales: LocalePair = {
              primary: row.primaryLocale,
              secondary: row.secondaryLocale,
            };

            return (
              <li key={row._id} className="rounded-xl border border-(--border) p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-(--text-primary)">
                        {row.title}
                      </span>
                      {statusBadge(row)}
                    </div>
                    <p className="mt-0.5 text-xs text-(--text-muted)">
                      {row.recipientName}
                      {row.recipientPosition && ` · ${row.recipientPosition}`}
                    </p>
                    <p className="mt-0.5 text-[10px] text-(--text-muted)">
                      {LOCALE_CAPTIONS[locales.primary]}
                      {isBilingualPair(locales) && ` + ${LOCALE_CAPTIONS[locales.secondary!]}`}
                      {row.documentNumber && <> · {row.documentNumber}</>}
                      {row.sourceDocxName && <> · {row.sourceDocxName}</>}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handlePreview(row)}
                      title={t('issued.preview', 'Preview')}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleDownloadPdf(row)}
                      title={t('issued.downloadPdf', 'Download PDF')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>

                    {!frozen && row.status !== 'cancelled' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleDownloadEditableDocx(row)}
                          title={t('issued.editInWord', 'Download for editing in Word')}
                        >
                          <FileType className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setUploadRow(row);
                            fileInputRef.current?.click();
                          }}
                          title={t('issued.uploadEdited', 'Upload the edited Word file')}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        {row.bodyOverride && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void withBusy(row, async () => {
                                await revertToTemplate({ issuedDocumentId: row._id });
                                toast.success(t('issued.reverted', 'Reverted to the template'));
                              })
                            }
                            title={t('issued.revert', 'Revert to the template')}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void withBusy(row, async () => {
                              await cancelDocument({ issuedDocumentId: row._id });
                            })
                          }
                          title={t('issued.cancel', 'Cancel')}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => void handleSend(row)}>
                          <Send className="mr-1 h-4 w-4" />
                          {t('issued.send', 'Send')}
                        </Button>
                      </>
                    )}

                    {row.status === 'cancelled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void withBusy(row, async () => {
                            await removeDocument({ issuedDocumentId: row._id });
                          })
                        }
                        title={t('issued.delete', 'Delete')}
                      >
                        <Trash2 className="h-4 w-4 text-(--danger-text)" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Hidden input backing "upload the edited Word file" */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => void handleFileSelected(e)}
      />

      {/* Preview */}
      <Sheet open={previewDoc !== null} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <SheetContent side="right" size="full" closeLabel={t('common.close', 'Close')}>
          {previewDoc && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{previewDoc.title}</SheetTitle>
                <SheetDescription>
                  {orgName}
                  {previewDoc.documentNumber && <> · {previewDoc.documentNumber}</>}
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <DocumentPreview doc={previewDoc} />
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
