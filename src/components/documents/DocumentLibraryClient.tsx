'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, FileType, Send, Library, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  CATALOG,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  ACCENT_HEX,
  getCatalogTemplate,
  localizedContent,
  type DocumentCategory,
} from '@/lib/documentCatalog';
import { resolveTokens, type MergeSourceData } from '@/lib/documentTokens';
import {
  exportDocumentToPDF,
  exportDocumentToDOCX,
  type RenderableDocument,
  type DocumentLabels,
} from '@/lib/exportDocument';
import type { SupportedLocale } from '@/lib/date-format';

/** Localized static labels for the export footer / signature block. */
function useDocumentLabels(): DocumentLabels {
  const { t } = useTranslation();
  return {
    signature: t('docLibrary.signature', 'Signature'),
    name: t('docLibrary.nameLabel', 'Name'),
    position: t('docLibrary.positionLabel', 'Position'),
    date: t('docLibrary.dateLabel', 'Date'),
    generatedOn: t('docLibrary.generatedOn', 'Generated on'),
    integrity: t('docLibrary.integrity', 'Integrity'),
  };
}

export default function DocumentLibraryClient() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const labels = useDocumentLabels();

  const lang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'en';
  const effectiveOrgId = (selectedOrgId ?? user?.organizationId) as Id<'organizations'> | undefined;
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(CATALOG[0]?.id ?? '');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<Id<'users'> | ''>('');
  const [exporting, setExporting] = useState(false);

  // Employees for the selector (reuses the same query the signature wizard uses).
  const employees = useQuery(
    api.users.getUsersByOrganizationId,
    effectiveOrgId ? { organizationId: effectiveOrgId } : 'skip',
  );

  // Merge-source data for the chosen employee.
  const mergeData = useQuery(
    api.documentLibrary.getEmployeeMergeData,
    selectedEmployeeId ? { userId: selectedEmployeeId } : 'skip',
  );

  const createDocument = useMutation(api.signatures.createDocument);

  const template = getCatalogTemplate(selectedTemplateId);

  const employeeList = useMemo(() => {
    if (!employees) return [];
    return (employees as { _id: Id<'users'>; name: string; role: string }[]).filter(
      (e) => e.role !== 'superadmin',
    );
  }, [employees]);

  // Build the fully-resolved source object the resolver expects.
  const source: MergeSourceData | null = useMemo(() => {
    if (!mergeData) return null;
    return {
      employee: mergeData.employee,
      organization: mergeData.organization,
      signatory: { name: user?.name ?? null, position: user?.position ?? null },
      now: Date.now(),
    };
  }, [mergeData, user?.name, user?.position]);

  const localized = template ? localizedContent(template, lang) : null;

  // Resolved title + body for the live preview / export.
  const resolved = useMemo(() => {
    if (!template || !localized) return null;
    if (!source) {
      // No employee chosen yet — show the raw template with placeholders intact.
      return { title: localized.title, body: localized.body };
    }
    return {
      title: resolveTokens(localized.title, source, lang),
      body: resolveTokens(localized.body, source, lang),
    };
  }, [template, localized, source, lang]);

  function buildRenderable(): RenderableDocument | null {
    if (!template || !resolved) return null;
    return {
      title: resolved.title,
      body: resolved.body,
      accent: template.accent,
      signature: template.signature,
      orgName: mergeData?.organization.name ?? user?.organizationName ?? '',
      now: Date.now(),
      labels,
    };
  }

  async function handleExportPDF() {
    const doc = buildRenderable();
    if (!doc) return;
    setExporting(true);
    try {
      await exportDocumentToPDF(doc, `${template!.id}.pdf`);
      toast.success(t('docLibrary.pdfDownloaded', 'PDF downloaded'));
    } catch {
      toast.error(t('docLibrary.exportError', 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportDOCX() {
    const doc = buildRenderable();
    if (!doc) return;
    setExporting(true);
    try {
      await exportDocumentToDOCX(doc, `${template!.id}.docx`);
      toast.success(t('docLibrary.docxDownloaded', 'DOCX downloaded'));
    } catch {
      toast.error(t('docLibrary.exportError', 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  async function handleSendForSignature() {
    if (!template || !resolved || !effectiveOrgId || !user?.id) return;
    if (!selectedEmployeeId || !mergeData) {
      toast.error(t('docLibrary.selectEmployeeFirst', 'Select an employee first'));
      return;
    }
    setExporting(true);
    try {
      await createDocument({
        organizationId: effectiveOrgId,
        title: resolved.title,
        content: resolved.body,
        // Capture the theme so the signed/archived PDF is rendered with the
        // same look as this document, not a generic audit report.
        accent: template.accent,
        orgName: mergeData.organization.name ?? user?.organizationName ?? '',
        signatureBlock: template.signature,
        // The document is pre-filled from employee data, so it needs only a
        // single signature field for the employee to sign.
        fieldDefinitions: [
          {
            id: 'signature',
            label: labels.signature,
            type: 'signature',
            required: true,
          },
        ],
        signers: [
          {
            userId: selectedEmployeeId,
            name: mergeData.employee.name ?? '',
            email: mergeData.employee.email ?? '',
            order: 1,
          },
        ],
        createdBy: user.id as Id<'users'>,
      });
      toast.success(t('docLibrary.sentForSignature', 'Sent for signature'));
    } catch {
      toast.error(t('docLibrary.sendError', 'Failed to send for signature'));
    } finally {
      setExporting(false);
    }
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t('docLibrary.adminOnly', 'This section is available to administrators only.')}
        </CardContent>
      </Card>
    );
  }

  const accentHex = template ? ACCENT_HEX[template.accent] : '#1d4ed8';

  return (
    <div className="mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary) flex items-center gap-2">
          <Library className="h-6 w-6" />
          {t('docLibrary.title', 'Document Library')}
        </h2>
        <p className="text-(--text-muted) text-sm mt-1">
          {t(
            'docLibrary.subtitle',
            'Pick a template, choose an employee, and the document fills itself in — export or send for signature.',
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Catalog (left) */}
        <div className="space-y-6">
          {CATEGORY_ORDER.map((category: DocumentCategory) => {
            const items = CATALOG.filter((c) => c.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {CATEGORY_LABELS[category][lang] ?? CATEGORY_LABELS[category].en}
                </h3>
                <div className="space-y-1.5">
                  {items.map((item) => {
                    const active = item.id === selectedTemplateId;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedTemplateId(item.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center gap-2 transition-colors ${
                          active
                            ? 'border-primary bg-primary/5 font-medium'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: ACCENT_HEX[item.accent] }}
                        />
                        <span className="truncate">{localizedContent(item, lang).title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Preview + actions (right) */}
        <div className="space-y-4">
          {/* Employee selector + actions */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex-1 min-w-0">
              <Select
                value={selectedEmployeeId || undefined}
                onValueChange={(v) => setSelectedEmployeeId(v as Id<'users'>)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('docLibrary.selectEmployee', 'Select an employee…')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {employeeList.map((emp) => (
                    <SelectItem key={emp._id} value={emp._id}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExportPDF} disabled={exporting || !resolved}>
                <FileText className="h-4 w-4 mr-1.5" />
                PDF
              </Button>
              <Button
                variant="outline"
                onClick={handleExportDOCX}
                disabled={exporting || !resolved}
              >
                <FileType className="h-4 w-4 mr-1.5" />
                DOCX
              </Button>
              <Button onClick={handleSendForSignature} disabled={exporting || !selectedEmployeeId}>
                <Send className="h-4 w-4 mr-1.5" />
                {t('docLibrary.sendForSignature', 'Send for signature')}
              </Button>
            </div>
          </div>

          {!selectedEmployeeId && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserIcon className="h-4 w-4" />
              {t(
                'docLibrary.noEmployeeHint',
                'No employee selected — placeholders are shown until you pick one.',
              )}
            </div>
          )}

          {/* Live preview — styled like a printed page */}
          {resolved ? (
            <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
              <div className="px-8 pt-8">
                <div className="text-lg font-bold" style={{ color: accentHex }}>
                  {mergeData?.organization.name ?? user?.organizationName ?? ''}
                </div>
                <div className="mt-1 h-0.5 rounded" style={{ backgroundColor: accentHex }} />
              </div>
              <div className="px-8 py-6">
                <h1 className="text-2xl font-bold mb-4" style={{ color: accentHex }}>
                  {resolved.title}
                </h1>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {resolved.body}
                </div>
                {template?.signature && (
                  <div className="mt-10 grid grid-cols-2 gap-8">
                    <div>
                      <div className="border-b border-gray-400 h-8" />
                      <div className="text-xs text-gray-500 mt-1">
                        {labels.name} / {labels.position}
                      </div>
                    </div>
                    <div>
                      <div className="border-b border-gray-400 h-8" />
                      <div className="text-xs text-gray-500 mt-1">{labels.date}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t('docLibrary.selectTemplate', 'Select a template to preview it.')}
              </CardContent>
            </Card>
          )}

          {/* Loading indicator while employee data resolves */}
          {selectedEmployeeId && mergeData === undefined && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldLoader message={t('docLibrary.loadingData', 'Loading employee data…')} />
            </div>
          )}

          {template && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {CATEGORY_LABELS[template.category][lang] ?? CATEGORY_LABELS[template.category].en}
              </Badge>
              {template.signature && (
                <Badge variant="outline" className="text-xs">
                  {t('docLibrary.includesSignature', 'Signature block')}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
