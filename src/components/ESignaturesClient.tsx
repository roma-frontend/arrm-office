'use client';
import NextImage from 'next/image';
import React, { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
  Upload,
  ImageIcon,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useConvex } from '@/lib/convex-typed';
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
import {
  exportDocumentToPDF,
  renderDocumentPdfBase64,
  documentBodyToPlainText,
  type RenderableDocument,
  type DocumentLabels,
  type DocumentBlock,
} from '@/lib/exportDocument';
import {
  assetFormDocumentNumber,
  assetFormFileName,
  assetFormInputFromParsed,
  assetFormTitle,
  buildAssetFormBlocks,
  parseAssetFormContent,
  type AssetFormInput,
} from '@/lib/assetFormDocument';
import type { AccentColor } from '@/lib/documentCatalog';
import { getLocaleString } from '@/lib/date-format';
import { uploadDocument } from '@/actions/cloudinary';

/** Localized static labels for the themed PDF footer / signature block. */
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

// ============ MOVEMENT / RETURN FORM HELPERS ============

/**
 * Localized title for a stored document. Asset acts are created with an English
 * technical title (`Movement Form - <asset>`) so they stay searchable in the DB;
 * every UI surface shows the act name in the active language instead.
 */
function localizedDocTitle(
  doc: { title: string; content?: string } | null | undefined,
  t: TFunction,
): string {
  if (!doc) return '';
  const parsed = doc.content ? parseAssetFormContent(doc.content) : null;
  if (!parsed) return doc.title;
  return assetFormTitle(parsed.type === 'return', t);
}

/**
 * Build the fully localized, structured body of an asset act stored on a
 * signature document. Returns `null` for generic documents.
 */
function buildActBody(
  doc: { content?: string } | null | undefined,
  t: TFunction,
  lang: string | undefined,
  signature?: AssetFormInput['signature'],
): { blocks: DocumentBlock[]; input: AssetFormInput } | null {
  const parsed = doc?.content ? parseAssetFormContent(doc.content) : null;
  if (!parsed) return null;
  const input = assetFormInputFromParsed(parsed, { t, signature });
  return { blocks: buildAssetFormBlocks(input, t, lang), input };
}

// ============ THEMED RENDER HELPERS ============

interface SignatureDocRequest {
  _id: Id<'signatureRequests'>;
  status: string;
  signatureData?: string;
  order: number;
  signerName: string;
  signedAt?: number;
}

interface SignatureDoc {
  _id: Id<'signatureDocuments'>;
  title: string;
  content: string;
  accent?: string;
  signatureBlock?: boolean;
  orgName?: string;
  contentHash?: string;
  completedAt?: number;
  createdAt: number;
  status: string;
  signedPdfUrl?: string;
  createdBy: Id<'users'>;
  expiresAt?: number;
  requests?: SignatureDocRequest[];
}

/**
 * Build the themed `RenderableDocument` for a signature document, baking in the
 * drawn signature so the exported/archived PDF looks like the ORIGINAL document
 * that was sent (org header, accent, signature block) — not a generic audit
 * report. Falls back to sensible defaults for documents created before the
 * theme was persisted.
 */
function toRenderableDocument(
  doc: SignatureDoc,
  labels: DocumentLabels,
  t?: TFunction,
  lang?: string,
): RenderableDocument {
  // The primary signed request supplies the signature image + signer name/date.
  const signedReq = (doc.requests || [])
    .filter((r) => r.status === 'signed' && r.signatureData)
    .sort((a, b) => a.order - b.order)[0];

  // Structured asset act → typed blocks (definition tables + signature grid).
  const act = t
    ? buildActBody(doc, t, lang, {
        image: signedReq?.signatureData,
        signerName: signedReq?.signerName,
        signedAt: signedReq?.signedAt,
      })
    : null;

  return {
    title: act && t ? assetFormTitle(act.input.isReturn, t) : doc.title,
    subtitle: act?.input.assetName || undefined,
    documentNumber: act && t ? assetFormDocumentNumber(act.input, t) : undefined,
    body: act ? act.blocks : doc.content,
    accent: (doc.accent as AccentColor) || 'blue',
    // Acts render their own two-party signature grid; generic documents keep the
    // legacy block (shown when themed with one, or when we have a signature).
    signature: act ? false : (doc.signatureBlock ?? Boolean(signedReq)),
    orgName: doc.orgName || '',
    contentHash: doc.contentHash || undefined,
    now: doc.completedAt || doc.createdAt || 0,
    lang,
    labels,
    signed: signedReq
      ? {
          signatureData: signedReq.signatureData,
          signerName: signedReq.signerName,
          signedAt: signedReq.signedAt,
        }
      : undefined,
  };
}

// ============ ARCHIVE HELPER ============

/**
 * Render the final signed PDF (themed document with the signature baked in),
 * upload it to Cloudinary and record the URL on the document. Called once a
 * document becomes fully signed. Best-effort: failures are logged/toasted but
 * never block signing.
 */
async function archiveSignedDocument(
  convex: ReturnType<typeof useConvex>,
  attachSignedPdf: ReturnType<typeof useMutation>,
  documentId: Id<'signatureDocuments'>,
  userId: Id<'users'>,
  labels: DocumentLabels,
  t: TFunction,
  lang?: string,
): Promise<boolean> {
  const doc = await convex.query(api.signatures.getDocument, { documentId });
  if (!doc || doc.status !== 'completed' || doc.signedPdfUrl) return false;

  const renderable = toRenderableDocument(doc, labels, t, lang);
  const base64 = await renderDocumentPdfBase64(renderable);

  const act = buildActBody(doc, t, lang);
  const fileName = act
    ? assetFormFileName(act.input).replace(/\.pdf$/, '_signed.pdf')
    : `${doc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_signed.pdf`;
  const uploaded = await uploadDocument(base64, fileName, 'application/pdf');
  await attachSignedPdf({
    documentId,
    url: uploaded.url,
    name: uploaded.name,
    size: uploaded.size,
    userId,
  });
  return true;
}

// ============ SIGNATURE CAPTURE (DRAW / UPLOAD) ============

/** Max accepted signature image size (bytes). Keeps the base64 payload small
 * enough to embed in the PDF and store on the request. */
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_SIGNATURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Normalize an uploaded signature image so it embeds as cleanly as a drawn one:
 * knock out the near-white background (so it sits transparently on the PDF's
 * signature line), then crop to the tight bounding box of the ink. Returns a PNG
 * data URL. On any failure (e.g. a tainted canvas) it resolves to the original
 * data URL so upload still works.
 */
function normalizeSignatureImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0);

        const { width, height } = canvas;
        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;

        // Pixels brighter than this on all channels are treated as background.
        const WHITE_THRESHOLD = 240;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i]!;
            const g = data[i + 1]!;
            const b = data[i + 2]!;
            const a = data[i + 3]!;
            const isBackground =
              a < 10 || (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD);
            if (isBackground) {
              data[i + 3] = 0; // make transparent
            } else {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        // No ink found — keep the original rather than returning a blank crop.
        if (maxX < minX || maxY < minY) return resolve(dataUrl);

        ctx.putImageData(image, 0, 0);

        // Crop to the ink bounds with a small padding margin.
        const pad = 8;
        const cx = Math.max(0, minX - pad);
        const cy = Math.max(0, minY - pad);
        const cw = Math.min(width, maxX + pad) - cx;
        const ch = Math.min(height, maxY + pad) - cy;

        const out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        const outCtx = out.getContext('2d');
        if (!outCtx) return resolve(canvas.toDataURL('image/png'));
        outCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
        resolve(out.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

interface SignatureCaptureProps {
  onSave: (dataUrl: string) => void;
  width?: number;
  height?: number;
}

/**
 * Lets a signer either draw their signature or upload an existing image (e.g.
 * a nice PNG of their handwritten signature). Both paths ultimately hand back a
 * PNG/image data URL via `onSave`, so downstream code is unchanged.
 */
function SignatureCapture({ onSave, width, height }: SignatureCaptureProps) {
  const { t } = useTranslation();
  return (
    <Tabs defaultValue="draw" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-3">
        <TabsTrigger value="draw" className="flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5" />
          {t('signatures.pad.tabDraw', 'Draw')}
        </TabsTrigger>
        <TabsTrigger value="upload" className="flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" />
          {t('signatures.pad.tabUpload', 'Upload')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="draw" className="mt-0">
        <SignaturePad onSave={onSave} width={width} height={height} />
      </TabsContent>
      <TabsContent value="upload" className="mt-0">
        <SignatureUpload onSave={onSave} />
      </TabsContent>
    </Tabs>
  );
}

// ============ SIGNATURE UPLOAD ============

function SignatureUpload({ onSave }: { onSave: (dataUrl: string) => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED_SIGNATURE_TYPES.includes(file.type)) {
      setError(t('signatures.pad.uploadTypeError', 'Please upload a PNG, JPG, or WEBP image.'));
      return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      setError(t('signatures.pad.uploadSizeError', 'Image is too large (max 2 MB).'));
      return;
    }
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) {
        setProcessing(false);
        setError(
          t('signatures.pad.uploadReadError', 'Could not read the file. Try another image.'),
        );
        return;
      }
      // Clean up the uploaded image (transparent background + tight crop) so it
      // embeds as neatly as a drawn signature.
      const normalized = await normalizeSignatureImage(result);
      setProcessing(false);
      onSave(normalized);
    };
    reader.onerror = () => {
      setProcessing(false);
      setError(t('signatures.pad.uploadReadError', 'Could not read the file. Try another image.'));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={processing}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!processing) handleFile(e.dataTransfer.files?.[0]);
        }}
        className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded-lg py-8 px-4 bg-white hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
      >
        <Upload className="w-6 h-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          {processing
            ? t('signatures.pad.uploadProcessing', 'Processing image…')
            : t('signatures.pad.uploadCta', 'Click or drag an image to upload')}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('signatures.pad.uploadHint', 'PNG, JPG or WEBP — transparent PNG looks best')}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_SIGNATURE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

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
    organizationId ? ({ organizationId } as never) : 'skip',
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
    } catch (_e: unknown) {
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
  const { t, i18n } = useTranslation();
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const doc = useQuery(
    api.signatures.getDocument,
    request ? { documentId: request.documentId } : 'skip',
  );

  // Asset acts render as a structured, localized document; generic documents
  // show their raw content.
  const act = buildActBody(doc, t, i18n.language);
  const displayBody = act ? documentBodyToPlainText(act.blocks) : doc?.content || '';
  const displayTitle = localizedDocTitle(doc, t);

  const signMutation = useMutation(api.signatures.signDocument);
  const declineMutation = useMutation(api.signatures.declineDocument);
  const attachSignedPdf = useMutation(api.signatures.attachSignedPdf);
  const convex = useConvex();
  const labels = useDocumentLabels();

  const handleSign = async () => {
    if (!request || !signatureData) return;
    try {
      const result = await signMutation({
        requestId: request._id,
        signatureData,
        userId,
      });
      toast.success(t('signatures.signed', 'Document signed successfully!'));
      onClose();

      // Last signer just completed the document — render + archive the final PDF.
      if (result?.completed) {
        try {
          const archived = await archiveSignedDocument(
            convex,
            attachSignedPdf,
            request.documentId,
            userId,
            labels,
            t,
            i18n.language,
          );
          if (archived) {
            toast.success(t('signatures.archived', 'Signed document archived'));
          }
        } catch (archiveErr) {
          console.error('Failed to archive signed PDF:', archiveErr);
          toast.error(t('signatures.errors.archiveFailed', 'Failed to archive signed PDF'));
        }
      }
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
                <h3 className="font-semibold">{displayTitle}</h3>
                {act?.input.assetName && (
                  <p className="text-xs text-muted-foreground mt-0.5">{act.input.assetName}</p>
                )}
                <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {displayBody}
                </div>
              </div>

              {!declineMode ? (
                <div>
                  <Label className="mb-2 block">
                    {t('signatures.pad.provideSignature', 'Draw or upload your signature')}
                  </Label>
                  {signatureData ? (
                    <div className="space-y-2">
                      <div className="border rounded-lg p-3 bg-white">
                        <NextImage
                          src={signatureData}
                          alt="Signature"
                          width={200}
                          height={80}
                          unoptimized
                          className="max-h-[80px] mx-auto"
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setSignatureData(null)}>
                        {t('signatures.pad.redraw', 'Redraw')}
                      </Button>
                    </div>
                  ) : (
                    <SignatureCapture onSave={setSignatureData} />
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
  const { t, i18n } = useTranslation();
  const doc = useQuery(api.signatures.getDocument, documentId ? { documentId } : 'skip');
  const auditLog = useQuery(api.signatures.getAuditLog, documentId ? { documentId } : 'skip');
  const cancelMutation = useMutation(api.signatures.cancelDocument);
  const reminderMutation = useMutation(api.signatures.sendReminder);
  const attachSignedPdf = useMutation(api.signatures.attachSignedPdf);
  const convex = useConvex();
  const labels = useDocumentLabels();
  const [archiving, setArchiving] = useState(false);

  // Asset acts render as a structured, localized document; generic documents
  // show their raw content.
  const act = buildActBody(doc, t, i18n.language);
  const displayBody = act ? documentBodyToPlainText(act.blocks) : doc?.content || '';
  const displayTitle = localizedDocTitle(doc, t);

  const handleArchive = async () => {
    if (!documentId) return;
    setArchiving(true);
    try {
      const archived = await archiveSignedDocument(
        convex,
        attachSignedPdf,
        documentId,
        userId,
        labels,
        t,
        i18n.language,
      );
      toast.success(
        archived
          ? t('signatures.archived', 'Signed document archived')
          : t('signatures.alreadyArchived', 'Document already archived'),
      );
    } catch (err) {
      // Surface the real cause (Cloudinary upload / PDF render / Convex mutation)
      // instead of swallowing it behind a generic message.
      console.error('Failed to archive signed PDF:', err);
      const detail = err instanceof Error ? err.message : '';
      toast.error(
        detail
          ? `${t('signatures.errors.archiveFailed', 'Failed to archive signed PDF')}: ${detail}`
          : t('signatures.errors.archiveFailed', 'Failed to archive signed PDF'),
      );
    } finally {
      setArchiving(false);
    }
  };

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

  const handleExportPDF = async () => {
    if (!doc) return;
    try {
      // Export the themed document with the signature baked in — the same copy
      // HR archives — instead of a generic audit report.
      const fileName = act
        ? assetFormFileName(act.input).replace(/\.pdf$/, '_signed.pdf')
        : `${doc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_signed.pdf`;
      await exportDocumentToPDF(toRenderableDocument(doc, labels, t, i18n.language), fileName);
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
          <DialogTitle>{displayTitle || '...'}</DialogTitle>
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
                    {new Date(doc.expiresAt).toLocaleDateString(getLocaleString(i18n.language))}
                  </span>
                )}
              </div>

              {/* Content Preview — localized for movement/return forms */}
              <div className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                {displayBody}
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
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t bg-muted/30 flex items-center justify-between">
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
            {doc && doc.status === 'completed' && doc.signedPdfUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={doc.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-1" />
                  {t('signatures.archivedPdf', 'Archived PDF')}
                </a>
              </Button>
            )}
            {doc && doc.status === 'completed' && !doc.signedPdfUrl && (
              <Button variant="outline" size="sm" onClick={handleArchive} disabled={archiving}>
                <Download className="w-4 h-4 mr-1" />
                {archiving
                  ? t('signatures.archiving', 'Archiving…')
                  : t('signatures.archivePdf', 'Archive PDF')}
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
                      {String(t(`signatures.category.${tpl.category}`, tpl.category))}
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
  const { t, i18n } = useTranslation();
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
    organizationId && userId ? { organizationId, userId } : 'skip',
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
                        <p className="font-medium text-sm truncate">{localizedDocTitle(doc, t)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(doc.createdAt).toLocaleDateString(
                            getLocaleString(i18n.language),
                          )}
                        </p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 ${statusBadgeClass[doc.status] || ''}`}>
                      {String(t(`signatures.status.${doc.status}`, doc.status))}
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
