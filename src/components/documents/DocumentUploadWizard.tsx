'use client';

import React, { useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { useMainRef } from '@/hooks/useMainRef';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { uploadDocument } from '@/actions/cloudinary';
import { toast } from 'sonner';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileText,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  X,
  File,
  Image as ImageIcon,
  Video,
  Music,
  Settings,
  Info,
  Eye,
} from 'lucide-react';
import Image from 'next/image';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import { ShieldLoader } from '../ui/ShieldLoader';
import { logger } from '@/lib/logger';

type DocumentCategory =
  | 'policy'
  | 'contract'
  | 'report'
  | 'template'
  | 'form'
  | 'certificate'
  | 'other';

interface UploadedFile {
  url: string;
  name: string;
  size: number;
  type: string;
}

interface LocalFile {
  id: string;
  file: File;
  preview?: string;
  base64?: string;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
  'application/pdf': <FileText className="w-10 h-10 text-red-400" />,
  'image/': <ImageIcon className="w-10 h-10 text-blue-400" />,
  'video/': <Video className="w-10 h-10 text-purple-400" />,
  'audio/': <Music className="w-10 h-10 text-green-400" />,
};

function getFileIcon(type: string): React.ReactNode {
  for (const [key, icon] of Object.entries(FILE_ICONS)) {
    if (type.startsWith(key)) return icon;
  }
  return <File className="w-10 h-10 text-gray-400" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getCategories(t: (key: string, fallback: string) => string) {
  return [
    {
      value: 'policy' as DocumentCategory,
      label: t('documents.categoryPolicy', 'Policy'),
      icon: <FileText className="w-4 h-4 text-blue-500" />,
    },
    {
      value: 'contract' as DocumentCategory,
      label: t('documents.categoryContract', 'Contract'),
      icon: <FileText className="w-4 h-4 text-green-500" />,
    },
    {
      value: 'report' as DocumentCategory,
      label: t('documents.categoryReport', 'Report'),
      icon: <FileText className="w-4 h-4 text-purple-500" />,
    },
    {
      value: 'template' as DocumentCategory,
      label: t('documents.categoryTemplate', 'Template'),
      icon: <FileText className="w-4 h-4 text-orange-500" />,
    },
    {
      value: 'form' as DocumentCategory,
      label: t('documents.categoryForm', 'Form'),
      icon: <FileText className="w-4 h-4 text-cyan-500" />,
    },
    {
      value: 'certificate' as DocumentCategory,
      label: t('documents.categoryCertificate', 'Certificate'),
      icon: <FileText className="w-4 h-4 text-yellow-500" />,
    },
    {
      value: 'other' as DocumentCategory,
      label: t('documents.categoryOther', 'Other'),
      icon: <FileText className="w-4 h-4 text-(--text-3)" />,
    },
  ];
}

function getSteps(t: (key: string, fallback: string) => string) {
  return [
    { id: 'file', title: t('documents.file', 'File'), icon: <Upload className="w-4 h-4" /> },
    { id: 'details', title: t('documents.details', 'Details'), icon: <Info className="w-4 h-4" /> },
    {
      id: 'settings',
      title: t('documents.settings', 'Settings'),
      icon: <Settings className="w-4 h-4" />,
    },
    { id: 'review', title: t('documents.review', 'Review'), icon: <Eye className="w-4 h-4" /> },
  ];
}

interface DocumentUploadWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  templateId?: Id<'documentTemplates'>;
}

export default function DocumentUploadWizard({
  onClose,
  onSuccess,
  templateId,
}: DocumentUploadWizardProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const effectiveOrgId = selectedOrgId ?? user?.organizationId;
  const mainRef = useMainRef();

  useLayoutEffect(() => {
    const mainEl = mainRef.current;
    if (mainEl) {
      const original = mainEl.style.overflow;
      mainEl.style.overflow = 'hidden';
      return () => {
        mainEl.style.overflow = original;
      };
    }
  }, [mainRef]);

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: File
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [tagsInput, setTagsInput] = useState('');

  // Fetch template if provided
  const templateData = useQuery(api.signatures.getTemplate, templateId ? { templateId } : 'skip');

  // Prefill from template
  React.useEffect(() => {
    if (templateData && !title) {
      setTitle(templateData.title);
      setDescription(templateData.description || '');
      setCategory('template');
    }
  }, [templateData, title]);

  // Step 3: Settings
  const [isMandatory, setIsMandatory] = useState(false);
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [enableExpiration, setEnableExpiration] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  // ── Черновик: данные переживают случайное закрытие окна ────────────────
  // localFiles не сохраняем — там объект File, который не сериализуется.
  // uploadedFile уже лежит в Cloudinary, так что переживает закрытие целиком.
  const draftData = useMemo(
    () => ({
      uploadedFile,
      title,
      description,
      category,
      tagsInput,
      isMandatory,
      publishImmediately,
      enableExpiration,
      expiresAt,
    }),
    [
      uploadedFile,
      title,
      description,
      category,
      tagsInput,
      isMandatory,
      publishImmediately,
      enableExpiration,
      expiresAt,
    ],
  );

  const handleRestoreDraft = useCallback((d: typeof draftData, savedStep: number) => {
    setUploadedFile(d.uploadedFile ?? null);
    setTitle(d.title ?? '');
    setDescription(d.description ?? '');
    if (d.category) setCategory(d.category);
    setTagsInput(d.tagsInput ?? '');
    setIsMandatory(!!d.isMandatory);
    setPublishImmediately(!!d.publishImmediately);
    setEnableExpiration(!!d.enableExpiration);
    setExpiresAt(d.expiresAt ?? '');
    // Без загруженного файла дальше первого шага идти некуда.
    setCurrentStep(d.uploadedFile ? Math.min(Math.max(savedStep, 0), 3) : 0);
  }, []);

  const draft = useWizardDraft({
    key: 'document-upload',
    data: draftData,
    step: currentStep,
    defaults: { category: 'other' as DocumentCategory },
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setLocalFiles([]);
    setUploadedFile(null);
    setTitle('');
    setDescription('');
    setCategory('other');
    setTagsInput('');
    setIsMandatory(false);
    setPublishImmediately(false);
    setEnableExpiration(false);
    setExpiresAt('');
    setCurrentStep(0);
  }, [clearDraft]);

  const createDocumentMutation = useMutation(api.documents.createDocument);
  const updateDocumentMutation = useMutation(api.documents.updateDocument);

  const categories = getCategories(t);
  const steps = getSteps(t);

  const handleFileSelect = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const file = fileArray[0] as File;
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_FILE_SIZE / (1024 * 1024)) {
        toast.error(
          `File size (${formatSize(file.size)}) ${t('documents.exceedsLimit', 'exceeds 10MB limit')}`,
        );
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      let preview: string | undefined;
      if (file.type.startsWith('image/')) {
        preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      setLocalFiles([{ id, file, preview, base64 }]);
    },
    [t],
  );

  const uploadFile = async (): Promise<boolean> => {
    if (localFiles.length === 0) return false;

    setUploading(true);
    setUploadProgress(0);
    try {
      const localFile = localFiles[0] as LocalFile;
      if (!localFile.base64) {
        toast.error(t('documents.fileDataMissing', 'File data is missing'));
        return false;
      }
      setUploadProgress(25);

      const result = await uploadDocument(
        localFile.base64,
        localFile.file.name,
        localFile.file.type,
      );
      setUploadProgress(100);

      setUploadedFile({
        url: result.url,
        name: result.name,
        size: result.size,
        type: result.type,
      });

      if (!title.trim()) {
        setTitle(result.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      }

      toast.success(t('documents.fileUploaded', 'File uploaded successfully'));
      return true;
    } catch (error) {
      logger.error('Upload error:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t('documents.uploadFailed', 'Failed to upload file'),
      );
      setLocalFiles([]);
      return false;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const removeFile = () => {
    setLocalFiles([]);
    setUploadedFile(null);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        // uploadedFile — восстановленный черновик: файл уже в Cloudinary,
        // локальный File при этом не сохраняется.
        return localFiles.length > 0 || !!uploadedFile;
      case 1:
        return title.trim().length > 0;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep === 0 && localFiles.length > 0 && !uploadedFile) {
      const success = await uploadFile();
      if (success) {
        setCurrentStep(1);
      }
      return;
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!effectiveOrgId || !user?.id || !uploadedFile) return;

    setIsSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const expirationDate =
        enableExpiration && expiresAt ? new Date(expiresAt).getTime() : undefined;

      const docId = await createDocumentMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        fileUrl: uploadedFile.url,
        fileName: uploadedFile.name,
        fileSize: uploadedFile.size,
        mimeType: uploadedFile.type,
        isMandatory,
        expiresAt: expirationDate,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (publishImmediately && docId) {
        await updateDocumentMutation({
          documentId: docId,
          isPublished: true,
        });
      }

      toast.success(t('documents.documentCreated', 'Document created successfully'));
      clearDraft();
      onSuccess();
    } catch (error) {
      logger.error('Create document error:', error);
      toast.error(t('documents.createFailed', 'Failed to create document'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            {!uploadedFile && localFiles.length === 0 && (
              <div
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
                  dragActive
                    ? 'border-(--primary) bg-(--primary)/5'
                    : 'border-(--border) hover:border-(--primary)/50 hover:bg-(--background-subtle)',
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                />
                <Upload className="w-12 h-12 mx-auto mb-4 text-(--muted-foreground)" />
                <p className="text-lg font-medium text-(--text-primary) mb-1">
                  {t('documents.dragDrop', 'Drag & drop your file here')}
                </p>
                <p className="text-sm text-(--muted-foreground) mb-4">
                  {t('documents.orClick', 'or click to browse')}
                </p>
                <p className="text-xs text-(--muted-foreground)">
                  {t('documents.maxSize', 'Max file size: 10MB')}
                </p>
              </div>
            )}

            {localFiles.length > 0 && !uploadedFile && (
              <div className="space-y-3">
                {localFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-4 p-4 rounded-lg border border-(--border) bg-(--background-subtle)"
                  >
                    {file.preview ? (
                      <Image
                        src={file.preview}
                        alt={file.file.name}
                        width={48}
                        height={48}
                        className="rounded object-cover"
                      />
                    ) : (
                      getFileIcon(file.file.type)
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-(--text-primary) truncate">{file.file.name}</p>
                      <p className="text-xs text-(--muted-foreground)">
                        {formatSize(file.file.size)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile();
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {uploading && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-(--muted-foreground)">
                      <ShieldLoader size="xs" variant="inline" />
                      <span>{t('documents.uploading', 'Uploading to Cloudinary...')}</span>
                    </div>
                    <div className="h-2 bg-(--background-subtle) rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-(--primary)"
                        initial={{ width: '0%' }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {uploadedFile && (
              <div className="flex items-center gap-4 p-4 rounded-lg border border-green-500/30 bg-green-500/5">
                {uploadedFile.type.startsWith('image/') ? (
                  <Image
                    src={uploadedFile.url}
                    alt={uploadedFile.name}
                    width={48}
                    height={48}
                    className="rounded object-cover"
                  />
                ) : (
                  getFileIcon(uploadedFile.type)
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-(--text-primary) truncate">{uploadedFile.name}</p>
                  <p className="text-xs text-(--muted-foreground)">
                    {formatSize(uploadedFile.size)}
                  </p>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                {t('documents.title', 'Title')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('documents.titlePlaceholder', 'Enter document title')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('documents.description', 'Description')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('documents.descriptionPlaceholder', 'Enter document description')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground) resize-none"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('documents.category', 'Category')}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger className="bg-(--input) border-(--input-border) text-(--text-primary)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      <div className="flex items-center gap-2">
                        {cat.icon}
                        {cat.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">{t('documents.tags', 'Tags')}</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder={t('documents.tagsPlaceholder', 'Comma-separated tags')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
              {tagsInput.trim() && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tagsInput
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="mandatory"
                checked={isMandatory}
                onCheckedChange={(checked) => setIsMandatory(checked as boolean)}
              />
              <Label htmlFor="mandatory" className="cursor-pointer">
                {t('documents.mandatory', 'Mandatory')}
              </Label>
            </div>
            <p className="text-xs text-(--muted-foreground) -mt-2 ml-6">
              {t('documents.mandatoryDesc', 'Users must acknowledge this document')}
            </p>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="publish"
                checked={publishImmediately}
                onCheckedChange={(checked) => setPublishImmediately(checked as boolean)}
              />
              <Label htmlFor="publish" className="cursor-pointer">
                {t('documents.publishImmediately', 'Publish immediately')}
              </Label>
            </div>
            <p className="text-xs text-(--muted-foreground) -mt-2 ml-6">
              {t('documents.publishDesc', 'Make this document visible to all users')}
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="expiration"
                  checked={enableExpiration}
                  onCheckedChange={(checked) => setEnableExpiration(checked as boolean)}
                />
                <Label htmlFor="expiration" className="cursor-pointer">
                  {t('documents.setExpiration', 'Set expiration date')}
                </Label>
              </div>

              {enableExpiration && (
                <div className="ml-6">
                  <Input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="bg-(--input) border-(--input-border) text-(--text-primary)"
                  />
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-(--border) bg-(--background-subtle) space-y-3">
              <div className="flex items-center gap-3">
                {uploadedFile?.type.startsWith('image/') ? (
                  <Image
                    src={uploadedFile.url}
                    alt={uploadedFile.name}
                    width={40}
                    height={40}
                    className="rounded object-cover"
                  />
                ) : (
                  getFileIcon(uploadedFile?.type || 'application/octet-stream')
                )}
                <div className="min-w-0">
                  <p className="font-medium text-(--text-primary) truncate">{uploadedFile?.name}</p>
                  <p className="text-xs text-(--muted-foreground)">
                    {formatSize(uploadedFile?.size || 0)}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('documents.title', 'Title')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">{title}</span>
                </div>
                {description && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('documents.description', 'Description')}:
                    </span>
                    <span className="font-medium text-(--text-primary) text-right max-w-[200px] truncate">
                      {description}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('documents.category', 'Category')}:
                  </span>
                  <span className="font-medium text-(--text-primary) capitalize">{category}</span>
                </div>
                {tagsInput.trim() && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('documents.tags', 'Tags')}:
                    </span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {tagsInput
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('documents.mandatory', 'Mandatory')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {isMandatory ? t('common.yes', 'Yes') : t('common.no', 'No')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('documents.publish', 'Publish')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {publishImmediately
                      ? t('documents.publishImmediately', 'Immediately')
                      : t('documents.draft', 'Draft')}
                  </span>
                </div>
                {enableExpiration && expiresAt && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('documents.expires', 'Expires')}:
                    </span>
                    <span className="font-medium text-(--text-primary)">
                      {new Date(expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        size="lg"
        closeLabel={t('common.close', 'Close')}
        hideClose
        className="p-0"
      >
        {/* Header */}
        <SheetHeader className="gap-3.5">
          <div className="flex items-center justify-between pr-8">
            <SheetTitle className="text-heading text-(--text-primary)">
              {t('documents.uploadDocument', 'Upload Document')}
            </SheetTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <WizardStepper
            steps={steps}
            current={currentStep}
            onStepClick={(i) => {
              // Backwards is always safe; forwards only through the steps the
              // footer already lets the user reach.
              if (i < currentStep) setCurrentStep(i);
            }}
          />
        </SheetHeader>

        {/* Content */}
        <SheetBody className="px-5 py-5">
          <WizardDraftNotice
            show={draft.restored}
            step={draft.restoredStep}
            onReset={handleStartOver}
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-(--text-primary)">
                  {steps[currentStep]!.title}
                </h3>
                <p className="text-sm text-(--muted-foreground)">
                  {currentStep === 0 &&
                    t('documents.fileUploadStep', 'Select the file you want to upload')}
                  {currentStep === 1 &&
                    t('documents.detailsStep', 'Add title, description and category')}
                  {currentStep === 2 && t('documents.settingsStep', 'Configure document settings')}
                  {currentStep === 3 &&
                    t('documents.reviewStep', 'Review and confirm your document')}
                </p>
              </div>
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </SheetBody>

        {/* Navigation */}
        <SheetFooter className="justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isSubmitting}
            className="border-(--border) bg-(--card) hover:bg-(--background-subtle) text-(--text-primary)"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {t('wizard.back', 'Back')}
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed() || uploading || isSubmitting}
              className="bg-(--primary) hover:bg-(--primary-hover) text-white gap-2"
            >
              {uploading ? (
                <>
                  <ShieldLoader size="xs" variant="inline" />
                </>
              ) : (
                <>
                  {t('wizard.next', 'Next')}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !canProceed()}
              className="bg-(--primary) hover:bg-(--primary-hover) text-white gap-2"
            >
              {isSubmitting ? (
                <>
                  <ShieldLoader size="xs" variant="inline" />
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {t('wizard.submit', 'Submit')}
                </>
              )}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
