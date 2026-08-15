'use client';

/**
 * Hiring packet panel — the HR-facing surface for the documents an employee
 * signs when they are hired.
 *
 * Everything the panel shows is derived, not stored: the Convex rows carry only
 * state (template id, second language, status, registration number), and the text
 * is resolved here from the catalog plus the employee's current data. The one
 * exception is a document whose body came from a hand-edited Word upload
 * (`bodyOverride`).
 *
 * Round trip: "Word" downloads a stripped, editable copy (no letterhead, no
 * signature block); uploading it back parses it into blocks and marks the
 * document as edited. The original file is kept in Cloudinary for audit.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  FileText,
  FileType,
  Loader2,
  RotateCcw,
  Send,
  Upload,
  XCircle,
} from 'lucide-react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { uploadDocument } from '@/actions/cloudinary';

import {
  DEFAULT_HIRING_PACKET,
  HIRING_PACKET_MANDATORY,
  getCatalogTemplate,
  localizedContent,
} from '@/lib/documentCatalog';
import type { MergeSourceData } from '@/lib/documentTokens';
import {
  exportDocumentToPDF,
  exportEditableDocx,
  renderDocumentDocxBlob,
  type DocumentBlock,
  type RenderableDocument,
} from '@/lib/exportDocument';
import { parseEditableDocx, DocxImportError } from '@/lib/docxRoundTrip';
import { DocumentPreview } from '@/components/documents/DocumentBlocksPreview';
import { useDocumentLabels } from '@/hooks/useDocumentLabels';
import {
  LOCALE_CAPTIONS,
  PRIMARY_LOCALE,
  applySignaturesToBlocks,
  buildBilingualBlocks,
  collectSignaturesInOrder,
  encodeHiringPacketContent,
  hiringPacketFileName,
  hiringPacketTitle,
  parseHiringPacketContent,
  type CollectedSignature,
  type HiringPacketPayload,
} from '@/lib/hiringPacketDocument';
import { formatDate, type SupportedLocale } from '@/lib/date-format';

/**
 * Languages offerable as the second column. Armenian is excluded: it already
 * occupies the primary column, so pairing it with itself is meaningless.
 */
const SECONDARY_LOCALES: readonly SupportedLocale[] = ['ru', 'en', 'de'];

/** One row as returned by `api.hiringPackets.listForEmployee`. */
interface PacketRow {
  _id: Id<'hiringPacketDocuments'>;
  templateId: string;
  order: number;
  secondaryLocale: SupportedLocale;
  mandatory: boolean;
  status: 'draft' | 'edited' | 'sent' | 'signed' | 'skipped';
  bodyOverride?: string;
  sourceDocxUrl?: string;
  sourceDocxName?: string;
  documentNumber?: string;
  signatureDocumentId?: Id<'signatureDocuments'>;
  signatureStatus: string | null;
  signedPdfUrl: string | null;
  contentHash: string | null;
  /** Immutable snapshot of the content taken when the document was sent. */
  frozenContent: string | null;
  sentAt?: number;
  createdAt: number;
  signers: Array<{
    requestId: Id<'signatureRequests'>;
    signerId: Id<'users'>;
    signerName: string;
    status: string;
    signedAt: number | null;
    order: number;
  }>;
}

/** Read a File as a base64 data URL (what the Cloudinary action expects). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}
// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

interface HiringPacketPanelProps {
  userId: Id<'users'>;
  /** Whether the viewer may edit and send documents (HR/admin, not the employee). */
  canManage: boolean;
}

export default function HiringPacketPanel({ userId, canManage }: HiringPacketPanelProps) {
  const { t } = useTranslation();
  const labels = useDocumentLabels();
  const currentUser = useAuthStore((s) => s.user);
  const convex = useConvex();

  const rows = useQuery(api.hiringPackets.listForEmployee, { userId }) as PacketRow[] | undefined;
  const mergeData = useQuery(api.documentLibrary.getEmployeeMergeData, { userId });

  const applyDocxOverride = useMutation(api.hiringPackets.applyDocxOverride);
  const revertToTemplate = useMutation(api.hiringPackets.revertToTemplate);
  const setSkipped = useMutation(api.hiringPackets.setSkipped);
  const sendForSignature = useMutation(api.hiringPackets.sendForSignature);
  const ensureDocumentNumber = useMutation(api.hiringPackets.ensureDocumentNumber);
  const generatePacket = useMutation(api.hiringPackets.generate);
  const setSecondaryLocale = useMutation(api.hiringPackets.setSecondaryLocale);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewRow, setPreviewRow] = useState<PacketRow | null>(null);
  const uploadTargetRef = useRef<PacketRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** Second language chosen for a packet that does not exist yet. */
  const [pendingLocale, setPendingLocale] = useState<SupportedLocale>('ru');

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      await generatePacket({
        userId,
        secondaryLocale: pendingLocale,
        templateIds: [...DEFAULT_HIRING_PACKET],
        mandatoryTemplateIds: [...HIRING_PACKET_MANDATORY],
      });
      toast.success(t('hiringPacket.generated', 'Documents prepared'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    } finally {
      setGenerating(false);
    }
  }, [generatePacket, pendingLocale, t, userId]);

  /**
   * Change the second language of every document that has not been sent yet.
   * Sent and signed documents keep the language they were signed in.
   */
  const handleChangeLocale = useCallback(
    async (locale: SupportedLocale) => {
      setGenerating(true);
      try {
        const result = await setSecondaryLocale({ userId, secondaryLocale: locale });
        if (result.updated === 0) {
          toast.info(
            t(
              'hiringPacket.localeUnchanged',
              'Nothing to change — the remaining documents have already been sent.',
            ),
          );
        } else {
          toast.success(
            t('hiringPacket.localeChanged', {
              count: result.updated,
              defaultValue: `Second language changed for ${result.updated} documents`,
            }),
          );
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed');
      } finally {
        setGenerating(false);
      }
    },
    [setSecondaryLocale, t, userId],
  );

  const source: MergeSourceData | null = useMemo(() => {
    if (!mergeData) return null;
    return {
      employee: mergeData.employee,
      organization: mergeData.organization,
      signatory: { name: currentUser?.name ?? null, position: currentUser?.position ?? null },
      now: Date.now(),
    };
  }, [mergeData, currentUser?.name, currentUser?.position]);

  const orgName = mergeData?.organization.name ?? currentUser?.organizationName ?? '';
  const employeeName = mergeData?.employee.name ?? '';

  /**
   * Snapshots of documents that have already been sent, keyed by row id.
   *
   * A row is rendered from its snapshot as soon as one exists — that is the text
   * the employee is signing or has signed, and it must not drift with later
   * edits to their profile.
   */
  const frozenPayloads = useMemo(() => {
    const map: Record<string, HiringPacketPayload> = {};
    for (const row of rows ?? []) {
      if (!row.frozenContent) continue;
      const parsed = parseHiringPacketContent(row.frozenContent);
      if (parsed) map[row._id] = parsed;
    }
    return map;
  }, [rows]);

  /**
   * The standard two-party signature grid.
   *
   * Built here rather than carried through Word: the editable export strips the
   * grid on purpose, so it has to be re-attached before a hand-edited document is
   * frozen — otherwise the signed original would have nowhere to hold a
   * signature.
   */
  const signatureGrid = useCallback(
    (): DocumentBlock => ({
      type: 'signatures',
      parties: [
        {
          role: labels.signature,
          nameLabel: labels.name,
          name: employeeName,
          dateLabel: labels.date,
        },
        {
          role: currentUser?.position || labels.position,
          nameLabel: labels.name,
          name: currentUser?.name ?? '',
          positionLabel: labels.position,
          position: currentUser?.position ?? undefined,
          dateLabel: labels.date,
        },
      ],
    }),
    [labels, employeeName, currentUser?.name, currentUser?.position],
  );

  /**
   * Build the renderable document for a row.
   *
   * Two rules matter here:
   *
   * 1. Once a document has been sent, the frozen snapshot in
   *    `signatureDocuments.content` is the document. Re-resolving the catalog
   *    against *current* employee data would mean a salary change after signing
   *    silently altered the "signed" copy someone downloads — while the footer
   *    still printed the hash of the original text.
   *
   * 2. A hand-edited body never carries a signature grid (the editable Word
   *    export strips it so an edited file cannot smuggle one in), so the grid is
   *    appended here from the template. Without this an edited document would be
   *    signed and archived with nowhere to put the signature.
   */
  const buildDoc = useCallback(
    (row: PacketRow, opts: { omitSignatures?: boolean } = {}): RenderableDocument | null => {
      const template = getCatalogTemplate(row.templateId);
      if (!template) return null;

      // ── Frozen documents render from their snapshot ───────────────────────
      const frozen = frozenPayloads[row._id];
      if (frozen) {
        return {
          title: frozen.title,
          body: frozen.blocks,
          accent: frozen.accent,
          // The snapshot carries its own grid.
          signature: false,
          orgName: frozen.orgName,
          documentNumber: frozen.documentNumber,
          contentHash: row.contentHash ?? undefined,
          now: row.sentAt ?? row.createdAt,
          lang: frozen.primaryLocale,
          labels: frozen.labels,
        };
      }

      if (!source) return null;

      let blocks: DocumentBlock[];
      if (row.bodyOverride) {
        try {
          blocks = JSON.parse(row.bodyOverride) as DocumentBlock[];
        } catch {
          return null;
        }
        // Defensive: an override should never contain a grid, but never render
        // two of them if a legacy row does.
        blocks = blocks.filter((block) => block.type !== 'signatures');
        if (!opts.omitSignatures && template.signature) {
          blocks = [...blocks, signatureGrid()];
        }
      } else {
        blocks = buildBilingualBlocks({
          template,
          data: source,
          secondaryLocale: row.secondaryLocale,
          labels,
          employeeName,
          signatoryName: currentUser?.name ?? undefined,
          signatoryPosition: currentUser?.position ?? undefined,
          omitSignatures: opts.omitSignatures,
        });
      }

      return {
        title: hiringPacketTitle(row.templateId, source, row.secondaryLocale),
        body: blocks,
        accent: template.accent,
        signature: template.signature,
        orgName,
        documentNumber: row.documentNumber,
        contentHash: row.contentHash ?? undefined,
        now: Date.now(),
        // The Armenian column is the binding text, so dates and labels in the
        // header/footer follow it.
        lang: PRIMARY_LOCALE,
        labels,
      };
    },
    [
      frozenPayloads,
      signatureGrid,
      source,
      labels,
      employeeName,
      orgName,
      currentUser?.name,
      currentUser?.position,
    ],
  );

  /**
   * Fetch the signatures actually collected for a row.
   *
   * Signature images are deliberately not part of `listForEmployee` (they are
   * bulky and only needed on an explicit download), so they are pulled on demand.
   */
  const fetchCollectedSignatures = useCallback(
    async (row: PacketRow): Promise<CollectedSignature[]> => {
      if (!row.signatureDocumentId) return [];
      const signatureDoc = await convex.query(api.signatures.getDocument, {
        documentId: row.signatureDocumentId,
      });
      // Keeps an empty slot for anyone who has not signed yet. Dropping them —
      // as this used to — shifts a lone countersignature into the employee's
      // box, because the grid pairs signatures with parties by position.
      return collectSignaturesInOrder(signatureDoc?.requests);
    },
    [convex],
  );

  /** Overlay collected signatures onto a document's signature grid. */
  const withSignatures = useCallback(
    (doc: RenderableDocument, collected: CollectedSignature[]): RenderableDocument => {
      if (!collected.length || !Array.isArray(doc.body)) return doc;
      return {
        ...doc,
        body: applySignaturesToBlocks(doc.body, collected, (ts) =>
          formatDate(ts, doc.lang ?? PRIMARY_LOCALE, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        ),
      };
    },
    [],
  );

  const handleDownloadPdf = useCallback(
    async (row: PacketRow) => {
      const base = buildDoc(row);
      if (!base) {
        toast.error(t('hiringPacket.buildFailed', 'Could not build this document'));
        return;
      }
      setBusyId(row._id);
      try {
        const collected = row.signatureDocumentId ? await fetchCollectedSignatures(row) : [];
        await exportDocumentToPDF(
          withSignatures(base, collected),
          hiringPacketFileName(row.templateId, employeeName, 'pdf'),
        );
      } catch {
        toast.error(t('docLibrary.exportError', 'Export failed'));
      } finally {
        setBusyId(null);
      }
    },
    [buildDoc, employeeName, fetchCollectedSignatures, t, withSignatures],
  );

  const handleDownloadEditableDocx = useCallback(
    async (row: PacketRow) => {
      const doc = buildDoc(row, { omitSignatures: true });
      if (!doc) {
        toast.error(t('hiringPacket.buildFailed', 'Could not build this document'));
        return;
      }
      setBusyId(row._id);
      try {
        await exportEditableDocx(doc, hiringPacketFileName(row.templateId, employeeName, 'docx'));
        toast.success(
          t(
            'hiringPacket.docxDownloaded',
            'Word file downloaded — edit the text and upload it back.',
          ),
        );
      } catch {
        toast.error(t('docLibrary.exportError', 'Export failed'));
      } finally {
        setBusyId(null);
      }
    },
    [buildDoc, employeeName, t],
  );

  /** Regenerate a DOCX of a completed document with the signature baked in. */
  const handleDownloadSignedDocx = useCallback(
    async (row: PacketRow) => {
      if (!row.signatureDocumentId) return;
      setBusyId(row._id);
      try {
        const base = buildDoc(row);
        if (!base) {
          toast.error(t('hiringPacket.buildFailed', 'Could not build this document'));
          return;
        }
        const collected = await fetchCollectedSignatures(row);
        const blob = await renderDocumentDocxBlob(withSignatures(base, collected));

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = hiringPacketFileName(row.templateId, employeeName, 'docx');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {
        toast.error(t('docLibrary.exportError', 'Export failed'));
      } finally {
        setBusyId(null);
      }
    },
    [buildDoc, employeeName, fetchCollectedSignatures, t, withSignatures],
  );

  const openUploadDialog = useCallback((row: PacketRow) => {
    uploadTargetRef.current = row;
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const row = uploadTargetRef.current;
      // Reset immediately so re-selecting the same file fires onChange again.
      event.target.value = '';
      uploadTargetRef.current = null;
      if (!file || !row) return;

      setBusyId(row._id);
      try {
        const buffer = await file.arrayBuffer();
        const parsed = await parseEditableDocx(buffer, {
          bilingual: true,
          leftLabel: LOCALE_CAPTIONS[PRIMARY_LOCALE],
          rightLabel: LOCALE_CAPTIONS[row.secondaryLocale],
        });

        // Keep the file the human actually edited, so an auditor can compare it
        // against what the parser made of it. A storage failure must not block
        // the edit itself.
        let sourceDocxUrl: string | undefined;
        let sourceDocxName: string | undefined;
        try {
          const dataUrl = await fileToDataUrl(file);
          const uploaded = await uploadDocument(
            dataUrl,
            file.name,
            file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          );
          sourceDocxUrl = uploaded.url;
          sourceDocxName = uploaded.name;
        } catch {
          toast.warning(
            t(
              'hiringPacket.sourceNotStored',
              'The edited text was applied, but the original file could not be archived.',
            ),
          );
        }

        await applyDocxOverride({
          packetDocumentId: row._id,
          blocksJson: JSON.stringify(parsed.blocks),
          sourceDocxUrl,
          sourceDocxName,
        });

        for (const warning of parsed.warnings) toast.warning(warning);
        toast.success(t('hiringPacket.docxApplied', 'The edited document was applied'));
      } catch (error) {
        toast.error(
          error instanceof DocxImportError
            ? error.message
            : error instanceof Error
              ? error.message
              : t('hiringPacket.importFailed', 'The document could not be imported'),
        );
      } finally {
        setBusyId(null);
      }
    },
    [applyDocxOverride, t],
  );

  const handleRevert = useCallback(
    async (row: PacketRow) => {
      setBusyId(row._id);
      try {
        await revertToTemplate({ packetDocumentId: row._id });
        toast.success(t('hiringPacket.reverted', 'Reverted to the standard template'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed');
      } finally {
        setBusyId(null);
      }
    },
    [revertToTemplate, t],
  );

  const handleToggleSkip = useCallback(
    async (row: PacketRow) => {
      setBusyId(row._id);
      try {
        await setSkipped({ packetDocumentId: row._id, skipped: row.status !== 'skipped' });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed');
      } finally {
        setBusyId(null);
      }
    },
    [setSkipped],
  );

  /**
   * Freeze one document and send it to the employee.
   *
   * The registration number is reserved first so the number printed inside the
   * frozen content is the same one the signed original carries.
   */
  const sendOne = useCallback(
    async (row: PacketRow) => {
      const template = getCatalogTemplate(row.templateId);
      if (!template || !source)
        throw new Error(t('hiringPacket.buildFailed', 'Could not build this document'));

      const { documentNumber } = await ensureDocumentNumber({ packetDocumentId: row._id });

      const doc = buildDoc({ ...row, documentNumber });
      if (!doc || !Array.isArray(doc.body)) {
        throw new Error(t('hiringPacket.buildFailed', 'Could not build this document'));
      }

      const content = encodeHiringPacketContent({
        version: 1,
        templateId: row.templateId,
        title: doc.title,
        blocks: doc.body,
        accent: template.accent,
        orgName,
        documentNumber,
        primaryLocale: PRIMARY_LOCALE,
        secondaryLocale: row.secondaryLocale,
        labels,
        edited: Boolean(row.bodyOverride),
      });

      await sendForSignature({
        packetDocumentId: row._id,
        title: doc.title,
        content,
        accent: template.accent,
        orgName,
        countersignerId: currentUser?.id ? (currentUser.id as Id<'users'>) : undefined,
      });
    },
    [buildDoc, currentUser?.id, ensureDocumentNumber, labels, orgName, sendForSignature, source, t],
  );

  const handleSend = useCallback(
    async (row: PacketRow) => {
      setBusyId(row._id);
      try {
        await sendOne(row);
        toast.success(t('docLibrary.sentForSignature', 'Sent for signature'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed');
      } finally {
        setBusyId(null);
      }
    },
    [sendOne, t],
  );

  const pending = useMemo(
    () => (rows ?? []).filter((row) => row.status === 'draft' || row.status === 'edited'),
    [rows],
  );

  const handleSendAll = useCallback(async () => {
    setSendingAll(true);
    let sent = 0;
    const failures: string[] = [];
    // Sequential on purpose: each send allocates a registration number, and
    // sequential sends keep the numbers in packet order.
    for (const row of pending) {
      try {
        await sendOne(row);
        sent++;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : row.templateId);
      }
    }
    setSendingAll(false);

    if (sent > 0) {
      toast.success(
        t('hiringPacket.sentCount', {
          count: sent,
          defaultValue: `${sent} documents sent for signature`,
        }),
      );
    }
    if (failures.length > 0) {
      toast.error(
        t('hiringPacket.sendPartialFailure', {
          count: failures.length,
          defaultValue: `${failures.length} documents could not be sent`,
        }),
      );
    }
  }, [pending, sendOne, t]);

  if (rows === undefined || mergeData === undefined) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-(--text-muted)" />
        </CardContent>
      </Card>
    );
  }

  // Empty packet: offer to create one. Employees hired before this feature
  // existed (or created through the SharePoint / recruitment paths, which do not
  // generate a packet) would otherwise have no way to get their documents.
  if (rows.length === 0) {
    if (!canManage) return null;
    return (
      <Card>
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-(--text-primary)">
                {t('hiringPacket.title', 'Hiring document packet')}
              </h3>
              <p className="text-sm text-(--text-muted)">
                {t(
                  'hiringPacket.emptyHint',
                  'No documents have been prepared for this employee yet.',
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <Select
              value={pendingLocale}
              onValueChange={(value) => setPendingLocale(value as SupportedLocale)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECONDARY_LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {LOCALE_CAPTIONS[PRIMARY_LOCALE]} + {LOCALE_CAPTIONS[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              {t('hiringPacket.generate', 'Prepare documents')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const active = rows.filter((row) => row.status !== 'skipped');
  const signedCount = active.filter((row) => row.status === 'signed').length;
  const mandatoryOutstanding = active.filter(
    (row) => row.mandatory && row.status !== 'signed',
  ).length;
  // Documents whose language can still be switched (a sent one is frozen).
  const editableCount = rows.filter(
    (row) => row.status !== 'sent' && row.status !== 'signed',
  ).length;
  const currentLocale = rows[0]?.secondaryLocale ?? 'ru';

  const statusBadge = (row: PacketRow) => {
    switch (row.status) {
      case 'signed':
        return (
          <Badge className="bg-(--success-quiet) text-(--success-text) border-(--success-outline)">
            {t('hiringPacket.statusSigned', 'Signed')}
          </Badge>
        );
      case 'sent':
        return (
          <Badge className="bg-(--brand-quiet) text-(--brand-text) border-(--brand-outline)">
            {t('hiringPacket.statusSent', 'Awaiting signature')}
          </Badge>
        );
      case 'edited':
        return (
          <Badge className="bg-(--warning-quiet) text-(--warning-text) border-(--warning-outline)">
            {t('hiringPacket.statusEdited', 'Edited in Word')}
          </Badge>
        );
      case 'skipped':
        return (
          <Badge variant="outline" className="text-(--text-muted)">
            {t('hiringPacket.statusSkipped', 'Excluded')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{t('hiringPacket.statusDraft', 'Ready to send')}</Badge>;
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        {/* Header + progress */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-(--text-primary)">
                {t('hiringPacket.title', 'Hiring document packet')}
              </h3>
              <p className="text-sm text-(--text-muted)">
                {t('hiringPacket.progress', {
                  signed: signedCount,
                  total: active.length,
                  defaultValue: `${signedCount} of ${active.length} signed`,
                })}
                {mandatoryOutstanding > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-(--warning-text)">
                    <AlertTriangle className="w-3 h-3" />
                    {t('hiringPacket.mandatoryOutstanding', {
                      count: mandatoryOutstanding,
                      defaultValue: `${mandatoryOutstanding} required outstanding`,
                    })}
                  </span>
                )}
              </p>
            </div>
          </div>

          {canManage && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              {editableCount > 0 && (
                <Select
                  value={currentLocale}
                  onValueChange={(value) => void handleChangeLocale(value as SupportedLocale)}
                  disabled={generating}
                >
                  <SelectTrigger className="w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECONDARY_LOCALES.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {LOCALE_CAPTIONS[PRIMARY_LOCALE]} + {LOCALE_CAPTIONS[locale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {pending.length > 0 && (
                <Button onClick={handleSendAll} disabled={sendingAll}>
                  {sendingAll ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {t('hiringPacket.sendAll', {
                    count: pending.length,
                    defaultValue: `Send ${pending.length} for signature`,
                  })}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Documents */}
        <ul className="space-y-2">
          {rows.map((row) => {
            const template = getCatalogTemplate(row.templateId);
            const title = template
              ? localizedContent(template, row.secondaryLocale).title
              : row.templateId;
            const busy = busyId === row._id;
            const frozen = row.status === 'sent' || row.status === 'signed';

            return (
              <li
                key={row._id}
                className={`rounded-xl border border-(--border) p-3 ${
                  row.status === 'skipped' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-(--text-primary) truncate">
                        {title}
                      </span>
                      {row.mandatory && (
                        <span className="text-[10px] font-medium text-(--warning-text)">
                          {t('hiringPacket.mandatory', 'required')}
                        </span>
                      )}
                      {statusBadge(row)}
                    </div>
                    <p className="text-xs text-(--text-muted) mt-0.5">
                      {LOCALE_CAPTIONS[PRIMARY_LOCALE]} + {LOCALE_CAPTIONS[row.secondaryLocale]}
                      {row.documentNumber && <> · {row.documentNumber}</>}
                      {row.sourceDocxName && <> · {row.sourceDocxName}</>}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewRow(row)}
                      title={t('hiringPacket.preview', 'Preview')}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleDownloadPdf(row)}
                      title={t('hiringPacket.downloadPdf', 'Download PDF')}
                    >
                      {busy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </Button>

                    {row.status === 'signed' ? (
                      <>
                        {row.signedPdfUrl && (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={row.signedPdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t('hiringPacket.signedPdf', 'Signed PDF')}
                            >
                              <Check className="w-4 h-4 text-(--success-text)" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleDownloadSignedDocx(row)}
                          title={t('hiringPacket.downloadSignedDocx', 'Download signed Word')}
                        >
                          <FileType className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      canManage &&
                      !frozen && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleDownloadEditableDocx(row)}
                            title={t('hiringPacket.editInWord', 'Download for editing in Word')}
                          >
                            <FileType className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => openUploadDialog(row)}
                            title={t('hiringPacket.uploadEdited', 'Upload the edited Word file')}
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                          {row.bodyOverride && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void handleRevert(row)}
                              title={t('hiringPacket.revert', 'Revert to the standard template')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          )}
                          {!row.mandatory && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void handleToggleSkip(row)}
                              title={
                                row.status === 'skipped'
                                  ? t('hiringPacket.include', 'Include in the packet')
                                  : t('hiringPacket.exclude', 'Exclude from the packet')
                              }
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                          {row.status !== 'skipped' && (
                            <Button size="sm" disabled={busy} onClick={() => void handleSend(row)}>
                              <Send className="w-4 h-4 mr-1" />
                              {t('hiringPacket.send', 'Send')}
                            </Button>
                          )}
                        </>
                      )
                    )}
                  </div>
                </div>

                {/* Signature progress for a sent document */}
                {row.signers.length > 0 && row.status !== 'signed' && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-(--text-muted)">
                    {row.signers.map((signer) => (
                      <span key={signer.requestId} className="inline-flex items-center gap-1">
                        {signer.status === 'signed' ? (
                          <Check className="w-3 h-3 text-(--success-text)" />
                        ) : signer.status === 'declined' ? (
                          <XCircle className="w-3 h-3 text-(--danger-text)" />
                        ) : (
                          <Loader2 className="w-3 h-3" />
                        )}
                        {signer.signerName}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Hidden input backing "upload the edited Word file" */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => void handleFileSelected(e)}
        />

        {/* Preview panel — a document deserves a full-height reading pane */}
        <Sheet open={previewRow !== null} onOpenChange={(open) => !open && setPreviewRow(null)}>
          <SheetContent
            side="right"
            size="xl"
            closeLabel={t('common.close', 'Close')}
            className="overflow-y-auto"
          >
            {previewRow &&
              (() => {
                const doc = buildDoc(previewRow);
                if (!doc) {
                  return (
                    <>
                      <SheetTitle>
                        {t('hiringPacket.buildFailed', 'Could not build this document')}
                      </SheetTitle>
                      <SheetDescription>
                        {t(
                          'hiringPacket.buildFailedHint',
                          'The stored content is unreadable. Revert to the standard template.',
                        )}
                      </SheetDescription>
                    </>
                  );
                }
                return (
                  <>
                    <SheetTitle className="pr-8">{doc.title}</SheetTitle>
                    <SheetDescription>
                      {orgName}
                      {doc.documentNumber && <> · {doc.documentNumber}</>}
                    </SheetDescription>
                    <div className="mt-4">
                      <DocumentPreview doc={doc} />
                    </div>
                  </>
                );
              })()}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}
