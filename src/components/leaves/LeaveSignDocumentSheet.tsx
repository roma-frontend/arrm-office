'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { DocumentPreview } from '@/components/documents/DocumentBlocksPreview';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  PenTool,
  FileText,
  CheckCircle,
  XCircle,
  ChevronLeft,
  Eye,
  Download,
  Send,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { parseDocumentContent } from '@/lib/bilingualDocument';
import {
  SignaturePad,
  SignatureUpload,
  localizedDocTitle,
  buildActBody,
  documentDisplayBody,
  toRenderableDocument,
} from '@/components/ESignaturesClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { exportDocumentToPDF } from '@/lib/exportDocument';
import { getLocaleString } from '@/lib/date-format';

interface LeaveSignDocumentSheetProps {
  open: boolean;
  onClose: () => void;
  documentId: Id<'signatureDocuments'> | null;
  userId: Id<'users'> | null;
}

/**
 * Sheet for viewing and signing a leave-related signature document.
 * Matches the UX of DocumentDetailDialog in ESignaturesClient.
 */
export function LeaveSignDocumentSheet({
  open,
  onClose,
  documentId,
  userId,
}: LeaveSignDocumentSheetProps) {
  const { t, i18n } = useTranslation();
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const doc = useQuery(api.signatures.getDocument, documentId ? { documentId } : 'skip');
  const auditLog = useQuery(api.signatures.getAuditLog, documentId ? { documentId } : 'skip');
  const signMutation = useMutation(api.signatures.signDocument);
  const declineMutation = useMutation(api.signatures.declineDocument);
  const reminderMutation = useMutation(api.signatures.sendReminder);

  if (!open || !documentId) return null;

  // Parse the document content — handles __DOC__ prefix, legacy __HP__, and raw JSON
  const parsedContent = doc?.content ? parseDocumentContent(doc.content) : null;
  const act = doc ? buildActBody(doc, t, i18n.language) : null;
  const displayBody = documentDisplayBody(doc, act);
  const displayTitle = doc ? localizedDocTitle(doc, t) : '';

  // Find the current user's pending request
  const myRequest = doc?.requests?.find((r) => r.signerId === userId && r.status === 'pending');

  const myOrder = myRequest?.order;
  const waitingFor =
    myOrder == null
      ? []
      : (doc?.requests ?? [])
          .filter((r) => r.order < myOrder && r.status === 'pending')
          .sort((a, b) => a.order - b.order)
          .map((r) => r.signerName);
  const isMyTurn = waitingFor.length === 0;
  const isSigned = doc?.status === 'completed';
  const canSign = !!myRequest && !isSigned;

  const handleSign = async () => {
    if (!myRequest || !signatureData) return;
    if (!isMyTurn) {
      toast.error(
        t('signatures.waitingForSigners', {
          names: waitingFor.join(', '),
          defaultValue: 'Waiting for {{names}}',
        }),
      );
      return;
    }
    setIsSigning(true);
    try {
      await signMutation({
        requestId: myRequest._id,
        signatureData,
        userId: userId!,
      });
      toast.success(t('signatures.signed', 'Document signed successfully!'));
      setSignatureData(null);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(msg || t('signatures.errors.signFailed', 'Failed to sign document'));
    } finally {
      setIsSigning(false);
    }
  };

  const handleDecline = async () => {
    if (!myRequest) return;
    try {
      await declineMutation({
        requestId: myRequest._id,
        reason: declineReason || undefined,
        userId: userId!,
      });
      toast.success(t('signatures.declined', 'Document declined'));
      onClose();
    } catch {
      toast.error(t('signatures.errors.declineFailed', 'Failed to decline'));
    }
  };

  const handleReminder = async (requestId: Id<'signatureRequests'>) => {
    try {
      await reminderMutation({ requestId, userId: userId! });
      toast.success(t('signatures.reminderSent', 'Reminder sent'));
    } catch {
      toast.error(t('signatures.errors.reminderFailed', 'Failed to send reminder'));
    }
  };

  const handleExportPDF = async () => {
    if (!doc) return;
    try {
      const renderable = toRenderableDocument(
        {
          ...doc,
          requests: doc.requests?.map((r) => ({
            _id: r._id,
            status: r.status,
            signatureData: r.signatureData,
            order: r.order,
            signerName: r.signerName,
            signedAt: r.signedAt,
          })),
        } as any,
        {
          signature: t('docLibrary.signature', 'Signature'),
          name: t('docLibrary.nameLabel', 'Name'),
          position: t('docLibrary.positionLabel', 'Position'),
          date: t('docLibrary.dateLabel', 'Date'),
          generatedOn: t('docLibrary.generatedOn', 'Generated on'),
          integrity: t('docLibrary.integrity', 'Integrity'),
        },
        t,
        i18n.language,
      );
      const fileName = `${doc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_signed.pdf`;
      await exportDocumentToPDF(renderable, fileName);
      toast.success(t('signatures.pdfExported', 'PDF exported successfully'));
    } catch {
      toast.error(t('signatures.errors.exportFailed', 'Failed to export PDF'));
    }
  };

  const statusColor: Record<string, string> = {
    pending: 'bg-(--warning-quiet) text-(--warning-text)',
    signed: 'bg-(--success-quiet) text-(--success-text)',
    completed: 'bg-(--success-quiet) text-(--success-text)',
    partially_signed: 'bg-blue-50 text-blue-700',
    declined: 'bg-(--danger-quiet) text-(--danger-text)',
    expired: 'bg-(--surface-3) text-(--text-2)',
  };

  const requestStatusColor: Record<string, string> = {
    pending: 'bg-(--warning-quiet) text-(--warning-text)',
    signed: 'bg-(--success-quiet) text-(--success-text)',
    declined: 'bg-(--danger-quiet) text-(--danger-text)',
  };

  const actionIcons: Record<string, LucideIcon> = {
    created: FileText,
    sent: Send,
    viewed: Eye,
    signed: CheckCircle,
    declined: XCircle,
    cancelled: XCircle,
    reminder_sent: RefreshCw,
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="xl" closeLabel={t('common.close', 'Close')} className="p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-(--border)">
          <SheetTitle>{displayTitle || '...'}</SheetTitle>
          <SheetDescription className="sr-only">Document details</SheetDescription>
        </SheetHeader>

        <SheetBody className="px-8 py-8 space-y-6">
          {doc === undefined && <ShieldLoader />}
          {doc === null && documentId && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('signatures.notFound', 'Document not found')}
            </p>
          )}
          {doc && (
            <>
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t(`signatures.status.${doc.status}`, doc.status)}</Badge>
                {doc.expiresAt && (
                  <span className="text-xs text-muted-foreground">
                    {t('signatures.expiresOn', 'Expires')}:{' '}
                    {new Date(doc.expiresAt).toLocaleDateString(getLocaleString(i18n.language))}
                  </span>
                )}
              </div>

              {/* Content Preview — themed document like employee profile */}
              <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-(--border) bg-white p-8 shadow-sm dark:bg-(--surface-3)">
                {parsedContent ? (
                  <DocumentPreview
                    doc={toRenderableDocument(
                      {
                        ...doc,
                        requests: doc.requests?.map((r) => ({
                          _id: r._id,
                          status: r.status,
                          signatureData: r.signatureData,
                          order: r.order,
                          signerName: r.signerName,
                          signedAt: r.signedAt,
                        })),
                      } as any,
                      {
                        signature: t('docLibrary.signature', 'Signature'),
                        name: t('docLibrary.nameLabel', 'Name'),
                        position: t('docLibrary.positionLabel', 'Position'),
                        date: t('docLibrary.dateLabel', 'Date'),
                        generatedOn: t('docLibrary.generatedOn', 'Generated on'),
                        integrity: t('docLibrary.integrity', 'Integrity'),
                      },
                      t,
                      i18n.language,
                    )}
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-sm text-(--text-muted)">
                    {displayBody || doc.content}
                  </div>
                )}
              </div>

              {/* Signers */}
              <div>
                <h4 className="text-sm font-semibold mb-2">{t('signatures.signers', 'Signers')}</h4>
                <div className="space-y-2">
                  {doc.requests?.map((req) => (
                    <div
                      key={req._id}
                      className="flex items-center justify-between p-2 rounded border"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          #{req.order}
                        </Badge>
                        <span className="text-sm">{req.signerName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${requestStatusColor[req.status] || ''}`}>
                          {String(t(`signatures.requestStatus.${req.status}`, req.status))}
                        </Badge>
                        {req.status === 'pending' && doc.createdBy === userId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            onClick={() => handleReminder(req._id)}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Log */}
              {auditLog && auditLog.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    {t('signatures.auditLog', 'Activity Log')}
                  </h4>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {auditLog.map((entry) => {
                      const Icon = actionIcons[entry.action] || FileText;
                      return (
                        <div
                          key={entry._id}
                          className="flex items-center gap-2 text-xs text-muted-foreground py-1"
                        >
                          <Icon className="w-3 h-3 shrink-0" />
                          <span>
                            {String(t(`signatures.actions.${entry.action}`, entry.action))}
                          </span>
                          <span className="ml-auto">
                            {new Date(entry.timestamp).toLocaleString(
                              getLocaleString(i18n.language),
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Signing Section — shown only when this user can sign */}
              {canSign && !declineMode && (
                <div className="border-t pt-4">
                  <Label className="mb-2 block">
                    {t('signatures.pad.provideSignature', 'Draw or upload your signature')}
                  </Label>
                  {!isMyTurn && waitingFor.length > 0 ? (
                    <p className="text-sm text-(--warning-text) py-3 text-center">
                      {t('signatures.waitingForSigners', {
                        names: waitingFor.join(', '),
                        defaultValue: 'Waiting for {{names}} to sign first',
                      })}
                    </p>
                  ) : signatureData ? (
                    <div className="space-y-2">
                      <div className="border rounded-lg p-3 bg-white flex justify-center">
                        <img src={signatureData} alt="Signature" className="max-h-[80px]" />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setSignatureData(null)}>
                        {t('signatures.pad.redraw', 'Redraw')}
                      </Button>
                    </div>
                  ) : (
                    <Tabs defaultValue="draw" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-3">
                        <TabsTrigger value="draw" className="flex items-center gap-1.5">
                          <PenTool className="w-3.5 h-3.5" />
                          {t('signatures.pad.tabDraw', 'Draw')}
                        </TabsTrigger>
                        <TabsTrigger value="upload" className="flex items-center gap-1.5">
                          {t('signatures.pad.tabUpload', 'Upload')}
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="draw" className="mt-0">
                        <SignaturePad onSave={setSignatureData} />
                      </TabsContent>
                      <TabsContent value="upload" className="mt-0">
                        <SignatureUpload onSave={setSignatureData} />
                      </TabsContent>
                    </Tabs>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {t(
                      'signatures.consent',
                      'By signing, you agree to be legally bound by this document.',
                    )}
                  </p>
                </div>
              )}

              {/* Decline reason */}
              {declineMode && (
                <div className="border-t pt-4">
                  <Label>
                    {t('signatures.fields.declineReason', 'Reason for declining (optional)')}
                  </Label>
                  <Textarea
                    className="mt-1"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                  />
                </div>
              )}

              {/* Already signed */}
              {isSigned && (
                <div className="text-center py-4">
                  <CheckCircle className="w-10 h-10 mx-auto text-(--success-text) mb-2" />
                  <p className="text-sm font-medium">
                    {t('signatures.alreadySigned', 'This document has been fully signed')}
                  </p>
                </div>
              )}
            </>
          )}
        </SheetBody>

        <SheetFooter className="justify-between px-6 py-4 border-t border-(--border)">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('common.close', 'Close')}
            </Button>
            {doc && doc.status === 'completed' && (
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-1" />
                {t('signatures.exportPdf', 'Export PDF')}
              </Button>
            )}
            {doc && doc.signedPdfUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={doc.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-1" />
                  {t('signatures.archivedPdf', 'Archived PDF')}
                </a>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {canSign && !declineMode && (
              <>
                <Button variant="outline" size="sm" onClick={() => setDeclineMode(true)}>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('signatures.decline', 'Decline')}
                </Button>
                <Button
                  size="sm"
                  disabled={!signatureData || !isMyTurn || isSigning}
                  onClick={handleSign}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {isSigning
                    ? t('signatures.signing', 'Signing…')
                    : t('signatures.sign', 'Sign Document')}
                </Button>
              </>
            )}
            {declineMode && (
              <>
                <Button variant="outline" size="sm" onClick={() => setDeclineMode(false)}>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  {t('common.back', 'Back')}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDecline}>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('signatures.confirmDecline', 'Confirm Decline')}
                </Button>
              </>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
