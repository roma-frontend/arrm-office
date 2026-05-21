'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PenTool,
  FileText,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { exportSignatureToPDF } from '@/lib/exportSignatureToPDF';

// ============ SIGNATURE PAD COMPONENT ============

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  width?: number;
  height?: number;
}

function SignaturePad({ onSave, width = 400, height = 200 }: SignaturePadProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  const getCtx = () => canvasRef.current?.getContext('2d');

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return { x: 0, y: 0 };
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasContent(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
  };

  const save = () => {
    if (!canvasRef.current || !hasContent) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full cursor-crosshair touch-none"
          style={{ height: `${height / 2}px` }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={clear} disabled={!hasContent}>
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          {t('signatures.pad.clear', 'Clear')}
        </Button>
        <Button size="sm" onClick={save} disabled={!hasContent}>
          <CheckCircle className="w-3.5 h-3.5 mr-1" />
          {t('signatures.pad.apply', 'Apply Signature')}
        </Button>
      </div>
    </div>
  );
}

// ============ CREATE DOCUMENT WIZARD ============

interface CreateDocumentWizardProps {
  open: boolean;
  onClose: () => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
}

function CreateDocumentWizard({
  open,
  onClose,
  organizationId,
  userId,
}: CreateDocumentWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  // Step 1: Document Info
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const [, setCategory] = useState<string>('custom');

  // Step 2: Signers
  const [selectedSigners, setSelectedSigners] = useState<
    { userId: Id<'users'>; name: string; email: string; order: number }[]
  >([]);

  // Step 3: Settings
  const [expiresAt, setExpiresAt] = useState('');

  const templates = useQuery(api.signatures.listTemplates, { organizationId });
  const employees = useQuery(
    api.users.getUsersByOrganizationId as never,
    organizationId ? ({ organizationId, requesterId: userId } as never) : 'skip',
  );
  const createDocument = useMutation(api.signatures.createDocument);

  const steps = [
    t('signatures.wizard.documentInfo', 'Document Info'),
    t('signatures.wizard.signers', 'Signers'),
    t('signatures.wizard.review', 'Review & Send'),
  ];

  const progress = ((step + 1) / steps.length) * 100;

  const handleTemplateSelect = (tid: string) => {
    setTemplateId(tid);
    if (tid && templates) {
      const tpl = templates.find((tt) => tt._id === tid);
      if (tpl) {
        setTitle(tpl.title);
        setContent(tpl.content);
        setCategory(tpl.category);
      }
    }
  };

  const toggleSigner = (user: { _id: Id<'users'>; name: string; email: string }) => {
    setSelectedSigners((prev) => {
      const exists = prev.find((s) => s.userId === user._id);
      if (exists) {
        const filtered = prev.filter((s) => s.userId !== user._id);
        return filtered.map((s, i) => ({ ...s, order: i + 1 }));
      }
      return [
        ...prev,
        { userId: user._id, name: user.name, email: user.email, order: prev.length + 1 },
      ];
    });
  };

  const canNext = () => {
    if (step === 0) return title.trim().length > 0 && content.trim().length > 0;
    if (step === 1) return selectedSigners.length > 0;
    return true;
  };

  const handleSubmit = async () => {
    try {
      await createDocument({
        organizationId,
        templateId: templateId ? (templateId as Id<'documentTemplates'>) : undefined,
        title,
        content,
        fieldDefinitions: [
          { id: 'signature', label: 'Signature', type: 'signature' as const, required: true },
        ],
        fieldValues: [],
        signers: selectedSigners,
        expiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
        createdBy: userId,
      });
      toast.success(t('signatures.created', 'Document sent for signing!'));
      onClose();
      resetForm();
    } catch (e: unknown) {
      toast.error(t('signatures.errors.createFailed', 'Failed to create document'));
    }
  };

  const resetForm = () => {
    setStep(0);
    setTitle('');
    setContent('');
    setTemplateId('');
    setCategory('custom');
    setSelectedSigners([]);
    setExpiresAt('');
  };

  const employeeList = useMemo(() => {
    if (!employees) return [];
    return (employees as { _id: Id<'users'>; name: string; email: string; role: string }[]).filter(
      (e) => e.role !== 'superadmin' && e._id !== (userId as string),
    );
  }, [employees, userId]);

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        onClose();
        resetForm();
      }}
    >
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Progress Bar */}
        <div className="relative h-1.5 bg-muted overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          />
        </div>

        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold">
            {t('signatures.createDocument', 'Create Document for Signing')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('signatures.createDocument', 'Create Document for Signing')}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicators */}
        <div className="flex items-center justify-center gap-2 px-5 py-3">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <motion.div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 text-xs font-semibold ${
                  i < step
                    ? 'bg-primary border-primary text-white'
                    : i === step
                      ? 'border-primary text-primary'
                      : 'border-muted-foreground/30 text-muted-foreground'
                }`}
                animate={{ scale: i === step ? 1.1 : 1 }}
              >
                {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
              </motion.div>
              <span
                className={`text-xs hidden sm:inline ${i === step ? 'text-primary font-medium' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
              {i < steps.length - 1 && <div className="w-6 h-0.5 bg-muted-foreground/20" />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {step === 0 && (
                <div className="space-y-4">
                  {templates && templates.length > 0 && (
                    <div>
                      <Label>{t('signatures.fields.template', 'Template (optional)')}</Label>
                      <Select value={templateId} onValueChange={handleTemplateSelect}>
                        <SelectTrigger className="mt-1">
                          <SelectValue
                            placeholder={t(
                              'signatures.fields.selectTemplate',
                              'Select a template...',
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((tpl) => (
                            <SelectItem key={tpl._id} value={tpl._id}>
                              {tpl.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>{t('signatures.fields.title', 'Document Title')}</Label>
                    <Input
                      className="mt-1"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t(
                        'signatures.fields.titlePlaceholder',
                        'e.g., Employment Contract — John Doe',
                      )}
                    />
                  </div>
                  <div>
                    <Label>{t('signatures.fields.content', 'Document Content')}</Label>
                    <Textarea
                      className="mt-1 min-h-[150px]"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={t(
                        'signatures.fields.contentPlaceholder',
                        'Enter document text...',
                      )}
                    />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'signatures.wizard.selectSigners',
                      'Select employees who need to sign. Order determines signing sequence.',
                    )}
                  </p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {employeeList.map((emp) => {
                      const selected = selectedSigners.find((s) => s.userId === emp._id);
                      return (
                        <div
                          key={emp._id}
                          onClick={() => toggleSigner(emp)}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox checked={!!selected} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{emp.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                          </div>
                          {selected && (
                            <Badge variant="secondary" className="shrink-0">
                              #{selected.order}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                    {employeeList.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t('signatures.noEmployees', 'No employees found')}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>{t('signatures.fields.expiresAt', 'Expiration Date (optional)')}</Label>
                    <Input
                      type="date"
                      className="mt-1"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t('signatures.fields.title', 'Title')}
                        </p>
                        <p className="font-medium">{title}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t('signatures.fields.content', 'Content')}
                        </p>
                        <p className="text-sm whitespace-pre-wrap line-clamp-4">{content}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t('signatures.wizard.signers', 'Signers')}
                        </p>
                        <div className="space-y-1 mt-1">
                          {selectedSigners.map((s) => (
                            <div key={s.userId} className="flex items-center gap-2 text-sm">
                              <Badge variant="outline" className="text-xs">
                                #{s.order}
                              </Badge>
                              <span>{s.name}</span>
                              <span className="text-muted-foreground">({s.email})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {expiresAt && (
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {t('signatures.fields.expiresAt', 'Expires')}
                          </p>
                          <p className="text-sm">{new Date(expiresAt).toLocaleDateString()}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-muted/30 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {step > 0 ? t('common.back', 'Back') : t('common.cancel', 'Cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!canNext()}
            onClick={() => (step < 2 ? setStep(step + 1) : handleSubmit())}
          >
            {step < 2 ? (
              <>
                {t('common.next', 'Next')}
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-1" />
                {t('signatures.send', 'Send for Signing')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ SIGN DOCUMENT DIALOG ============

interface SignDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  request: {
    _id: Id<'signatureRequests'>;
    documentId: Id<'signatureDocuments'>;
    signerName: string;
  } | null;
  userId: Id<'users'>;
}

function SignDocumentDialog({ open, onClose, request, userId }: SignDocumentDialogProps) {
  const { t } = useTranslation();
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const doc = useQuery(
    api.signatures.getDocument,
    request ? { documentId: request.documentId } : 'skip',
  );
  const signMutation = useMutation(api.signatures.signDocument);
  const declineMutation = useMutation(api.signatures.declineDocument);

  const handleSign = async () => {
    if (!request || !signatureData) return;
    try {
      await signMutation({
        requestId: request._id,
        signatureData,
        userId,
      });
      toast.success(t('signatures.signed', 'Document signed successfully!'));
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Previous signers')) {
        toast.error(t('signatures.errors.previousSigners', 'Waiting for previous signers'));
      } else {
        toast.error(t('signatures.errors.signFailed', 'Failed to sign document'));
      }
    }
  };

  const handleDecline = async () => {
    if (!request) return;
    try {
      await declineMutation({
        requestId: request._id,
        reason: declineReason || undefined,
        userId,
      });
      toast.success(t('signatures.declined', 'Document declined'));
      onClose();
    } catch {
      toast.error(t('signatures.errors.declineFailed', 'Failed to decline'));
    }
  };

  if (!open || !request) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[85vh]">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-primary" />
            {declineMode
              ? t('signatures.declineTitle', 'Decline Document')
              : t('signatures.signTitle', 'Sign Document')}
          </DialogTitle>
          <DialogDescription className="sr-only">Sign or decline</DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4 overflow-y-auto max-h-[60vh]">
          {doc && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">{doc.title}</h3>
                <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {doc.content}
                </div>
              </div>

              {!declineMode ? (
                <div>
                  <Label className="mb-2 block">
                    {t('signatures.pad.drawSignature', 'Draw your signature below')}
                  </Label>
                  {signatureData ? (
                    <div className="space-y-2">
                      <div className="border rounded-lg p-3 bg-white">
                        <img src={signatureData} alt="Signature" className="max-h-[80px] mx-auto" />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setSignatureData(null)}>
                        {t('signatures.pad.redraw', 'Redraw')}
                      </Button>
                    </div>
                  ) : (
                    <SignaturePad onSave={setSignatureData} />
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {t(
                      'signatures.consent',
                      'By signing, you agree to be legally bound by this document.',
                    )}
                  </p>
                </div>
              ) : (
                <div>
                  <Label>
                    {t('signatures.fields.declineReason', 'Reason for declining (optional)')}
                  </Label>
                  <Textarea
                    className="mt-1"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder={t(
                      'signatures.fields.declineReasonPlaceholder',
                      'Explain why you are declining...',
                    )}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t bg-muted/30 flex items-center justify-between">
          {!declineMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDeclineMode(true)}>
                <XCircle className="w-4 h-4 mr-1" />
                {t('signatures.decline', 'Decline')}
              </Button>
              <Button size="sm" disabled={!signatureData} onClick={handleSign}>
                <CheckCircle className="w-4 h-4 mr-1" />
                {t('signatures.sign', 'Sign Document')}
              </Button>
            </>
          ) : (
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
      </DialogContent>
    </Dialog>
  );
}

// ============ DOCUMENT DETAIL DIALOG ============

interface DocumentDetailDialogProps {
  open: boolean;
  onClose: () => void;
  documentId: Id<'signatureDocuments'> | null;
  userId: Id<'users'>;
}

function DocumentDetailDialog({ open, onClose, documentId, userId }: DocumentDetailDialogProps) {
  const { t } = useTranslation();
  const doc = useQuery(api.signatures.getDocument, documentId ? { documentId } : 'skip');
  const auditLog = useQuery(api.signatures.getAuditLog, documentId ? { documentId } : 'skip');
  const cancelMutation = useMutation(api.signatures.cancelDocument);
  const reminderMutation = useMutation(api.signatures.sendReminder);

  const handleCancel = async () => {
    if (!documentId) return;
    try {
      await cancelMutation({ documentId, userId });
      toast.success(t('signatures.cancelled', 'Document cancelled'));
      onClose();
    } catch {
      toast.error(t('signatures.errors.cancelFailed', 'Failed to cancel'));
    }
  };

  const handleReminder = async (requestId: Id<'signatureRequests'>) => {
    try {
      await reminderMutation({ requestId, userId });
      toast.success(t('signatures.reminderSent', 'Reminder sent'));
    } catch {
      toast.error(t('signatures.errors.reminderFailed', 'Failed to send reminder'));
    }
  };

  const handleExportPDF = () => {
    if (!doc) return;
    try {
      const signerInfo = (doc.requests || []).map((req) => ({
        order: req.order,
        name: req.signerName,
        email: req.signerEmail || '',
        status: req.status,
        signedAt: req.signedAt,
        signatureData: req.signatureData,
        declineReason: req.declinedReason,
      }));

      const auditEntries = (auditLog || []).map((entry) => ({
        action: entry.action,
        actorName: entry.userId ? 'User' : 'System',
        timestamp: entry.timestamp,
      }));

      exportSignatureToPDF(
        {
          title: doc.title,
          content: doc.content,
          status: doc.status,
          createdAt: doc.createdAt,
          completedAt: doc.completedAt,
          expiresAt: doc.expiresAt,
          contentHash: doc.contentHash || '',
          signers: signerInfo,
          auditLog: auditEntries,
        },
        `${doc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
      );
      toast.success(t('signatures.pdfExported', 'PDF exported successfully'));
    } catch {
      toast.error(t('signatures.errors.exportFailed', 'Failed to export PDF'));
    }
  };

  if (!open || !documentId) return null;

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    signed: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800',
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[85vh]">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{doc?.title ?? '...'}</DialogTitle>
          <DialogDescription className="sr-only">Document details</DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4 overflow-y-auto max-h-[60vh] space-y-4">
          {doc && (
            <>
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t(`signatures.status.${doc.status}`, doc.status)}</Badge>
                {doc.expiresAt && (
                  <span className="text-xs text-muted-foreground">
                    {t('signatures.expiresOn', 'Expires')}:{' '}
                    {new Date(doc.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Content Preview */}
              <div className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                {doc.content}
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
                        <Badge className={`text-xs ${statusColor[req.status] || ''}`}>
                          {t(`signatures.requestStatus.${req.status}`, req.status)}
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
                          <span>{t(`signatures.actions.${entry.action}`, entry.action)}</span>
                          <span className="ml-auto">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t bg-muted/30 flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('common.close', 'Close')}
            </Button>
            {doc && doc.status === 'completed' && (
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-1" />
                {t('signatures.exportPdf', 'Export PDF')}
              </Button>
            )}
          </div>
          {doc &&
            doc.createdBy === userId &&
            (doc.status === 'pending' || doc.status === 'partially_signed') && (
              <Button variant="destructive" size="sm" onClick={handleCancel}>
                <XCircle className="w-4 h-4 mr-1" />
                {t('signatures.cancel', 'Cancel Document')}
              </Button>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ TEMPLATE MANAGER ============

interface TemplateManagerProps {
  open: boolean;
  onClose: () => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
}

function TemplateManager({ open, onClose, organizationId, userId }: TemplateManagerProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('custom');

  const templates = useQuery(api.signatures.listTemplates, { organizationId });
  const createTemplate = useMutation(api.signatures.createTemplate);
  const deleteTemplate = useMutation(api.signatures.deleteTemplate);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      await createTemplate({
        organizationId,
        title,
        description: description || undefined,
        category: category as 'nda' | 'offer' | 'contract' | 'policy' | 'custom',
        content,
        fields: [
          { id: 'signature', label: 'Signature', type: 'signature' as const, required: true },
        ],
        createdBy: userId,
      });
      toast.success(t('signatures.templateCreated', 'Template created!'));
      setCreating(false);
      setTitle('');
      setDescription('');
      setContent('');
      setCategory('custom');
    } catch {
      toast.error(t('signatures.errors.templateFailed', 'Failed to create template'));
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[80vh]">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{t('signatures.templates', 'Document Templates')}</DialogTitle>
          <DialogDescription className="sr-only">Manage templates</DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4 overflow-y-auto max-h-[60vh]">
          {!creating ? (
            <div className="space-y-3">
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4 mr-1" />
                {t('signatures.createTemplate', 'New Template')}
              </Button>
              {templates?.map((tpl) => (
                <div
                  key={tpl._id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="text-sm font-medium">{tpl.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`signatures.category.${tpl.category}`, tpl.category)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTemplate({ templateId: tpl._id })}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {(!templates || templates.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('signatures.noTemplates', 'No templates yet')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>{t('signatures.fields.title', 'Title')}</Label>
                <Input
                  className="mt-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., NDA Agreement"
                />
              </div>
              <div>
                <Label>{t('signatures.fields.category', 'Category')}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nda">{t('signatures.category.nda', 'NDA')}</SelectItem>
                    <SelectItem value="offer">
                      {t('signatures.category.offer', 'Offer Letter')}
                    </SelectItem>
                    <SelectItem value="contract">
                      {t('signatures.category.contract', 'Contract')}
                    </SelectItem>
                    <SelectItem value="policy">
                      {t('signatures.category.policy', 'Policy')}
                    </SelectItem>
                    <SelectItem value="custom">
                      {t('signatures.category.custom', 'Custom')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('signatures.fields.description', 'Description')}</Label>
                <Input
                  className="mt-1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <Label>{t('signatures.fields.content', 'Content')}</Label>
                <Textarea
                  className="mt-1 min-h-[120px]"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t bg-muted/30 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (creating ? setCreating(false) : onClose())}
          >
            {creating ? t('common.back', 'Back') : t('common.close', 'Close')}
          </Button>
          {creating && (
            <Button size="sm" disabled={!title.trim() || !content.trim()} onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-1" />
              {t('signatures.save', 'Save Template')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ MAIN CLIENT ============

export function ESignaturesClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore(useShallow((state) => ({ user: state.user })));

  const [wizardOpen, setWizardOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [signDialogData, setSignDialogData] = useState<{
    _id: Id<'signatureRequests'>;
    documentId: Id<'signatureDocuments'>;
    signerName: string;
  } | null>(null);
  const [detailDocId, setDetailDocId] = useState<Id<'signatureDocuments'> | null>(null);

  const organizationId = user?.organizationId as Id<'organizations'> | undefined;
  const userId = user?.id && user.id !== '' ? (user.id as Id<'users'>) : null;

  const documents = useQuery(
    api.signatures.listDocuments,
    organizationId ? { organizationId } : 'skip',
  );
  const myPending = useQuery(
    api.signatures.getMyPendingSignatures,
    organizationId && userId ? { organizationId, userId } : 'skip',
  );
  const stats = useQuery(
    api.signatures.getStats,
    organizationId && userId ? { organizationId, userId } : 'skip',
  );

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  if (!user || !organizationId || !userId) {
    return <ShieldLoader />;
  }

  const statusBadgeClass: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    pending: 'bg-yellow-100 text-yellow-800',
    partially_signed: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="p-0 md:p-6 py-4">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('signatures.title', 'E-Signatures')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t('signatures.subtitle', 'Create, send, and sign documents electronically')}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTemplatesOpen(true)}
                className="flex-1 sm:flex-initial"
              >
                <FileText className="w-4 h-4 mr-1" />
                {t('signatures.templates', 'Templates')}
              </Button>
              <Button
                size="sm"
                onClick={() => setWizardOpen(true)}
                className="flex-1 sm:flex-initial"
              >
                <Plus className="w-4 h-4 mr-1" />
                {t('signatures.createDocument', 'New Document')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <Clock className="w-5 h-5 text-yellow-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingMySignature}</p>
                <p className="text-xs text-muted-foreground">
                  {t('signatures.stats.pending', 'Awaiting My Signature')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completed}</p>
                <p className="text-xs text-muted-foreground">
                  {t('signatures.stats.completed', 'Completed')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Send className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.awaitingOthers}</p>
                <p className="text-xs text-muted-foreground">
                  {t('signatures.stats.awaitingOthers', 'Awaiting Others')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList className="w-full mb-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-2">
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="pending"
          >
            {t('signatures.tabs.mySignatures', 'My Signatures')}
            {myPending && myPending.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-2 text-xs h-5 w-5 p-0 flex items-center justify-center rounded-full"
              >
                {myPending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="documents"
          >
            {t('signatures.tabs.documents', 'Documents')}
          </TabsTrigger>
        </TabsList>

        {/* My Signatures Tab */}
        <TabsContent value="pending" className="mt-4">
          {!myPending ? (
            <ShieldLoader />
          ) : myPending.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
                <p className="font-medium">{t('signatures.noPending', 'No documents to sign')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('signatures.noPendingHint')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {myPending.map((req) => (
                <Card
                  key={req._id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() =>
                    setSignDialogData({
                      _id: req._id,
                      documentId: req.documentId,
                      signerName: req.signerName,
                    })
                  }
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <PenTool className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {req.document?.title ?? 'Document'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('signatures.signingOrder', 'Order')}: #{req.order}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" className="w-full sm:w-auto shrink-0">
                      <PenTool className="w-4 h-4 mr-1" />
                      {t('signatures.sign', 'Sign')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-4">
          {!documents ? (
            <ShieldLoader />
          ) : documents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">{t('signatures.noDocuments', 'No documents yet')}</p>
                {isAdmin && (
                  <Button size="sm" className="mt-3" onClick={() => setWizardOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    {t('signatures.createFirst', 'Create your first document')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <Card
                  key={doc._id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setDetailDocId(doc._id)}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-muted shrink-0">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 ${statusBadgeClass[doc.status] || ''}`}>
                      {t(`signatures.status.${doc.status}`, doc.status)}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateDocumentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        organizationId={organizationId}
        userId={userId!}
      />
      <SignDocumentDialog
        open={!!signDialogData}
        onClose={() => setSignDialogData(null)}
        request={signDialogData}
        userId={userId!}
      />
      <DocumentDetailDialog
        open={!!detailDocId}
        onClose={() => setDetailDocId(null)}
        documentId={detailDocId}
        userId={userId!}
      />
      <TemplateManager
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        organizationId={organizationId}
        userId={userId!}
      />
    </div>
  );
}
