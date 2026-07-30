/**
 * Wizard Step Components
 * Готовые компоненты для использования в шагах Wizard
 */

'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
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
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useWizardContext } from '@/components/ui/wizard';
import { uploadTaskAttachment } from '@/actions/cloudinary';
import { toast } from 'sonner';
import { Upload, FileText, Image as ImageIcon, Video, Music, File } from 'lucide-react';
import { AnimatePresence, motion } from '@/lib/cssMotion';

// ═══════════════════════════════════════════════════════════════
// Text Input Step
// ═══════════════════════════════════════════════════════════════
interface TextInputStepProps {
  stepData?: Record<string, string | number | boolean | null>;
  updateStepData?: (key: string, value: string | number | boolean | null) => void;
  field: string;
  label: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'number' | 'password' | 'date' | 'time';
  defaultValue?: string;
}

export function TextInputStep({
  stepData,
  updateStepData,
  field,
  label,
  placeholder,
  description,
  required = false,
  type = 'text',
  defaultValue,
}: TextInputStepProps) {
  const context = useWizardContext();
  const data = stepData ?? context.stepData;
  const update = updateStepData ?? context.updateStepData;
  const value = (data[field] as string | number | undefined) ?? defaultValue;
  return (
    <div className="space-y-2">
      <Label htmlFor={field} className="text-(--text-primary)">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        id={field}
        name={field}
        type={type}
        value={value ?? ''}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder}
        className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--text-muted)"
        required={required}
      />
      {description && <p className="text-xs text-(--text-muted)">{description}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Textarea Step
// ═══════════════════════════════════════════════════════════════
interface TextareaStepProps {
  stepData?: Record<string, string | number | boolean | null>;
  updateStepData?: (key: string, value: string | number | boolean | null) => void;
  field: string;
  label: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  rows?: number;
}

export function TextareaStep({
  stepData,
  updateStepData,
  field,
  label,
  placeholder,
  description,
  required = false,
  rows = 4,
}: TextareaStepProps) {
  const context = useWizardContext();
  const data = stepData ?? context.stepData;
  const update = updateStepData ?? context.updateStepData;
  const value = data[field] as string | number | undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={field} className="text-(--text-primary)">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Textarea
        id={field}
        name={field}
        value={value ?? ''}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--text-muted) resize-none"
        required={required}
      />
      {description && <p className="text-xs text-(--text-muted)">{description}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Select Step
// ═══════════════════════════════════════════════════════════════
interface SelectStepProps {
  stepData?: Record<string, string | number | boolean | null>;
  updateStepData?: (key: string, value: string | number | boolean | null) => void;
  field: string;
  label: string;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  placeholder?: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

export function SelectStep({
  stepData,
  updateStepData,
  field,
  label,
  options,
  placeholder = 'Select...',
  description,
  required = false,
  defaultValue,
}: SelectStepProps) {
  const context = useWizardContext();
  const data = stepData ?? context.stepData;
  const update = updateStepData ?? context.updateStepData;
  const value = (data[field] as string | undefined) ?? defaultValue;
  return (
    <div className="space-y-2">
      <Label htmlFor={field} className="text-(--text-primary)">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Select
        value={value ?? ''}
        onValueChange={(value) => update(field, value)}
        required={required}
      >
        <SelectTrigger className="bg-(--input) border-(--input-border) text-(--text-primary)">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-(--text-primary)">
              <div className="flex items-center gap-2">
                {option.icon}
                {option.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <p className="text-xs text-(--text-muted)">{description}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Card Selection Step
// ═══════════════════════════════════════════════════════════════
interface CardSelectionStepProps {
  stepData?: Record<string, string | number | boolean | null>;
  updateStepData?: (key: string, value: string | number | boolean | null) => void;
  field: string;
  label: string;
  options: {
    value: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    color?: string;
    badge?: string;
  }[];
  description?: string;
  required?: boolean;
  columns?: 2 | 3 | 4;
}

export function CardSelectionStep({
  stepData,
  updateStepData,
  field,
  label,
  options,
  description,
  required = false,
  columns = 2,
}: CardSelectionStepProps) {
  const { t, i18n } = useTranslation();
  const context = useWizardContext();
  const data = stepData ?? context.stepData;
  const update = updateStepData ?? context.updateStepData;
  const selectedValue = data[field];

  return (
    <div className="space-y-2 md:space-y-3">
      <div>
        <Label className="text-(--text-primary) text-sm md:text-base">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        {description && (
          <p className="text-[10px] md:text-xs text-(--text-muted) mt-1">{description}</p>
        )}
      </div>

      <div
        className={cn(
          'grid gap-2 md:gap-3',
          'grid-cols-1 sm:grid-cols-2',
          columns === 3 && 'md:grid-cols-3',
          columns === 4 && 'md:grid-cols-4',
        )}
      >
        {options.map((option) => {
          const isSelected = selectedValue === option.value;

          return (
            <Card
              key={option.value}
              className={cn(
                'cursor-pointer transition-all duration-200',
                isSelected
                  ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                  : 'border-(--border) bg-(--background) hover:bg-(--background-subtle) hover:shadow-md',
              )}
              onClick={() => update(field, option.value)}
            >
              <CardContent className="p-3 md:p-5 flex flex-col items-center text-center gap-2 md:gap-3">
                <div
                  className={cn(
                    'p-2 md:p-3 rounded-full transition-colors',
                    isSelected
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                      : option.color || 'bg-(--background-subtle) text-(--text-muted)',
                  )}
                >
                  {React.isValidElement(option.icon)
                    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      React.cloneElement(option.icon as React.ReactElement<any>, {
                        className: 'w-4 h-4 md:w-6 md:h-6',
                      })
                    : option.icon}
                </div>
                <div className="space-y-1 md:space-y-1.5">
                  <p
                    className={cn(
                      'font-bold text-xs md:text-sm leading-tight',
                      isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-(--text-primary)',
                    )}
                  >
                    {option.title}
                  </p>
                  <p className="text-[10px] md:text-xs text-(--text-muted) leading-relaxed line-clamp-2">
                    {option.description}
                  </p>
                </div>
                {/* Badge (balance info) */}
                {option.badge && !isSelected && (
                  <span className="text-[10px] font-medium text-(--text-muted) bg-(--background-subtle) px-2 py-0.5 rounded-full border border-(--border)">
                    {option.badge}
                  </span>
                )}
                {isSelected && (
                  <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-[10px] md:text-xs px-2 py-0.5 shadow-sm">
                    ✓{' '}
                    {i18n.language === 'ru'
                      ? 'Выбрано'
                      : i18n.language === 'hy'
                        ? 'Ընտրված'
                        : 'Selected'}
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Radio Group Step
// ═══════════════════════════════════════════════════════════════
interface RadioGroupStepProps {
  stepData?: Record<string, string | number | boolean | null>;
  updateStepData?: (key: string, value: string | number | boolean | null) => void;
  field: string;
  label: string;
  options: { value: string; label: string; description?: string }[];
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

export function RadioGroupStep({
  stepData,
  updateStepData,
  field,
  label,
  options,
  description,
  required = false,
  defaultValue,
}: RadioGroupStepProps) {
  const context = useWizardContext();
  const data = stepData ?? context.stepData;
  const update = updateStepData ?? context.updateStepData;
  const value = (data[field] as string | undefined) ?? defaultValue;
  return (
    <div className="space-y-2 md:space-y-3">
      <div>
        <Label className="text-(--text-primary) text-sm md:text-base">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        {description && (
          <p className="text-[10px] md:text-xs text-(--text-muted) mt-1">{description}</p>
        )}
      </div>

      <RadioGroup
        value={value ?? ''}
        onValueChange={(value) => update(field, value)}
        className="space-y-2"
      >
        {options.map((option) => (
          <div
            key={option.value}
            className="flex items-start space-x-2 md:space-x-3 p-2 md:p-3 rounded-lg border border-(--border) bg-(--background) hover:bg-(--background-subtle) transition-colors cursor-pointer"
            onClick={() => update(field, option.value)}
          >
            <RadioGroupItem
              value={option.value}
              id={`${field}-${option.value}`}
              className="mt-0.5 shrink-0"
            />
            <Label htmlFor={`${field}-${option.value}`} className="flex-1 cursor-pointer">
              <p className="font-medium text-sm md:text-base text-(--text-primary)">
                {option.label}
              </p>
              {option.description && (
                <p className="text-[10px] md:text-xs text-(--text-muted) mt-0.5 md:mt-1">
                  {option.description}
                </p>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Checkbox Step
// ═══════════════════════════════════════════════════════════════
interface CheckboxStepProps {
  stepData?: Record<string, string | number | boolean | null | string[]>;
  updateStepData?: (key: string, value: string | number | boolean | null | string[]) => void;
  field: string;
  label: string;
  options: { value: string; label: string; description?: string }[];
  description?: string;
}

export function CheckboxStep({
  stepData,
  updateStepData,
  field,
  label,
  options,
  description,
}: CheckboxStepProps) {
  const context = useWizardContext();
  const data = stepData ?? context.stepData;
  const update = updateStepData ?? context.updateStepData;
  const values = (data[field] as string[] | undefined) || [];

  const toggleValue = (value: string) => {
    const newValues = values.includes(value)
      ? values.filter((v: string) => v !== value)
      : [...values, value];
    update(field, newValues);
  };

  return (
    <div className="space-y-2 md:space-y-3">
      <div>
        <Label className="text-(--text-primary) text-sm md:text-base">{label}</Label>
        {description && (
          <p className="text-[10px] md:text-xs text-(--text-muted) mt-1">{description}</p>
        )}
      </div>

      <div className="space-y-2">
        {options.map((option) => {
          const isChecked = values.includes(option.value);

          return (
            <div
              key={option.value}
              className="flex items-start space-x-2 md:space-x-3 p-2 md:p-3 rounded-lg border border-(--border) bg-(--background) hover:bg-(--background-subtle) transition-colors cursor-pointer"
              onClick={() => toggleValue(option.value)}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggleValue(option.value)}
                id={`${field}-${option.value}`}
                className="shrink-0 mt-0.5"
              />
              <Label htmlFor={`${field}-${option.value}`} className="flex-1 cursor-pointer">
                <p className="font-medium text-sm md:text-base text-(--text-primary)">
                  {option.label}
                </p>
                {option.description && (
                  <p className="text-[10px] md:text-xs text-(--text-muted) mt-0.5 md:mt-1">
                    {option.description}
                  </p>
                )}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// File Upload Step
// ═══════════════════════════════════════════════════════════════

interface FileUploadStepProps {
  stepData?: Record<string, string | number | boolean | null | string[]>;
  updateStepData?: (key: string, value: string | number | boolean | null | string[]) => void;
  field: string;
  label: string;
  description?: string;
  maxFiles?: number;
  maxSizeMB?: number;
}

interface AttachmentData {
  url: string;
  name: string;
  type: string;
  size: number;
}

interface LocalFile {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  base64?: string;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
  'application/pdf': <FileText className="w-8 h-8 text-red-400" />,
  'image/': <ImageIcon className="w-8 h-8 text-blue-400" />,
  'video/': <Video className="w-8 h-8 text-purple-400" />,
  'audio/': <Music className="w-8 h-8 text-green-400" />,
};

function getFileIcon(type: string): React.ReactNode {
  for (const [key, icon] of Object.entries(FILE_ICONS)) {
    if (type.startsWith(key)) return icon;
  }
  return <File className="w-8 h-8 text-gray-400" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadStep({
  stepData,
  updateStepData,
  field,
  label,
  description,
  maxFiles = 5,
  maxSizeMB = 1,
}: FileUploadStepProps) {
  const context = useWizardContext();
  const data = stepData ?? context.stepData;
  const update = updateStepData ?? context.updateStepData;

  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storedJson = (data[field] as string | undefined) || '[]';
  const storedAttachments: AttachmentData[] = JSON.parse(storedJson);

  const handleFileSelect = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validFiles = fileArray
        .filter((f) => {
          const sizeMB = f.size / (1024 * 1024);
          if (sizeMB > maxSizeMB) {
            toast.error(`File "${f.name}" exceeds ${maxSizeMB}MB limit`);
            return false;
          }
          return true;
        })
        .slice(0, maxFiles - localFiles.length);

      if (validFiles.length === 0) return;

      const newFiles: LocalFile[] = await Promise.all(
        validFiles.map(async (file) => {
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

          return {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            type: file.type,
            size: file.size,
            preview,
            base64,
          };
        }),
      );

      setLocalFiles((prev) => [...prev, ...newFiles]);

      // Auto-upload files immediately after selection
      await uploadFiles([...localFiles, ...newFiles]);
    },
    [localFiles.length, maxFiles, maxSizeMB, storedAttachments, update],
  );

  const uploadFiles = async (filesToUpload: LocalFile[]) => {
    if (filesToUpload.length === 0) return;

    setUploading(true);
    try {
      const newAttachments: AttachmentData[] = [];

      for (const file of filesToUpload) {
        if (file.base64) {
          const url = await uploadTaskAttachment(file.base64, file.name);
          newAttachments.push({
            url,
            name: file.name,
            type: file.type,
            size: file.size,
          });
        }
      }

      const allAttachments = [...storedAttachments, ...newAttachments];
      update(field as string, JSON.stringify(allAttachments) as string);
      setLocalFiles([]);

      toast.success(`Uploaded ${newAttachments.length} file(s)`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const _handleRemoveLocal = (id: string) => {
    setLocalFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleRemoveUploaded = (url: string) => {
    const filtered = storedAttachments.filter((a) => a.url !== url);
    update(field as string, JSON.stringify(filtered) as string);
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

  return (
    <div className="space-y-3 md:space-y-4">
      <div>
        <Label className="text-(--text-primary) text-sm md:text-base">{label}</Label>
        {description && (
          <p className="text-[10px] md:text-xs text-(--text-muted) mt-1">{description}</p>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-xl p-4 md:p-6 text-center transition-colors cursor-pointer',
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="*/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-(--text-muted)" />
        <p className="text-sm text-(--text-secondary)">Drag files here or click to select</p>
        <p className="text-xs text-(--text-muted) mt-1">
          Max {maxFiles} files, up to {maxSizeMB}MB each
        </p>
      </div>

      {/* Local files preview (not yet uploaded) */}
      <AnimatePresence>
        {localFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-(--text-muted)">Uploading...</p>
            <div className="grid grid-cols-2 gap-2">
              {localFiles.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative rounded-lg border border-(--border) overflow-hidden bg-(--background-subtle)"
                >
                  {file.preview ? (
                    <img src={file.preview} alt={file.name} className="w-full h-20 object-cover" />
                  ) : (
                    <div className="h-20 flex items-center justify-center">
                      {getFileIcon(file.type)}
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs font-medium text-(--text-primary) truncate">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-(--text-muted)">{formatSize(file.size)}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            {uploading && (
              <p className="text-xs text-(--text-muted) text-center">Uploading to Cloudinary...</p>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Already uploaded files */}
      <AnimatePresence>
        {storedAttachments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-(--text-muted)">Uploaded:</p>
            <div className="grid grid-cols-2 gap-2">
              {storedAttachments.map((attachment) => {
                const isImage = attachment.type.startsWith('image/');

                return (
                  <motion.div
                    key={attachment.url}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative rounded-lg border border-(--border) overflow-hidden bg-(--background-subtle)"
                  >
                    {isImage ? (
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="w-full h-20 object-cover"
                      />
                    ) : (
                      <div className="h-20 flex items-center justify-center">
                        {getFileIcon(attachment.type)}
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-medium text-(--text-primary) truncate">
                        {attachment.name}
                      </p>
                      <p className="text-[10px] text-(--text-muted)">
                        {formatSize(attachment.size)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveUploaded(attachment.url);
                      }}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
